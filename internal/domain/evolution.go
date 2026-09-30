package domain

import (
	"time"

	"github.com/google/uuid"
)

type RuleStatus string

const (
	RuleCandidate  RuleStatus = "candidate"   // 待验证/待审批
	RuleStable     RuleStatus = "stable"      // 生产稳定生效
	RulePaused     RuleStatus = "paused"      // 暂停
	RuleRolledBack RuleStatus = "rolled_back" // 已回滚
	RuleRejected   RuleStatus = "rejected"    // 已驳回
)

// Rule represents a versioned self-evolving strategy rule (Condition-Action AST)
type Rule struct {
	ID             uuid.UUID              `json:"id"`
	ProjectID      uuid.UUID              `json:"project_id"`
	RuleName       string                 `json:"rule_name"`
	Category       string                 `json:"category"`       // opportunity_weight, template_strategy, channel_priority
	ConditionExpr  string                 `json:"condition_expr"` // Expr expression string
	ActionType     string                 `json:"action_type"`
	ActionPayload  map[string]interface{} `json:"action_payload"`
	Status         RuleStatus             `json:"status"`
	Version        string                 `json:"version"` // e.g. "v2.8", "v2.9"
	PreviousRuleID *uuid.UUID             `json:"previous_rule_id,omitempty"`
	SampleSize     int                    `json:"sample_size"`
	ImpactScore    float64                `json:"impact_score"`
	CreatedAt      time.Time              `json:"created_at"`
	ApprovedAt     *time.Time             `json:"approved_at,omitempty"`
	ApprovedBy     *uuid.UUID             `json:"approved_by,omitempty"`
}

// EvolutionRun represents one cycle of self-evolution pipeline
type EvolutionRun struct {
	ID           uuid.UUID  `json:"id"`
	ProjectID    uuid.UUID  `json:"project_id"`
	CurrentStage int        `json:"current_stage"` // 1 - 6
	StageName    string     `json:"stage_name"`
	Percentage   int        `json:"percentage"`
	Status       string     `json:"status"` // running, completed, paused, failed
	StartedAt    time.Time  `json:"started_at"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}
