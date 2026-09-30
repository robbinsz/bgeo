package usecase

import (
	"encoding/json"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"testing"
	"time"
)

func TestEvidenceEvaluationRuleActivationAndRollback(t *testing.T) {
	db := setupTestDB(t)
	projectID := uuid.New()
	ctx := testActorProject(t, db, projectID)
	worker := NewWorker(db, config.Config{LeaseDuration: time.Minute, JobTimeout: time.Minute}, nil)
	baseline := repository.MonitorRunModel{ProjectID: projectID, Status: "completed", TotalQueries: 20}
	variant := repository.MonitorRunModel{ProjectID: projectID, Status: "completed", TotalQueries: 20}
	db.Create(&baseline)
	db.Create(&variant)
	for i := 0; i < 20; i++ {
		q := repository.QueryModel{BaseGormModel: repository.BaseGormModel{ID: uuid.New()}, ProjectID: projectID, QueryText: "Same prompt", Intent: "commercial"}
		parameters, _ := json.Marshal(samplePayload{Query: q, BrandName: "Bgeo", Options: domain.SampleOptions{MaxTokens: 2048}})
		for _, runID := range []uuid.UUID{baseline.ID, variant.ID} {
			if err := db.Create(&repository.AnswerSnapshotModel{ProjectID: projectID, RunID: &runID, QueryID: q.ID, ChannelID: "provider", Source: "live", SampleStatus: "valid", ParserVersion: "v1", RequestParameters: string(parameters), ModelVersion: "model", IsBrandMentioned: runID == variant.ID, SampledAt: time.Now()}).Error; err != nil {
				t.Fatal(err)
			}
		}
	}
	fact := repository.BrandFactModel{ProjectID: projectID, FactType: "claim", Statement: "Approved evidence", Source: "https://example.com/evidence", Status: "approved"}
	db.Create(&fact)
	other := repository.BrandFactModel{ProjectID: projectID, FactType: "claim", Statement: "Other approved fact", Source: "source", Status: "approved"}
	db.Create(&other)
	proposal, _ := json.Marshal(proposedRule{Name: "Evidence-backed candidate", Condition: `query.intent == "commercial"`, ActionPayload: map[string]interface{}{"fact_id": fact.ID.String()}})
	experiment := repository.ExperimentModel{ProjectID: projectID, Title: "Paired comparison", Hypothesis: "Evidence correlates with mentions", BaselineRunID: &baseline.ID, VariantRunID: &variant.ID, ProposedRule: string(proposal), Status: "pending"}
	db.Create(&experiment)
	evaluation, err := worker.Evolution.EvaluateExperiment(ctx, &experiment)
	if err != nil || evaluation.Status != "passed" || evaluation.SampleSize != 20 || evaluation.Confidence < 0.95 {
		t.Fatalf("bad paired test: %+v %v", evaluation, err)
	}
	db.Model(&repository.AnswerSnapshotModel{}).Where("run_id = ?", variant.ID).Update("model_version", "changed")
	evaluation, err = worker.Evolution.EvaluateExperiment(ctx, &experiment)
	if err != nil || evaluation.Status != "inconclusive" || evaluation.SampleSize != 0 {
		t.Fatal("model drift treated as matched samples")
	}
	db.Model(&repository.AnswerSnapshotModel{}).Where("run_id = ?", variant.ID).Update("model_version", "model")
	previous := repository.RuleModel{ProjectID: projectID, RuleName: "Previous", Category: "template_strategy", ConditionExpr: `query.intent == "commercial"`, ActionType: "append_evidence_citation", ActionPayload: string(proposal), Status: "stable", Version: "previous"}
	db.Create(&previous)
	if _, err = worker.Evolution.ExecuteEvolutionRun(ctx, projectID); err != nil {
		t.Fatal(err)
	}
	if err = worker.RunOne(ctx); err != nil {
		t.Fatal(err)
	}
	var rule repository.RuleModel
	if err = db.Where("experiment_id = ?", experiment.ID).First(&rule).Error; err != nil {
		t.Fatal(err)
	}
	if rule.Status != "candidate" {
		t.Fatal("rule automatically activated")
	}
	if err = worker.Evolution.ApproveRule(ctx, rule.ID); err != nil {
		t.Fatal(err)
	}
	var paused repository.RuleModel
	db.First(&paused, "id = ?", previous.ID)
	if paused.Status != "paused" {
		t.Fatal("previous version not paused")
	}
	content := NewContentUsecase(repository.NewContentRepository(db), repository.NewProjectRepository(db))
	asset, err := content.CreateContentAsset(ctx, projectID, "Draft", "faq", other.Statement, map[string]interface{}{"intent": "commercial"})
	if err != nil {
		t.Fatal(err)
	}
	if asset.ContentBody != other.Statement+"\n"+fact.Statement {
		t.Fatalf("stable rule not applied: %s", asset.ContentBody)
	}
	if err = worker.Evolution.RollbackRule(ctx, rule.ID); err != nil {
		t.Fatal(err)
	}
	db.First(&paused, "id = ?", previous.ID)
	if paused.Status != "stable" {
		t.Fatal("rollback did not restore previous version")
	}
	if err = worker.Evolution.RollbackRule(ctx, rule.ID); err == nil {
		t.Fatal("rollback replay accepted")
	}
}
