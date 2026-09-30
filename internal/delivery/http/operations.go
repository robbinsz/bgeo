package http

import (
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/connector/publisher"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/internal/usecase"
	"github.com/robbinsz/bgeo/pkg/outbound"
	"github.com/robbinsz/bgeo/pkg/secretutil"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"net/http"
	"time"
)

func respondError(c *gin.Context, err error) {
	status := 500
	message := "operation failed"
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		status = 404
		message = "resource not found"
	case errors.Is(err, domain.ErrForbidden):
		status = 403
		message = err.Error()
	case errors.Is(err, domain.ErrConflict) || errors.Is(err, domain.ErrPaused):
		status = 409
		message = err.Error()
	case errors.Is(err, domain.ErrInvalid):
		status = 400
		message = err.Error()
	}
	c.JSON(status, gin.H{"error": message})
}
func projectID(c *gin.Context) uuid.UUID { return domain.ActorFrom(c.Request.Context()).ProjectID }
func audit(tx *gorm.DB, c *gin.Context, tool string, data interface{}) error {
	raw, _ := json.Marshal(data)
	actor := domain.ActorFrom(c.Request.Context())
	return tx.Create(&repository.CopilotAuditLogModel{ProjectID: actor.ProjectID, UserID: actor.UserID, ToolName: tool, InputPayload: string(raw), ExecutionRisk: "confirmed", UserConfirmed: true, ExecutionStatus: "success", ExecutedAt: time.Now()}).Error
}
func registerOperations(r *gin.RouterGroup, db *gorm.DB, monitor *usecase.MonitorUsecase, content *usecase.ContentUsecase, copilot *usecase.CopilotUsecase) {
	r.GET("/model-calls", func(c *gin.Context) {
		var items []repository.ModelCallModel
		if err := db.WithContext(c.Request.Context()).Where("project_id = ?", projectID(c)).Order("created_at DESC").Limit(100).Find(&items).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"items": items})
	})
	r.GET("/jobs", func(c *gin.Context) {
		items, err := repository.NewJobRepository(db).List(c.Request.Context(), projectID(c), 100)
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"items": items})
	})
	r.POST("/jobs/:id/cancel", func(c *gin.Context) {
		id, _ := uuid.Parse(c.Param("id"))
		if err := repository.NewJobRepository(db).Cancel(c.Request.Context(), projectID(c), id); err != nil {
			respondError(c, err)
			return
		}
		c.JSON(202, gin.H{"status": "cancellation_requested"})
	})
	r.GET("/monitor/runs", func(c *gin.Context) {
		var items []repository.MonitorRunModel
		if err := db.WithContext(c.Request.Context()).Where("project_id = ?", projectID(c)).Order("created_at DESC").Limit(100).Find(&items).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"items": items})
	})
	r.GET("/evolution/runs", func(c *gin.Context) {
		var items []repository.EvolutionRunModel
		if err := db.WithContext(c.Request.Context()).Where("project_id = ?", projectID(c)).Order("created_at DESC").Limit(100).Find(&items).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"items": items})
	})
	r.GET("/projects/facts/all", func(c *gin.Context) {
		var items []repository.BrandFactModel
		if err := db.WithContext(c.Request.Context()).Where("project_id = ?", projectID(c)).Order("created_at DESC").Limit(1000).Find(&items).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"items": items})
	})
	r.POST("/projects/facts", func(c *gin.Context) {
		var req struct {
			FactType  string `json:"fact_type" binding:"required,max=64"`
			Statement string `json:"statement" binding:"required,max=4000"`
			Source    string `json:"source" binding:"required,max=2000"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(400, gin.H{"error": "fact type, statement and evidence source required"})
			return
		}
		actor := domain.ActorFrom(c.Request.Context())
		fact := repository.BrandFactModel{ProjectID: projectID(c), FactType: req.FactType, Statement: req.Statement, Source: req.Source, Status: "pending", CreatedBy: &actor.UserID}
		if err := db.WithContext(c.Request.Context()).Create(&fact).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(201, fact)
	})
	r.POST("/projects/facts/:id/approve", func(c *gin.Context) {
		err := db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
			result := tx.Model(&repository.BrandFactModel{}).Where("id = ? AND project_id = ? AND status = 'pending' AND source <> ''", c.Param("id"), projectID(c)).Update("status", "approved")
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return domain.ErrConflict
			}
			return audit(tx, c, "approve_fact", gin.H{"id": c.Param("id")})
		})
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"status": "approved"})
	})
	r.POST("/harness/memory/:id/approve", func(c *gin.Context) {
		err := db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
			var entry repository.MemoryEntryModel
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND project_id = ? AND status = 'pending'", c.Param("id"), projectID(c)).First(&entry).Error; err != nil {
				return err
			}
			if entry.MemoryType == "brand_truth" {
				return domain.ErrConflict
			}
			if err := tx.Model(&entry).Update("status", "approved").Error; err != nil {
				return err
			}
			return audit(tx, c, "approve_memory", gin.H{"id": entry.ID})
		})
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"status": "approved"})
	})
	r.PUT("/content/assets/:id", func(c *gin.Context) {
		var req struct {
			Version int    `json:"version" binding:"required,min=1"`
			Title   string `json:"title" binding:"required,max=255"`
			Body    string `json:"body" binding:"required,max=100000"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(400, gin.H{"error": "version, title and body required"})
			return
		}
		check, err := content.VerifyContentFacts(c.Request.Context(), projectID(c), req.Body)
		if err != nil {
			respondError(c, err)
			return
		}
		raw, _ := json.Marshal(check)
		status := "draft"
		if check.Passed {
			status = "pending_approval"
		}
		result := db.WithContext(c.Request.Context()).Model(&repository.ContentAssetModel{}).Where("id = ? AND project_id = ? AND version = ?", c.Param("id"), projectID(c), req.Version).Updates(map[string]interface{}{"title": req.Title, "content_body": req.Body, "version": req.Version + 1, "status": status, "quality_checks": string(raw)})
		if result.Error != nil {
			respondError(c, result.Error)
			return
		}
		if result.RowsAffected != 1 {
			respondError(c, domain.ErrConflict)
			return
		}
		c.JSON(200, gin.H{"status": status, "version": req.Version + 1, "quality_checks": check})
	})
	r.POST("/content/assets/:id/approve", func(c *gin.Context) {
		var req struct {
			Version int `json:"version" binding:"required,min=1"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(400, gin.H{"error": "content version required"})
			return
		}
		err := db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
			var asset repository.ContentAssetModel
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND project_id = ? AND version = ? AND status = 'pending_approval'", c.Param("id"), projectID(c), req.Version).First(&asset).Error; err != nil {
				return err
			}
			check, err := usecase.NewContentUsecase(repository.NewContentRepository(tx), repository.NewProjectRepository(tx)).VerifyContentFacts(c.Request.Context(), projectID(c), asset.ContentBody)
			if err != nil {
				return err
			}
			if !check.Passed {
				return domain.ErrConflict
			}
			raw, _ := json.Marshal(check)
			if err = tx.Model(&asset).Updates(map[string]interface{}{"status": "approved", "quality_checks": string(raw)}).Error; err != nil {
				return err
			}
			return audit(tx, c, "approve_content", gin.H{"id": asset.ID, "version": asset.Version, "content_hash": secretutil.Digest(asset.ContentBody)})
		})
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"status": "approved"})
	})
	r.GET("/channels", func(c *gin.Context) {
		var items []repository.PublishChannelModel
		if err := db.WithContext(c.Request.Context()).Where("project_id = ?", projectID(c)).Find(&items).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"items": items})
	})
	r.POST("/channels", func(c *gin.Context) {
		var req struct {
			Name        string `json:"name" binding:"required,max=120"`
			EndpointURL string `json:"endpoint_url" binding:"required,max=512"`
			Credential  string `json:"credential" binding:"max=4000"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(400, gin.H{"error": "invalid channel"})
			return
		}
		if err := outbound.ValidateURL(req.EndpointURL); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		channel := repository.PublishChannelModel{ProjectID: projectID(c), Name: req.Name, ChannelType: "webhook", EndpointURL: req.EndpointURL, Credential: req.Credential, IsActive: true}
		if err := db.WithContext(c.Request.Context()).Create(&channel).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(201, channel)
	})
	r.DELETE("/channels/:id", func(c *gin.Context) {
		if err := db.WithContext(c.Request.Context()).Model(&repository.PublishChannelModel{}).Where("id = ? AND project_id = ?", c.Param("id"), projectID(c)).Update("is_active", false).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"status": "disabled"})
	})
	r.POST("/content/assets/:id/publish", func(c *gin.Context) {
		var req struct {
			ChannelID string `json:"channel_id" binding:"required,uuid"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(400, gin.H{"error": "channel_id required"})
			return
		}
		actor := domain.ActorFrom(c.Request.Context())
		session := repository.CopilotSessionModel{ProjectID: projectID(c), UserID: actor.UserID, Title: "内容发布审批", LastActiveAt: time.Now()}
		repo := repository.NewCopilotRepository(db)
		if err := repo.CreateSession(c.Request.Context(), &session); err != nil {
			respondError(c, err)
			return
		}
		args, _ := json.Marshal(gin.H{"content_id": c.Param("id"), "channel": req.ChannelID, "title": "内容发布"})
		preview, err := copilot.PrepareAction(c.Request.Context(), session.ID, string(args))
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"status": "pending", "session_id": session.ID, "preview": preview})
	})
	r.GET("/publications", func(c *gin.Context) {
		var items []repository.PublicationModel
		if err := db.WithContext(c.Request.Context()).Where("project_id = ?", projectID(c)).Order("created_at DESC").Limit(100).Find(&items).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"items": items})
	})
	r.POST("/publications/:id/reconcile", func(c *gin.Context) {
		var publication repository.PublicationModel
		if err := db.WithContext(c.Request.Context()).Where("id = ? AND project_id = ? AND status IN ('publishing','outcome_unknown')", c.Param("id"), projectID(c)).First(&publication).Error; err != nil {
			respondError(c, err)
			return
		}
		if publication.ChannelID == nil {
			respondError(c, domain.ErrConflict)
			return
		}
		var channel repository.PublishChannelModel
		if err := db.Where("id = ? AND project_id = ?", publication.ChannelID, projectID(c)).First(&channel).Error; err != nil {
			respondError(c, err)
			return
		}
		receipt, err := (publisher.Webhook{}).Reconcile(c.Request.Context(), channel.EndpointURL, publication.IdempotencyKey, channel.Credential)
		if err != nil {
			respondError(c, err)
			return
		}
		raw, _ := json.Marshal(receipt)
		err = db.WithContext(c.Request.Context()).Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&publication).Updates(map[string]interface{}{"status": "published", "external_id": receipt.ExternalID, "target_url": receipt.PublishedURL, "receipt": string(raw), "published_at": time.Now(), "error_message": ""}).Error; err != nil {
				return err
			}
			if err := repository.EnqueueJob(tx, &repository.JobModel{ProjectID: publication.ProjectID, Kind: "scheduled_monitor", Payload: "{}", IdempotencyKey: "retest:" + publication.ID.String(), AvailableAt: time.Now().Add(48 * time.Hour)}); err != nil {
				return err
			}
			return audit(tx, c, "reconcile_publication", gin.H{"id": publication.ID, "receipt": receipt})
		})
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, receipt)
	})
	r.GET("/experiments", func(c *gin.Context) {
		var items []repository.ExperimentModel
		if err := db.WithContext(c.Request.Context()).Where("project_id = ?", projectID(c)).Order("created_at DESC").Limit(100).Find(&items).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"items": items})
	})
	r.POST("/experiments", func(c *gin.Context) {
		var req struct {
			Title        string          `json:"title" binding:"required,max=255"`
			Hypothesis   string          `json:"hypothesis" binding:"required,max=4000"`
			BaselineID   uuid.UUID       `json:"baseline_run_id" binding:"required"`
			VariantID    uuid.UUID       `json:"variant_run_id" binding:"required"`
			ProposedRule json.RawMessage `json:"proposed_rule"`
		}
		if c.ShouldBindJSON(&req) != nil || req.BaselineID == req.VariantID {
			c.JSON(400, gin.H{"error": "two distinct completed monitor runs required"})
			return
		}
		var count int64
		if err := db.Model(&repository.MonitorRunModel{}).Where("project_id = ? AND id IN ? AND status = 'completed'", projectID(c), []uuid.UUID{req.BaselineID, req.VariantID}).Count(&count).Error; err != nil {
			respondError(c, err)
			return
		}
		if count != 2 {
			respondError(c, domain.ErrConflict)
			return
		}
		experiment := repository.ExperimentModel{ProjectID: projectID(c), Title: req.Title, Hypothesis: req.Hypothesis, BaselineRunID: &req.BaselineID, VariantRunID: &req.VariantID, ProposedRule: string(req.ProposedRule), Status: "pending"}
		if err := db.WithContext(c.Request.Context()).Create(&experiment).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(201, experiment)
	})
	r.GET("/schedules", func(c *gin.Context) {
		var schedule repository.ScheduleModel
		err := db.Where("project_id = ?", projectID(c)).First(&schedule).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(200, gin.H{"configured": false})
			return
		}
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, schedule)
	})
	r.GET("/members", func(c *gin.Context) {
		var items []repository.ProjectMemberModel
		if err := db.Where("project_id = ?", projectID(c)).Find(&items).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"items": items})
	})
	r.PUT("/members", func(c *gin.Context) {
		var req struct {
			UserID uuid.UUID `json:"user_id" binding:"required"`
			Role   string    `json:"role" binding:"required,oneof=viewer editor reviewer"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(400, gin.H{"error": "invalid member"})
			return
		}
		actor := domain.ActorFrom(c.Request.Context())
		var user repository.UserModel
		if err := db.Where("id = ? AND organization_id = ?", req.UserID, actor.OrganizationID).First(&user).Error; err != nil {
			respondError(c, err)
			return
		}
		member := repository.ProjectMemberModel{ProjectID: projectID(c), UserID: req.UserID, Role: req.Role}
		if err := db.Clauses(clause.OnConflict{UpdateAll: true}).Create(&member).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, member)
	})
}
