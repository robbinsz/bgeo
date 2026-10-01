package http

import (
	"context"
	"github.com/gin-gonic/gin"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/delivery/http/middleware"
	"github.com/robbinsz/bgeo/internal/delivery/ws"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/internal/usecase"
	"github.com/robbinsz/bgeo/pkg/jwtutil"
	"gorm.io/gorm"
	"net/http"
	"os"
	"strings"
	"time"
)

type routeServices struct {
	db           *gorm.DB
	userRepo     *repository.UserRepository
	jwtService   *jwtutil.JWTService
	copilotRepo  *repository.CopilotRepository
	copilotUC    *usecase.CopilotUsecase
	harnessRepo  *repository.HarnessRepository
	projectRepo  *repository.ProjectRepository
	monitorRepo  *repository.MonitorRepository
	oppRepo      *repository.OpportunityRepository
	strategyRepo *repository.StrategyRepository
	contentRepo  *repository.ContentRepository
	evoRepo      *repository.EvolutionRepository
	monitorUC    *usecase.MonitorUsecase
	contentUC    *usecase.ContentUsecase
	evolutionUC  *usecase.EvolutionUsecase
}

func SetupRouterWithDB(db *gorm.DB, hub *ws.Hub) *gin.Engine {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}
	r := gin.New()
	r.Use(gin.Recovery(), middleware.RequestBoundary())
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		panic(err)
	}

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
	runtime := usecase.NewRuntime(db, hub)
	monitorUC, contentUC, evolutionUC, copilotUC := runtime.Monitor, runtime.Content, runtime.Evolution, runtime.Copilot
	harnessRepo := repository.NewHarnessRepository(db)

	services := &routeServices{db: db, userRepo: userRepo, jwtService: jwtService, copilotRepo: copilotRepo, copilotUC: copilotUC, harnessRepo: harnessRepo, projectRepo: projectRepo, monitorRepo: monitorRepo, oppRepo: oppRepo, strategyRepo: strategyRepo, contentRepo: contentRepo, evoRepo: evoRepo, monitorUC: monitorUC, contentUC: contentUC, evolutionUC: evolutionUC}

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"system":  "GeoPilot GEO Autonomous Operations Platform",
			"version": "1.0.0",
		})
	})

	r.GET("/ready", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		conn, err := db.DB()
		if err == nil {
			err = conn.PingContext(ctx)
		}
		if err == nil {
			err = repository.VerifySchema(ctx, db)
		}
		if err != nil {
			c.JSON(503, gin.H{"status": "unavailable"})
			return
		}
		c.JSON(200, gin.H{"status": "ready"})
	})
	// WebSocket real-time subscription
	r.GET("/ws/live", middleware.JWTAuthMiddleware(jwtService), middleware.CurrentUser(db), middleware.ProjectContextMiddleware(), middleware.AuthorizeProject(db), func(c *gin.Context) {
		if hub == nil {
			c.JSON(503, gin.H{"error": "live progress is unavailable; use persisted run status"})
			return
		}
		actor := domain.ActorFrom(c.Request.Context())
		version, expires := c.GetInt("auth_version"), c.GetTime("access_expires_at")
		// Capture values, never retain the pooled Gin context after the handshake.
		hub.HandleWSGuarded(c.Writer, c.Request, func() bool {
			if !time.Now().Before(expires) {
				return false
			}
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			var user repository.UserModel
			if db.WithContext(ctx).Where("id = ? AND status = 'active' AND auth_version = ?", actor.UserID, version).First(&user).Error != nil {
				return false
			}
			var count int64
			q := db.WithContext(ctx).Model(&repository.ProjectModel{}).Where("id = ? AND organization_id = ?", actor.ProjectID, user.OrganizationID)
			if user.Role != "owner" && user.Role != "admin" {
				q = q.Where("id IN (?)", db.Model(&repository.ProjectMemberModel{}).Select("project_id").Where("user_id = ?", user.ID))
			}
			return q.Count(&count).Error == nil && count == 1
		})
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
			projects := []repository.ProjectModel{}
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
		registerAuthRoutes(apiV1, services)
		// Protected business APIs (require valid JWT access token)
		protected := apiV1.Group("")
		protected.Use(middleware.JWTAuthMiddleware(jwtService), middleware.CurrentUser(db), middleware.ProjectContextMiddleware(), middleware.AuthorizeProject(db), middleware.Pagination())
		registerOperations(protected, db, monitorUC, contentUC, copilotUC)
		protected.GET("/projects/access", func(c *gin.Context) {
			a := domain.ActorFrom(c.Request.Context())
			c.JSON(200, gin.H{"role": a.Role, "write": domain.CanWrite(a.Role), "review": domain.CanReview(a.Role), "admin": a.Role == "admin" || a.Role == "owner"})
		})

		{
			registerBusinessRoutes(protected, services)
			registerCopilotRoutes(protected, services)
			registerHarnessRoutes(protected, services)
			registerSystemRoutes(protected, services)
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
