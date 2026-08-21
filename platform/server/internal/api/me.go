package api

import (
	"net/http"

	"github.com/sunrise-mdm/platform/server/internal/auth"
)

func (a *Handler) me(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"id":          c.UserID,
		"email":       c.Email,
		"role":        c.Role,
		"tenant_id":   c.TenantID,
		"departments": c.Departments,
	})
}
