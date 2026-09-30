package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/delivery/ws"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/pkg/ruleengine"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"math"
	"reflect"
	"slices"
	"time"
)

type EvolutionUsecase struct {
	evoRepo   *repository.EvolutionRepository
	evaluator *ruleengine.Evaluator
	hub       *ws.Hub
}

func NewEvolutionUsecase(r *repository.EvolutionRepository, e *ruleengine.Evaluator, h *ws.Hub) *EvolutionUsecase {
	return &EvolutionUsecase{r, e, h}
}

type proposedRule struct {
	Name          string                 `json:"name"`
	Condition     string                 `json:"condition_expr"`
	ActionPayload map[string]interface{} `json:"action_payload"`
}
type experimentEvaluation struct {
	SampleSize int     `json:"sample_size"`
	Improved   int     `json:"improved"`
	Regressed  int     `json:"regressed"`
	Lift       float64 `json:"lift"`
	Confidence float64 `json:"confidence"`
	Status     string  `json:"status"`
	Reason     string  `json:"reason"`
	Version    string  `json:"version"`
}

func (uc *EvolutionUsecase) EvaluateExperiment(ctx context.Context, experiment *repository.ExperimentModel) (experimentEvaluation, error) {
	evaluation := experimentEvaluation{Status: "inconclusive", Reason: "需要两个已完成的真实监测批次", Version: "paired-mention-v1"}
	if experiment.BaselineRunID == nil || experiment.VariantRunID == nil || *experiment.BaselineRunID == *experiment.VariantRunID {
		return evaluation, nil
	}
	db := uc.evoRepo.DB().WithContext(ctx)
	var runs []repository.MonitorRunModel
	if err := db.Where("project_id = ? AND id IN ? AND status = 'completed'", experiment.ProjectID, []uuid.UUID{*experiment.BaselineRunID, *experiment.VariantRunID}).Find(&runs).Error; err != nil {
		return evaluation, err
	}
	if len(runs) != 2 {
		return evaluation, nil
	}
	var samples []repository.AnswerSnapshotModel
	if err := db.Where("project_id = ? AND run_id IN ? AND source = 'live' AND sample_status = 'valid' AND is_refusal = false", experiment.ProjectID, []uuid.UUID{*experiment.BaselineRunID, *experiment.VariantRunID}).Find(&samples).Error; err != nil {
		return evaluation, err
	}
	baseline := map[string]repository.AnswerSnapshotModel{}
	key := func(s repository.AnswerSnapshotModel) string {
		return s.QueryID.String() + ":" + s.ChannelID + ":" + s.ModelVersion
	}
	for _, sample := range samples {
		if *sample.RunID == *experiment.BaselineRunID {
			baseline[key(sample)] = sample
		}
	}
	baseHits, variantHits := 0, 0
	for _, sample := range samples {
		if *sample.RunID != *experiment.VariantRunID {
			continue
		}
		b, ok := baseline[key(sample)]
		if !ok {
			continue
		}
		var bp, vp samplePayload
		if json.Unmarshal([]byte(b.RequestParameters), &bp) != nil || json.Unmarshal([]byte(sample.RequestParameters), &vp) != nil || bp.Query.QueryText != vp.Query.QueryText || bp.BrandName != vp.BrandName || !reflect.DeepEqual(bp.Options, vp.Options) || !slices.Equal(bp.Aliases, vp.Aliases) || b.ParserVersion != sample.ParserVersion {
			continue
		}
		evaluation.SampleSize++
		if b.IsBrandMentioned {
			baseHits++
		}
		if sample.IsBrandMentioned {
			variantHits++
		}
		if !b.IsBrandMentioned && sample.IsBrandMentioned {
			evaluation.Improved++
		}
		if b.IsBrandMentioned && !sample.IsBrandMentioned {
			evaluation.Regressed++
		}
	}
	if evaluation.SampleSize > 0 {
		evaluation.Lift = float64(variantHits-baseHits) / float64(evaluation.SampleSize)
		experiment.BaselineRate = float64(baseHits) / float64(evaluation.SampleSize)
		experiment.VariantRate = float64(variantHits) / float64(evaluation.SampleSize)
	}
	// Exact paired sign test for discordant outcomes; this fixed primary metric is not selected after seeing results.
	n := evaluation.Improved + evaluation.Regressed
	if n > 0 {
		cutoff := min(evaluation.Improved, evaluation.Regressed)
		logSum := math.Inf(-1)
		for k := 0; k <= cutoff; k++ {
			a, _ := math.Lgamma(float64(n + 1))
			b, _ := math.Lgamma(float64(k + 1))
			c, _ := math.Lgamma(float64(n - k + 1))
			term := a - b - c - float64(n)*math.Log(2)
			if math.IsInf(logSum, -1) {
				logSum = term
			} else {
				hi := math.Max(logSum, term)
				logSum = hi + math.Log(math.Exp(logSum-hi)+math.Exp(term-hi))
			}
		}
		evaluation.Confidence = 1 - math.Min(1, 2*math.Exp(logSum))
	}
	evaluation.Reason = "至少 20 个匹配样本、95% 置信度和 5% 绝对增益；结论仅适用于此实验问题集"
	if evaluation.SampleSize >= 20 && evaluation.Confidence >= 0.95 && evaluation.Lift >= 0.05 {
		evaluation.Status = "passed"
	} else if evaluation.SampleSize >= 20 && evaluation.Lift < 0 && evaluation.Confidence >= 0.95 {
		evaluation.Status = "failed"
	}
	return evaluation, nil
}

