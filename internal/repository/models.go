package repository

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Base model with UUID primary key
type BaseGormModel struct {
	ID        uuid.UUID      `gorm:"type:uuid;primary_key;" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (b *BaseGormModel) BeforeCreate(tx *gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}

type OrganizationModel struct {
	BaseGormModel
	Name   string `gorm:"size:120;not null" json:"name"`
	Plan   string `gorm:"size:32;default:'pro'" json:"plan"`
	Status string `gorm:"size:32;default:'active'" json:"status"`
}

func (OrganizationModel) TableName() string {
	return "organizations"
}

type ProjectModel struct {
	BaseGormModel
	OrganizationID      uuid.UUID `gorm:"type:uuid;index;not null" json:"organization_id"`
	Name                string    `gorm:"size:120;not null" json:"name"`
	BrandName           string    `gorm:"size:120;not null" json:"brand_name"`
	BrandAliases        string    `gorm:"type:text" json:"brand_aliases"` // JSON array string
	Region              string    `gorm:"size:32;default:'zh-CN'" json:"region"`
	Language            string    `gorm:"size:16;default:'zh'" json:"language"`
	Timezone            string    `gorm:"size:64;default:'Asia/Shanghai'" json:"timezone"`
	AutomationLevel     string    `gorm:"size:8;default:'L2'" json:"automation_level"`
	IsPaused            bool      `gorm:"default:false" json:"is_paused"`
	ReadinessScore      int       `gorm:"default:85" json:"readiness_score"`
	DailySampleLimit    int       `gorm:"default:10000" json:"daily_sample_limit"`
	DailyModelCallLimit int       `gorm:"default:500" json:"daily_model_call_limit"`
}

func (ProjectModel) TableName() string {
	return "projects"
}

type BrandFactModel struct {
	BaseGormModel
	ProjectID  uuid.UUID  `gorm:"type:uuid;index;not null" json:"project_id"`
	FactType   string     `gorm:"size:64;index;not null" json:"fact_type"`
	Statement  string     `gorm:"type:text;not null" json:"statement"`
	Source     string     `gorm:"type:text;not null" json:"source"`
	Confidence float64    `gorm:"default:1.0" json:"confidence"`
	Status     string     `gorm:"size:32;default:'pending'" json:"status"`
	Version    int        `gorm:"default:1" json:"version"`
	CreatedBy  *uuid.UUID `gorm:"type:uuid" json:"created_by,omitempty"`
}

func (BrandFactModel) TableName() string {
	return "brand_facts"
}

type CompetitorModel struct {
	BaseGormModel
	ProjectID uuid.UUID `gorm:"type:uuid;index;not null" json:"project_id"`
	Name      string    `gorm:"size:120;not null" json:"name"`
	Aliases   string    `gorm:"type:text" json:"aliases"` // JSON array string
	Domain    string    `gorm:"size:255" json:"domain"`
	Region    string    `gorm:"size:32;default:'zh-CN'" json:"region"`
	Status    string    `gorm:"size:32;default:'active'" json:"status"`
}

func (CompetitorModel) TableName() string {
	return "competitors"
}

type QueryModel struct {
	BaseGormModel
	ProjectID       uuid.UUID `gorm:"type:uuid;index;not null" json:"project_id"`
	QueryText       string    `gorm:"type:text;not null" json:"query_text"`
	Topic           string    `gorm:"size:64;index" json:"topic"`
	Intent          string    `gorm:"size:32;default:'informational'" json:"intent"`
	BusinessValue   float64   `gorm:"default:50.0" json:"business_value"`
	Priority        string    `gorm:"size:16;default:'medium'" json:"priority"`
	Status          string    `gorm:"size:32;default:'active'" json:"status"`
	SampleFrequency string    `gorm:"size:32;default:'daily'" json:"sample_frequency"`
}

func (QueryModel) TableName() string {
	return "queries"
}

type MonitorRunModel struct {
	BaseGormModel
	ProjectID    uuid.UUID  `gorm:"type:uuid;index;not null" json:"project_id"`
	TriggerType  string     `gorm:"size:32;default:'scheduled'" json:"trigger_type"`
	Status       string     `gorm:"size:32;default:'completed'" json:"status"`
	TotalQueries int        `gorm:"default:0" json:"total_queries"`
	SuccessCount int        `gorm:"default:0" json:"success_count"`
	FailureCount int        `gorm:"default:0" json:"failure_count"`
	StartedAt    time.Time  `json:"started_at"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}

