package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/sunrise-mdm/platform/agent/internal/agent"
)

func main() {
	var server string
	var serverWS string
	var enrollToken string
	var deviceUUID string
	var heartbeatSec int
	flag.StringVar(&server, "server", "http://localhost:8080", "management API base URL")
	flag.StringVar(&server, "s", "http://localhost:8080", "management API base URL (shorthand)")
	flag.StringVar(&serverWS, "ws", "", "websocket gateway base URL (defaults to server host with :8090)")
	flag.StringVar(&enrollToken, "token", "", "one-time enrollment token")
	flag.StringVar(&enrollToken, "t", "", "one-time enrollment token (shorthand)")
	flag.StringVar(&deviceUUID, "uuid", "", "device uuid (generated if empty)")
	flag.IntVar(&heartbeatSec, "heartbeat", 60, "heartbeat interval seconds")
	flag.Parse()

	stateDir := os.Getenv("SUNRISE_STATE_DIR")
	if stateDir == "" {
		stateDir = agent.DefaultStateDir()
	}

	ctx, stop := signal.NotifyContext(backgroundCtx(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	a := agent.New(agent.Config{
		ServerAPI:   server,
		ServerWS:    serverWS,
		EnrollToken: enrollToken,
		DeviceUUID:  deviceUUID,
		Heartbeat:   heartbeatSec,
		StateDir:    stateDir,
	})
	if err := a.Run(ctx); err != nil {
		log.Fatalf("agent: %v", err)
	}
}