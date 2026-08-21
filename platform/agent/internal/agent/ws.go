package agent

import (
	"context"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

type wsMessage struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

// wsBase returns the WebSocket gateway base URL. If ServerWS is explicitly set
// it takes precedence; otherwise derive it from the API URL by switching the
// scheme and using the gateway port (8090 by default in dev).
func (a *Agent) wsBase() string {
	if a.cfg.ServerWS != "" {
		return a.cfg.ServerWS
	}
	u, err := url.Parse(a.cfg.ServerAPI)
	if err != nil {
		return "ws://localhost:8090"
	}
	if u.Port() == "8080" {
		u.Host = u.Hostname() + ":8090"
	}
	if u.Scheme == "https" {
		u.Scheme = "wss"
	} else {
		u.Scheme = "ws"
	}
	return u.String()
}

func (a *Agent) wsLoop(ctx context.Context) {
	wsBase := a.wsBase()
	for {
		if ctx.Err() != nil {
			return
		}
		wsURL := wsBase + "/api/v1/agent/ws"
		wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
		u, err := url.Parse(wsURL)
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}
		q := u.Query()
		q.Set("token", a.token)
		u.RawQuery = q.Encode()

		log.Printf("dialing %s", u.Host+u.Path)
		conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
		if err != nil {
			log.Printf("websocket dial error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		log.Printf("websocket connected")
		_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))

		for {
			var msg wsMessage
			if err := conn.ReadJSON(&msg); err != nil {
				log.Printf("websocket read error: %v", err)
				_ = conn.Close()
				break
			}
			switch msg.Type {
			case "job_push":
				b, _ := jsonMarshal(msg.Payload)
				var job Job
				if err := jsonUnmarshal(b, &job); err == nil {
					go a.runJob(ctx, job)
				}
			case "pong", "ping":
				_ = conn.WriteJSON(map[string]string{"type": "pong"})
			}
			_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		}
		time.Sleep(3 * time.Second)
	}
}

func (a *Agent) runJob(ctx context.Context, job Job) {
	if job.Command == "collect_inventory" {
		a.scanAndPost(ctx)
		code := 0
		_ = a.client.SubmitResult(job.JobTargetID, "completed", &code, "inventory collected", "", 0)
		return
	}
	res, err := execute(job.Command, time.Duration(job.TimeoutSeconds)*time.Second)
	status := "completed"
	if err != nil {
		status = "failed"
	}
	if submitErr := a.client.SubmitResult(job.JobTargetID, status, &res.ExitCode, res.Stdout, res.Stderr, 0); submitErr != nil {
		_ = a.queue.Enqueue(queuedResult{
			JobTargetID: job.JobTargetID, Status: status, ExitCode: &res.ExitCode,
			Stdout: res.Stdout, Stderr: res.Stderr,
		})
	}
}