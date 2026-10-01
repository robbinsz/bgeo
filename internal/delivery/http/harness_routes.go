package http

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/internal/usecase"
	"github.com/robbinsz/bgeo/pkg/outbound"
	"io"
	"net/http"
	"path/filepath"
	"strings"
)

func registerHarnessRoutes(protected *gin.RouterGroup, h *routeServices) {
	harnessRepo := h.harnessRepo
	copilotUC := h.copilotUC
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
			c.JSON(http.StatusOK, gin.H{"id": cfg.ID, "enabled_skills": cfg.EnabledSkills, "max_history_turns": cfg.MaxHistoryTurns})
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
			if req.AutoSummarize != nil || req.DefaultModelID != "" || req.EmbeddingModelID != "" {
				c.JSON(400, gin.H{"error": "automatic summarization and model overrides are not supported; configure the model in system settings"})
				return
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
			c.JSON(http.StatusOK, gin.H{"id": cfg.ID, "enabled_skills": cfg.EnabledSkills, "max_history_turns": cfg.MaxHistoryTurns})
		})

		harnessGroup.GET("/mcp-servers", func(c *gin.Context) {
			projID, _ := c.Get("project_id")
			servers, err := harnessRepo.ListMCPServers(c.Request.Context(), projID.(uuid.UUID))
			if err != nil {
				respondError(c, err)
				return
			}
			respondItems(c, servers)
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
			respondItems(c, entries)
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
				MemoryType  string  `json:"memory_type" binding:"omitempty,oneof=brand_truth user_pref episodic_strategy"`
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
			if req.MemoryType != "" {
				updates["memory_type"] = req.MemoryType
			}
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
			respondItems(c, skills)
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

		harnessGroup.POST("/skills", func(c *gin.Context) {
			projID, _ := c.Get("project_id")
			var projectUUID uuid.UUID
			if projID != nil {
				projectUUID = projID.(uuid.UUID)
			}
			var req struct {
				SkillID     string `json:"skill_id" binding:"required"`
				Name        string `json:"name" binding:"required"`
				Description string `json:"description"`
				Content     string `json:"content" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			filesJSON, _ := json.Marshal([]string{"SKILL.md"})
			skillModel := &repository.CustomSkillModel{
				ProjectID:   projectUUID,
				SkillID:     req.SkillID,
				Name:        req.Name,
				Description: req.Description,
				Content:     req.Content,
				FileNames:   string(filesJSON),
				IsActive:    false,
			}
			if err := harnessRepo.CreateCustomSkill(c.Request.Context(), skillModel); err != nil {
				respondError(c, err)
				return
			}
			c.JSON(http.StatusCreated, gin.H{
				"message": "自定义技能已创建，待审核启用",
				"skill":   skillModel,
			})
		})

		harnessGroup.PUT("/skills/:id", func(c *gin.Context) {
			id, err := uuid.Parse(c.Param("id"))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid uuid"})
				return
			}
			var req struct {
				Name        string `json:"name"`
				Description string `json:"description"`
				Content     string `json:"content"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			updates := map[string]interface{}{}
			if req.Name != "" {
				updates["name"] = req.Name
			}
			if req.Description != "" {
				updates["description"] = req.Description
			}
			if req.Content != "" {
				updates["content"] = req.Content
			}
			if len(updates) > 0 {
				if err := harnessRepo.UpdateCustomSkill(c.Request.Context(), id, updates); err != nil {
					respondError(c, err)
					return
				}
			}
			skill, err := harnessRepo.GetCustomSkill(c.Request.Context(), id)
			if err != nil {
				respondError(c, err)
				return
			}
			c.JSON(http.StatusOK, gin.H{"message": "技能已更新", "skill": skill})
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
