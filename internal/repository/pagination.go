package repository

import (
	"context"
	"gorm.io/gorm"
)

type Page struct {
	Limit   int  `json:"limit"`
	Offset  int  `json:"offset"`
	HasMore bool `json:"has_more"`
}
type pageKey struct{}

func WithPage(ctx context.Context, page Page) context.Context {
	return context.WithValue(ctx, pageKey{}, page)
}
func PageFrom(ctx context.Context) (Page, bool) {
	page, ok := ctx.Value(pageKey{}).(Page)
	return page, ok
}

// Pagination applies only to public collection requests, never to worker evidence queries.
func PageScope(ctx context.Context) func(*gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if page, ok := PageFrom(ctx); ok {
			return db.Limit(page.Limit + 1).Offset(page.Offset).Order("id")
		}
		return db
	}
}