func (MonitorRunModel) TableName() string {
	return "monitor_runs"
}

type AnswerSnapshotModel struct {
	BaseGormModel
	RunID              *uuid.UUID `gorm:"type:uuid;index;uniqueIndex:idx_run_query_channel" json:"run_id,omitempty"`
	Source             string     `gorm:"size:16;default:'legacy'" json:"source"`
	ParserVersion      string     `gorm:"size:32" json:"parser_version"`
	RequestParameters  string     `gorm:"type:text" json:"request_parameters"`
	SampleStatus       string     `gorm:"size:32;default:'unknown'" json:"sample_status"`
	ErrorMessage       string     `gorm:"type:text" json:"error_message,omitempty"`
	ProjectID          uuid.UUID  `gorm:"type:uuid;index;not null" json:"project_id"`
	QueryID            uuid.UUID  `gorm:"type:uuid;index;not null;uniqueIndex:idx_run_query_channel" json:"query_id"`
	ChannelID          string     `gorm:"size:64;index;not null;uniqueIndex:idx_run_query_channel" json:"channel_id"`
	ModelVersion       string     `gorm:"size:64" json:"model_version"`
	RawAnswer          string     `gorm:"type:text" json:"raw_answer"`
	ParsedData         string     `gorm:"type:text" json:"parsed_data"` // JSON string
	IsBrandMentioned   bool       `gorm:"default:false" json:"is_brand_mentioned"`
	IsBrandRecommended bool       `gorm:"default:false" json:"is_brand_recommended"`
	BrandRank          int        `gorm:"default:-1" json:"brand_rank"`
	IsRefusal          bool       `gorm:"default:false" json:"is_refusal"`
	Confidence         float64    `gorm:"default:1.0" json:"confidence"`
	SampledAt          time.Time  `gorm:"index" json:"sampled_at"`
}

func (AnswerSnapshotModel) TableName() string {
	return "answer_snapshots"
}

type OpportunityModel struct {
	BaseGormModel
	ProjectID         uuid.UUID `gorm:"type:uuid;index;not null" json:"project_id"`
	Type              string    `gorm:"size:64;index;not null" json:"type"`
	Title             string    `gorm:"size:255;not null" json:"title"`
	Description       string    `gorm:"type:text" json:"description"`
	Score             float64   `gorm:"index" json:"score"`
	ImpactScore       float64   `json:"impact_score"`
	GapScore          float64   `json:"gap_score"`
	FeasibilityScore  float64   `json:"feasibility_score"`
	ConfidenceScore   float64   `json:"confidence_score"`
	RiskCost          float64   `json:"risk_cost"`
	Status            string    `gorm:"size:32;default:'new'" json:"status"`
	RecommendedAction string    `gorm:"type:text" json:"recommended_action"`
	EvidenceIDs       string    `gorm:"type:text" json:"evidence_ids"` // JSON array
}

func (OpportunityModel) TableName() string {
	return "opportunities"
}

type StrategyModel struct {
	BaseGormModel
	ProjectID      uuid.UUID `gorm:"type:uuid;index;not null" json:"project_id"`
	Title          string    `gorm:"size:255;not null" json:"title"`
	Objective      string    `gorm:"type:text" json:"objective"`
	Hypothesis     string    `gorm:"type:text" json:"hypothesis"`
	OpportunityIDs string    `gorm:"type:text" json:"opportunity_ids"` // JSON array
	RiskLevel      string    `gorm:"size:32;default:'medium'" json:"risk_level"`
	RollbackPlan   string    `gorm:"type:text" json:"rollback_plan"`
	Status         string    `gorm:"size:32;default:'draft'" json:"status"`
	Assignee       string    `gorm:"size:120" json:"assignee"`
}

