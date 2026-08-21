package worker

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/nats-io/nats.go"

	"github.com/sunrise-mdm/platform/server/internal/app"
)

// Start runs the background workers: job result rollup + offline detection.
func Start(ctx context.Context, a *app.App) error {
	// Roll up job status from per-target results.
	_, err := a.JS.Subscribe(app.SubjectResult, func(msg *nats.Msg) {
		var m struct {
			JobID       string `json:"job_id"`
			JobTargetID string `json:"job_target_id"`
			Status      string `json:"status"`
		}
		if err := json.Unmarshal(msg.Data, &m); err != nil {
			return
		}
		rollupJob(ctx, a, m.JobID)
	}, nats.Durable("worker-rollup"), nats.ManualAck())
	if err != nil {
		return err
	}

	// Offline detection: 3 missed heartbeats (~3 min at 60s).
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				_, err := a.DB.Exec(ctx, `UPDATE devices SET online = false
					WHERE online AND last_seen < now() - interval '3 minutes'`)
				if err != nil {
					log.Printf("offline detection: %v", err)
				}
			}
		}
	}()

	log.Println("worker started")
	<-ctx.Done()
	return nil
}

func rollupJob(ctx context.Context, a *app.App, jobID string) {
	var pending int64
	var failed int64
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FILTER (WHERE status IN ('pending','queued','delivered','running')),
		count(*) FILTER (WHERE status = 'failed')
		FROM job_targets WHERE job_id = $1`, jobID).Scan(&pending, &failed); err != nil {
		log.Printf("rollup: %v", err)
		return
	}
	if pending > 0 {
		return
	}
	final := "completed"
	if failed > 0 {
		final = "failed"
	}
	if _, err := a.DB.Exec(ctx, `UPDATE jobs SET status = $1, updated_at = now() WHERE id = $2 AND status <> 'cancelled'`, final, jobID); err != nil {
		log.Printf("rollup: %v", err)
	}
}
