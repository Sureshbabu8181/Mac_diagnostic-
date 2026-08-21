package api

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/sunrise-mdm/platform/server/internal/auth"
	"github.com/sunrise-mdm/platform/server/internal/db"
	"github.com/sunrise-mdm/platform/server/internal/httpx"
)

func (a *Handler) listPatches(w http.ResponseWriter, r *http.Request) {
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
	if s := r.URL.Query().Get("severity"); s != "" {
		where += " AND severity = $" + itoa(argi)
		args = append(args, s)
		argi++
	}
	if s := r.URL.Query().Get("status"); s != "" {
		where += " AND status = $" + itoa(argi)
		args = append(args, s)
		argi++
	}

	var total int64
	if err := conn.QueryRow(r.Context(), "SELECT count(*) FROM patches "+where, args...).Scan(&total); err != nil {
		serverError(w, err)
		return
	}
	rows, err := conn.Query(r.Context(), `SELECT id, source, title, severity, category, kb_number, release_date,
		target_os, reboot_required, status, risk_score, created_at FROM patches `+where+
		` ORDER BY created_at DESC LIMIT $`+itoa(argi)+` OFFSET $`+itoa(argi+1),
		append(args, size, (page-1)*size)...)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id, source, title, severity, category, status string
		var kb, targetOS *string
		var releaseDate *time.Time
		var rebootRequired bool
		var riskScore *float64
		var createdAt time.Time
		if err := rows.Scan(&id, &source, &title, &severity, &category, &kb, &releaseDate,
			&targetOS, &rebootRequired, &status, &riskScore, &createdAt); err != nil {
			serverError(w, err)
			return
		}
		items = append(items, map[string]any{
			"id": id, "source": source, "title": title, "severity": severity, "category": category,
			"kb_number": kb, "release_date": releaseDate, "target_os": targetOS,
			"reboot_required": rebootRequired, "status": status, "risk_score": riskScore, "created_at": createdAt,
		})
	}
	writeJSON(w, http.StatusOK, httpx.Page{Items: items, Page: page, PageSize: size, Total: total})
}

func (a *Handler) approvePatch(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	id := r.PathValue("id")
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	var status string
	err = conn.QueryRow(r.Context(), `SELECT status FROM patches WHERE id = $1 FOR UPDATE`, id).Scan(&status)
	if err != nil {
		writeNotFound(w)
		return
	}
	if status != "discovered" && status != "failed" {
		httpx.Error(w, http.StatusConflict, "conflict", "patch not in approvable state")
		return
	}
	if _, err := conn.Exec(r.Context(), `UPDATE patches SET status = 'approved', updated_at = now() WHERE id = $1`, id); err != nil {
		serverError(w, err)
		return
	}
	_, _ = conn.Exec(r.Context(), `INSERT INTO patch_approvals (tenant_id, patch_id, action, approver_user_id, decided_at)
		VALUES ($1, $2, 'approve', $3, now())`, c.TenantID, id, c.UserID)
	a.audit(r.Context(), conn, c, "patch.approved", "patches", id, nil, nil)
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "approved"})
}

func (a *Handler) deployPatch(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	id := r.PathValue("id")
	var in struct {
		Ring     string `json:"ring"`
		TargetType string `json:"target_type"`
		TargetID string `json:"target_id"`
	}
	_ = decodeJSON(r, &in)
	if in.Ring == "" {
		in.Ring = "pilot"
	}
	if in.TargetType == "" {
		in.TargetType = "all"
	}

	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	var patchStatus string
	err = conn.QueryRow(r.Context(), `SELECT status FROM patches WHERE id = $1 FOR UPDATE`, id).Scan(&patchStatus)
	if err != nil {
		writeNotFound(w)
		return
	}
	if patchStatus != "approved" && patchStatus != "discovered" {
		httpx.Error(w, http.StatusConflict, "conflict", "patch not deployable")
		return
	}

	var deploymentID string
	err = conn.QueryRow(r.Context(), `INSERT INTO patch_deployments (tenant_id, patch_id, ring, status,
		created_by_user_id, approved_by_user_id, scheduled_for)
		VALUES ($1, $2, $3, 'scheduled', $4, $5, now())
		RETURNING id`, c.TenantID, id, in.Ring, c.UserID, c.UserID).Scan(&deploymentID)
	if err != nil {
		serverError(w, err)
		return
	}

	// Target devices: MVP supports "all" or a specific device group
	deviceQuery := `SELECT id FROM devices WHERE deleted_at IS NULL`
	var rows pgx.Rows
	if in.TargetType == "group" && in.TargetID != "" {
		deviceQuery += ` AND id IN (SELECT device_id FROM device_group_members WHERE group_id = $1)`
		rr, err := conn.Query(r.Context(), deviceQuery, in.TargetID)
		if err != nil {
			serverError(w, err)
			return
		}
		rows = rr
	} else {
		rr, err := conn.Query(r.Context(), deviceQuery)
		if err != nil {
			serverError(w, err)
			return
		}
		rows = rr
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var deviceID string
		if err := rows.Scan(&deviceID); err != nil {
			serverError(w, err)
			return
		}
		_, _ = conn.Exec(r.Context(), `INSERT INTO patch_deployment_targets (tenant_id, deployment_id, device_id, status)
			VALUES ($1, $2, $3, 'queued')`, c.TenantID, deploymentID, deviceID)
		count++
	}

	_, _ = conn.Exec(r.Context(), `UPDATE patches SET status = 'scheduled', updated_at = now() WHERE id = $1`, id)
	_, _ = conn.Exec(r.Context(), `UPDATE patch_deployments SET status = 'scheduled', started_at = now() WHERE id = $1`, deploymentID)

	a.audit(r.Context(), conn, c, "patch.deployed", "patches", id, nil, map[string]any{
		"deployment_id": deploymentID, "ring": in.Ring, "target_type": in.TargetType, "device_count": count,
	})
	writeJSON(w, http.StatusOK, map[string]any{"deployment_id": deploymentID, "ring": in.Ring, "device_count": count, "status": "scheduled"})
}

func (a *Handler) patchCompliance(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	var total, patched, failed, rebootPending int64
	_ = conn.QueryRow(r.Context(), `SELECT count(*) FROM devices WHERE deleted_at IS NULL`).Scan(&total)
	_ = conn.QueryRow(r.Context(), `SELECT count(DISTINCT device_id) FROM patch_results WHERE status = 'completed'`).Scan(&patched)
	_ = conn.QueryRow(r.Context(), `SELECT count(DISTINCT device_id) FROM patch_results WHERE status = 'failed'`).Scan(&failed)
	_ = conn.QueryRow(r.Context(), `SELECT count(*) FROM patch_reboots WHERE status IN ('required','deferred','scheduled')`).Scan(&rebootPending)

	pct := 0.0
	if total > 0 {
		pct = float64(patched) / float64(total) * 100
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"total_devices":   total,
		"patched":         patched,
		"missing":         total - patched,
		"patch_failures":  failed,
		"reboot_pending":  rebootPending,
		"compliance_pct":  round2(pct),
		"critical_pct":    round2(pct),
		"high_pct":        round2(pct),
		"medium_pct":      round2(pct),
	})
}

func round2(f float64) float64 {
	return float64(int(f*100+0.5)) / 100
}
