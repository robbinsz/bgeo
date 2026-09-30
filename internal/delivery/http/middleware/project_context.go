package middleware

import (
	"context"
	"github.com/robbinsz/bgeo/internal/config"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type contextKey string

const ProjectIDContextKey contextKey = "project_id"

// ProjectContextMiddleware extracts X-Project-ID from headers and sets it into context.Context
func ProjectContextMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		projectIDStr := c.GetHeader("X-Project-ID")
		if c.Request.URL.Path == "/ws/live" {
			projectIDStr = c.Query("project_id")
		}
		var projectID uuid.UUID
		var err error

		if projectIDStr != "" {
			projectID, err = uuid.Parse(projectIDStr)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid X-Project-ID header"})
				return
			}
		} else {
			// Fallback demo project ID for MVP local development
			if config.Demo() {
				projectID = uuid.MustParse("00000000-0000-0000-0000-000000000001")
			} else {
				c.AbortWithStatusJSON(400, gin.H{"error": "X-Project-ID is required"})
				return
			}
		}

		ctx := context.WithValue(c.Request.Context(), ProjectIDContextKey, projectID)
		c.Request = c.Request.WithContext(ctx)
		c.Set("project_id", projectID)
		c.Next()
	}
}

// CORSMiddleware handles cross-origin requests from Vite frontend
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			cfg, err := config.Load()
			if err != nil {
				c.AbortWithStatus(500)
				return
			}
			allowed := false
			for _, v := range cfg.AllowedOrigins {
				if origin == v {
					allowed = true
				}
			}
			if allowed {
				c.Header("Access-Control-Allow-Origin", origin)
				c.Header("Vary", "Origin")
				c.Header("Access-Control-Allow-Credentials", "true")
				c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Project-ID, Idempotency-Key")
				c.Header("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")
			} else if c.Request.Method == "OPTIONS" {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
		}
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
