package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/robbinsz/bgeo/internal/repository"
	"strconv"
)

var collections = map[string]bool{
	"/api/v1/projects/facts": true, "/api/v1/projects/facts/all": true, "/api/v1/projects/competitors": true,
	"/api/v1/monitor/queries": true, "/api/v1/diagnosis/opportunities": true, "/api/v1/strategies": true,
	"/api/v1/content/assets": true, "/api/v1/evolution/rules": true,
	"/api/v1/harness/mcp-servers": true, "/api/v1/harness/memory": true, "/api/v1/harness/skills": true,
}

func Pagination() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == "GET" && collections[c.FullPath()] {
			limit, offset := 100, 0
			var err error
			if raw := c.Query("limit"); raw != "" {
				limit, err = strconv.Atoi(raw)
				if err != nil || limit < 1 || limit > 100 {
					c.AbortWithStatusJSON(400, gin.H{"error": "limit must be between 1 and 100"})
					return
				}
			}
			if raw := c.Query("offset"); raw != "" {
				offset, err = strconv.Atoi(raw)
				if err != nil || offset < 0 || offset > 1000000 {
					c.AbortWithStatusJSON(400, gin.H{"error": "invalid offset"})
					return
				}
			}
			c.Request = c.Request.WithContext(repository.WithPage(c.Request.Context(), repository.Page{Limit: limit, Offset: offset}))
		}
		c.Next()
	}
}
