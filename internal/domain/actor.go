package domain

import (
	"context"
	"errors"
	"github.com/google/uuid"
)

var (
	ErrForbidden = errors.New("operation forbidden")
	ErrConflict  = errors.New("resource changed or action already consumed")
	ErrPaused    = errors.New("project is paused")
	ErrInvalid   = errors.New("invalid operation")
)

type Actor struct {
	UserID, OrganizationID, ProjectID uuid.UUID
	Role                              string
}
type actorKey struct{}

func WithActor(ctx context.Context, actor Actor) context.Context {
	return context.WithValue(ctx, actorKey{}, actor)
}
func ActorFrom(ctx context.Context) Actor { a, _ := ctx.Value(actorKey{}).(Actor); return a }
func WithProject(ctx context.Context, id uuid.UUID) context.Context {
	a := ActorFrom(ctx)
	a.ProjectID = id
	return WithActor(ctx, a)
}
func CanReview(role string) bool { return role == "admin" || role == "owner" || role == "reviewer" }
func CanWrite(role string) bool  { return CanReview(role) || role == "editor" }
