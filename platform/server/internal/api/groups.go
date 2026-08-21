package api

import (
	"net/http"
	"time"

	"github.com/sunrise-mdm/platform/server/internal/auth"
	"github.com/sunrise-mdm/platform/server/internal/db"
	"github.com/sunrise-mdm/platform/server/internal/httpx"
)

func (a *Handler) listGroups(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	rows, err := conn.Query(r.Context(), `SELECT id, name, description, kind, parent_id, is_system, created_at
		FROM device_groups ORDER BY name`)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id, name, kind string
		var desc, parent *string
		var isSystem bool
		var created time.Time
		if err := rows.Scan(&id, &name, &desc, &kind, &parent, &isSystem, &created); err != nil {
			serverError(w, err)
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "description": desc, "kind": kind, "parent_id": parent, "is_system": isSystem, "created_at": created.Format(time.RFC3339)})
	}
	writeJSON(w, http.StatusOK, httpx.Page{Items: items, Page: 1, PageSize: len(items), Total: int64(len(items))})
}

func (a *Handler) createGroup(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	var in struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Kind        string `json:"kind"`
		ParentID    string `json:"parent_id"`
	}
	if err := decodeJSON(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "invalid body")
		return
	}
	if in.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "name required")
		return
	}
	if in.Kind == "" {
		in.Kind = "static"
	}

	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	var id string
	err = conn.QueryRow(r.Context(), `INSERT INTO device_groups (tenant_id, name, description, kind, parent_id)
		VALUES ($1, $2, NULLIF($3,''), $4, NULLIF($5,'')::uuid) RETURNING id`,
		c.TenantID, in.Name, in.Description, in.Kind, in.ParentID).Scan(&id)
	if err != nil {
		serverError(w, err)
		return
	}
	a.audit(r.Context(), conn, c, "group.created", "device_groups", id, nil, in)
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}
