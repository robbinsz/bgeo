package http

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/connector/ai"
	"github.com/robbinsz/bgeo/internal/delivery/http/middleware"
	"github.com/robbinsz/bgeo/internal/delivery/ws"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/internal/usecase"
	"github.com/robbinsz/bgeo/pkg/jwtutil"
	"github.com/robbinsz/bgeo/pkg/outbound"
	"github.com/robbinsz/bgeo/pkg/ruleengine"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func SetupRouterWithDB(db *gorm.DB, hub *ws.Hub) *gin.Engine {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}
	r := gin.New()
	r.Use(gin.Recovery(), middleware.RequestBoundary())
	_ = r.SetTrustedProxies(nil)

	r.Use(middleware.CORSMiddleware())

	// Initialize repos and usecases
	userRepo := repository.NewUserRepository(db)
	projectRepo := repository.NewProjectRepository(db)
	monitorRepo := repository.NewMonitorRepository(db)
	oppRepo := repository.NewOpportunityRepository(db)
	strategyRepo := repository.NewStrategyRepository(db)
	contentRepo := repository.NewContentRepository(db)
	evoRepo := repository.NewEvolutionRepository(db)
	copilotRepo := repository.NewCopilotRepository(db)

	jwtService := jwtutil.NewJWTService(cfg.AccessSecret, cfg.RefreshSecret, 15*time.Minute, 7*24*time.Hour)
	aiConnector := ai.NewPerplexityConnector()
	evaluator := ruleengine.NewEvaluator()

	monitorUC := usecase.NewMonitorUsecase(monitorRepo, oppRepo, aiConnector, hub)
	contentUC := usecase.NewContentUsecase(contentRepo, projectRepo)
	evolutionUC := usecase.NewEvolutionUsecase(evoRepo, evaluator, hub)
	harnessRepo := repository.NewHarnessRepository(db)
	copilotUC := usecase.NewCopilotUsecase(copilotRepo, harnessRepo, monitorUC, contentUC, monitorRepo, oppRepo, projectRepo, contentRepo, hub)

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"system":  "GeoPilot GEO Autonomous Operations Platform",
			"version": "1.0.0",
		})
	})

	r.GET("/ready", func(c *gin.Context) {
		conn, err := db.DB()
		if err == nil {
			err = conn.PingContext(c.Request.Context())
		}
		if err == nil {
			err = repository.VerifySchema(c.Request.Context(), db)
		}
		if err != nil {
			c.JSON(503, gin.H{"status": "unavailable"})
			return
		}
		c.JSON(200, gin.H{"status": "ready"})
	})
	// WebSocket real-time subscription
	r.GET("/ws/live", middleware.JWTAuthMiddleware(jwtService), middleware.CurrentUser(db), middleware.ProjectContextMiddleware(), middleware.AuthorizeProject(db), func(c *gin.Context) {
		hub.HandleWS(c.Writer, c.Request)
	})

	// Serve static uploads
	_ = os.MkdirAll("data/uploads/avatars", 0755)
	r.Static("/uploads", "data/uploads")

	apiV1 := r.Group("/api/v1")
	{
		apiV1.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"status":  "ok",
				"system":  "GeoPilot GEO Autonomous Operations Platform",
				"version": "1.0.0",
			})
		})

		apiV1.GET("/runtime", func(c *gin.Context) { c.JSON(200, gin.H{"mode": cfg.Mode, "environment": cfg.Environment}) })
		apiV1.GET("/projects", middleware.JWTAuthMiddleware(jwtService), middleware.CurrentUser(db), func(c *gin.Context) {
			actor := domain.ActorFrom(c.Request.Context())
			var projects []repository.ProjectModel
			q := db.WithContext(c.Request.Context()).Where("organization_id = ?", actor.OrganizationID)
			if actor.Role != "admin" && actor.Role != "owner" {
				q = q.Where("id IN (?)", db.Model(&repository.ProjectMemberModel{}).Select("project_id").Where("user_id = ?", actor.UserID))
			}
			if err := q.Find(&projects).Error; err != nil {
				respondError(c, err)
				return
			}
			c.JSON(200, gin.H{"items": projects})
		})
		// Authentication (Dual token JWT: login, refresh, logout, me, profile, avatar)
		authGroup := apiV1.Group("/auth")
		{
			authGroup.POST("/login", middleware.LoginRateLimit(), func(c *gin.Context) {
				var req struct {
					Email    string `json:"email" binding:"required,email"`
					Password string `json:"password" binding:"required,max=72"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱和密码格式不正确"})
					return
				}

				user, err := userRepo.FindByEmail(c.Request.Context(), req.Email)
				if err != nil {
					c.JSON(http.StatusUnauthorized, gin.H{"error": "用户不存在或已被禁用"})
					return
				}

				if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
					c.JSON(http.StatusUnauthorized, gin.H{"error": "账号或密码错误"})
					return
				}

				access, refresh, accessExp, refreshExp, err := jwtService.GenerateTokenPair(user.ID, user.OrganizationID, user.Email, user.Role)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "生成鉴权凭据失败"})
					return
				}

				if err := userRepo.SaveRefreshToken(c.Request.Context(), user.ID, refresh, time.Unix(refreshExp, 0)); err != nil {
					respondError(c, err)
					return
				}

				setRefreshCookie(c, refresh, refreshExp)
				c.JSON(http.StatusOK, gin.H{
					"access_token": access,

					"token_type": "Bearer",
					"expires_in": accessExp - time.Now().Unix(),
					"user": gin.H{
						"id":            user.ID,
						"email":         user.Email,
						"name":          user.Name,
						"role":          user.Role,
						"team":          user.Team,
						"avatar":        user.Avatar,
						"avatar_bg":     user.AvatarBg,
						"avatar_letter": user.AvatarLetter,
					},
				})
			})

			authGroup.POST("/refresh", func(c *gin.Context) {
				var req struct {
					RefreshToken string `json:"refresh_token"`
				}
				req.RefreshToken, _ = c.Cookie("bgeo_refresh")
				if req.RefreshToken == "" {
					c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 refresh_token"})
					return
				}

				claims, err := jwtService.ValidateRefreshToken(req.RefreshToken)
				if err != nil {
					c.JSON(http.StatusUnauthorized, gin.H{"error": "refresh_token 无效或已过期", "code": "REFRESH_EXPIRED"})
					return
				}

				user, err := userRepo.FindByID(c.Request.Context(), claims.UserID)
				if err != nil {
					c.JSON(http.StatusUnauthorized, gin.H{"error": "关联用户不存在"})
					return
				}

				newAccess, newRefresh, accessExp, refreshExp, err := jwtService.GenerateTokenPair(user.ID, user.OrganizationID, user.Email, user.Role)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "刷新鉴权凭据失败"})
					return
				}

				if err := userRepo.RotateRefreshToken(c.Request.Context(), req.RefreshToken, newRefresh, user.ID, time.Unix(refreshExp, 0)); err != nil {
					c.JSON(401, gin.H{"error": "refresh token consumed or expired"})
					return
				}

				setRefreshCookie(c, newRefresh, refreshExp)
				c.JSON(http.StatusOK, gin.H{
					"access_token": newAccess,

					"token_type": "Bearer",
					"expires_in": accessExp - time.Now().Unix(),
				})
			})

			authGroup.POST("/logout", middleware.JWTAuthMiddleware(jwtService), middleware.CurrentUser(db), func(c *gin.Context) {
				setRefreshCookie(c, "", time.Now().Add(-time.Hour).Unix())
				userIDVal, exists := c.Get("user_id")
				if exists {
					if err := userRepo.RevokeUserRefreshTokens(c.Request.Context(), userIDVal.(uuid.UUID)); err != nil {
						respondError(c, err)
						return
					}
				}
				c.JSON(http.StatusOK, gin.H{"status": "logged_out"})
			})

			authGroup.GET("/me", middleware.JWTAuthMiddleware(jwtService), middleware.CurrentUser(db), func(c *gin.Context) {
				userIDVal, _ := c.Get("user_id")
				user, err := userRepo.FindByID(c.Request.Context(), userIDVal.(uuid.UUID))
				if err != nil {
					c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
					return
				}
				c.JSON(http.StatusOK, gin.H{
					"id":            user.ID,
					"email":         user.Email,
					"name":          user.Name,
					"role":          user.Role,
					"team":          user.Team,
					"avatar":        user.Avatar,
					"avatar_bg":     user.AvatarBg,
					"avatar_letter": user.AvatarLetter,
				})
			})

			authGroup.PUT("/profile", middleware.JWTAuthMiddleware(jwtService), middleware.CurrentUser(db), func(c *gin.Context) {
				userIDVal, exists := c.Get("user_id")
				if !exists {
					c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录或登录已失效"})
					return
				}
				userID := userIDVal.(uuid.UUID)

				var req struct {
					Name            string `json:"name"`
					Team            string `json:"team"`
					Avatar          string `json:"avatar"`
					AvatarBg        string `json:"avatar_bg"`
					AvatarLetter    string `json:"avatar_letter"`
					CurrentPassword string `json:"current_password"`
					NewPassword     string `json:"new_password"`
				}

				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数无效"})
					return
				}

				user, err := userRepo.FindByID(c.Request.Context(), userID)
				if err != nil {
					c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
					return
				}

				updates := make(map[string]interface{})

				if req.NewPassword != "" {
					if len(req.NewPassword) < 6 {
						c.JSON(http.StatusBadRequest, gin.H{"error": "新密码长度至少需要 6 位"})
						return
					}
					if req.CurrentPassword == "" {
						c.JSON(http.StatusBadRequest, gin.H{"error": "修改密码必须输入当前密码"})
						return
					}
					if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "当前密码不正确，无法修改密码"})
						return
					}
					newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
					if err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
						return
					}
					updates["password_hash"] = string(newHash)
				}

				if strings.TrimSpace(req.Name) != "" {
					updates["name"] = strings.TrimSpace(req.Name)
				}
				if req.Team != "" {
					updates["team"] = strings.TrimSpace(req.Team)
				}
				updates["avatar"] = strings.TrimSpace(req.Avatar)
				if req.AvatarBg != "" {
					updates["avatar_bg"] = strings.TrimSpace(req.AvatarBg)
				}
				if req.AvatarLetter != "" {
					updates["avatar_letter"] = strings.TrimSpace(req.AvatarLetter)
				}

				updatedUser, err := userRepo.UpdateProfile(c.Request.Context(), userID, updates)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "更新资料失败"})
					return
				}

				c.JSON(http.StatusOK, gin.H{
					"id":            updatedUser.ID,
					"email":         updatedUser.Email,
					"name":          updatedUser.Name,
					"role":          updatedUser.Role,
					"team":          updatedUser.Team,
					"avatar":        updatedUser.Avatar,
					"avatar_bg":     updatedUser.AvatarBg,
					"avatar_letter": updatedUser.AvatarLetter,
				})
			})

			authGroup.POST("/avatar", middleware.JWTAuthMiddleware(jwtService), middleware.CurrentUser(db), func(c *gin.Context) {
				file, err := c.FormFile("avatar")
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "请选择图片文件"})
					return
				}
				if file.Size > 2<<20 {
					c.JSON(413, gin.H{"error": "avatar exceeds 2MB"})
					return
				}
				source, err := file.Open()
				if err != nil {
					respondError(c, err)
					return
				}
				defer source.Close()
				pixels, format, err := image.DecodeConfig(io.LimitReader(source, 2<<20+1))
				if err != nil || pixels.Width > 4096 || pixels.Height > 4096 || pixels.Width*pixels.Height > 16000000 || (format != "jpeg" && format != "png") {
					c.JSON(400, gin.H{"error": "only bounded PNG/JPEG images are accepted"})
					return
				}
				ext := ".png"
				if format == "jpeg" {
					ext = ".jpg"
				}
				if _, err = source.Seek(0, io.SeekStart); err != nil {
					respondError(c, err)
					return
				}
				newFilename := uuid.NewString() + ext
				dst := filepath.Join("data/uploads/avatars", newFilename)
				target, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
				if err != nil {
					respondError(c, err)
					return
				}
				_, err = io.Copy(target, io.LimitReader(source, 2<<20))
				closeErr := target.Close()
				if err != nil || closeErr != nil {
					os.Remove(dst)
					c.JSON(500, gin.H{"error": "avatar save failed"})
					return
				}

				avatarURL := "/uploads/avatars/" + newFilename
				c.JSON(http.StatusOK, gin.H{"avatar_url": avatarURL})
			})
		}

		// Protected business APIs (require valid JWT access token)
		protected := apiV1.Group("")
		protected.Use(middleware.JWTAuthMiddleware(jwtService), middleware.CurrentUser(db), middleware.ProjectContextMiddleware(), middleware.AuthorizeProject(db))
		registerOperations(protected, db, monitorUC, contentUC, copilotUC)
		{
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
				c.JSON(http.StatusOK, gin.H{"items": facts})
			})

			protected.GET("/projects/competitors", func(c *gin.Context) {
				projID, _ := c.Get("project_id")
				comps, err := projectRepo.ListCompetitors(c.Request.Context(), projID.(uuid.UUID))
				if err != nil {
					respondError(c, err)
					return
				}
				c.JSON(http.StatusOK, gin.H{"items": comps})
			})

			// 2. Monitor & Snapshots
			protected.GET("/monitor/queries", func(c *gin.Context) {
				projID, _ := c.Get("project_id")
				queries, err := monitorRepo.ListQueries(c.Request.Context(), projID.(uuid.UUID))
				if err != nil {
					respondError(c, err)
					return
				}
				c.JSON(http.StatusOK, gin.H{"items": queries})
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
				c.JSON(http.StatusOK, gin.H{"items": snaps})
			})

			// 3. Opportunities
			protected.GET("/diagnosis/opportunities", func(c *gin.Context) {
				projID, _ := c.Get("project_id")
				opps, err := oppRepo.ListOpportunities(c.Request.Context(), projID.(uuid.UUID))
				if err != nil {
					respondError(c, err)
					return
				}
				c.JSON(http.StatusOK, gin.H{"items": opps})
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
				c.JSON(http.StatusOK, gin.H{"items": strategies})
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
				c.JSON(http.StatusOK, gin.H{"items": assets})
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
				c.JSON(http.StatusOK, gin.H{"items": rules})
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

			// 8. Copilot & AI Ops
			copilotGroup := protected.Group("/copilot")
			{
				copilotGroup.POST("/chat", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					userID, _ := c.Get("user_id")

					var req struct {
						SessionID string                 `json:"session_id"`
						Message   string                 `json:"message" binding:"required"`
						Context   map[string]interface{} `json:"context"`
					}
					if err := c.ShouldBindJSON(&req); err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
						return
					}

					var sessionUUID uuid.UUID
					if req.SessionID != "" {
						sessionUUID, _ = uuid.Parse(req.SessionID)
					}
					if sessionUUID == uuid.Nil {
						sessionUUID = uuid.New()
					}

					c.Writer.Header().Set("Content-Type", "text/event-stream")
					c.Writer.Header().Set("Cache-Control", "no-cache")
					c.Writer.Header().Set("Connection", "keep-alive")
					c.Writer.Header().Set("Transfer-Encoding", "chunked")

					flusher, ok := c.Writer.(http.Flusher)
					if !ok {
						c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming unsupported"})
						return
					}

					if err := copilotUC.ChatStream(
						c.Request.Context(),
						sessionUUID,
						projID.(uuid.UUID),
						userID.(uuid.UUID),
						req.Message,
						req.Context,
						c.Writer,
						flusher,
					); err != nil {
						raw, _ := json.Marshal(gin.H{"error": err.Error()})
						fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", raw)
						flusher.Flush()
					}
				})

				copilotGroup.POST("/resume", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					userID, _ := c.Get("user_id")

					var req struct {
						SessionID   string `json:"session_id" binding:"required"`
						InterruptID string `json:"interrupt_id" binding:"required"`
						Action      string `json:"action" binding:"required,oneof=confirm cancel"` // "confirm" or "cancel"
					}
					if err := c.ShouldBindJSON(&req); err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
						return
					}

					sessionUUID, err := uuid.Parse(req.SessionID)
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session_id"})
						return
					}

					c.Writer.Header().Set("Content-Type", "text/event-stream")
					c.Writer.Header().Set("Cache-Control", "no-cache")
					c.Writer.Header().Set("Connection", "keep-alive")
					c.Writer.Header().Set("Transfer-Encoding", "chunked")

					flusher, ok := c.Writer.(http.Flusher)
					if !ok {
						c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming unsupported"})
						return
					}

					if err := copilotUC.ResumeAction(
						c.Request.Context(),
						sessionUUID,
						projID.(uuid.UUID),
						userID.(uuid.UUID),
						req.InterruptID,
						req.Action,
						c.Writer,
						flusher,
					); err != nil {
						raw, _ := json.Marshal(gin.H{"error": err.Error()})
						fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", raw)
						flusher.Flush()
					}
				})

				copilotGroup.GET("/sessions", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					userID, _ := c.Get("user_id")
					sessions, err := copilotRepo.ListSessions(c.Request.Context(), projID.(uuid.UUID), userID.(uuid.UUID))
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"items": sessions})
				})

				copilotGroup.GET("/sessions/:id", func(c *gin.Context) {
					sessionID, err := uuid.Parse(c.Param("id"))
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session uuid"})
						return
					}
					session, err := copilotRepo.GetSession(c.Request.Context(), sessionID)
					if err != nil {
						c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
						return
					}
					messages, err := copilotRepo.ListMessages(c.Request.Context(), sessionID)
					if err != nil {
						respondError(c, err)
						return
					}
					checkpoint, err := copilotRepo.GetCheckpoint(c.Request.Context(), sessionID)
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{
						"session":    session,
						"messages":   messages,
						"checkpoint": checkpoint,
					})
				})

				copilotGroup.DELETE("/sessions/:id", func(c *gin.Context) {
					sessionID, err := uuid.Parse(c.Param("id"))
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session uuid"})
						return
					}
					if err := copilotRepo.ArchiveSession(c.Request.Context(), sessionID); err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"status": "archived"})
				})

				copilotGroup.GET("/audit-logs", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					logs, err := copilotRepo.ListAuditLogs(c.Request.Context(), projID.(uuid.UUID), 50)
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"items": logs})
				})

				copilotGroup.GET("/traces", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					var sessionUUID *uuid.UUID
					if sStr := c.Query("session_id"); sStr != "" {
						if sid, err := uuid.Parse(sStr); err == nil {
							sessionUUID = &sid
						}
					}
					limit := 50
					if lStr := c.Query("limit"); lStr != "" {
						if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
							limit = l
						}
					}
					traces, err := copilotRepo.ListExecutionTraces(c.Request.Context(), projID.(uuid.UUID), sessionUUID, limit)
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"items": traces})
				})

				copilotGroup.GET("/traces/:id", func(c *gin.Context) {
					traceID, err := uuid.Parse(c.Param("id"))
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid trace uuid"})
						return
					}
					trace, err := copilotRepo.GetExecutionTrace(c.Request.Context(), traceID)
					if err != nil {
						c.JSON(http.StatusNotFound, gin.H{"error": "trace not found"})
						return
					}
					c.JSON(http.StatusOK, trace)
				})
			}

			// 8b. Harness Configuration API (HarnessConfig / MCPServer / MemoryEntry)
			harnessGroup := protected.Group("/harness")
			{
				harnessGroup.GET("/config", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					cfg, err := harnessRepo.GetOrCreateConfig(c.Request.Context(), projID.(uuid.UUID))
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, cfg)
				})

				harnessGroup.PUT("/config", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					var req struct {
						EnabledSkills    *string `json:"enabled_skills"`
						MaxHistoryTurns  *int    `json:"max_history_turns"`
						AutoSummarize    *bool   `json:"auto_summarize"`
						DefaultModelID   string  `json:"default_model_id"`
						EmbeddingModelID string  `json:"embedding_model_id"`
					}
					if err := c.ShouldBindJSON(&req); err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
						return
					}
					updates := map[string]interface{}{}
					if req.EnabledSkills != nil {
						var names []string
						if len(*req.EnabledSkills) > 8000 || json.Unmarshal([]byte(*req.EnabledSkills), &names) != nil || names == nil || len(names) > 100 {
							respondError(c, domain.ErrInvalid)
							return
						}
						updates["enabled_skills"] = *req.EnabledSkills
					}
					if req.MaxHistoryTurns != nil {
						if *req.MaxHistoryTurns < 1 || *req.MaxHistoryTurns > 40 {
							respondError(c, domain.ErrInvalid)
							return
						}
						updates["max_history_turns"] = *req.MaxHistoryTurns
					}
					if req.AutoSummarize != nil {
						updates["auto_summarize"] = *req.AutoSummarize
					}
					if req.DefaultModelID != "" {
						updates["default_model_id"] = req.DefaultModelID
					}
					if req.EmbeddingModelID != "" {
						updates["embedding_model_id"] = req.EmbeddingModelID
					}
					if len(updates) > 0 {
						if err := harnessRepo.UpdateConfig(c.Request.Context(), projID.(uuid.UUID), updates); err != nil {
							respondError(c, err)
							return
						}
					}
					cfg, err := harnessRepo.GetOrCreateConfig(c.Request.Context(), projID.(uuid.UUID))
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, cfg)
				})

				harnessGroup.GET("/mcp-servers", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					servers, err := harnessRepo.ListMCPServers(c.Request.Context(), projID.(uuid.UUID))
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"items": servers})
				})

				harnessGroup.POST("/mcp-servers", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					var req struct {
						Name          string `json:"name" binding:"required"`
						TransportType string `json:"transport_type" binding:"omitempty,oneof=http_sse streamable_http sse"`
						EndpointURL   string `json:"endpoint_url" binding:"required"`
						AuthHeaders   string `json:"auth_headers" binding:"max=8000"`
						IsActive      *bool  `json:"is_active"`
					}
					if err := c.ShouldBindJSON(&req); err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
						return
					}
					transport := req.TransportType
					if transport == "" {
						transport = "http_sse"
					}
					isActive := true
					if req.IsActive != nil {
						isActive = *req.IsActive
					}
					if err := outbound.ValidateURL(req.EndpointURL); err != nil {
						respondError(c, err)
						return
					}
					srv := &repository.MCPServerModel{
						ProjectID:     projID.(uuid.UUID),
						Name:          req.Name,
						TransportType: transport,
						EndpointURL:   req.EndpointURL,
						AuthHeaders:   req.AuthHeaders,
						IsActive:      isActive,
					}
					if err := harnessRepo.CreateMCPServer(c.Request.Context(), srv); err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusCreated, srv)
				})

				harnessGroup.PUT("/mcp-servers/:id", func(c *gin.Context) {
					serverID, err := uuid.Parse(c.Param("id"))
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid uuid"})
						return
					}
					var req struct {
						Name          string `json:"name"`
						TransportType string `json:"transport_type" binding:"omitempty,oneof=http_sse streamable_http sse"`
						EndpointURL   string `json:"endpoint_url"`
						AuthHeaders   string `json:"auth_headers" binding:"max=8000"`
						IsActive      *bool  `json:"is_active"`
					}
					if err := c.ShouldBindJSON(&req); err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
						return
					}
					updates := map[string]interface{}{}
					if req.Name != "" {
						updates["name"] = req.Name
					}
					if req.TransportType != "" {
						updates["transport_type"] = req.TransportType
					}
					if req.EndpointURL != "" {
						if err := outbound.ValidateURL(req.EndpointURL); err != nil {
							respondError(c, err)
							return
						}
						updates["endpoint_url"] = req.EndpointURL
					}
					if req.AuthHeaders != "" {
						var value map[string]string
						if json.Unmarshal([]byte(req.AuthHeaders), &value) != nil {
							respondError(c, domain.ErrInvalid)
							return
						}
						updates["auth_headers"] = req.AuthHeaders
					}
					if req.IsActive != nil {
						updates["is_active"] = *req.IsActive
					}
					if err := harnessRepo.UpdateMCPServer(c.Request.Context(), serverID, updates); err != nil {
						respondError(c, err)
						return
					}
					srv, err := harnessRepo.GetMCPServer(c.Request.Context(), serverID)
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, srv)
				})

				harnessGroup.DELETE("/mcp-servers/:id", func(c *gin.Context) {
					serverID, err := uuid.Parse(c.Param("id"))
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid uuid"})
						return
					}
					if err := harnessRepo.DeleteMCPServer(c.Request.Context(), serverID); err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"status": "deleted"})
				})

				harnessGroup.POST("/mcp-servers/:id/ping", func(c *gin.Context) {
					serverID, err := uuid.Parse(c.Param("id"))
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid uuid"})
						return
					}
					srv, err := harnessRepo.GetMCPServer(c.Request.Context(), serverID)
					if err != nil {
						c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
						return
					}
					var authMap map[string]string
					_ = json.Unmarshal([]byte(srv.AuthHeaders), &authMap)
					mcpClient := usecase.NewMCPClient(srv.ID.String(), srv.EndpointURL, authMap)
					tools, err := mcpClient.ListTools(c.Request.Context())
					if err != nil {
						c.JSON(http.StatusOK, gin.H{"status": "offline", "error": err.Error()})
						return
					}
					var toolMaps []map[string]interface{}
					for _, t := range tools {
						toolMaps = append(toolMaps, t.ToOpenAIToolDef())
					}
					if err := harnessRepo.UpdateMCPToolsCache(c.Request.Context(), srv.ID, toolMaps); err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"status": "online", "tools_count": len(tools), "tools": toolMaps})
				})

				harnessGroup.GET("/memory", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					memType := c.Query("type")
					entries, err := harnessRepo.ListMemoryEntries(c.Request.Context(), projID.(uuid.UUID), memType)
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"items": entries})
				})

				harnessGroup.POST("/memory", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					var req struct {
						MemoryType  string  `json:"memory_type" binding:"required,oneof=brand_truth user_pref episodic_strategy"`
						Title       string  `json:"title" binding:"required"`
						Content     string  `json:"content" binding:"required,max=4000"`
						Tags        string  `json:"tags"`
						IsPinned    bool    `json:"is_pinned"`
						ScoreWeight float64 `json:"score_weight"`
					}
					if err := c.ShouldBindJSON(&req); err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
						return
					}
					weight := req.ScoreWeight
					if weight == 0 {
						weight = 1.0
					}
					entry := &repository.MemoryEntryModel{
						ProjectID:   projID.(uuid.UUID),
						MemoryType:  req.MemoryType,
						Title:       req.Title,
						Content:     req.Content,
						Tags:        req.Tags,
						IsPinned:    req.IsPinned,
						ScoreWeight: weight,
					}
					if err := harnessRepo.CreateMemoryEntry(c.Request.Context(), entry); err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusCreated, entry)
				})

				harnessGroup.PUT("/memory/:id", func(c *gin.Context) {
					entryID, err := uuid.Parse(c.Param("id"))
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid uuid"})
						return
					}
					var req struct {
						Title       string  `json:"title"`
						Content     string  `json:"content"`
						Tags        string  `json:"tags"`
						IsPinned    *bool   `json:"is_pinned"`
						ScoreWeight float64 `json:"score_weight"`
					}
					if err := c.ShouldBindJSON(&req); err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
						return
					}
					updates := map[string]interface{}{}
					if req.Title != "" {
						updates["title"] = req.Title
					}
					if req.Content != "" {
						updates["content"] = req.Content
					}
					if req.Tags != "" {
						updates["tags"] = req.Tags
					}
					if req.IsPinned != nil {
						updates["is_pinned"] = *req.IsPinned
					}
					if req.ScoreWeight > 0 {
						updates["score_weight"] = req.ScoreWeight
					}
					if err := harnessRepo.UpdateMemoryEntry(c.Request.Context(), entryID, updates); err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"status": "updated"})
				})

				harnessGroup.DELETE("/memory/:id", func(c *gin.Context) {
					entryID, err := uuid.Parse(c.Param("id"))
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid uuid"})
						return
					}
					if err := harnessRepo.DeleteMemoryEntry(c.Request.Context(), entryID); err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"status": "deleted"})
				})

				harnessGroup.POST("/memory/trigger-hook", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					var projectUUID uuid.UUID
					if projID != nil {
						projectUUID = projID.(uuid.UUID)
					}

					var req struct {
						SessionID     string `json:"session_id"`
						UserPrompt    string `json:"user_prompt" binding:"required"`
						AssistantResp string `json:"assistant_resp" binding:"required"`
					}
					if err := c.ShouldBindJSON(&req); err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "user_prompt 与 assistant_resp 均为必填"})
						return
					}

					var sessionUUID uuid.UUID
					if req.SessionID != "" {
						sessionUUID, _ = uuid.Parse(req.SessionID)
					}
					if sessionUUID == uuid.Nil {
						sessionUUID = uuid.New()
					}

					extracted, err := copilotUC.ExtractMemoryCandidates(c.Request.Context(), sessionUUID, projectUUID, req.UserPrompt, req.AssistantResp)
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{
						"status":    "success",
						"count":     len(extracted),
						"extracted": extracted,
					})
				})

				// ── Custom Skills Import & Management ──
				harnessGroup.GET("/skills", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					var projectUUID uuid.UUID
					if projID != nil {
						projectUUID = projID.(uuid.UUID)
					}
					skills, err := harnessRepo.ListCustomSkills(c.Request.Context(), projectUUID)
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"items": skills})
				})

				harnessGroup.POST("/skills/import", func(c *gin.Context) {
					projID, _ := c.Get("project_id")
					var projectUUID uuid.UUID
					if projID != nil {
						projectUUID = projID.(uuid.UUID)
					}

					fileHeader, err := c.FormFile("file")
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "请上传技能 zip 格式压缩包文件"})
						return
					}

					if !strings.HasSuffix(strings.ToLower(fileHeader.Filename), ".zip") {
						c.JSON(http.StatusBadRequest, gin.H{"error": "文件格式不正确，仅支持上传 .zip 格式压缩包"})
						return
					}

					file, err := fileHeader.Open()
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "无法读取上传的文件: " + err.Error()})
						return
					}
					defer file.Close()

					data, err := io.ReadAll(io.LimitReader(file, 8<<20+1))
					if len(data) > 8<<20 {
						c.JSON(413, gin.H{"error": "upload exceeds 8MB"})
						return
					}
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "读取文件数据失败: " + err.Error()})
						return
					}

					zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "ZIP 压缩包损坏或格式不合法: " + err.Error()})
						return
					}

					if len(zr.File) > 200 {
						c.JSON(400, gin.H{"error": "too many files"})
						return
					}
					var expanded uint64
					for _, file := range zr.File {
						expanded += file.UncompressedSize64
						if expanded > 8<<20 {
							c.JSON(413, gin.H{"error": "archive expanded size exceeds limit"})
							return
						}
					}
					// Preliminary screening: MUST contain SKILL.md
					var skillMDContent string
					var fileNames []string
					foundSkillMD := false

					for _, f := range zr.File {
						fileNames = append(fileNames, f.Name)
						base := filepath.Base(f.Name)
						if strings.EqualFold(base, "SKILL.md") && !f.FileInfo().IsDir() {
							foundSkillMD = true
							rc, err := f.Open()
							if err == nil {
								contentBytes, readErr := io.ReadAll(io.LimitReader(rc, 1<<20+1))
								if readErr != nil || len(contentBytes) > 1<<20 {
									rc.Close()
									c.JSON(413, gin.H{"error": "invalid skill size"})
									return
								}
								rc.Close()
								skillMDContent = string(contentBytes)
							}
						}
					}

					if !foundSkillMD || strings.TrimSpace(skillMDContent) == "" {
						c.JSON(http.StatusBadRequest, gin.H{
							"error":       "压缩包初步筛查未通过：压缩包内必须包含合法的 SKILL.md 技能定义文件（可在根目录或子目录）",
							"files_found": fileNames,
						})
						return
					}

					skillName, skillDesc, skillID := parseSkillMD(skillMDContent, fileHeader.Filename)
					filesJSON, _ := json.Marshal(fileNames)

					skillModel := &repository.CustomSkillModel{
						ProjectID:   projectUUID,
						SkillID:     skillID,
						Name:        skillName,
						Description: skillDesc,
						Content:     skillMDContent,
						FileNames:   string(filesJSON),
						IsActive:    false,
					}

					if err := harnessRepo.CreateCustomSkill(c.Request.Context(), skillModel); err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": "保存技能数据失败: " + err.Error()})
						return
					}

					c.JSON(http.StatusCreated, gin.H{
						"message": "技能已导入，审核后手动启用",
						"skill":   skillModel,
					})
				})

				harnessGroup.DELETE("/skills/:id", func(c *gin.Context) {
					id, err := uuid.Parse(c.Param("id"))
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid uuid"})
						return
					}
					if err := harnessRepo.DeleteCustomSkill(c.Request.Context(), id); err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"status": "deleted"})
				})

				harnessGroup.PUT("/skills/:id/toggle", func(c *gin.Context) {
					id, err := uuid.Parse(c.Param("id"))
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"error": "invalid uuid"})
						return
					}
					skill, err := harnessRepo.ToggleCustomSkill(c.Request.Context(), id)
					if err != nil {
						respondError(c, err)
						return
					}
					c.JSON(http.StatusOK, gin.H{"status": "updated", "is_active": skill.IsActive})
				})
			}

			// 9. System AI Configuration
			systemGroup := protected.Group("/system")
			{
				systemGroup.GET("/ai-config", func(c *gin.Context) {
					cfg, err := copilotRepo.GetActiveAIConfig(c.Request.Context())
					if err != nil {
						respondError(c, err)
						return
					}
					maskedKey := ""
					if len(cfg.APIKey) > 8 {
						maskedKey = cfg.APIKey[:4] + "********" + cfg.APIKey[len(cfg.APIKey)-4:]
					} else if cfg.APIKey != "" {
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
	}
	// If web/dist exists, serve frontend SPA with HTML5 history routing fallback
	if _, err := os.Stat("web/dist/index.html"); err == nil {
		r.Static("/assets", "web/dist/assets")
		r.NoRoute(func(c *gin.Context) {
			if !strings.HasPrefix(c.Request.URL.Path, "/api") && !strings.HasPrefix(c.Request.URL.Path, "/ws") {
				c.File("web/dist/index.html")
				return
			}
			c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
		})
	}

	return r
}

func parseSkillMD(content string, defaultFilename string) (name string, desc string, skillID string) {
	lines := strings.Split(content, "\n")
	inFrontmatter := false
	var frontmatterLines []string
	var remainingLines []string

	for idx, line := range lines {
		trimmed := strings.TrimSpace(line)
		if idx == 0 && trimmed == "---" {
			inFrontmatter = true
			continue
		}
		if inFrontmatter {
			if trimmed == "---" {
				inFrontmatter = false
				remainingLines = lines[idx+1:]
				break
			}
			frontmatterLines = append(frontmatterLines, line)
		} else {
			remainingLines = append(remainingLines, line)
		}
	}

	for _, fl := range frontmatterLines {
		parts := strings.SplitN(fl, ":", 2)
		if len(parts) == 2 {
			k := strings.ToLower(strings.TrimSpace(parts[0]))
			v := strings.Trim(strings.TrimSpace(parts[1]), "\"'")
			if k == "name" && name == "" {
				name = v
			} else if k == "description" && desc == "" {
				desc = v
			}
		}
	}

	if name == "" {
		for _, line := range remainingLines {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "# ") {
				name = strings.TrimSpace(strings.TrimPrefix(trimmed, "# "))
				break
			}
		}
	}

	if desc == "" {
		for _, line := range remainingLines {
			trimmed := strings.TrimSpace(line)
			if trimmed != "" && !strings.HasPrefix(trimmed, "#") && !strings.HasPrefix(trimmed, "---") {
				desc = trimmed
				if len(desc) > 200 {
					desc = desc[:200] + "..."
				}
				break
			}
		}
	}

	base := filepath.Base(defaultFilename)
	baseWithoutExt := strings.TrimSuffix(base, filepath.Ext(base))
	if name == "" {
		name = baseWithoutExt
	}
	if desc == "" {
		desc = "从外部压缩包 " + base + " 导入的自定义技能"
	}

	cleanID := strings.ToLower(name)
	cleanID = strings.ReplaceAll(cleanID, " ", "-")
	cleanID = strings.ReplaceAll(cleanID, "_", "-")
	var idRunes []rune
	for _, r := range cleanID {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			idRunes = append(idRunes, r)
		}
	}
	skillID = string(idRunes)
	if skillID == "" {
		skillID = "skill-" + uuid.New().String()[:8]
	}

	return name, desc, skillID
}

func setRefreshCookie(c *gin.Context, token string, expiry int64) {
	c.SetSameSite(http.SameSiteStrictMode)
	secure := os.Getenv("APP_ENV") == "production"
	age := int(expiry - time.Now().Unix())
	if token == "" {
		age = -1
	}
	c.SetCookie("bgeo_refresh", token, age, "/api/v1/auth", "", secure, true)
}
