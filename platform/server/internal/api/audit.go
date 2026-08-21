package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sunrise-mdm/platform/server/internal/auth"
	"github.com/sunrise-mdm/platform/server/internal/db"
	"github.com/sunrise-mdm/platform/server/internal/httpx"
)

func (a *Handler) audit(ctx context.Context, conn *pgxpool.Conn, c *auth.Claims, action, resourceType, resourceID string, before, after any) {
	beforeB, _ := json.Marshal(before)
	afterB, _ := json.Marshal(after)
	actorType := "admin"
	if c.Purpose == "device" {
		actorType = "agent"
	}
	_, _ = conn.Exec(ctx, `INSERT INTO audit_logs (tenant_id, user_id, device_id, actor_type, action, resource_type, resource_id, before, after)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		c.TenantID, nullStr(c.UserID), nullStr(c.DeviceID), actorType, action, resourceType, resourceID,
		nullJSON(beforeB), nullJSON(afterB))
}

func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func nullJSON(b []byte) []byte {
	if len(b) == 0 || string(b) == "null" {
		return nil
	}
	return b
}

func (a *Handler) listAudit(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	page, size := httpx.Pagination(r)
	where := "WHERE 1=1"
	args := []any{}
	argi := 1
	if action := r.URL.Query().Get("action"); action != "" {
		where += " AND action = $" + itoa(argi)
		args = append(args, action)
		argi++
	}
	if from := r.URL.Query().Get("from"); from != "" {
		where += " AND occurred_at >= $" + itoa(argi)
		args = append(args, from)
		argi++
	}
	if to := r.URL.Query().Get("to"); to != "" {
		where += " AND occurred_at <= $" + itoa(argi)
		args = append(args, to)
		argi++
	}

	var total int64
	if err := conn.QueryRow(r.Context(), "SELECT count(*) FROM audit_logs "+where, args...).Scan(&total); err != nil {
		serverError(w, err)
		return
	}

	rows, err := conn.Query(r.Context(), `SELECT id, user_id, device_id, actor_type, action, resource_type,
		resource_id, before, after, COALESCE(ip, ''), occurred_at FROM audit_logs `+where+
		` ORDER BY occurred_at DESC LIMIT $`+itoa(argi)+` OFFSET $`+itoa(argi+1),
		append(args, size, (page-1)*size)...)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id, actorType, action, resourceType, resourceID, ip string
		var userID, deviceID *string
		var before, after []byte
		var occurred time.Time
		if err := rows.Scan(&id, &userID, &deviceID, &actorType, &action, &resourceType,
			&resourceID, &before, &after, &ip, &occurred); err != nil {
			serverError(w, err)
			return
		}
		var bv, av any
		_ = jsonUnmarshal(before, &bv)
		_ = jsonUnmarshal(after, &av)
		items = append(items, map[string]any{
			"id": id, "user_id": userID, "device_id": deviceID, "actor_type": actorType,
			"action": action, "resource_type": resourceType, "resource_id": resourceID,
			"before": bv, "after": av, "ip": ip, "occurred_at": occurred,
		})
	}
	writeJSON(w, http.StatusOK, httpx.Page{Items: items, Page: page, PageSize: size, Total: total})
}
