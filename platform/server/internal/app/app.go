package app

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"

	"github.com/sunrise-mdm/platform/server/internal/config"
	"github.com/sunrise-mdm/platform/server/internal/db"
)

const (
	SubjectDispatch = "jobs.dispatch"
	SubjectResult   = "jobs.result"
)

type App struct {
	Cfg config.Config
	DB  *pgxpool.Pool
	NC  *nats.Conn
	JS  nats.JetStreamContext
}

func New(ctx context.Context, cfg config.Config) (*App, error) {
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	if err := db.Migrate(ctx, pool); err != nil {
		return nil, err
	}

	nc, err := nats.Connect(cfg.NATSURL, nats.MaxReconnects(-1), nats.ReconnectWait(time.Second))
	if err != nil {
		return nil, err
	}
	js, err := nc.JetStream()
	if err != nil {
		return nil, err
	}
	_, err = js.AddStream(&nats.StreamConfig{
		Name:     "JOBS",
		Subjects: []string{"jobs.>"},
		Storage:  nats.FileStorage,
		MaxAge:   24 * time.Hour,
	})
	if err != nil && err != nats.ErrStreamNameAlreadyInUse {
		return nil, err
	}

	return &App{Cfg: cfg, DB: pool, NC: nc, JS: js}, nil
}

func (a *App) Close() {
	a.NC.Close()
	a.DB.Close()
}
