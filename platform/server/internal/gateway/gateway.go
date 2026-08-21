package gateway

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/nats-io/nats.go"

	"github.com/sunrise-mdm/platform/server/internal/app"
	"github.com/sunrise-mdm/platform/server/internal/auth"
)

type Frame struct {
	Type string          `json:"type"`
	Job  *JobPushPayload `json:"job,omitempty"`
}

type JobPushPayload struct {
	JobID       string         `json:"job_id"`
	JobTargetID string         `json:"job_target_id"`
	Command     string         `json:"command"`
	Args        map[string]any `json:"args"`
	Timeout     int            `json:"timeout"`
}

type client struct {
	deviceID string
	tenantID string
	conn     *websocket.Conn
}

type Server struct {
	app    *app.App
	mu     sync.RWMutex
	conns  map[string]*client
	upgrader websocket.Upgrader
}

func New(a *app.App) *Server {
	return &Server{
		app:   a,
		conns: make(map[string]*client),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(*http.Request) bool { return true },
		},
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		header := r.Header.Get("Authorization")
		if strings.HasPrefix(header, "Bearer ") {
			token = strings.TrimPrefix(header, "Bearer ")
		}
	}
	if token == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	claims, err := auth.Parse(s.app.Cfg.JWTSecret, token)
	if err != nil || claims.Purpose != "device" || claims.DeviceID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &client{deviceID: claims.DeviceID, tenantID: claims.TenantID, conn: conn}

	s.mu.Lock()
	s.conns[claims.DeviceID] = c
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		if s.conns[claims.DeviceID] == c {
			delete(s.conns, claims.DeviceID)
		}
		s.mu.Unlock()
		conn.Close()
	}()

	// ack connection
	_ = conn.WriteJSON(Frame{Type: "hello"})

	// read loop (keeps connection alive; discard frames for MVP, agent uses HTTP for data)
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

// Start subscribes to the dispatch stream and pushes jobs to connected agents.
func (s *Server) Start() error {
	_, err := s.app.JS.Subscribe(app.SubjectDispatch, func(msg *nats.Msg) {
		var m struct {
			TenantID string `json:"tenant_id"`
			JobID    string `json:"job_id"`
			Command  string `json:"command"`
			Args     map[string]any `json:"args"`
			Timeout  int    `json:"timeout"`
			Targets  []struct {
				JobTargetID string `json:"job_target_id"`
				DeviceID    string `json:"device_id"`
				DeviceUUID  string `json:"device_uuid"`
			} `json:"targets"`
		}
		if err := json.Unmarshal(msg.Data, &m); err != nil {
			log.Printf("bad dispatch: %v", err)
			return
		}
		for _, t := range m.Targets {
			payload := JobPushPayload{JobID: m.JobID, JobTargetID: t.JobTargetID, Command: m.Command, Args: m.Args, Timeout: m.Timeout}
			s.push(t.DeviceID, Frame{Type: "job_push", Job: &payload})
		}
	}, nats.Durable("gateway-dispatch"), nats.ManualAck())
	if err != nil {
		return err
	}
	return nil
}

func (s *Server) push(deviceID string, f Frame) {
	s.mu.RLock()
	c, ok := s.conns[deviceID]
	s.mu.RUnlock()
	if !ok {
		return
	}
	if err := c.conn.WriteJSON(f); err != nil {
		s.mu.Lock()
		delete(s.conns, deviceID)
		s.mu.Unlock()
	}
}
