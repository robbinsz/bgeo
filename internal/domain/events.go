package domain

import "github.com/google/uuid"

// EventSink is optional progress delivery; persisted jobs and runs remain authoritative.
type EventSink interface {
	BroadcastProject(projectID uuid.UUID, event, topic string, payload interface{})
}
