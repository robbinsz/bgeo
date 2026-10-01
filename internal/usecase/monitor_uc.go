package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"regexp"
	"strings"
	"time"
)

type MonitorUsecase struct {
	monitorRepo *repository.MonitorRepository
	oppRepo     *repository.OpportunityRepository
	connector   domain.AISearchConnector
	hub         domain.EventSink
}

func NewMonitorUsecase(m *repository.MonitorRepository, o *repository.OpportunityRepository, c domain.AISearchConnector, h domain.EventSink) *MonitorUsecase {
	return &MonitorUsecase{m, o, c, h}
}

type monitorPayload struct {
	RunID     uuid.UUID
	Queries   []repository.QueryModel
	BrandName string
	Aliases   []string
}
type samplePayload struct {
	Options   domain.SampleOptions
	RunID     uuid.UUID
	Query     repository.QueryModel
	BrandName string
	Aliases   []string
}

func (uc *MonitorUsecase) ExecuteBatchRun(ctx context.Context, projectID uuid.UUID) (*repository.MonitorRunModel, error) {
	var run repository.MonitorRunModel
	err := uc.monitorRepo.DB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var project repository.ProjectModel
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", projectID).First(&project).Error; err != nil {
			return err
		}
		if project.IsPaused {
			return domain.ErrPaused
		}
		var active int64
		if err := tx.Model(&repository.MonitorRunModel{}).Where("project_id = ? AND status IN ('queued','running')", projectID).Count(&active).Error; err != nil {
			return err
		}
		if active > 0 {
			return fmt.Errorf("%w: monitor run already active", domain.ErrConflict)
		}
		queries, err := repository.NewMonitorRepository(tx).ListQueries(ctx, projectID)
		if err != nil {
			return err
		}
		if len(queries) == 0 {
			return fmt.Errorf("%w: no active queries", domain.ErrInvalid)
		}
		var reserved int64
		if err := tx.Model(&repository.JobModel{}).Where("project_id = ? AND kind = 'monitor_run' AND created_at > ?", projectID, time.Now().Add(-24*time.Hour)).Select("COALESCE(SUM(reserved_samples),0)").Scan(&reserved).Error; err != nil {
			return err
		}
		if project.DailySampleLimit <= 0 || reserved+int64(len(queries)*3) > int64(project.DailySampleLimit) {
			return fmt.Errorf("%w: daily sample budget exceeded", domain.ErrConflict)
		}
		var aliases []string
		_ = json.Unmarshal([]byte(project.BrandAliases), &aliases)
		run = repository.MonitorRunModel{BaseGormModel: repository.BaseGormModel{ID: uuid.New()}, ProjectID: projectID, TriggerType: "manual", Status: "queued", TotalQueries: len(queries)}
		if err := tx.Create(&run).Error; err != nil {
			return err
		}
		payload, err := json.Marshal(monitorPayload{run.ID, queries, project.BrandName, aliases})
		if err != nil {
			return err
		}
		return repository.EnqueueJob(tx, &repository.JobModel{ProjectID: projectID, RunID: &run.ID, Kind: "monitor_run", Payload: string(payload), IdempotencyKey: "monitor:" + run.ID.String(), ReservedSamples: len(queries) * 3})
	})
	return &run, err
}

func verifyLease(tx *gorm.DB, job repository.JobModel) error {
	var current repository.JobModel
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND status = 'running' AND lease_token = ? AND lease_until > ? AND cancel_requested = false", job.ID, job.LeaseToken, time.Now()).First(&current).Error; err != nil {
		return domain.ErrConflict
	}
	return nil
}