func (StrategyModel) TableName() string {
	return "strategies"
}

type StrategyTaskModel struct {
	BaseGormModel
	StrategyID   uuid.UUID  `gorm:"type:uuid;index;not null" json:"strategy_id"`
	TaskType     string     `gorm:"size:64;not null" json:"task_type"`
	Status       string     `gorm:"size:32;default:'pending'" json:"status"`
	Dependencies string     `gorm:"type:text" json:"dependencies"` // JSON array
	StartedAt    *time.Time `json:"started_at,omitempty"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}

func (StrategyTaskModel) TableName() string {
	return "strategy_tasks"
}

type ContentAssetModel struct {
	BaseGormModel
	ProjectID     uuid.UUID  `gorm:"type:uuid;index;not null" json:"project_id"`
	StrategyID    *uuid.UUID `gorm:"type:uuid;index" json:"strategy_id,omitempty"`
	Title         string     `gorm:"size:255;not null" json:"title"`
	AssetType     string     `gorm:"size:64;not null" json:"asset_type"`
	Brief         string     `gorm:"type:text" json:"brief"` // JSON
	ContentBody   string     `gorm:"type:text" json:"content_body"`
	Version       int        `gorm:"default:1" json:"version"`
	QualityChecks string     `gorm:"type:text" json:"quality_checks"` // JSON
	Status        string     `gorm:"size:32;default:'draft'" json:"status"`
}

func (ContentAssetModel) TableName() string {
	return "content_assets"
}

type PublicationModel struct {
	BaseGormModel
	AssetVersion   int        `json:"asset_version"`
	ChannelID      *uuid.UUID `gorm:"type:uuid;index" json:"channel_id,omitempty"`
	IdempotencyKey string     `gorm:"size:128;uniqueIndex:idx_publication_key,where:idempotency_key <> ''" json:"idempotency_key"`
	Receipt        string     `gorm:"type:text" json:"receipt"`
	ProjectID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"project_id"`
	AssetID        uuid.UUID  `gorm:"type:uuid;index;not null" json:"asset_id"`
	ChannelType    string     `gorm:"size:64;not null" json:"channel_type"`
	TargetURL      string     `gorm:"size:512" json:"target_url"`
	ExternalID     string     `gorm:"size:128" json:"external_id"`
	Status         string     `gorm:"size:32;default:'pending'" json:"status"`
	ErrorMessage   string     `gorm:"type:text" json:"error_message,omitempty"`
	PublishedAt    *time.Time `json:"published_at,omitempty"`
}

func (PublicationModel) TableName() string {
	return "publications"
}

type ExperimentModel struct {
	BaseGormModel
	BaselineRunID *uuid.UUID `gorm:"type:uuid" json:"baseline_run_id,omitempty"`
	VariantRunID  *uuid.UUID `gorm:"type:uuid" json:"variant_run_id,omitempty"`
	SampleSize    int        `json:"sample_size"`
	Evaluation    string     `gorm:"type:text" json:"evaluation"`
	ProposedRule  string     `gorm:"type:text" json:"proposed_rule"`
	ProjectID     uuid.UUID  `gorm:"type:uuid;index;not null" json:"project_id"`
	Title         string     `gorm:"size:255;not null" json:"title"`
	Hypothesis    string     `gorm:"type:text" json:"hypothesis"`
	BaselineRate  float64    `json:"baseline_rate"`
	VariantRate   float64    `json:"variant_rate"`
	Confidence    float64    `json:"confidence"`
	Status        string     `gorm:"size:32;default:'running'" json:"status"`
	CurrentDays   int        `gorm:"default:1" json:"current_days"`
	TotalDays     int        `gorm:"default:14" json:"total_days"`
}

func (ExperimentModel) TableName() string {
	return "experiments"
}

