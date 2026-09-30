package domain

import (
	"time"

	"github.com/google/uuid"
)

type StrategyStatus string

const (
	StrategyDraft     StrategyStatus = "draft"
	StrategyPending   StrategyStatus = "pending_approval"
	StrategyApproved  StrategyStatus = "approved"
	StrategyRunning   StrategyStatus = "running"
	StrategyVerifying StrategyStatus = "verifying"
	StrategyCompleted StrategyStatus = "completed"
	StrategyPaused    StrategyStatus = "paused"
	StrategyRejected  StrategyStatus = "rejected"
)

// Strategy represents an actionable execution plan compiled from opportunities
type Strategy struct {
	ID             uuid.UUID      `json:"id"`
	ProjectID      uuid.UUID      `json:"project_id"`
	Title          string         `json:"title"`
	Objective      string         `json:"objective"`
	Hypothesis     string         `json:"hypothesis"`
	OpportunityIDs []uuid.UUID    `json:"opportunity_ids"`
	RiskLevel      string         `json:"risk_level"` // low, medium, high
	RollbackPlan   string         `json:"rollback_plan"`
	Status         StrategyStatus `json:"status"`
	Assignee       string         `json:"assignee"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

// StrategyTask represents an individual task step in the strategy pipeline
type StrategyTask struct {
	ID           uuid.UUID   `json:"id"`
	StrategyID   uuid.UUID   `json:"strategy_id"`
	TaskType     string      `json:"task_type"` // content_draft, fact_review, approval, publish, retest
	Status       string      `json:"status"`    // pending, running, completed, blocked, failed
	Dependencies []uuid.UUID `json:"dependencies"`
	StartedAt    *time.Time  `json:"started_at,omitempty"`
	CompletedAt  *time.Time  `json:"completed_at,omitempty"`
}
