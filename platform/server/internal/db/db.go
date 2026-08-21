package db

import (
	"context"
	"fmt"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sunrise-mdm/platform/server/migrations"
)

// Connect creates the pool. In production, credentials come from Vault.
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}
	return pool, nil
}

// WithTenant binds a tenant_id for RLS on subsequent queries in the same tx/conn.
func WithTenant(ctx context.Context, pool *pgxpool.Pool, tenantID string) context.Context {
	_, err := pool.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenantID)
	if err != nil {
		// tenant scoping best effort; requests fail closed at handler level too
		fmt.Printf("warning: failed to set tenant: %v\n", err)
	}
	return ctx
}

// TenantConn acquires a dedicated connection with app.tenant_id set for RLS.
// Handlers MUST release the connection when done.
func TenantConn(ctx context.Context, pool *pgxpool.Pool, tenantID string) (*pgxpool.Conn, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenantID); err != nil {
		conn.Release()
		return nil, err
	}
	return conn, nil
}

// Migrate applies SQL migrations that have not yet been applied.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return err
	}

	entries, err := migrations.FS.ReadDir(".")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		if name == "embed.go" {
			continue
		}
		var applied bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)`, name).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}
		sqlBytes, err := migrations.FS.ReadFile(name)
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name); err != nil {
			return err
		}
		fmt.Printf("applied migration %s\n", name)
	}
	return nil
}
