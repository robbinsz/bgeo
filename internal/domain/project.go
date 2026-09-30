package domain

import (
	"time"

	"github.com/google/uuid"
)

// AutomationLevel defines the autonomy level of a project (L0-L3)
type AutomationLevel string

const (
	AutomationL0 AutomationLevel = "L0" // Pure manual review
	AutomationL1 AutomationLevel = "L1" // AI proposal, human approval
	AutomationL2 AutomationLevel = "L2" // Semi-automatic (auto low risk, review high risk)
	AutomationL3 AutomationLevel = "L3" // Autonomous operations with safety guardrails
)

// Organization represents the top-level tenant
type Organization struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Plan      string    `json:"plan"`
	Status    string    `json:"status"` // active, suspended
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Project represents the operational unit in GeoPilot
type Project struct {
	ID              uuid.UUID       `json:"id"`
	OrganizationID  uuid.UUID       `json:"organization_id"`
	Name            string          `json:"name"`
	BrandName       string          `json:"brand_name"`
	BrandAliases    []string        `json:"brand_aliases"`
	Region          string          `json:"region"`   // e.g. zh-CN, en-US
	Language        string          `json:"language"` // e.g. zh, en
	Timezone        string          `json:"timezone"` // e.g. Asia/Shanghai
	AutomationLevel AutomationLevel `json:"automation_level"`
	IsPaused        bool            `json:"is_paused"`
	ReadinessScore  int             `json:"readiness_score"` // 0 - 100
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// BrandFact represents immutable, versioned brand facts for quality verification
type BrandFact struct {
	ID         uuid.UUID  `json:"id"`
	ProjectID  uuid.UUID  `json:"project_id"`
	FactType   string     `json:"fact_type"` // qualification, pricing, service_scope, contact
	Statement  string     `json:"statement"`
	Source     string     `json:"source"`
	Confidence float64    `json:"confidence"`
	Status     string     `json:"status"` // approved, pending, deprecated
	Version    int        `json:"version"`
	CreatedBy  *uuid.UUID `json:"created_by,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// Competitor represents tracked market competitors
type Competitor struct {
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"project_id"`
	Name      string    `json:"name"`
	Aliases   []string  `json:"aliases"`
	Domain    string    `json:"domain"`
	Region    string    `json:"region"`
	Status    string    `json:"status"` // active, paused
	CreatedAt time.Time `json:"created_at"`
}
