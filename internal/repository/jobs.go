package repository

import (
	"context"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/domain"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"time"
)

type JobRepository struct{ db *gorm.DB }

func NewJobRepository(db *gorm.DB) *JobRepository { return &JobRepository{db: db} }
func (r *MonitorRepository) DB() *gorm.DB         { return r.db }
func (r *ProjectRepository) DB() *gorm.DB         { return r.db }
func (r *EvolutionRepository) DB() *gorm.DB       { return r.db }
func (r *CopilotRepository) DB() *gorm.DB         { return r.db }

func EnqueueJob(tx *gorm.DB, job *JobModel) error {
	if job.ID == uuid.Nil {
		job.ID = uuid.New()
	}
	if job.AvailableAt.IsZero() {
		job.AvailableAt = time.Now()
	}
	if job.MaxAttempts == 0 {
		job.MaxAttempts = 3
	}
	job.Status = "queued"
	return tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "idempotency_key"}}, DoNothing: true}).Create(job).Error
}

func (r *JobRepository) Claim(ctx context.Context, lease time.Duration) (*JobModel, error) {
	var job JobModel
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		q := tx.Where("project_id IN (SELECT id FROM projects WHERE is_paused = false AND deleted_at IS NULL) AND cancel_requested = false AND attempts < max_attempts AND ((status = 'queued' AND available_at <= ?) OR (status = 'running' AND lease_until < ?))", now, now).Order("available_at, created_at, id")
		if tx.Dialector.Name() == "postgres" {
			q = q.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"})
		}
		if err := q.First(&job).Error; err != nil {
			return err
		}
		token := uuid.NewString()
		until := now.Add(lease)
		result := tx.Model(&JobModel{}).Where("id = ? AND attempts = ? AND cancel_requested = false AND ((status = 'queued' AND available_at <= ?) OR (status = 'running' AND lease_until < ?))", job.ID, job.Attempts, now, now).Updates(map[string]interface{}{"status": "running", "attempts": job.Attempts + 1, "lease_token": token, "lease_until": until, "heartbeat_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		job.Status = "running"
		job.Attempts++
		job.LeaseToken = token
		job.LeaseUntil = &until
		return nil
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &job, err
}

func (r *JobRepository) Heartbeat(ctx context.Context, job JobModel, lease time.Duration) error {
	now := time.Now()
	result := r.db.WithContext(ctx).Model(&JobModel{}).Where("id = ? AND status = 'running' AND lease_token = ? AND lease_until > ? AND cancel_requested = false", job.ID, job.LeaseToken, now).Updates(map[string]interface{}{"lease_until": now.Add(lease), "heartbeat_at": now})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return domain.ErrConflict
	}
	return nil
}

// Finish is fenced by the lease token; an expired owner cannot acknowledge a new owner's work.
func (r *JobRepository) Finish(ctx context.Context, job JobModel, executionErr error, permanent bool) error {
	now := time.Now()
	updates := map[string]interface{}{"lease_until": nil, "lease_token": "", "completed_at": now, "status": "completed", "error_message": ""}
	if executionErr != nil {
		updates["error_message"] = executionErr.Error()
		if permanent || job.Attempts >= job.MaxAttempts {
			updates["status"] = "failed"
		} else {
			updates["status"] = "queued"
			updates["completed_at"] = nil
			updates["available_at"] = now.Add(time.Duration(1<<min(job.Attempts, 8)) * time.Second)
		}
	}
	updates["status"] = gorm.Expr("CASE WHEN cancel_requested THEN 'cancelled' ELSE ? END", updates["status"])
	if updates["completed_at"] == nil {
		if r.db.Dialector.Name() == "postgres" {
			updates["completed_at"] = gorm.Expr("CASE WHEN cancel_requested THEN CAST(? AS timestamptz) ELSE NULL END", now)
		} else {
			updates["completed_at"] = gorm.Expr("CASE WHEN cancel_requested THEN ? ELSE NULL END", now)
		}
	}
	result := r.db.WithContext(ctx).Model(&JobModel{}).Where("id = ? AND status = 'running' AND lease_token = ? AND lease_until > ?", job.ID, job.LeaseToken, now).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return domain.ErrConflict
	}
	return nil
}

func (r *JobRepository) Recover(ctx context.Context) error {
	now := time.Now()
	if err := r.db.WithContext(ctx).Model(&JobModel{}).Where("cancel_requested = true AND (status = 'queued' OR (status = 'running' AND lease_until < ?))", now).Updates(map[string]interface{}{"status": "cancelled", "completed_at": now, "lease_until": nil, "lease_token": ""}).Error; err != nil {
		return err
	}
	return r.db.WithContext(ctx).Model(&JobModel{}).Where("status = 'running' AND lease_until < ? AND attempts >= max_attempts", now).Updates(map[string]interface{}{"status": "failed", "error_message": "worker lease expired after maximum attempts", "completed_at": now, "lease_until": nil, "lease_token": ""}).Error
}

func (r *JobRepository) List(ctx context.Context, projectID uuid.UUID, limit int) ([]JobModel, error) {
	var jobs []JobModel
	err := r.db.WithContext(ctx).Where("project_id = ?", projectID).Order("created_at desc, id").Limit(min(max(limit, 1), 100)).Find(&jobs).Error
	return jobs, err
}
func (r *JobRepository) Cancel(ctx context.Context, projectID, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Model(&JobModel{}).Where("id = ? AND project_id = ? AND status IN ('queued','running')", id, projectID).Update("cancel_requested", true)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return fmt.Errorf("%w: job is not active", domain.ErrConflict)
	}
	return nil
}

func (r *HarnessRepository) DB() *gorm.DB { return r.db }
