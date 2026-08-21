package api

import (
	"net/http"
	"strings"

	"github.com/sunrise-mdm/platform/server/internal/auth"
	"github.com/sunrise-mdm/platform/server/internal/db"
	"github.com/sunrise-mdm/platform/server/internal/httpx"
	"github.com/sunrise-mdm/platform/server/internal/models"
)

const deviceColumns = `id, device_uuid, hostname, os, os_version, os_build, manufacturer, model,
	serial_number, cpu, ram_mb, storage_mb, gpu, mac_address, ip_address, last_seen, online,
	status, tags, department_id, assigned_user_id, location_consent, encryption_status,
	battery_health, agent_version, compliance_score, created_at, updated_at`

func scanDevice(row interface{ Scan(...any) error }) (models.Device, error) {
	var d models.Device
	var tags []byte
	err := row.Scan(
		&d.ID, &d.DeviceUUID, &d.Hostname, &d.OS, &d.OSVersion, &d.OSBuild, &d.Manufacturer,
		&d.Model, &d.SerialNumber, &d.CPU, &d.RAMMB, &d.StorageMB, &d.GPU, &d.MACAddress,
		&d.IPAddress, &d.LastSeen, &d.Online, &d.Status, &tags, &d.DepartmentID,
		&d.AssignedUserID, &d.LocationConsent, &d.EncryptionStatus, &d.BatteryHealth,
		&d.AgentVersion, &d.ComplianceScore, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return d, err
	}
	_ = jsonUnmarshal(tags, &d.Tags)
	return d, nil
}

func (a *Handler) listDevices(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	page, size := httpx.Pagination(r)
	q := r.URL.Query()
	where := "WHERE deleted_at IS NULL"
	args := []any{}
	argi := 1
	add := func(cond string, val any) {
		args = append(args, val)
		where += " AND " + strings.ReplaceAll(cond, "?", "$"+itoa(argi))
		argi++
	}
	if os := q.Get("os"); os != "" {
		add("os = ?", os)
	}
	if status := q.Get("status"); status != "" {
		add("status = ?", status)
	}
	if s := q.Get("search"); s != "" {
		add("(hostname ILIKE ? OR serial_number ILIKE ?)", "%"+s+"%")
	}

	var total int64
	if err := conn.QueryRow(r.Context(), "SELECT count(*) FROM devices "+where, args...).Scan(&total); err != nil {
		serverError(w, err)
		return
	}

	offset := (page - 1) * size
	rows, err := conn.Query(r.Context(),
		"SELECT "+deviceColumns+" FROM devices "+where+" ORDER BY created_at DESC LIMIT $"+itoa(argi)+" OFFSET $"+itoa(argi+1),
		append(args, size, offset)...)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()

	items := []models.Device{}
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			serverError(w, err)
			return
		}
		items = append(items, d)
	}

	writeJSON(w, http.StatusOK, httpx.Page{Items: items, Page: page, PageSize: size, Total: total})
}

func (a *Handler) getDevice(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	id := r.PathValue("id")
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	row := conn.QueryRow(r.Context(), "SELECT "+deviceColumns+" FROM devices WHERE id = $1 AND deleted_at IS NULL", id)
	d, err := scanDevice(row)
	if err != nil {
		writeNotFound(w)
		return
	}

	// network adapters
	netRows, err := conn.Query(r.Context(), `SELECT iface, ipv4, ipv6, mac, ssid, gateway, is_primary, captured_at
		FROM device_network WHERE device_id = $1 ORDER BY captured_at DESC LIMIT 20`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	defer netRows.Close()
	networks := []map[string]any{}
	for netRows.Next() {
		var iface, ipv4, ipv6, mac, ssid, gateway *string
		var primary bool
		var captured interface{}
		if err := netRows.Scan(&iface, &ipv4, &ipv6, &mac, &ssid, &gateway, &primary, &captured); err != nil {
			serverError(w, err)
			return
		}
		networks = append(networks, map[string]any{
			"iface": iface, "ipv4": ipv4, "ipv6": ipv6, "mac": mac, "ssid": ssid,
			"gateway": gateway, "is_primary": primary,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"device": d, "network": networks})
}

func writeNotFound(w http.ResponseWriter) {
	httpx.Error(w, http.StatusNotFound, "not_found", "resource not found")
}
