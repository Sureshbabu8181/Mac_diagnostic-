package agent

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"
)

type Config struct {
	ServerAPI   string
	ServerWS    string
	EnrollToken string
	DeviceUUID  string
	Heartbeat   int
	StateDir    string
}

type Agent struct {
	cfg       Config
	client    *Client
	token     string
	deviceID  string
	deviceUUID string
	queue     *Queue
}

func New(cfg Config) *Agent {
	return &Agent{cfg: cfg}
}

func DefaultStateDir() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = os.TempDir()
	}
	return filepath.Join(dir, "sunrise-mdm")
}

func (a *Agent) Run(ctx context.Context) error {
	if a.cfg.Heartbeat <= 0 {
		a.cfg.Heartbeat = 60
	}

	if err := os.MkdirAll(a.cfg.StateDir, 0700); err != nil {
		return err
	}

	// Load or generate device identity
	state, err := loadState(a.cfg.StateDir)
	if err != nil {
		return err
	}
	state.DeviceUUID = a.cfg.DeviceUUID
	if state.DeviceUUID == "" {
		if state.DeviceUUID == "" {
			gen, err := randomID()
			if err != nil {
				return err
			}
			state.DeviceUUID = gen
		}
	}
	a.deviceUUID = state.DeviceUUID
	a.token = state.Token

	// Enroll with one-time token if provided
	if a.cfg.EnrollToken != "" {
		log.Printf("enrolling device %s", a.deviceUUID)
		resp, err := Enroll(a.cfg.ServerAPI, a.cfg.EnrollToken, a.deviceUUID, collectOSInfo())
		if err != nil {
			if a.token == "" {
				return fmt.Errorf("enroll failed: %w", err)
			}
			log.Printf("enroll failed (using stored token): %v", err)
		} else {
			a.token = resp.Token
			a.deviceID = resp.DeviceID
			state.Token = resp.Token
			state.DeviceID = resp.DeviceID
			if err := saveState(a.cfg.StateDir, state); err != nil {
				return err
			}
		}
	}
	if a.token == "" {
		return fmt.Errorf("no authentication token (enroll first)")
	}

	a.client = NewClient(a.cfg.ServerAPI, a.token)
	a.queue = NewQueue(filepath.Join(a.cfg.StateDir, "queue.jsonl"))

	log.Printf("agent started (device_uuid=%s server=%s)", a.deviceUUID, a.cfg.ServerAPI)

	// Initial inventory + heartbeat
	a.scanAndPost(ctx)
	a.beat(ctx)

	heartTicker := time.NewTicker(time.Duration(a.cfg.Heartbeat) * time.Second)
	defer heartTicker.Stop()
	scanTicker := time.NewTicker(24 * time.Hour)
	defer scanTicker.Stop()
	wsTicker := time.NewTicker(10 * time.Second)
	defer wsTicker.Stop()

	go a.wsLoop(ctx)

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-heartTicker.C:
			if err := a.beat(ctx); err == nil {
				a.syncQueue()
			}
		case <-scanTicker.C:
			a.scanAndPost(ctx)
		case <-wsTicker.C:
			a.pollJobs(ctx)
		}
	}
}

func (a *Agent) beat(ctx context.Context) error {
	ip, _ := primaryIP()
	err := a.client.Heartbeat(a.version(), ip)
	if err != nil {
		log.Printf("heartbeat failed: %v", err)
	}
	return err
}

func (a *Agent) scanAndPost(ctx context.Context) {
	hw := collectHardware()
	sw := collectSoftware()
	net := collectNetwork()
	if err := a.client.PostInventory(hw, sw, net); err != nil {
		log.Printf("inventory post failed: %v", err)
	}
}

func (a *Agent) pollJobs(ctx context.Context) {
	jobs, err := a.client.PollJobs()
	if err != nil {
		return
	}
	for _, j := range jobs {
		a.runJob(ctx, j)
	}
}

func randomID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}