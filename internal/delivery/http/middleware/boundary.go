package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

func RequestBoundary() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := uuid.NewString()
		c.Header("X-Request-ID", id)
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("Cache-Control", "no-store")
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 10<<20)
		start := time.Now()
		c.Next()
		slog.Info("http request", "request_id", id, "method", c.Request.Method, "route", c.FullPath(), "status", c.Writer.Status(), "duration_ms", time.Since(start).Milliseconds())
	}
}

type rateEntry struct {
	count int
	until time.Time
}

func LoginRateLimit() gin.HandlerFunc {
	var mu sync.Mutex
	entries := map[string]rateEntry{}
	return func(c *gin.Context) {
		mu.Lock()
		now := time.Now()
		for key, e := range entries {
			if now.After(e.until) {
				delete(entries, key)
			}
		}
		key := c.ClientIP()
		e := entries[key]
		if e.until.IsZero() {
			e.until = now.Add(time.Minute)
		}
		e.count++
		entries[key] = e
		blocked := e.count > 10 || len(entries) > 10000
		mu.Unlock()
		if blocked {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(429, gin.H{"error": "login rate limit exceeded"})
			return
		}
		c.Next()
	}
}