func (uc *EvolutionUsecase) ExecuteEvolutionRun(ctx context.Context, projectID uuid.UUID) (*repository.EvolutionRunModel, error) {
	var project repository.ProjectModel
	if err := uc.evoRepo.DB().WithContext(ctx).Where("id = ?", projectID).First(&project).Error; err != nil {
		return nil, err
	}
	if project.IsPaused {
		return nil, domain.ErrPaused
	}
	run := &repository.EvolutionRunModel{BaseGormModel: repository.BaseGormModel{ID: uuid.New()}, ProjectID: projectID, Status: "queued", StageName: "等待实验评估", StartedAt: time.Now()}
	err := uc.evoRepo.DB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(run).Error; err != nil {
			return err
		}
		raw, _ := json.Marshal(run.ID)
		return repository.EnqueueJob(tx, &repository.JobModel{ProjectID: projectID, RunID: &run.ID, Kind: "evolution", Payload: string(raw), IdempotencyKey: "evolution:" + run.ID.String()})
	})
	return run, err
}

func (uc *EvolutionUsecase) HandleJob(ctx context.Context, job repository.JobModel) error {
	var id uuid.UUID
	if err := json.Unmarshal([]byte(job.Payload), &id); err != nil {
		return err
	}
	db := uc.evoRepo.DB().WithContext(ctx)
	var experiments []repository.ExperimentModel
	if err := db.Where("project_id = ? AND status IN ('pending','draft','running','inconclusive','passed')", job.ProjectID).Limit(100).Find(&experiments).Error; err != nil {
		return err
	}
	candidates := 0
	for i := range experiments {
		experiment := &experiments[i]
		evaluation, err := uc.EvaluateExperiment(ctx, experiment)
		if err != nil {
			return err
		}
		raw, _ := json.Marshal(evaluation)
		if err := db.Model(experiment).Updates(map[string]interface{}{"evaluation": string(raw), "status": evaluation.Status, "sample_size": evaluation.SampleSize, "confidence": evaluation.Confidence, "baseline_rate": experiment.BaselineRate, "variant_rate": experiment.VariantRate}).Error; err != nil {
			return err
		}
		if evaluation.Status != "passed" || experiment.ProposedRule == "" {
			continue
		}
		var proposal proposedRule
		if err := json.Unmarshal([]byte(experiment.ProposedRule), &proposal); err != nil {
			return fmt.Errorf("%w: invalid proposed rule", domain.ErrInvalid)
		}
		if proposal.Name == "" || proposal.Condition == "" {
			return domain.ErrInvalid
		}
		if _, err := uc.evaluator.EvaluateCondition(proposal.Condition, map[string]interface{}{"query": map[string]interface{}{"intent": "commercial"}, "content": map[string]interface{}{"has_pricing": true}}); err != nil {
			return err
		}
		factID, ok := proposal.ActionPayload["fact_id"].(string)
		if !ok {
			return domain.ErrInvalid
		}
		var count int64
		if err := db.Model(&repository.BrandFactModel{}).Where("id = ? AND project_id = ? AND status = 'approved' AND source <> ''", factID, job.ProjectID).Count(&count).Error; err != nil {
			return err
		}
		if count != 1 {
			return domain.ErrInvalid
		}
		payload, _ := json.Marshal(proposal.ActionPayload)
		evidence, _ := json.Marshal([]uuid.UUID{*experiment.BaselineRunID, *experiment.VariantRunID})
		rule := repository.RuleModel{ProjectID: job.ProjectID, ExperimentID: &experiment.ID, RuleName: proposal.Name, Category: "template_strategy", ConditionExpr: proposal.Condition, ActionType: "append_evidence_citation", ActionPayload: string(payload), Status: "candidate", Version: "candidate-" + experiment.ID.String(), SampleSize: evaluation.SampleSize, ImpactScore: evaluation.Lift * 100, EvidenceIDs: string(evidence)}
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := verifyLease(tx, job); err != nil {
				return err
			}
			return tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "experiment_id"}}, DoNothing: true}).Create(&rule).Error
		})
		if err != nil {
			return err
		}
		candidates++
	}
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := verifyLease(tx, job); err != nil {
			return err
		}
		return tx.Model(&repository.EvolutionRunModel{}).Where("id = ? AND project_id = ?", id, job.ProjectID).Updates(map[string]interface{}{"status": "completed", "current_stage": 6, "stage_name": fmt.Sprintf("评估完成：%d 个实验符合候选门槛", candidates), "percentage": 100, "completed_at": time.Now()}).Error
	})
	if err == nil && uc.hub != nil {
		uc.hub.BroadcastProject(job.ProjectID, "EVOLUTION_PROGRESS", "evolution", map[string]interface{}{"run_id": id, "stage_index": 5, "percentage": 100, "label": fmt.Sprintf("%d 个实验符合门槛", candidates), "is_completed": true})
	}
	return err
}

