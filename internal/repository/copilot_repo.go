package repository

import (
	"context"
	"errors"
	"gorm.io/gorm/clause"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/pkg/secretutil"
	"gorm.io/gorm"
)

type CopilotRepository struct {
	db *gorm.DB
}

func NewCopilotRepository(db *gorm.DB) *CopilotRepository {
	return &CopilotRepository{db: db}
}

// Session operations
func (r *CopilotRepository) CreateSession(ctx context.Context, session *CopilotSessionModel) error {
	if session.ID == uuid.Nil {
		session.ID = uuid.New()
	}
	session.LastActiveAt = time.Now()
	return r.db.WithContext(ctx).Create(session).Error
}

func (r *CopilotRepository) GetSession(ctx context.Context, id uuid.UUID) (*CopilotSessionModel, error) {
	var s CopilotSessionModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	if a := domain.ActorFrom(ctx); a.ProjectID != uuid.Nil {
		q = q.Where("project_id = ? AND user_id = ?", a.ProjectID, a.UserID)
	}
	err := q.First(&s).Error
	return &s, err
}

func (r *CopilotRepository) ListSessions(ctx context.Context, projectID, userID uuid.UUID) ([]CopilotSessionModel, error) {
	var sessions []CopilotSessionModel
	query := r.db.WithContext(ctx).Where("project_id = ? AND is_archived = false", projectID)
	if userID != uuid.Nil {
		query = query.Where("user_id = ?", userID)
	}
	err := query.Order("last_active_at desc").Limit(30).Find(&sessions).Error
	return sessions, err
}

func (r *CopilotRepository) UpdateSessionActivity(ctx context.Context, id uuid.UUID, title string) error {
	updates := map[string]interface{}{
		"last_active_at": time.Now(),
	}
	if title != "" {
		updates["title"] = title
	}
	return r.db.WithContext(ctx).Model(&CopilotSessionModel{}).Where("id = ?", id).Updates(updates).Error
}

func (r *CopilotRepository) ArchiveSession(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&CopilotSessionModel{}).Where("id = ? AND project_id = ? AND user_id = ?", id, domain.ActorFrom(ctx).ProjectID, domain.ActorFrom(ctx).UserID).Update("is_archived", true).Error
}

// Message operations
func (r *CopilotRepository) SaveMessage(ctx context.Context, msg *CopilotMessageModel) error {
	if msg.ID == uuid.Nil {
		msg.ID = uuid.New()
	}
	return r.db.WithContext(ctx).Create(msg).Error
}

func (r *CopilotRepository) ListMessages(ctx context.Context, sessionID uuid.UUID) ([]CopilotMessageModel, error) {
	var msgs []CopilotMessageModel
	err := r.db.WithContext(ctx).Where("session_id = ?", sessionID).Order("created_at asc").Find(&msgs).Error
	return msgs, err
}

func (r *CopilotRepository) UpdateMessageCardStatus(ctx context.Context, id uuid.UUID, status string) error {
	return r.db.WithContext(ctx).Model(&CopilotMessageModel{}).Where("id = ?", id).Update("card_status", status).Error
}

// Checkpoint operations
func (r *CopilotRepository) SaveCheckpoint(ctx context.Context, cp *CopilotCheckpointModel) error {
	cp.Status = "pending"
	cp.ExpiresAt = time.Now().Add(15 * time.Minute)
	cp.PayloadHash = secretutil.Digest(cp.StateData)
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var session CopilotSessionModel
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", cp.SessionID).First(&session).Error; err != nil {
			return err
		}
		var existing CopilotCheckpointModel
		err := tx.Where("session_id = ?", cp.SessionID).First(&existing).Error
		if err == nil {
			if existing.Status == "queued" || (existing.Status == "pending" && existing.ExpiresAt.After(time.Now())) {
				return domain.ErrConflict
			}
			cp.ID = existing.ID
			return tx.Save(cp).Error
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if cp.ID == uuid.Nil {
			cp.ID = uuid.New()
		}
		return tx.Create(cp).Error
	})
}

