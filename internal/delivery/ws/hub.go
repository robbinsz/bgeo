package ws

import (
	"encoding/json"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/domain"
	"net/http"
	"sync"
	"time"
)

type EventMessage struct {
	Event     string      `json:"event"`
	Topic     string      `json:"topic"`
	Timestamp int64       `json:"timestamp"`
	Payload   interface{} `json:"payload"`
}
type client struct {
	conn      *websocket.Conn
	projectID uuid.UUID
	queue     chan []byte
}
type Hub struct {
	mu      sync.Mutex
	clients map[*client]bool
}

var GlobalHub *Hub

func InitGlobalHub() *Hub { h := &Hub{clients: map[*client]bool{}}; GlobalHub = h; return h }
func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request) {
	actor := domain.ActorFrom(r.Context())
	if actor.ProjectID == uuid.Nil || actor.UserID == uuid.Nil {
		http.Error(w, "unauthorized", 401)
		return
	}
	upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		if origin == scheme+"://"+r.Host {
			return true
		}
		cfg, err := config.Load()
		if err != nil {
			return false
		}
		for _, allowed := range cfg.AllowedOrigins {
			if origin == allowed {
				return true
			}
		}
		return false
	}}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &client{conn: conn, projectID: actor.ProjectID, queue: make(chan []byte, 32)}
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
	go func() {
		defer h.remove(c)
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case msg, ok := <-c.queue:
				if !ok {
					return
				}
				conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
				if conn.WriteMessage(websocket.TextMessage, msg) != nil {
					return
				}
			case <-ticker.C:
				conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
				if conn.WriteMessage(websocket.PingMessage, nil) != nil {
					return
				}
			}
		}
	}()
	conn.SetReadLimit(4096)
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(60 * time.Second)) })
	go func() {
		defer h.remove(c)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()
}
func (h *Hub) remove(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[c] {
		delete(h.clients, c)
		close(c.queue)
		c.conn.Close()
	}
}
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		delete(h.clients, c)
		close(c.queue)
		c.conn.Close()
	}
}
func (h *Hub) BroadcastProject(projectID uuid.UUID, event, topic string, payload interface{}) {
	if projectID == uuid.Nil {
		return
	}
	data, err := json.Marshal(EventMessage{event, topic, time.Now().UnixMilli(), payload})
	if err != nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if c.projectID != projectID {
			continue
		}
		select {
		case c.queue <- data:
		default:
			delete(h.clients, c)
			close(c.queue)
			c.conn.Close()
		}
	}
}
