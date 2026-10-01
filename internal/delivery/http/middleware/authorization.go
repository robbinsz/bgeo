package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"gorm.io/gorm"
	"net/http"
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
		if c.GetInt("auth_version") != user.AuthVersion {
			c.AbortWithStatusJSON(401, gin.H{"error": "session revoked", "code": "SESSION_REVOKED"})
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
		policy, known := projectPolicies[c.Request.Method+" "+c.FullPath()]
		if !known {
			c.AbortWithStatusJSON(403, gin.H{"error": "route policy is not configured"})
			return
		}
		allowed := policy.permission == "read" || policy.permission == "write" && domain.CanWrite(a.Role) || policy.permission == "review" && domain.CanReview(a.Role) || policy.permission == "admin" && (a.Role == "admin" || a.Role == "owner")
		if !allowed {
			c.AbortWithStatusJSON(403, gin.H{"error": "insufficient project permission"})
			return
		}
		if project.IsPaused && policy.execution {
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
			if policy.resource != nil {
				model = policy.resource()
			}
			if model != nil {
				q := db.WithContext(c.Request.Context()).Model(model).Where("id = ? AND project_id = ?", resourceID, a.ProjectID)
				if policy.ownedSession {
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