func (r *CopilotRepository) GetCheckpoint(ctx context.Context, sessionID uuid.UUID) (*CopilotCheckpointModel, error) {
	var cp CopilotCheckpointModel
	err := r.db.WithContext(ctx).Where("session_id = ?", sessionID).First(&cp).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &cp, err
}

func (r *CopilotRepository) DeleteCheckpoint(ctx context.Context, sessionID uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&CopilotCheckpointModel{}).Where("session_id = ? AND status = 'pending'", sessionID).Update("status", "consumed").Error
}

// Audit log operations
func (r *CopilotRepository) RecordAuditLog(ctx context.Context, log *CopilotAuditLogModel) error {
	if log.ID == uuid.Nil {
		log.ID = uuid.New()
	}
	if log.ExecutedAt.IsZero() {
		log.ExecutedAt = time.Now()
	}
	return r.db.WithContext(ctx).Create(log).Error
}

func (r *CopilotRepository) ListAuditLogs(ctx context.Context, projectID uuid.UUID, limit int) ([]CopilotAuditLogModel, error) {
	var logs []CopilotAuditLogModel
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("executed_at desc").Limit(limit).Find(&logs).Error
	return logs, err
}

// ─── Agent Execution Trace Operations ─────────────────────────────────────────

func (r *CopilotRepository) SaveExecutionTrace(ctx context.Context, trace *AgentExecutionTraceModel) error {
	if trace.ID == uuid.Nil {
		trace.ID = uuid.New()
	}
	return r.db.WithContext(ctx).Save(trace).Error
}

func (r *CopilotRepository) ListExecutionTraces(ctx context.Context, projectID uuid.UUID, sessionID *uuid.UUID, limit int) ([]AgentExecutionTraceModel, error) {
	var traces []AgentExecutionTraceModel
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	q := r.db.WithContext(ctx).Where("project_id = ?", projectID)
	if sessionID != nil && *sessionID != uuid.Nil {
		q = q.Where("session_id = ?", *sessionID)
	}
	err := q.Order("created_at desc").Limit(limit).Find(&traces).Error
	return traces, err
}

func (r *CopilotRepository) GetExecutionTrace(ctx context.Context, id uuid.UUID) (*AgentExecutionTraceModel, error) {
	var trace AgentExecutionTraceModel
	q := r.db.WithContext(ctx).Where("id = ?", id)
	if a := domain.ActorFrom(ctx); a.ProjectID != uuid.Nil {
		q = q.Where("project_id = ?", a.ProjectID)
	}
	err := q.First(&trace).Error
	return &trace, err
}

// AI Configuration operations
func (r *CopilotRepository) GetActiveAIConfig(ctx context.Context) (*AIConfigModel, error) {
	var cfg AIConfigModel
	err := r.db.WithContext(ctx).Where("project_id = ? AND is_active = true", domain.ActorFrom(ctx).ProjectID).Order("updated_at desc").First(&cfg).Error
	if err == nil {
		return &cfg, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}
	baseURL := os.Getenv("COPILOT_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.deepseek.com/v1"
	}
	model := os.Getenv("COPILOT_MODEL")
	if model == "" {
		model = "deepseek-chat"
	}
	return &AIConfigModel{ProjectID: domain.ActorFrom(ctx).ProjectID, Provider: "deepseek", BaseURL: baseURL, APIKey: os.Getenv("COPILOT_API_KEY"), ModelName: model, Temperature: 0.3, IsActive: true}, nil
}
func (r *CopilotRepository) SaveAIConfig(ctx context.Context, cfg *AIConfigModel) error {
	cfg.ProjectID = domain.ActorFrom(ctx).ProjectID
	if cfg.ProjectID == uuid.Nil {
		return domain.ErrForbidden
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var project ProjectModel
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", cfg.ProjectID).First(&project).Error; err != nil {
			return err
		}
		if err := tx.Model(&AIConfigModel{}).Where("project_id = ?", cfg.ProjectID).Update("is_active", false).Error; err != nil {
			return err
		}
		if cfg.ID == uuid.Nil {
			cfg.ID = uuid.New()
		}
		cfg.IsActive = true
		return tx.Save(cfg).Error
	})
}
