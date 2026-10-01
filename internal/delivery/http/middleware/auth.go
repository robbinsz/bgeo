package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/robbinsz/bgeo/pkg/jwtutil"
)

type userContextKey string

const (
	UserIDKey    userContextKey = "user_id"
	UserEmailKey userContextKey = "user_email"
	UserRoleKey  userContextKey = "user_role"
)

// JWTAuthMiddleware verifies Bearer access token
func JWTAuthMiddleware(jwtService *jwtutil.JWTService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			// Also check query param ?token= (useful for WebSocket connection handshakes)
			tokenQuery := c.Query("token")
			if tokenQuery != "" && c.Request.URL.Path == "/ws/live" {
				authHeader = "Bearer " + tokenQuery
			}
		}

		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "missing or invalid authorization header",
				"code":  "UNAUTHORIZED",
			})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := jwtService.ValidateAccessToken(tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid or expired access token",
				"code":  "TOKEN_EXPIRED",
			})
			return
		}

		// Inject into gin context and request context
		c.Set("user_id", claims.UserID)
		c.Set("user_email", claims.Email)
		c.Set("user_role", claims.Role)
		c.Set("org_id", claims.OrgID)
		c.Set("auth_version", claims.AuthVersion)
		c.Set("access_expires_at", claims.ExpiresAt.Time)

		ctx := context.WithValue(c.Request.Context(), UserIDKey, claims.UserID)
		ctx = context.WithValue(ctx, UserEmailKey, claims.Email)
		ctx = context.WithValue(ctx, UserRoleKey, claims.Role)
		c.Request = c.Request.WithContext(ctx)

		c.Next()
	}
}