type RuleModel struct {
	BaseGormModel
	ExperimentID   *uuid.UUID `gorm:"type:uuid;uniqueIndex" json:"experiment_id,omitempty"`
	EvidenceIDs    string     `gorm:"type:text" json:"evidence_ids"`
	ProjectID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"project_id"`
	RuleName       string     `gorm:"size:255;not null" json:"rule_name"`
	Category       string     `gorm:"size:64;index;not null" json:"category"`
	ConditionExpr  string     `gorm:"type:text;not null" json:"condition_expr"`
	ActionType     string     `gorm:"size:64;not null" json:"action_type"`
	ActionPayload  string     `gorm:"type:text" json:"action_payload"` // JSON
	Status         string     `gorm:"size:32;default:'candidate'" json:"status"`
	Version        string     `gorm:"size:96;not null" json:"version"`
	PreviousRuleID *uuid.UUID `gorm:"type:uuid" json:"previous_rule_id,omitempty"`
	SampleSize     int        `gorm:"default:0" json:"sample_size"`
	ImpactScore    float64    `gorm:"default:0" json:"impact_score"`
	ApprovedAt     *time.Time `json:"approved_at,omitempty"`
	ApprovedBy     *uuid.UUID `gorm:"type:uuid" json:"approved_by,omitempty"`
}

func (RuleModel) TableName() string {
	return "rules"
}

type EvolutionRunModel struct {
	BaseGormModel
	ProjectID    uuid.UUID  `gorm:"type:uuid;index;not null" json:"project_id"`
	CurrentStage int        `gorm:"default:1" json:"current_stage"`
	StageName    string     `gorm:"size:64" json:"stage_name"`
	Percentage   int        `gorm:"default:0" json:"percentage"`
	Status       string     `gorm:"size:32;default:'running'" json:"status"`
	StartedAt    time.Time  `json:"started_at"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}

func (EvolutionRunModel) TableName() string {
	return "evolution_runs"
}

type AuditLogModel struct {
	BaseGormModel
	ProjectID uuid.UUID `gorm:"type:uuid;index" json:"project_id"`
	UserID    uuid.UUID `gorm:"type:uuid;index" json:"user_id"`
	Action    string    `gorm:"size:64;not null" json:"action"`
	Entity    string    `gorm:"size:64;not null" json:"entity"`
	EntityID  string    `gorm:"size:64" json:"entity_id"`
	Details   string    `gorm:"type:text" json:"details"` // JSON
}

func (AuditLogModel) TableName() string {
	return "audit_logs"
}

type UserModel struct {
	BaseGormModel
	OrganizationID uuid.UUID `gorm:"type:uuid;index;not null" json:"organization_id"`
	Email          string    `gorm:"size:120;uniqueIndex;not null" json:"email"`
	PasswordHash   string    `gorm:"size:255;not null" json:"-"`
	Name           string    `gorm:"size:120;not null" json:"name"`
	Role           string    `gorm:"size:32;default:'admin'" json:"role"`
	Team           string    `gorm:"size:120;default:'增长团队'" json:"team"`
	Avatar         string    `gorm:"type:text" json:"avatar"`
	AvatarBg       string    `gorm:"size:32;default:'#f5d8a8'" json:"avatar_bg"`
	AvatarLetter   string    `gorm:"size:16;default:'M'" json:"avatar_letter"`
	Status         string    `gorm:"size:32;default:'active'" json:"status"`
}

func (UserModel) TableName() string {
	return "users"
}

type RefreshTokenModel struct {
	BaseGormModel
	UserID    uuid.UUID `gorm:"type:uuid;index;not null" json:"user_id"`
	Token     string    `gorm:"size:512;uniqueIndex;not null" json:"token"`
	ExpiresAt time.Time `gorm:"index;not null" json:"expires_at"`
	Revoked   bool      `gorm:"default:false" json:"revoked"`
}

func (RefreshTokenModel) TableName() string {
	return "refresh_tokens"
}

type CopilotSessionModel struct {
	BaseGormModel
	ProjectID    uuid.UUID `gorm:"type:uuid;index;not null" json:"project_id"`
	UserID       uuid.UUID `gorm:"type:uuid;index;not null" json:"user_id"`
	Title        string    `gorm:"size:255;not null" json:"title"`
	LastActiveAt time.Time `json:"last_active_at"`
	IsArchived   bool      `gorm:"default:false" json:"is_archived"`
}

