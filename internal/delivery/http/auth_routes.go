package http

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/delivery/http/middleware"
	"golang.org/x/crypto/bcrypt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func registerAuthRoutes(apiV1 *gin.RouterGroup, h *routeServices) {
	db := h.db
	userRepo := h.userRepo
	jwtService := h.jwtService
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

			access, refresh, accessExp, refreshExp, err := jwtService.GenerateTokenPairWithVersion(user.ID, user.OrganizationID, user.Email, user.Role, user.AuthVersion)
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
			if err != nil || claims.AuthVersion != user.AuthVersion {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "关联用户不存在"})
				return
			}

			newAccess, newRefresh, accessExp, refreshExp, err := jwtService.GenerateTokenPairWithVersion(user.ID, user.OrganizationID, user.Email, user.Role, user.AuthVersion)
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
				if len(req.NewPassword) < 12 || len(req.NewPassword) > 72 {
					c.JSON(http.StatusBadRequest, gin.H{"error": "新密码长度需要 12 至 72 字节"})
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

			updatedUser, err := userRepo.UpdateProfile(c.Request.Context(), userID, updates, user.PasswordHash)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "更新资料失败"})
				return
			}
			if req.NewPassword != "" {
				setRefreshCookie(c, "", time.Now().Add(-time.Hour).Unix())
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
