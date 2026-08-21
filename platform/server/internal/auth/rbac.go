package auth

import (
	"net/http"

	"github.com/sunrise-mdm/platform/server/internal/httpx"
)

// RBAC loads role→permissions into memory. In production this is populated from
// the database at startup (permission_sets); a compact default map is included
// so the MVP runs without an external cache.
var rolePerms = map[string][]string{
	"Super Admin": nil,
	"IT Admin":    {"devices:read", "devices:write", "devices:commands", "assets:read", "assets:write", "users:read", "groups:read", "groups:write", "software:read", "software:deploy", "policies:read", "policies:write", "jobs:read", "jobs:create", "jobs:approve", "patches:read", "patches:approve", "compliance:read", "reports:read", "notifications:manage"},
	"Helpdesk":    {"devices:read", "devices:write", "devices:commands", "jobs:read", "jobs:create", "compliance:read", "software:read"},
	"Asset Manager":  {"assets:read", "assets:write", "devices:read"},
	"Security Admin": {"devices:read", "devices:commands", "policies:read", "policies:write", "patches:read", "patches:approve", "compliance:read", "reports:read"},
	"Read Only":      {"devices:read", "assets:read", "users:read", "groups:read", "software:read", "policies:read", "jobs:read", "patches:read", "compliance:read", "reports:read"},
	"Auditor":        {"audit:read", "devices:read", "assets:read", "jobs:read", "patches:read", "compliance:read"},
}

func HasPermission(role, perm string) bool {
	if role == "Super Admin" {
		return true
	}
	for _, p := range rolePerms[role] {
		if p == perm {
			return true
		}
	}
	return false
}

// RequirePermission rejects requests whose role lacks the permission.
func RequirePermission(perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c := ClaimsFrom(r.Context())
			if c == nil {
				httpx.Error(w, http.StatusUnauthorized, "unauthorized", "no claims")
				return
			}
			if !HasPermission(c.Role, perm) {
				httpx.Error(w, http.StatusForbidden, "forbidden", "permission required: "+perm)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}