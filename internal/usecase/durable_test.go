package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/connector/publisher"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type controlledSampler struct{}

func (controlledSampler) ChannelID() string                                           { return "provider" }
func (controlledSampler) DisplayName() string                                         { return "controlled" }
func (controlledSampler) ValidateCredential(context.Context, map[string]string) error { return nil }
func (controlledSampler) Sample(ctx context.Context, q string, o domain.SampleOptions) (*domain.SamplingResult, error) {
	if q == "failure" {
		return nil, errors.New("provider unavailable")
	}
	return &domain.SamplingResult{RawText: "1. Other\n2. Bgeo", Source: "live", ModelVersion: "fixed-model"}, nil
}
func TestDurableMonitoringPartialFailureAndMetrics(t *testing.T) {
	db := setupTestDB(t)
	t.Setenv("APP_MODE", "live")
	projectID := uuid.New()
	ctx := testActorProject(t, db, projectID)
	for _, q := range []string{"success", "failure"} {
		if err := db.Create(&repository.QueryModel{ProjectID: projectID, QueryText: q, Status: "active"}).Error; err != nil {
			t.Fatal(err)
		}
	}
	cfg := config.Config{LeaseDuration: time.Minute, JobTimeout: time.Minute}
	first := NewWorker(db, cfg, nil)
	first.Monitor.connector = controlledSampler{}
	run, err := first.Monitor.ExecuteBatchRun(ctx, projectID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = first.Monitor.ExecuteBatchRun(ctx, projectID); !errors.Is(err, domain.ErrConflict) {
		t.Fatal("duplicate active run accepted")
	}
	if err = first.RunOne(ctx); err != nil {
		t.Fatal(err)
	}
	// Restart the process between kickoff and sampling; no goroutine state is required.
	restarted := NewWorker(db, cfg, nil)
	restarted.Monitor.connector = controlledSampler{}
	for i := 0; i < 8; i++ {
		db.Model(&repository.JobModel{}).Where("status = 'queued'").Update("available_at", time.Now().Add(-time.Second))
		if err = restarted.RunOne(ctx); err != nil {
			t.Fatal(err)
		}
	}
	var persisted repository.MonitorRunModel
	if err = db.First(&persisted, "id = ?", run.ID).Error; err != nil {
		t.Fatal(err)
	}
	if persisted.Status != "partial_failed" || persisted.SuccessCount != 1 || persisted.FailureCount != 1 {
		t.Fatalf("incorrect terminal state: %+v", persisted)
	}
	metrics, err := restarted.Monitor.Metrics(ctx, projectID)
	if err != nil {
		t.Fatal(err)
	}
	if metrics["valid_samples"] != 1 || metrics["voice_share"] != float64(100) || metrics["avg_rank"] != float64(2) {
		t.Fatalf("fabricated or incorrect metrics: %+v", metrics)
	}
	db.Model(&repository.AnswerSnapshotModel{}).Where("run_id = ?", run.ID).Update("source", "demo")
	metrics, err = restarted.Monitor.Metrics(ctx, projectID)
	if err != nil || metrics["valid_samples"] != 0 || metrics["voice_share"] != nil {
		t.Fatalf("demo data entered live metrics: %+v %v", metrics, err)
	}
}
func TestJobLeaseFencingCancellationAndConcurrentClaims(t *testing.T) {
	db := setupTestDB(t)
	projectID := uuid.New()
	ctx := testActorProject(t, db, projectID)
	repo := repository.NewJobRepository(db)
	job := repository.JobModel{ProjectID: projectID, Kind: "test", Payload: "{}", IdempotencyKey: "unique"}
	if err := repository.EnqueueJob(db, &job); err != nil {
		t.Fatal(err)
	}
	duplicate := repository.JobModel{ProjectID: projectID, Kind: "test", Payload: "{}", IdempotencyKey: "unique"}
	if err := repository.EnqueueJob(db, &duplicate); err != nil {
		t.Fatal(err)
	}
	old, err := repo.Claim(ctx, time.Minute)
	if err != nil || old == nil {
		t.Fatal(err)
	}
	db.Model(&repository.JobModel{}).Where("id = ?", old.ID).Update("lease_until", time.Now().Add(-time.Second))
	current, err := repo.Claim(ctx, time.Minute)
	if err != nil || current == nil || current.ID != old.ID || current.LeaseToken == old.LeaseToken {
		t.Fatal("expired lease not recovered")
	}
	if err = repo.Finish(ctx, *old, nil, false); !errors.Is(err, domain.ErrConflict) {
		t.Fatal("stale owner acknowledged replacement work")
	}
	if err = repo.Heartbeat(ctx, *old, time.Minute); !errors.Is(err, domain.ErrConflict) {
		t.Fatal("stale owner extended lease")
	}
	if err = repo.Finish(ctx, *current, nil, false); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 20; i++ {
		if err = repository.EnqueueJob(db, &repository.JobModel{ProjectID: projectID, Kind: "test", Payload: "{}", IdempotencyKey: fmt.Sprintf("parallel:%d", i)}); err != nil {
			t.Fatal(err)
		}
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	claimed := map[uuid.UUID]bool{}
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				job, e := repo.Claim(ctx, time.Minute)
				if e != nil {
					t.Error(e)
					return
				}
				if job == nil {
					return
				}
				mu.Lock()
				if claimed[job.ID] {
					t.Error("job claimed twice")
				}
				claimed[job.ID] = true
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if len(claimed) != 20 {
		t.Fatalf("claimed %d jobs", len(claimed))
	}
	cancelJob := repository.JobModel{ProjectID: projectID, Kind: "test", Payload: "{}", IdempotencyKey: "cancel"}
	repository.EnqueueJob(db, &cancelJob)
	if err = repo.Cancel(ctx, projectID, cancelJob.ID); err != nil {
		t.Fatal(err)
	}
	if err = repo.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	var canceled repository.JobModel
	db.First(&canceled, "id = ?", cancelJob.ID)
	if canceled.Status != "cancelled" {
		t.Fatal("cancel request not reconciled")
	}
	activeJob := repository.JobModel{ProjectID: projectID, Kind: "test", Payload: "{}", IdempotencyKey: "active-cancel"}
	if err = repository.EnqueueJob(db, &activeJob); err != nil {
		t.Fatal(err)
	}
	active, err := repo.Claim(ctx, time.Minute)
	if err != nil || active == nil || active.ID != activeJob.ID {
		t.Fatal("active cancellation job not claimed", err)
	}
	if err = repo.Cancel(ctx, projectID, active.ID); err != nil {
		t.Fatal(err)
	}
	if err = repo.Finish(ctx, *active, domain.ErrConflict, false); err != nil {
		t.Fatal(err)
	}
	canceled = repository.JobModel{}
	if err = db.First(&canceled, "id = ?", active.ID).Error; err != nil {
		t.Fatal(err)
	}
	if canceled.Status != "cancelled" || canceled.CompletedAt == nil {
		t.Fatal("active cancellation was retried or marked failed")
	}
}
func TestPublicationUnknownOutcomeNeverRepeatsNetwork(t *testing.T) {
	db := setupTestDB(t)
	projectID := uuid.New()
	ctx := testActorProject(t, db, projectID)
	t.Setenv("ALLOW_LOCAL_OUTBOUND", "true")
	var posts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Idempotency-Key") == "" {
			t.Error("missing idempotency key")
		}
		if r.Method == http.MethodPost {
			posts.Add(1)
			w.Write([]byte("{}"))
		} else {
			w.Write([]byte(`{"external_id":"actual","published_url":"https://example.com/actual"}`))
		}
	}))
	defer server.Close()
	worker := NewWorker(db, config.Config{LeaseDuration: time.Minute, JobTimeout: time.Minute}, nil)
	harness, _ := worker.Copilot.harnessRepo.GetOrCreateConfig(ctx, projectID)
	db.Model(harness).Update("enabled_skills", `["publish"]`)
	asset := repository.ContentAssetModel{ProjectID: projectID, Title: "Asset", ContentBody: "Approved", Status: "approved", Version: 1}
	if err := db.Create(&asset).Error; err != nil {
		t.Fatal(err)
	}
	channel := repository.PublishChannelModel{ProjectID: projectID, Name: "receiver", ChannelType: "webhook", EndpointURL: server.URL, IsActive: true}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	session := repository.CopilotSessionModel{ProjectID: projectID, UserID: domain.ActorFrom(ctx).UserID}
	db.Create(&session)
	raw, _ := json.Marshal(publishArgs{ContentID: asset.ID.String(), Channel: channel.ID.String(), Title: "Publish"})
	preview, err := worker.Copilot.PrepareAction(ctx, session.ID, string(raw))
	if err != nil {
		t.Fatal(err)
	}
	_, err = worker.Copilot.QueueApprovedAction(ctx, session.ID, projectID, session.UserID, preview.InterruptID, "confirm")
	if err != nil {
		t.Fatal(err)
	}
	job, err := worker.Jobs.Claim(ctx, time.Minute)
	if err != nil || job == nil {
		t.Fatal(err)
	}
	if err = worker.Copilot.HandleApprovedJob(ctx, *job); !errors.Is(err, publisher.ErrOutcomeUnknown) {
		t.Fatalf("missing uncertain outcome: %v", err)
	}
	if err = worker.Copilot.HandleApprovedJob(ctx, *job); !errors.Is(err, publisher.ErrOutcomeUnknown) {
		t.Fatal(err)
	}
	if posts.Load() != 1 {
		t.Fatalf("external side effect repeated %d times", posts.Load())
	}
	var publication repository.PublicationModel
	if err = db.First(&publication, "project_id = ?", projectID).Error; err != nil {
		t.Fatal(err)
	}
	if publication.Status != "outcome_unknown" || publication.TargetURL != "" {
		t.Fatalf("fabricated publication receipt: %+v", publication)
	}
	receipt, err := (publisher.Webhook{}).Reconcile(ctx, server.URL, publication.IdempotencyKey, "")
	if err != nil || receipt.ExternalID != "actual" {
		t.Fatalf("receipt lookup failed: %+v %v", receipt, err)
	}
}
func TestApprovalRevalidationAndConcurrentReplay(t *testing.T) {
	db := setupTestDB(t)
	projectID := uuid.New()
	ctx := testActorProject(t, db, projectID)
	worker := NewWorker(db, config.Config{LeaseDuration: time.Minute, JobTimeout: time.Minute}, nil)
	uc := worker.Copilot
	session := repository.CopilotSessionModel{ProjectID: projectID, UserID: domain.ActorFrom(ctx).UserID}
	db.Create(&session)
	preview, err := uc.preparePreview(ctx, projectID, "update_schedule_config", `{"frequency":"daily","time_slot":"09:00"}`)
	if err != nil {
		t.Fatal(err)
	}
	state := CopilotState{SessionID: session.ID, ProjectID: projectID, UserID: session.UserID, PendingAction: preview, InterruptID: preview.InterruptID}
	raw, _ := json.Marshal(state)
	if err = uc.copilotRepo.SaveCheckpoint(ctx, &repository.CopilotCheckpointModel{SessionID: session.ID, ThreadID: session.ID.String(), StateData: string(raw), InterruptID: preview.InterruptID}); err != nil {
		t.Fatal(err)
	}
	var wins atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := uc.QueueApprovedAction(ctx, session.ID, projectID, session.UserID, preview.InterruptID, "confirm"); e == nil {
				wins.Add(1)
			}
		}()
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatalf("replay race accepted %d approvals", wins.Load())
	}
	db.Model(&repository.ProjectModel{}).Where("id = ?", projectID).Update("automation_level", "L1")
	if err = worker.RunOne(ctx); err != nil {
		t.Fatal(err)
	}
	var cp repository.CopilotCheckpointModel
	db.First(&cp, "session_id = ?", session.ID)
	if cp.Status != "failed" {
		t.Fatalf("stale approval not reconciled: %s", cp.Status)
	}
	var count int64
	db.Model(&repository.ScheduleModel{}).Count(&count)
	if count != 0 {
		t.Fatal("stale preview executed")
	}
}
func TestFactsRejectUnsupportedAndPendingClaims(t *testing.T) {
	db := setupTestDB(t)
	projectID := uuid.New()
	testActorProject(t, db, projectID)
	uc := NewContentUsecase(repository.NewContentRepository(db), repository.NewProjectRepository(db))
	db.Create(&repository.BrandFactModel{ProjectID: projectID, FactType: "claim", Statement: "Approved fact", Source: "source", Status: "approved"})
	db.Create(&repository.BrandFactModel{ProjectID: projectID, FactType: "claim", Statement: "Pending fact", Source: "source", Status: "pending"})
	for _, body := range []string{"Approved fact。Unverified promise。", "Approved fact。\n# Unsupported promise", "Pending fact", "Unknown", ""} {
		check, err := uc.VerifyContentFacts(context.Background(), projectID, body)
		if err != nil {
			t.Fatal(err)
		}
		if check.Passed {
			t.Fatalf("unsupported content passed: %q", body)
		}
	}
	checkTitle, err := uc.VerifyAssetFacts(context.Background(), projectID, "Unsupported title", "Approved fact。")
	if err != nil || checkTitle.Passed {
		t.Fatalf("unsupported title passed: %+v %v", checkTitle, err)
	}
	check, err := uc.VerifyContentFacts(context.Background(), projectID, "Approved fact。")
	if err != nil || !check.Passed || len(check.Evidence) == 0 {
		t.Fatalf("approved evidence not recognized: %+v %v", check, err)
	}
}

