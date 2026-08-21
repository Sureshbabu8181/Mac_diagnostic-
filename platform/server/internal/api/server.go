package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sunrise-mdm/platform/server/internal/app"
	"github.com/sunrise-mdm/platform/server/internal/auth"
	"github.com/sunrise-mdm/platform/server/internal/db"
	"github.com/sunrise-mdm/platform/server/internal/httpx"
)

// Handler exposes the shared application dependencies to API handlers.
type Handler struct {
	*app.App
}

// perm wraps a handler with an RBAC permission check, returning an http.HandlerFunc.
func perm(h *Handler, permCode string, fn http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c := auth.ClaimsFrom(r.Context())
		if c == nil {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "no claims")
			return
		}
		if !auth.HasPermission(c.Role, permCode) {
			httpx.Error(w, http.StatusForbidden, "forbidden", "permission required: "+permCode)
			return
		}
		fn(w, r)
	}
}

// NewRouter builds the /api/v1 REST surface for the admin console and agents.
func NewRouter(a *app.App) http.Handler {
	h := &Handler{App: a}
	r := chi.NewRouter()

	r.Use(requestLogger)
	r.Use(recoverer)
	r.Use(rateLimit)

	authMW := auth.Middleware(h.Cfg.JWTSecret)

	r.Route("/api/v1", func(v1 chi.Router) {
		v1.Get("/health", health(h))
		v1.Post("/auth/login", h.devLogin)

		// Agent endpoints (device token auth)
		v1.Post("/agent/enroll", h.agentEnroll)
		v1.Group(func(ag chi.Router) {
			ag.Use(authMW)
			ag.Post("/agent/heartbeat", h.agentHeartbeat)
			ag.Post("/agent/inventory", h.agentInventory)
			ag.Post("/agent/jobs/{jobTargetID}/result", h.agentJobResult)
			ag.Get("/agent/jobs", h.agentJobPoll)
		})

		// Admin endpoints
		v1.Group(func(adm chi.Router) {
			adm.Use(authMW)
			adm.Get("/auth/me", h.me)
			adm.Post("/enrollment-tokens", perm(h, "devices:write", h.createEnrollmentToken))

			adm.Get("/dashboard/summary", perm(h, "devices:read", h.dashboardSummary))

			adm.Get("/devices", perm(h, "devices:read", h.listDevices))
			adm.Get("/devices/{id}", perm(h, "devices:read", h.getDevice))

			adm.Get("/assets", perm(h, "assets:read", h.listAssets))
			adm.Get("/assets/{id}", perm(h, "assets:read", h.getAsset))
			adm.Post("/assets", perm(h, "assets:write", h.createAsset))
			adm.Post("/assets/{id}/transitions", perm(h, "assets:write", h.assetTransition))

			adm.Get("/groups", perm(h, "groups:read", h.listGroups))
			adm.Post("/groups", perm(h, "groups:write", h.createGroup))

			adm.Get("/commands", perm(h, "jobs:read", h.listCommands))
			adm.Post("/jobs", perm(h, "jobs:create", h.createJob))
			adm.Get("/jobs", perm(h, "jobs:read", h.listJobs))
			adm.Get("/jobs/{id}", perm(h, "jobs:read", h.getJob))
			adm.Post("/jobs/{id}/approve", perm(h, "jobs:approve", h.approveJob))

			adm.Get("/audit-logs", perm(h, "audit:read", h.listAudit))

			adm.Get("/patches", perm(h, "patches:read", h.listPatches))
			adm.Post("/patches/{id}/approve", perm(h, "patches:approve", h.approvePatch))
			adm.Post("/patches/{id}/deploy", perm(h, "patches:approve", h.deployPatch))
			adm.Get("/patch-compliance", perm(h, "patches:read", h.patchCompliance))
		})
	})
	return r
}

func health(h *Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		if err := h.DB.Ping(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "degraded"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "time": time.Now().UTC().Format(time.RFC3339)})
	}
}

// Ensure tenant scoping helpers are referenced for the db package import.
var _ = db.WithTenant