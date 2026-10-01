package http

import (
	"context"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/internal/usecase"
	"github.com/robbinsz/bgeo/pkg/outbound"
	"net/http"
	"time"
)

func registerSystemRoutes(protected *gin.RouterGroup, h *routeServices) {
	copilotRepo, copilotUC := h.copilotRepo, h.copilotUC
	// 9. System AI Configuration
	systemGroup := protected.Group("/system")
	systemGroup.GET("/status", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		db := h.db.WithContext(ctx)
		projectID := domain.ActorFrom(ctx).ProjectID
		counts := []struct {
			Status string `json:"status"`
			Count  int64  `json:"count"`
		}{}
		if err := db.Model(&repository.JobModel{}).Select("status, count(*) as count").Where("project_id = ?", projectID).Group("status").Scan(&counts).Error; err != nil {
			respondError(c, err)
			return
		}
		var expired, unknown int64
		if err := db.Model(&repository.JobModel{}).Where("project_id = ? AND status = 'running' AND lease_until < ?", projectID, time.Now()).Count(&expired).Error; err != nil {
			respondError(c, err)
			return
		}
		if err := db.Model(&repository.PublicationModel{}).Where("project_id = ? AND status = 'outcome_unknown'", projectID).Count(&unknown).Error; err != nil {
			respondError(c, err)
			return
		}
		c.JSON(200, gin.H{"jobs": counts, "expired_leases": expired, "unknown_publications": unknown, "schema_version": repository.SchemaVersion, "observed_at": time.Now().UTC()})
	})
	{
		systemGroup.GET("/ai-config", func(c *gin.Context) {
			cfg, err := copilotRepo.GetActiveAIConfig(c.Request.Context())
			if err != nil {
				respondError(c, err)
				return
			}
			maskedKey := ""
			if cfg.APIKey != "" {
				maskedKey = "********"
			}
			c.JSON(http.StatusOK, gin.H{
				"id":          cfg.ID,
				"provider":    cfg.Provider,
				"base_url":    cfg.BaseURL,
				"model_name":  cfg.ModelName,
				"temperature": cfg.Temperature,
				"masked_key":  maskedKey,
				"is_active":   cfg.IsActive,
			})
		})

		systemGroup.PUT("/ai-config", func(c *gin.Context) {
			var req struct {
				Provider    string  `json:"provider"`
				BaseURL     string  `json:"base_url" binding:"required"`
				APIKey      string  `json:"api_key"`
				ModelName   string  `json:"model_name" binding:"required"`
				Temperature float64 `json:"temperature"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			if err := outbound.ValidateURL(req.BaseURL); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			if req.Temperature < 0 || req.Temperature > 2 {
				respondError(c, domain.ErrInvalid)
				return
			}
			existing, err := copilotRepo.GetActiveAIConfig(c.Request.Context())
			if err != nil {
				respondError(c, err)
				return
			}
			key := req.APIKey
			if key == "" && existing != nil {
				key = existing.APIKey
			}
			provider := req.Provider
			if provider == "" {
				provider = "openai"
			}
			temp := req.Temperature
			if temp == 0 {
				temp = 0.3
			}
			newCfg := &repository.AIConfigModel{
				BaseGormModel: repository.BaseGormModel{ID: uuid.New()},
				Provider:      provider,
				BaseURL:       req.BaseURL,
				APIKey:        key,
				ModelName:     req.ModelName,
				Temperature:   temp,
				IsActive:      true,
			}
			if err := copilotRepo.SaveAIConfig(c.Request.Context(), newCfg); err != nil {
				respondError(c, err)
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "saved", "model": newCfg.ModelName})
		})

		systemGroup.POST("/ai-config/test", func(c *gin.Context) {
			cfg, err := copilotRepo.GetActiveAIConfig(c.Request.Context())
			if err != nil || cfg.APIKey == "" {
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": "未配置大模型 API 密钥 (API Key)",
				})
				return
			}
			messages := []usecase.OpenAIMessage{
				{Role: "user", Content: "Hello, reply with 'OK'"},
			}
			_, _, err = copilotUC.CallLLMDirect(c.Request.Context(), cfg, messages)
			if err != nil {
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"message": fmt.Sprintf("连接测试失败: %v", err),
				})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": fmt.Sprintf("模型接口测试连接成功！供应商: %s, 模型: %s", cfg.Provider, cfg.ModelName),
			})
		})
	}
}
