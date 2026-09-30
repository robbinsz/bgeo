package repository

import (
	"github.com/google/uuid"
	"time"
)

type ProjectMemberModel struct {
	ProjectID uuid.UUID `gorm:"type:uuid;primaryKey" json:"project_id"`
	UserID    uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	Role      string    `gorm:"size:32;not null" json:"role"`
}

type JobModel struct {
	BaseGormModel
	RunID           *uuid.UUID `gorm:"type:uuid;index" json:"run_id,omitempty"`
	ReservedSamples int        `json:"reserved_samples"`
	ProjectID       uuid.UUID  `gorm:"type:uuid;index:idx_job_project;not null" json:"project_id"`
	Kind            string     `gorm:"size:32;not null" json:"kind"`
	Payload         string     `gorm:"type:text;not null" json:"-"`
	Status          string     `gorm:"size:32;index:idx_job_ready;not null" json:"status"`
	IdempotencyKey  string     `gorm:"size:200;uniqueIndex;not null" json:"idempotency_key"`
	Attempts        int        `json:"attempts"`
	MaxAttempts     int        `gorm:"default:3" json:"max_attempts"`
	AvailableAt     time.Time  `gorm:"index:idx_job_ready" json:"available_at"`
	LeaseUntil      *time.Time `gorm:"index" json:"lease_until,omitempty"`
	LeaseToken      string     `gorm:"size:64" json:"-"`
	HeartbeatAt     *time.Time `json:"heartbeat_at,omitempty"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
	ErrorMessage    string     `gorm:"type:text" json:"error_message,omitempty"`
	CancelRequested bool       `json:"cancel_requested"`
}

type ScheduleModel struct {
	ProjectID uuid.UUID `gorm:"type:uuid;primaryKey" json:"project_id"`
	Frequency string    `gorm:"size:16;not null" json:"frequency"`
	TimeSlot  string    `gorm:"size:5;not null" json:"time_slot"`
	NextRunAt time.Time `gorm:"index" json:"next_run_at"`
	Version   int       `gorm:"default:1" json:"version"`
	UpdatedAt time.Time `json:"updated_at"`
}

type PublishChannelModel struct {
	BaseGormModel
	ProjectID     uuid.UUID `gorm:"type:uuid;index;not null" json:"project_id"`
	Name          string    `gorm:"size:120;not null" json:"name"`
	ChannelType   string    `gorm:"size:32;not null" json:"channel_type"`
	EndpointURL   string    `gorm:"size:512;not null" json:"endpoint_url"`
	Credential    string    `gorm:"type:text" json:"-"`
	HasCredential bool      `gorm:"-" json:"has_credential"`
	IsActive      bool      `gorm:"default:true" json:"is_active"`
}

type SchemaMigration struct {
	Version   int `gorm:"primaryKey"`
	AppliedAt time.Time
}

// Request counts are reserved before contacting a provider. Usage is provider-reported, never invented.
type ModelCallModel struct {
	BaseGormModel
	ProjectID       uuid.UUID `gorm:"type:uuid;index" json:"project_id"`
	Model           string    `gorm:"size:128" json:"model"`
	Status          string    `gorm:"size:32" json:"status"`
	MaxOutputTokens int       `json:"max_output_tokens"`
	TokensUsed      *int      `json:"tokens_used,omitempty"`
}
