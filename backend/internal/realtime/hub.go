package realtime

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/shared/apierror"
	"github.com/gorilla/websocket"
)

type Event struct {
	Type    string `json:"type"`
	Payload any    `json:"payload,omitempty"`
}

type client struct {
	conn   *websocket.Conn
	userID uint64
	send   chan []byte
}

type Hub struct {
	mu             sync.RWMutex
	clients        map[*client]bool
	allowedOrigins []string
	upgrader       websocket.Upgrader
}

func NewHub(allowedOrigins ...string) *Hub {
	h := &Hub{
		clients:        make(map[*client]bool),
		allowedOrigins: allowedOrigins,
	}
	h.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     h.checkOrigin,
	}
	return h
}

func (h *Hub) checkOrigin(r *http.Request) bool {
	if len(h.allowedOrigins) == 0 {
		return true
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	for _, allowed := range h.allowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (h *Hub) HandleWS(ctx *gin.Context) {
	userIDVal, exists := ctx.Get("auth.userID")
	if !exists {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	userID, ok := userIDVal.(uint64)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	conn, err := h.upgrader.Upgrade(ctx.Writer, ctx.Request, nil)
	if err != nil {
		slog.Error("websocket upgrade failed", "error", err)
		return
	}

	c := &client{
		conn:   conn,
		userID: userID,
		send:   make(chan []byte, 64),
	}

	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()

	go h.writePump(c)
	go h.readPump(c)
}

func (h *Hub) Broadcast(userID uint64, event Event) {
	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for c := range h.clients {
		if c.userID != userID {
			continue
		}
		select {
		case c.send <- data:
		default:
		}
	}
}

func (h *Hub) BroadcastAll(event Event) {
	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for c := range h.clients {
		select {
		case c.send <- data:
		default:
		}
	}
}

func (h *Hub) removeClient(c *client) {
	h.mu.Lock()
	if h.clients[c] {
		delete(h.clients, c)
		close(c.send)
	}
	h.mu.Unlock()
	c.conn.Close()
}

func (h *Hub) writePump(c *client) {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		h.removeClient(c)
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, nil)
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) readPump(c *client) {
	defer h.removeClient(c)
	c.conn.SetReadLimit(512)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			break
		}
	}
}