func TestModelBudgetReservationIsAtomic(t *testing.T) {
	db := setupTestDB(t)
	id := uuid.New()
	ctx := testActorProject(t, db, id)
	db.Model(&repository.ProjectModel{}).Where("id = ?", id).Update("daily_model_call_limit", 1)
	worker := NewWorker(db, config.Config{}, nil)
	var wins atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := worker.Copilot.reserveModelCall(ctx, "configured-model"); err == nil {
				wins.Add(1)
			}
		}()
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatal("model quota raced")
	}
	var record repository.ModelCallModel
	if err := db.First(&record).Error; err != nil {
		t.Fatal(err)
	}
	if record.TokensUsed != nil {
		t.Fatal("unknown token usage fabricated")
	}
}

func TestReconciliationDoesNotStarveOlderFailedRuns(t *testing.T) {
	db := setupTestDB(t)
	projectID := uuid.New()
	testActorProject(t, db, projectID)
	var runs []repository.EvolutionRunModel
	var jobs []repository.JobModel
	for i := 0; i < 205; i++ {
		run := repository.EvolutionRunModel{BaseGormModel: repository.BaseGormModel{ID: uuid.New()}, ProjectID: projectID, Status: "queued"}
		runs = append(runs, run)
		jobs = append(jobs, repository.JobModel{ProjectID: projectID, RunID: &runs[len(runs)-1].ID, Kind: "evolution", Payload: "{}", Status: "failed", IdempotencyKey: uuid.NewString()})
	}
	if err := db.Create(&runs).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&jobs).Error; err != nil {
		t.Fatal(err)
	}
	worker := NewWorker(db, config.Config{}, nil)
	for i := 0; i < 3; i++ {
		if err := worker.Reconcile(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	var pending int64
	db.Model(&repository.EvolutionRunModel{}).Where("project_id = ? AND status = 'queued'", projectID).Count(&pending)
	if pending != 0 {
		t.Fatalf("%d older runs were starved", pending)
	}
	var reconciled int64
	db.Model(&repository.JobModel{}).Where("project_id = ? AND reconciled_at IS NOT NULL", projectID).Count(&reconciled)
	if reconciled != 205 {
		t.Fatalf("reconciled %d of 205 jobs", reconciled)
	}
}
