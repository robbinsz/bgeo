package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"gorm.io/gorm"
	"net/http"
	"strings"
)

func CurrentUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := c.Get("user_id")
		if !ok {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		var user repository.UserModel
		if err := db.WithContext(c.Request.Context()).Where("id = ? AND status = 'active'", id).First(&user).Error; err != nil {
			c.AbortWithStatusJSON(401, gin.H{"error": "account is unavailable"})
			return
		}
		c.Set("user_role", user.Role)
		c.Set("org_id", user.OrganizationID)
		c.Request = c.Request.WithContext(domain.WithActor(c.Request.Context(), domain.Actor{UserID: user.ID, OrganizationID: user.OrganizationID, Role: user.Role}))
		c.Next()
	}
}

func AuthorizeProject(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		a := domain.ActorFrom(c.Request.Context())
		id, _ := c.Get("project_id")
		var project repository.ProjectModel
		if err := db.WithContext(c.Request.Context()).Where("id = ? AND organization_id = ?", id, a.OrganizationID).First(&project).Error; err != nil {
			c.AbortWithStatusJSON(403, gin.H{"error": "project access denied"})
			return
		}
		a.ProjectID = project.ID
		if a.Role != "admin" && a.Role != "owner" {
			var member repository.ProjectMemberModel
			if err := db.WithContext(c.Request.Context()).Where("project_id = ? AND user_id = ?", project.ID, a.UserID).First(&member).Error; err != nil {
				c.AbortWithStatusJSON(403, gin.H{"error": "project membership required"})
				return
			}
			a.Role = member.Role
		}
		path := c.FullPath()
		write := c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead
		if write && !domain.CanWrite(a.Role) {
			c.AbortWithStatusJSON(403, gin.H{"error": "write permission required"})
			return
		}
		if (strings.Contains(path, "/projects/current") || strings.Contains(path, "/system/") || strings.HasPrefix(path, "/api/v1/harness/") || strings.Contains(path, "/channels") || strings.Contains(path, "/members")) && write && a.Role != "admin" && a.Role != "owner" {
			c.AbortWithStatusJSON(403, gin.H{"error": "project administrator required"})
			return
		}
		if write && (strings.HasSuffix(path, "/approve") || strings.HasSuffix(path, "/rollback") || strings.HasSuffix(path, "/publish")) && !domain.CanReview(a.Role) {
			c.AbortWithStatusJSON(403, gin.H{"error": "review permission required"})
			return
		}
		if project.IsPaused && write && (strings.Contains(path, "/runs") || strings.HasSuffix(path, "/publish")) {
			c.AbortWithStatusJSON(409, gin.H{"error": "project is paused"})
			return
		}
		c.Set("user_role", a.Role)
		c.Request = c.Request.WithContext(domain.WithActor(c.Request.Context(), a))
		if raw := c.Param("id"); raw != "" {
			resourceID, err := uuid.Parse(raw)
			if err != nil {
				c.AbortWithStatusJSON(400, gin.H{"error": "invalid resource ID"})
				return
			}
			var model interface{}
			ownerSession := false
			switch {
			case strings.Contains(path, "/copilot/sessions/"):
				model = &repository.CopilotSessionModel{}
				ownerSession = true
			case strings.Contains(path, "/copilot/traces/"):
				model = &repository.AgentExecutionTraceModel{}
			case strings.Contains(path, "/opportunities/"):
				model = &repository.OpportunityModel{}
			case strings.Contains(path, "/evolution/rules/"):
				model = &repository.RuleModel{}
			case strings.Contains(path, "/harness/mcp-servers/"):
				model = &repository.MCPServerModel{}
			case strings.Contains(path, "/harness/memory/"):
				model = &repository.MemoryEntryModel{}
			case strings.Contains(path, "/harness/skills/"):
				model = &repository.CustomSkillModel{}
			case strings.Contains(path, "/content/assets/"):
				model = &repository.ContentAssetModel{}
			case strings.Contains(path, "/experiments/"):
				model = &repository.ExperimentModel{}
			case strings.Contains(path, "/projects/facts/"):
				model = &repository.BrandFactModel{}
			case strings.Contains(path, "/jobs/"):
				model = &repository.JobModel{}
			case strings.Contains(path, "/channels/"):
				model = &repository.PublishChannelModel{}
			case strings.Contains(path, "/publications/"):
				model = &repository.PublicationModel{}
			}
			if model != nil {
				q := db.WithContext(c.Request.Context()).Model(model).Where("id = ? AND project_id = ?", resourceID, a.ProjectID)
				if ownerSession {
					q = q.Where("user_id = ? AND is_archived = false", a.UserID)
				}
				var count int64
				if err := q.Count(&count).Error; err != nil || count != 1 {
					c.AbortWithStatusJSON(404, gin.H{"error": "resource not found"})
					return
				}
			}
		}
		c.Next()
	}
}