func (CopilotSessionModel) TableName() string {
	return "copilot_sessions"
}

type CopilotMessageModel struct {
	BaseGormModel
	SessionID   uuid.UUID  `gorm:"type:uuid;index;not null" json:"session_id"`
	Role        string     `gorm:"size:32;not null" json:"role"` // user, assistant, system, tool
	Content     string     `gorm:"type:text" json:"content"`
	ToolCalls   string     `gorm:"type:text" json:"tool_calls,omitempty"`   // JSON
	CardType    string     `gorm:"size:64" json:"card_type,omitempty"`      // preview_publish, preview_schedule, insight_metric
	CardPayload string     `gorm:"type:text" json:"card_payload,omitempty"` // JSON
	CardStatus  string     `gorm:"size:32;default:''" json:"card_status"`   // pending, approved, rejected, executed
	TraceID     *uuid.UUID `gorm:"type:uuid;index" json:"trace_id,omitempty"`
}

func (CopilotMessageModel) TableName() string {
	return "copilot_messages"
}

type CopilotCheckpointModel struct {
	BaseGormModel
	Status      string    `gorm:"size:32;default:'pending'" json:"status"`
	ExpiresAt   time.Time `json:"expires_at"`
	PayloadHash string    `gorm:"size:64" json:"payload_hash"`
	SessionID   uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"session_id"`
	ThreadID    string    `gorm:"size:128;index;not null" json:"thread_id"`
	StateData   string    `gorm:"type:text" json:"state_data"` // JSON serialized state
	InterruptID string    `gorm:"size:128" json:"interrupt_id,omitempty"`
}

func (CopilotCheckpointModel) TableName() string {
	return "copilot_checkpoints"
}

type CopilotAuditLogModel struct {
	BaseGormModel
	ProjectID       uuid.UUID `gorm:"type:uuid;index;not null" json:"project_id"`
	UserID          uuid.UUID `gorm:"type:uuid;index;not null" json:"user_id"`
	SessionID       uuid.UUID `gorm:"type:uuid;index;not null" json:"session_id"`
	ToolName        string    `gorm:"size:128;not null" json:"tool_name"`
	InputPayload    string    `gorm:"type:text" json:"input_payload"`
	ExecutionRisk   string    `gorm:"size:32;not null" json:"execution_risk"` // direct, confirmed
	UserConfirmed   bool      `gorm:"default:false" json:"user_confirmed"`
	ExecutionStatus string    `gorm:"size:32;not null" json:"execution_status"` // success, failed, aborted
	ErrorMessage    string    `gorm:"type:text" json:"error_message,omitempty"`
	ExecutedAt      time.Time `json:"executed_at"`
}

func (CopilotAuditLogModel) TableName() string {
	return "copilot_audit_logs"
}

type AIConfigModel struct {
	BaseGormModel
	ProjectID   uuid.UUID `gorm:"type:uuid;index" json:"project_id"`
	Provider    string    `gorm:"size:64;not null;default:'openai'" json:"provider"` // openai, deepseek, qwen
	BaseURL     string    `gorm:"size:255;not null" json:"base_url"`
	APIKey      string    `gorm:"size:255;not null" json:"-"`
	ModelName   string    `gorm:"size:128;not null" json:"model_name"`
	Temperature float64   `gorm:"default:0.3" json:"temperature"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
}

func (AIConfigModel) TableName() string {
	return "ai_configs"
}

