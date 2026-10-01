package http

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"net/http"
)

func registerBusinessRoutes(protected *gin.RouterGroup, h *routeServices) {
	db := h.db
	projectRepo := h.projectRepo
	monitorRepo := h.monitorRepo
	oppRepo := h.oppRepo
	strategyRepo := h.strategyRepo
	contentRepo := h.contentRepo
	evoRepo := h.evoRepo
	monitorUC := h.monitorUC
	contentUC := h.contentUC
	evolutionUC := h.evolutionUC
	// 1. Projects & Facts
	protected.GET("/projects/current", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		proj, err := projectRepo.GetProject(c.Request.Context(), projID.(uuid.UUID))
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		c.JSON(http.StatusOK, proj)
	})

	protected.PUT("/projects/current", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		var req struct {
			AutomationLevel string `json:"automation_level"`
			IsPaused        *bool  `json:"is_paused"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		updates := map[string]interface{}{}
		if req.AutomationLevel != "" && req.AutomationLevel != "L1" && req.AutomationLevel != "L2" && req.AutomationLevel != "L3" {
			c.JSON(400, gin.H{"error": "invalid automation level"})
			return
		}
		if req.AutomationLevel != "" {
			updates["automation_level"] = req.AutomationLevel
		}
		if req.IsPaused != nil {
			updates["is_paused"] = *req.IsPaused
		}
		if len(updates) > 0 {
			if err := db.Model(&repository.ProjectModel{}).Where("id = ?", projID).Updates(updates).Error; err != nil {
				respondError(c, err)
				return
			}
		}
		proj, err := projectRepo.GetProject(c.Request.Context(), projID.(uuid.UUID))
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, proj)
	})

	protected.GET("/projects/facts", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		facts, err := projectRepo.ListBrandFacts(c.Request.Context(), projID.(uuid.UUID))
		if err != nil {
			respondError(c, err)
			return
		}
		respondItems(c, facts)
	})

	protected.GET("/projects/competitors", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		comps, err := projectRepo.ListCompetitors(c.Request.Context(), projID.(uuid.UUID))
		if err != nil {
			respondError(c, err)
			return
		}
		respondItems(c, comps)
	})

	// 2. Monitor & Snapshots
	protected.GET("/monitor/queries", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		queries, err := monitorRepo.ListQueries(c.Request.Context(), projID.(uuid.UUID))
		if err != nil {
			respondError(c, err)
			return
		}
		respondItems(c, queries)
	})

	protected.POST("/monitor/queries", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		var req struct {
			QueryText string `json:"query_text" binding:"required,max=4000"`
			Topic     string `json:"topic"`
			Intent    string `json:"intent"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		q := &repository.QueryModel{
			BaseGormModel:   repository.BaseGormModel{ID: uuid.New()},
			ProjectID:       projID.(uuid.UUID),
			QueryText:       req.QueryText,
			Topic:           req.Topic,
			Intent:          req.Intent,
			BusinessValue:   80,
			Priority:        "high",
			Status:          "active",
			SampleFrequency: "daily",
		}
		if err := monitorRepo.CreateQuery(c.Request.Context(), q); err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusCreated, q)
	})

	protected.POST("/monitor/runs", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		run, err := monitorUC.ExecuteBatchRun(c.Request.Context(), projID.(uuid.UUID))
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusAccepted, run)
	})

	protected.GET("/monitor/snapshots", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		snaps, err := monitorRepo.ListRecentSnapshots(c.Request.Context(), projID.(uuid.UUID), 50)
		if err != nil {
			respondError(c, err)
			return
		}
		respondItems(c, snaps)
	})

	// 3. Opportunities
	protected.GET("/diagnosis/opportunities", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		opps, err := oppRepo.ListOpportunities(c.Request.Context(), projID.(uuid.UUID))
		if err != nil {
			respondError(c, err)
			return
		}
		respondItems(c, opps)
	})

	protected.POST("/diagnosis/opportunities/:id/status", func(c *gin.Context) {
		oppID, err := uuid.Parse(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid uuid"})
			return
		}
		var req struct {
			Status string `json:"status" binding:"required,oneof=new reviewed in_progress resolved dismissed"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := oppRepo.UpdateStatus(c.Request.Context(), oppID, req.Status); err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "updated"})
	})

	// 4. Strategies
	protected.GET("/strategies", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		strategies, err := strategyRepo.ListStrategies(c.Request.Context(), projID.(uuid.UUID))
		if err != nil {
			respondError(c, err)
			return
		}
		respondItems(c, strategies)
	})

	protected.POST("/strategies", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		var req struct {
			Title     string `json:"title" binding:"required"`
			Objective string `json:"objective"`
			Priority  string `json:"priority"`
			Assignee  string `json:"assignee"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		st := &repository.StrategyModel{
			BaseGormModel: repository.BaseGormModel{ID: uuid.New()},
			ProjectID:     projID.(uuid.UUID),
			Title:         req.Title,
			Objective:     req.Objective,
			Status:        "backlog",
			Assignee:      req.Assignee,
		}
		if err := strategyRepo.CreateStrategy(c.Request.Context(), st); err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusCreated, st)
	})

	// 5. Content Assets
	protected.GET("/content/assets", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		assets, err := contentRepo.ListAssets(c.Request.Context(), projID.(uuid.UUID))
		if err != nil {
			respondError(c, err)
			return
		}
		respondItems(c, assets)
	})

	protected.POST("/content/assets", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		var req struct {
			Title     string `json:"title" binding:"required"`
			AssetType string `json:"asset_type" binding:"required"`
			Body      string `json:"body"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		asset, err := contentUC.CreateContentAsset(c.Request.Context(), projID.(uuid.UUID), req.Title, req.AssetType, req.Body, map[string]interface{}{})
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusCreated, asset)
	})

	protected.POST("/content/verify", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		var req struct {
			Content string `json:"content" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		result, err := contentUC.VerifyContentFacts(c.Request.Context(), projID.(uuid.UUID), req.Content)
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, result)
	})

	// 6. Evolution
	protected.GET("/evolution/rules", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		rules, err := evoRepo.ListRules(c.Request.Context(), projID.(uuid.UUID))
		if err != nil {
			respondError(c, err)
			return
		}
		respondItems(c, rules)
	})

	protected.POST("/evolution/runs", func(c *gin.Context) {
		projID, _ := c.Get("project_id")
		run, err := evolutionUC.ExecuteEvolutionRun(c.Request.Context(), projID.(uuid.UUID))
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusAccepted, run)
	})

	protected.POST("/evolution/rules/:id/approve", func(c *gin.Context) {
		ruleID, err := uuid.Parse(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule uuid"})
			return
		}
		if err := evolutionUC.ApproveRule(c.Request.Context(), ruleID); err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "approved"})
	})

	protected.POST("/evolution/rules/:id/rollback", func(c *gin.Context) {
		ruleID, err := uuid.Parse(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule uuid"})
			return
		}
		if err := evolutionUC.RollbackRule(c.Request.Context(), ruleID); err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "rolled_back"})
	})

	// 7. Overview metrics aggregation
	protected.GET("/overview/metrics", func(c *gin.Context) {
		data, err := monitorUC.Metrics(c.Request.Context(), domain.ActorFrom(c.Request.Context()).ProjectID)
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, data)
	})

}
