package api

import (
	"net/http"

	"github.com/sunrise-mdm/platform/server/internal/auth"
	"github.com/sunrise-mdm/platform/server/internal/db"
)

func (a *Handler) dashboardSummary(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	type counts struct {
		Total         int64
		Online        int64
		Offline       int64
		NonCompliant  int64
		Windows       int64
		MacOS         int64
		Unknown       int64
		CriticalAlert int64
	}
	var row counts
	err = conn.QueryRow(r.Context(), `
		SELECT
			(SELECT count(*) FROM devices WHERE deleted_at IS NULL) AS total,
			(SELECT count(*) FROM devices WHERE online AND deleted_at IS NULL) AS online,
			(SELECT count(*) FROM devices WHERE NOT online AND deleted_at IS NULL) AS offline,
			(SELECT count(*) FROM compliance WHERE status = 'non_compliant') AS non_compliant,
			(SELECT count(*) FROM devices WHERE os = 'windows' AND deleted_at IS NULL) AS windows,
			(SELECT count(*) FROM devices WHERE os = 'macos' AND deleted_at IS NULL) AS macos,
			(SELECT count(*) FROM devices WHERE status = 'unknown' AND deleted_at IS NULL) AS unknown,
			(SELECT count(*) FROM notifications WHERE status = 'pending') AS critical_alert
	`).Scan(&row.Total, &row.Online, &row.Offline, &row.NonCompliant, &row.Windows, &row.MacOS, &row.Unknown, &row.CriticalAlert)
	if err != nil {
		serverError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"total_devices":   row.Total,
		"online":          row.Online,
		"offline":         row.Offline,
		"non_compliant":   row.NonCompliant,
		"windows":         row.Windows,
		"macos":           row.MacOS,
		"unknown":         row.Unknown,
		"critical_alerts": row.CriticalAlert,
	})
}