// HarnessConfigModel stores per-project Harness runtime preferences
type HarnessConfigModel struct {
	BaseGormModel
	ProjectID        uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"project_id"`
	EnabledSkills    string    `gorm:"type:text;default:'[\"monitor\",\"diagnosis\",\"content\",\"evolution\"]'" json:"enabled_skills"` // JSON array
	MaxHistoryTurns  int       `gorm:"default:10" json:"max_history_turns"`
	AutoSummarize    bool      `gorm:"default:true" json:"auto_summarize"`
	DefaultModelID   string    `gorm:"size:128" json:"default_model_id"`   // name label of preferred LLM
	EmbeddingModelID string    `gorm:"size:128" json:"embedding_model_id"` // name label for embedding
}

func (HarnessConfigModel) TableName() string {
	return "harness_configs"
}

// MCPServerModel stores external MCP server connection details
type MCPServerModel struct {
	BaseGormModel
	ProjectID      uuid.UUID  `gorm:"type:uuid;index;not null" json:"project_id"`
	Name           string     `gorm:"size:120;not null" json:"name"`
	TransportType  string     `gorm:"size:32;default:'http_sse'" json:"transport_type"` // http_sse | stdio
	EndpointURL    string     `gorm:"size:512" json:"endpoint_url"`
	AuthHeaders    string     `gorm:"type:text" json:"-"`
	HasCredentials bool       `gorm:"-" json:"has_credentials"`
	IsActive       bool       `gorm:"default:true" json:"is_active"`
	CachedTools    string     `gorm:"type:text" json:"cached_tools"` // JSON array of tool definitions from tools/list
	LastPingAt     *time.Time `json:"last_ping_at,omitempty"`
}

func (MCPServerModel) TableName() string {
	return "mcp_servers"
}

// MemoryEntryModel stores layered project memory (brand truths, preferences, episodic)
type MemoryEntryModel struct {
	BaseGormModel
	Status           string     `gorm:"size:32;default:'pending'" json:"status"`
	Evidence         string     `gorm:"type:text" json:"evidence"`
	Version          int        `gorm:"default:1" json:"version"`
	ProjectID        uuid.UUID  `gorm:"type:uuid;index;not null" json:"project_id"`
	MemoryType       string     `gorm:"size:64;index;not null" json:"memory_type"` // brand_truth | user_pref | episodic_strategy
	Title            string     `gorm:"size:255;not null" json:"title"`
	Content          string     `gorm:"type:text;not null" json:"content"`
	Tags             string     `gorm:"type:text" json:"tags"` // JSON array of string labels
	IsPinned         bool       `gorm:"default:false" json:"is_pinned"`
	ScoreWeight      float64    `gorm:"default:1.0" json:"score_weight"`
	SourceSessionID  *uuid.UUID `gorm:"type:uuid;index" json:"source_session_id,omitempty"`
	ExtractionSource string     `gorm:"size:32;default:'manual'" json:"extraction_source"` // manual | agent_hook
}

func (MemoryEntryModel) TableName() string {
	return "memory_entries"
}

// CustomSkillModel stores custom skills imported from external zip packages
type CustomSkillModel struct {
	BaseGormModel
	ProjectID   uuid.UUID `gorm:"type:uuid;index;not null" json:"project_id"`
	SkillID     string    `gorm:"size:64;not null" json:"skill_id"`
	Name        string    `gorm:"size:128;not null" json:"name"`
	Description string    `gorm:"type:text" json:"description"`
	Content     string    `gorm:"type:text;not null" json:"content"` // raw SKILL.md
	FileNames   string    `gorm:"type:text" json:"file_names"`       // JSON array of contained files
	IsActive    bool      `gorm:"default:false" json:"is_active"`
}

func (CustomSkillModel) TableName() string {
	return "custom_skills"
}

// AgentExecutionTraceModel records full lifecycle timeline of an Agent execution run
type AgentExecutionTraceModel struct {
	BaseGormModel
	ProjectID       uuid.UUID `gorm:"type:uuid;index;not null" json:"project_id"`
	SessionID       uuid.UUID `gorm:"type:uuid;index;not null" json:"session_id"`
	UserPrompt      string    `gorm:"type:text;not null" json:"user_prompt"`
	ModelName       string    `gorm:"size:128" json:"model_name"`
	TotalDurationMs int64     `gorm:"default:0" json:"total_duration_ms"`
	Status          string    `gorm:"size:32;default:'completed'" json:"status"` // completed | interrupted | failed
	TimelineJSON    string    `gorm:"type:text" json:"timeline_json"`            // JSON array of ExecutionStep
}

func (AgentExecutionTraceModel) TableName() string {
	return "agent_execution_traces"
}