func (uc *MonitorUsecase) HandleJob(ctx context.Context, job repository.JobModel) error {
	db := uc.monitorRepo.DB().WithContext(ctx)
	if job.Kind == "monitor_run" {
		var payload monitorPayload
		if err := json.Unmarshal([]byte(job.Payload), &payload); err != nil {
			return err
		}
		if uc.connector == nil {
			return errors.New("sampling connector is unavailable")
		}
		return db.Transaction(func(tx *gorm.DB) error {
			if err := verifyLease(tx, job); err != nil {
				return err
			}
			jobs := make([]repository.JobModel, 0, len(payload.Queries))
			for _, query := range payload.Queries {
				raw, err := json.Marshal(samplePayload{Options: domain.SampleOptions{MaxTokens: 2048, Temperature: 0.2, TimeoutSec: 30}, RunID: payload.RunID, Query: query, BrandName: payload.BrandName, Aliases: payload.Aliases})
				if err != nil {
					return err
				}
				jobs = append(jobs, repository.JobModel{BaseGormModel: repository.BaseGormModel{ID: uuid.New()}, ProjectID: job.ProjectID, RunID: &payload.RunID, Kind: "monitor_sample", Payload: string(raw), Status: "queued", IdempotencyKey: "sample:" + payload.RunID.String() + ":" + query.ID.String() + ":" + uc.connector.ChannelID(), MaxAttempts: 3, AvailableAt: time.Now()})
			}
			if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "idempotency_key"}}, DoNothing: true}).CreateInBatches(jobs, 200).Error; err != nil {
				return err
			}
			return tx.Model(&repository.MonitorRunModel{}).Where("id = ? AND project_id = ?", payload.RunID, job.ProjectID).Updates(map[string]interface{}{"status": "running", "started_at": time.Now()}).Error
		})
	}
	if job.Kind != "monitor_sample" {
		return domain.ErrInvalid
	}
	var payload samplePayload
	if err := json.Unmarshal([]byte(job.Payload), &payload); err != nil {
		return err
	}
	if uc.connector == nil {
		return errors.New("sampling connector is unavailable")
	}
	result, sampleErr := uc.connector.Sample(ctx, payload.Query.QueryText, payload.Options)
	source := "live"
	if config.Demo() {
		source = "demo"
	}
	snapshot := repository.AnswerSnapshotModel{BaseGormModel: repository.BaseGormModel{ID: uuid.New()}, ProjectID: job.ProjectID, RunID: &payload.RunID, QueryID: payload.Query.ID, ChannelID: uc.connector.ChannelID(), Source: source, ParserVersion: "mention-list-v1", RequestParameters: job.Payload, SampleStatus: "failed", SampledAt: time.Now(), BrandRank: -1}
	if sampleErr == nil && result != nil {
		if (result.Source != "live" && !(result.Source == "demo" && config.Demo())) || strings.TrimSpace(result.RawText) == "" {
			sampleErr = fmt.Errorf("demo result rejected in live mode")
		} else {
			parsed, err := json.Marshal(result)
			if err != nil {
				return err
			}
			snapshot.RawAnswer = result.RawText
			snapshot.ParsedData = string(parsed)
			snapshot.ModelVersion = result.ModelVersion
			snapshot.IsRefusal = result.IsRefusal
			snapshot.Source = result.Source
			snapshot.IsBrandMentioned, snapshot.IsBrandRecommended, snapshot.BrandRank = parseBrand(result.RawText, payload.BrandName, payload.Aliases)
			snapshot.SampleStatus = "valid"
		}
	} else if sampleErr == nil {
		sampleErr = fmt.Errorf("provider returned no sampling result")
	}
	if sampleErr != nil {
		snapshot.ErrorMessage = sampleErr.Error()
	}
	if err := db.Transaction(func(tx *gorm.DB) error {
		if err := verifyLease(tx, job); err != nil {
			return err
		}
		return tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "run_id"}, {Name: "query_id"}, {Name: "channel_id"}}, DoUpdates: clause.AssignmentColumns([]string{"raw_answer", "parsed_data", "model_version", "is_brand_mentioned", "is_brand_recommended", "brand_rank", "is_refusal", "source", "sample_status", "error_message", "sampled_at", "updated_at"})}).Create(&snapshot).Error
	}); err != nil {
		return err
	}
	if err := db.Select("id").Where("run_id = ? AND query_id = ? AND channel_id = ?", payload.RunID, payload.Query.ID, uc.connector.ChannelID()).First(&snapshot).Error; err != nil {
		return err
	}
	if sampleErr == nil && !snapshot.IsBrandMentioned && !snapshot.IsRefusal {
		evidence, _ := json.Marshal([]uuid.UUID{snapshot.ID})
		// One evidence-linked gap per successful sample. Retry upserts never fabricate a rank or impact.
		var existing int64
		if err := db.Model(&repository.OpportunityModel{}).Where("project_id = ? AND evidence_ids = ?", job.ProjectID, string(evidence)).Count(&existing).Error; err != nil {
			return err
		}
		if existing == 0 {
			if err := uc.oppRepo.CreateOpportunity(ctx, &repository.OpportunityModel{ProjectID: job.ProjectID, Type: "brand_absent", Title: "品牌未被提及：" + payload.Query.QueryText, Description: "该回答快照未发现已配置的品牌名称或别名。", Score: domain.CalculateOpportunityScore(payload.Query.BusinessValue, 100, 50, 50, 20), ImpactScore: payload.Query.BusinessValue, GapScore: 100, FeasibilityScore: 50, ConfidenceScore: 50, RiskCost: 20, Status: "new", RecommendedAction: "人工核对原始回答与品牌别名后创建优化策略", EvidenceIDs: string(evidence)}); err != nil {
				return err
			}
		}
	}
	return sampleErr
}

