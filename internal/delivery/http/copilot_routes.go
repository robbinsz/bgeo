package http

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http"
	"strconv"
	"strings"
)

func registerCopilotRoutes(protected *gin.RouterGroup, h *routeServices) {
	copilotRepo := h.copilotRepo
	copilotUC := h.copilotUC
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
			respondItems(c, sessions)
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
			traces, _ := copilotRepo.ListExecutionTraces(c.Request.Context(), session.ProjectID, &sessionID, 50)
			c.JSON(http.StatusOK, gin.H{
				"session":    session,
				"messages":   messages,
				"checkpoint": checkpoint,
				"traces":     traces,
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

		copilotGroup.PATCH("/sessions/:id", func(c *gin.Context) {
			sessionID, err := uuid.Parse(c.Param("id"))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session uuid"})
				return
			}
			var req struct {
				Title string `json:"title" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Title) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
				return
			}
			title := strings.TrimSpace(req.Title)
			if err := copilotRepo.RenameSession(c.Request.Context(), sessionID, title); err != nil {
				respondError(c, err)
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "ok", "title": title})
		})

		copilotGroup.GET("/audit-logs", func(c *gin.Context) {
			projID, _ := c.Get("project_id")
			limit := 50
			if lStr := c.Query("limit"); lStr != "" {
				if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
					limit = l
				}
			}
			logs, err := copilotRepo.ListAuditLogs(c.Request.Context(), projID.(uuid.UUID), limit)
			if err != nil {
				respondError(c, err)
				return
			}
			respondItems(c, logs)
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
			respondItems(c, traces)
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

}