func (uc *EvolutionUsecase) ApproveRule(ctx context.Context, ruleID uuid.UUID) error {
	actor := domain.ActorFrom(ctx)
	if !domain.CanReview(actor.Role) || actor.UserID == uuid.Nil {
		return domain.ErrForbidden
	}
	return uc.evoRepo.DB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var project repository.ProjectModel
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", actor.ProjectID).First(&project).Error; err != nil {
			return err
		}
		if project.IsPaused {
			return domain.ErrPaused
		}
		var rule repository.RuleModel
		if err := tx.Where("id = ? AND project_id = ? AND status = 'candidate'", ruleID, actor.ProjectID).First(&rule).Error; err != nil {
			return err
		}
		if rule.ExperimentID == nil {
			return fmt.Errorf("%w: rule has no experiment evidence", domain.ErrInvalid)
		}
		var experiment repository.ExperimentModel
		if err := tx.Where("id = ? AND project_id = ? AND status = 'passed' AND sample_size >= 20 AND confidence >= 0.95", *rule.ExperimentID, actor.ProjectID).First(&experiment).Error; err != nil {
			return err
		}
		var previous repository.RuleModel
		if err := tx.Where("project_id = ? AND category = ? AND status = 'stable'", actor.ProjectID, rule.Category).Order("approved_at desc").First(&previous).Error; err == nil {
			rule.PreviousRuleID = &previous.ID
			if err = tx.Model(&previous).Update("status", "paused").Error; err != nil {
				return err
			}
		} else if err != gorm.ErrRecordNotFound {
			return err
		}
		rule.Status = "stable"
		now := time.Now()
		rule.ApprovedAt = &now
		rule.ApprovedBy = &actor.UserID
		rule.Version = "stable-" + rule.ID.String()
		if err := tx.Save(&rule).Error; err != nil {
			return err
		}
		return tx.Create(&repository.AuditLogModel{ProjectID: actor.ProjectID, UserID: actor.UserID, Action: "approve_rule", Entity: "rule", EntityID: rule.ID.String(), Details: rule.EvidenceIDs}).Error
	})
}

func (uc *EvolutionUsecase) RollbackRule(ctx context.Context, ruleID uuid.UUID) error {
	actor := domain.ActorFrom(ctx)
	if !domain.CanReview(actor.Role) {
		return domain.ErrForbidden
	}
	return uc.evoRepo.DB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var project repository.ProjectModel
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", actor.ProjectID).First(&project).Error; err != nil {
			return err
		}
		var rule repository.RuleModel
		if err := tx.Where("id = ? AND project_id = ? AND status = 'stable'", ruleID, actor.ProjectID).First(&rule).Error; err != nil {
			return err
		}
		if err := tx.Model(&rule).Update("status", "rolled_back").Error; err != nil {
			return err
		}
		if rule.PreviousRuleID != nil {
			result := tx.Model(&repository.RuleModel{}).Where("id = ? AND project_id = ? AND status = 'paused'", *rule.PreviousRuleID, actor.ProjectID).Update("status", "stable")
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return domain.ErrConflict
			}
		}
		return tx.Create(&repository.AuditLogModel{ProjectID: actor.ProjectID, UserID: actor.UserID, Action: "rollback_rule", Entity: "rule", EntityID: rule.ID.String()}).Error
	})
}
