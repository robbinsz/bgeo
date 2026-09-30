package domain

import (
	"time"

	"github.com/google/uuid"
)

type QueryIntent string

const (
	IntentInformational QueryIntent = "informational"
	IntentNavigational  QueryIntent = "navigational"
	IntentCommercial    QueryIntent = "commercial"
	IntentTransactional QueryIntent = "transactional"
)

// Query represents a tracked user query/question in the monitor set
type Query struct {
	ID              uuid.UUID   `json:"id"`
	ProjectID       uuid.UUID   `json:"project_id"`
	QueryText       string      `json:"query_text"`
	Topic           string      `json:"topic"`
	Intent          QueryIntent `json:"intent"`
	BusinessValue   float64     `json:"business_value"` // 0 - 100
	Priority        string      `json:"priority"`       // critical, high, medium, low
	Status          string      `json:"status"`         // active, paused, archived
	SampleFrequency string      `json:"sample_frequency"`
	CreatedAt       time.Time   `json:"created_at"`
}

// AnswerSnapshot represents an immutable sampling result from an AI engine
type AnswerSnapshot struct {
	ID                 uuid.UUID              `json:"id"`
	ProjectID          uuid.UUID              `json:"project_id"`
	QueryID            uuid.UUID              `json:"query_id"`
	ChannelID          string                 `json:"channel_id"` // perplexity, deepseek, chatgpt, etc.
	ModelVersion       string                 `json:"model_version"`
	RawAnswer          string                 `json:"raw_answer"`
	ParsedData         map[string]interface{} `json:"parsed_data"`
	IsBrandMentioned   bool                   `json:"is_brand_mentioned"`
	IsBrandRecommended bool                   `json:"is_brand_recommended"`
	BrandRank          int                    `json:"brand_rank"` // 1-indexed, -1 if not mentioned
	IsRefusal          bool                   `json:"is_refusal"`
	Confidence         float64                `json:"confidence"`
	SampledAt          time.Time              `json:"sampled_at"`
	CreatedAt          time.Time              `json:"created_at"`
}

// MonitorRun represents a scheduled or manual batch monitor run
type MonitorRun struct {
	ID           uuid.UUID  `json:"id"`
	ProjectID    uuid.UUID  `json:"project_id"`
	TriggerType  string     `json:"trigger_type"` // scheduled, manual, event
	Status       string     `json:"status"`       // queued, running, completed, partial_failed, failed
	TotalQueries int        `json:"total_queries"`
	SuccessCount int        `json:"success_count"`
	FailureCount int        `json:"failure_count"`
	StartedAt    time.Time  `json:"started_at"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}
