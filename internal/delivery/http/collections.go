package http

import (
	"github.com/gin-gonic/gin"
	"github.com/robbinsz/bgeo/internal/repository"
)

func respondItems[T any](c *gin.Context, items []T) {
	if items == nil {
		items = []T{}
	}
	if page, ok := repository.PageFrom(c.Request.Context()); ok {
		page.HasMore = len(items) > page.Limit
		if page.HasMore {
			items = items[:page.Limit]
		}
		c.JSON(200, gin.H{"items": items, "pagination": page})
		return
	}
	c.JSON(200, gin.H{"items": items})
}