// RefreshRuns derives persisted progress from durable child jobs, including worker exhaustion and cancellation.
func (uc *MonitorUsecase) RefreshRuns(ctx context.Context) error {
	db := uc.monitorRepo.DB().WithContext(ctx)
	var runs []repository.MonitorRunModel
	if err := db.Where("status IN ('queued','running')").Limit(100).Find(&runs).Error; err != nil {
		return err
	}
	for _, run := range runs {
		var remaining int64
		if err := db.Model(&repository.JobModel{}).Where("run_id = ? AND status IN ('queued','running')", run.ID).Count(&remaining).Error; err != nil {
			return err
		}
		var valid int64
		if err := db.Model(&repository.AnswerSnapshotModel{}).Where("run_id = ? AND sample_status = 'valid'", run.ID).Count(&valid).Error; err != nil {
			return err
		}
		updates := map[string]interface{}{"success_count": valid}
		if remaining == 0 {
			status := "completed"
			failure := run.TotalQueries - int(valid)
			if failure > 0 {
				status = "partial_failed"
			}
			if valid == 0 {
				status = "failed"
			}
			updates["status"] = status
			updates["failure_count"] = failure
			updates["completed_at"] = time.Now()
		}
		if err := db.Model(&repository.MonitorRunModel{}).Where("id = ?", run.ID).Updates(updates).Error; err != nil {
			return err
		}
		if uc.hub != nil {
			uc.hub.BroadcastProject(run.ProjectID, "CYCLE_PROGRESS", "monitor", map[string]interface{}{"run_id": run.ID, "step_index": 0, "step_name": "监测", "label": fmt.Sprintf("有效采样 %d / %d", valid, run.TotalQueries), "is_completed": remaining == 0, "status": updates["status"]})
		}
	}
	return nil
}

func parseBrand(raw, brand string, aliases []string) (bool, bool, int) {
	names := append([]string{brand}, aliases...)
	mentioned := false
	rank := -1
	list := regexp.MustCompile(`^\s*(\d{1,2})[.)、．]\s+`)
	for _, name := range names {
		if strings.TrimSpace(name) == "" {
			continue
		}
		pattern := regexp.QuoteMeta(name)
		if regexp.MustCompile(`^[a-zA-Z0-9 ._-]+$`).MatchString(name) {
			pattern = `(?:^|[^\p{L}\p{N}])` + pattern + `(?:$|[^\p{L}\p{N}])`
		}
		re := regexp.MustCompile("(?i)" + pattern)
		if !re.MatchString(raw) {
			continue
		}
		mentioned = true
		for _, line := range strings.Split(raw, "\n") {
			if re.MatchString(line) {
				if m := list.FindStringSubmatch(line); len(m) == 2 {
					var n int
					if _, err := fmt.Sscanf(m[1], "%d", &n); err == nil && (rank < 0 || n < rank) {
						rank = n
					}
				}
			}
		}
	}
	return mentioned, rank > 0, rank
}

// Metrics uses the latest terminal batch only; legacy/demo and failed/refused responses are excluded.
func (uc *MonitorUsecase) Metrics(ctx context.Context, projectID uuid.UUID) (map[string]interface{}, error) {
	db := uc.monitorRepo.DB().WithContext(ctx)
	data := map[string]interface{}{"voice_share": nil, "query_coverage": nil, "avg_rank": nil, "citations_count": 0, "valid_samples": 0, "failed_samples": 0, "source": "live", "active_rules_count": 0}
	var rules int64
	if err := db.Model(&repository.RuleModel{}).Where("project_id = ? AND status = 'stable'", projectID).Count(&rules).Error; err != nil {
		return nil, err
	}
	data["active_rules_count"] = rules
	var run repository.MonitorRunModel
	err := db.Where("project_id = ? AND status IN ('completed','partial_failed','failed')", projectID).Order("created_at DESC").First(&run).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return data, nil
	}
	if err != nil {
		return nil, err
	}
	data["run_id"] = run.ID
	data["status"] = run.Status
	data["failed_samples"] = run.FailureCount
	var samples []repository.AnswerSnapshotModel
	if err = db.Where("run_id = ? AND source = 'live' AND sample_status = 'valid' AND is_refusal = false", run.ID).Find(&samples).Error; err != nil {
		return nil, err
	}
	data["valid_samples"] = len(samples)
	if len(samples) == 0 {
		return data, nil
	}
	mentioned, ranked, totalRank, citations := 0, 0, 0, 0
	for _, sample := range samples {
		if sample.IsBrandMentioned {
			mentioned++
		}
		if sample.BrandRank > 0 {
			ranked++
			totalRank += sample.BrandRank
		}
		var parsed domain.SamplingResult
		if json.Unmarshal([]byte(sample.ParsedData), &parsed) == nil {
			citations += len(parsed.Citations)
		}
	}
	data["voice_share"] = float64(mentioned) * 100 / float64(len(samples))
	data["query_coverage"] = float64(len(samples)) * 100 / float64(run.TotalQueries)
	data["citations_count"] = citations
	if ranked > 0 {
		data["avg_rank"] = float64(totalRank) / float64(ranked)
	}
	return data, nil
}
