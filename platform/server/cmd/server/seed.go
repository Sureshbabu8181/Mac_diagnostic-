package main

import (
	"context"

	"golang.org/x/crypto/bcrypt"

	"github.com/sunrise-mdm/platform/server/internal/app"
)

// seedAdmin sets a bcrypt password for a user (dev convenience; prod uses Keycloak).
func seedAdmin(ctx context.Context, a *app.App, email, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	tag, err := a.DB.Exec(ctx, `UPDATE users SET password_hash = $1 WHERE email = $2`, string(hash), email)
	if err != nil {
		return err
	}
	n := tag.RowsAffected()
	if n == 0 {
		_, err = a.DB.Exec(ctx, `
			INSERT INTO users (tenant_id, email, display_name, status, password_hash)
			SELECT id, $1, $2, 'active', $3 FROM organizations WHERE slug = 'sunrise'
			ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash`, email, email, string(hash))
		return err
	}
	return nil
}
