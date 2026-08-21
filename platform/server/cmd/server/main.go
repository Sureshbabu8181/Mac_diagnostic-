package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sunrise-mdm/platform/server/internal/api"
	"github.com/sunrise-mdm/platform/server/internal/app"
	"github.com/sunrise-mdm/platform/server/internal/config"
	"github.com/sunrise-mdm/platform/server/internal/gateway"
	"github.com/sunrise-mdm/platform/server/internal/worker"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg := config.Load()
	a, err := app.New(ctx, cfg)
	if err != nil {
		log.Fatalf("init: %v", err)
	}
	defer a.Close()

	switch cmd := os.Args[1:][0]; cmd {
	case "api":
		srv := &http.Server{
			Addr:              ":" + cfg.APIPort,
			Handler:           api.NewRouter(a),
			ReadHeaderTimeout: 10 * time.Second,
		}
		go func() {
			log.Printf("api listening on :%s", cfg.APIPort)
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatalf("api: %v", err)
			}
		}()
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)

	case "gateway":
		gw := gateway.New(a)
		if err := gw.Start(); err != nil {
			log.Fatalf("gateway nats: %v", err)
		}
		srv := &http.Server{
			Addr:              ":" + cfg.GatewayPort,
			Handler:           gw,
			ReadHeaderTimeout: 10 * time.Second,
		}
		go func() {
			log.Printf("gateway listening on :%s", cfg.GatewayPort)
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatalf("gateway: %v", err)
			}
		}()
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)

	case "worker":
		if err := worker.Start(ctx, a); err != nil {
			log.Fatalf("worker: %v", err)
		}

	case "seed-admin":
		if len(os.Args) < 4 {
			log.Fatal("usage: server seed-admin <email> <password>")
		}
		if err := seedAdmin(ctx, a, os.Args[2], os.Args[3]); err != nil {
			log.Fatalf("seed-admin: %v", err)
		}

	default:
		log.Fatalf("unknown command: %s (expected api|gateway|worker|seed-admin)", cmd)
	}
}
