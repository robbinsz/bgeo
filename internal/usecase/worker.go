package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"gorm.io/gorm"
	"log/slog"
	"sync"
	"time"
)

type Worker struct {
	DB        *gorm.DB
	Jobs      *repository.JobRepository
	Monitor   *MonitorUsecase
	Evolution *EvolutionUsecase
	Copilot   *CopilotUsecase
	Config    config.Config
}

func (w *Worker) Run(ctx context.Context) error {
	var wg sync.WaitGroup
	for i := 0; i < w.Config.WorkerConcurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ticker := time.NewTicker(250 * time.Millisecond)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					if err := w.RunOne(ctx); err != nil {
						slog.Error("worker iteration failed", "error", err)
					}
				}
			}
		}()
	}
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	defer wg.Wait()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if err := w.Jobs.Recover(ctx); err != nil {
				slog.Error("job recovery failed", "error", err)
			}
			if err := w.Monitor.RefreshRuns(ctx); err != nil {
				slog.Error("monitor reconciliation failed", "error", err)
			}
			if err := w.Reconcile(ctx); err != nil {
				slog.Error("outcome reconciliation failed", "error", err)
			}
			if err := w.Copilot.DispatchSchedules(ctx); err != nil {
				slog.Error("schedule dispatch failed", "error", err)
			}
		}
	}
}

func (w *Worker) RunOne(ctx context.Context) error {
	job, err := w.Jobs.Claim(ctx, w.Config.LeaseDuration)
	if err != nil || job == nil {
		return err
	}
	executionCtx, cancel := context.WithTimeout(ctx, w.Config.JobTimeout)
	defer cancel()
	executionCtx = domain.WithProject(executionCtx, job.ProjectID)
	done := make(chan struct{})
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		ticker := time.NewTicker(w.Config.LeaseDuration / 3)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-executionCtx.Done():
				return
			case <-ticker.C:
				if err := w.Jobs.Heartbeat(executionCtx, *job, w.Config.LeaseDuration); err != nil {
					cancel()
					return
				}
			}
		}
	}()
	err = w.execute(executionCtx, *job)
	close(done)
	<-stopped
	finishCtx, finishCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer finishCancel()
	permanent := errors.Is(err, domain.ErrInvalid) || errors.Is(err, domain.ErrForbidden) || errors.Is(err, domain.ErrConflict)
	if finishErr := w.Jobs.Finish(finishCtx, *job, err, permanent); finishErr != nil {
		return finishErr
	}
	if err != nil {
		slog.Warn("job execution failed", "job_id", job.ID, "project_id", job.ProjectID, "kind", job.Kind, "attempt", job.Attempts, "error", err)
	}
	if err := w.Reconcile(finishCtx); err != nil {
		return err
	}
	return w.Monitor.RefreshRuns(finishCtx)
}

func (w *Worker) execute(ctx context.Context, job repository.JobModel) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("worker panic recovered: %v", r)
		}
	}()
	switch job.Kind {
	case "monitor_run", "monitor_sample":
		return w.Monitor.HandleJob(ctx, job)
	case "scheduled_monitor":
		_, err := w.Monitor.ExecuteBatchRun(ctx, job.ProjectID)
		return err
	case "evolution":
		return w.Evolution.HandleJob(ctx, job)
	case "approved_action":
		return w.Copilot.HandleApprovedJob(ctx, job)
	case "memory_hook":
		var payload memoryHookPayload
		if err = json.Unmarshal([]byte(job.Payload), &payload); err != nil {
			return err
		}
		return w.Copilot.HandleMemoryJob(ctx, job, payload)
	default:
		return fmt.Errorf("%w: unknown job kind", domain.ErrInvalid)
	}
}

// Jobs remain the source of truth when a worker dies before updating its parent resource.
func (w *Worker) Reconcile(ctx context.Context) error {
	db := w.DB.WithContext(ctx)
	var jobs []repository.JobModel
	if err := db.Where("kind IN ('evolution','approved_action') AND status IN ('failed','cancelled')").Order("created_at DESC").Limit(200).Find(&jobs).Error; err != nil {
		return err
	}
	for _, job := range jobs {
		if job.Kind == "evolution" {
			if err := db.Model(&repository.EvolutionRunModel{}).Where("id = ? AND project_id = ? AND status IN ('queued','running')", job.RunID, job.ProjectID).Updates(map[string]interface{}{"status": job.Status, "completed_at": time.Now(), "stage_name": job.ErrorMessage}).Error; err != nil {
				return err
			}
			continue
		}
		var payload approvedActionPayload
		if json.Unmarshal([]byte(job.Payload), &payload) != nil {
			continue
		}
		if err := db.Transaction(func(tx *gorm.DB) error {
			result := tx.Model(&repository.CopilotCheckpointModel{}).Where("session_id = ? AND interrupt_id = ? AND status = 'queued'", payload.State.SessionID, payload.State.InterruptID).Update("status", job.Status)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				return nil
			}
			if err := tx.Model(&repository.CopilotMessageModel{}).Where("session_id = ? AND card_status = 'queued'", payload.State.SessionID).Update("card_status", job.Status).Error; err != nil {
				return err
			}
			return tx.Create(&repository.CopilotMessageModel{SessionID: payload.State.SessionID, Role: "assistant", Content: "任务未确认完成：" + job.ErrorMessage + "。外部执行可能已产生影响，请先核对回执或目标系统。"}).Error
		}); err != nil {
			return err
		}
	}
	return nil
}
