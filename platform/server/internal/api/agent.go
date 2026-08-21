package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/sunrise-mdm/platform/server/internal/app"
	"github.com/sunrise-mdm/platform/server/internal/auth"
	"github.com/sunrise-mdm/platform/server/internal/db"
	"github.com/sunrise-mdm/platform/server/internal/httpx"
)

func hashToken(t string) string {
	h := sha256.Sum256([]byte(t))
	return hex.EncodeToString(h[:])
}

func (a *Handler) createEnrollmentToken(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	var in struct {
		TTLHours int `json:"ttl_hours"`
		MaxUses  int `json:"max_uses"`
	}
	if err := decodeJSON(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "invalid body")
		return
	}
	if in.TTLHours <= 0 {
		in.TTLHours = 24
	}
	raw := randomHex(24)
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	var id string
	err = conn.QueryRow(r.Context(), `INSERT INTO enrollment_tokens (tenant_id, token_hash, created_by_user_id, expires_at, max_uses)
		VALUES ($1, $2, $3, now() + ($4::int * interval '1 hour'), $5) RETURNING id`,
		c.TenantID, hashToken(raw), c.UserID, in.TTLHours, in.MaxUses).Scan(&id)
	if err != nil {
		serverError(w, err)
		return
	}
	a.audit(r.Context(), conn, c, "enrollment_token.created", "enrollment_tokens", id, nil, nil)
	writeJSON(w, http.StatusCreated, map[string]string{"id": id, "token": raw})
}

func (a *Handler) agentEnroll(w http.ResponseWriter, r *http.Request) {
	var in struct {
		EnrollmentToken string `json:"enrollment_token"`
		DeviceUUID      string `json:"device_uuid"`
		Hostname        string `json:"hostname"`
		OS              string `json:"os"`
		OSVersion       string `json:"os_version"`
		OSBuild         string `json:"os_build"`
		Manufacturer    string `json:"manufacturer"`
		Model           string `json:"model"`
		SerialNumber    string `json:"serial_number"`
		AgentVersion    string `json:"agent_version"`
	}
	if err := decodeJSON(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "invalid body")
		return
	}
	if in.EnrollmentToken == "" || in.DeviceUUID == "" {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "enrollment_token and device_uuid required")
		return
	}

	conn, err := a.DB.Acquire(r.Context())
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	var tenantID string
	var used int
	var maxUses *int
	var expires time.Time
	err = conn.QueryRow(r.Context(), `SELECT tenant_id, used_count, max_uses, expires_at
		FROM enrollment_tokens WHERE token_hash = $1 AND revoked_at IS NULL`, hashToken(in.EnrollmentToken)).
		Scan(&tenantID, &used, &maxUses, &expires)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "invalid enrollment token")
		return
	}
	if time.Now().After(expires) {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "enrollment token expired")
		return
	}
	if maxUses != nil && used >= *maxUses {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "enrollment token exhausted")
		return
	}

	// Scoped RLS for tenant writes
	conn.Exec(r.Context(), "SELECT set_config('app.tenant_id', $1, false)", tenantID)

	var deviceID string
	err = conn.QueryRow(r.Context(), `INSERT INTO devices (tenant_id, device_uuid, hostname, os, os_version, os_build,
		manufacturer, model, serial_number, status, enrolled_at, agent_version, online, last_seen)
		VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), NULLIF($6,''), NULLIF($7,''),
		NULLIF($8,''), NULLIF($9,''), 'active', now(), NULLIF($10,''), true, now())
		ON CONFLICT (tenant_id, device_uuid) DO UPDATE SET hostname=EXCLUDED.hostname, os=EXCLUDED.os,
			os_version=EXCLUDED.os_version, os_build=EXCLUDED.os_build, manufacturer=EXCLUDED.manufacturer,
			model=EXCLUDED.model, serial_number=EXCLUDED.serial_number, status='active',
			enrolled_at=COALESCE(devices.enrolled_at, now()), agent_version=EXCLUDED.agent_version,
			online=true, last_seen=now(), deleted_at=NULL
		RETURNING id`, tenantID, in.DeviceUUID, in.Hostname, in.OS, in.OSVersion, in.OSBuild,
		in.Manufacturer, in.Model, in.SerialNumber, in.AgentVersion).Scan(&deviceID)
	if err != nil {
		serverError(w, err)
		return
	}

	_, _ = conn.Exec(r.Context(), `INSERT INTO agents (tenant_id, device_id, version, os, arch, installed_at, last_seen, status)
		VALUES ($1, $2, $3, $4, 'unknown', now(), now(), 'healthy')
		ON CONFLICT DO NOTHING`, tenantID, deviceID, in.AgentVersion, in.OS)

	_, _ = conn.Exec(r.Context(), `UPDATE enrollment_tokens SET used_count = used_count + 1 WHERE token_hash = $1`, hashToken(in.EnrollmentToken))

	// Issue short-lived device session token
	token, err := auth.Sign(a.Cfg.JWTSecret, a.Cfg.JWTIssuer, auth.Claims{
		TenantID: tenantID, DeviceID: deviceID, Purpose: "device",
	}, time.Duration(a.Cfg.TokenTTLMin)*time.Minute)
	if err != nil {
		serverError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"device_id": deviceID, "token": token, "token_ttl_seconds": a.Cfg.TokenTTLMin * 60,
	})
}

func (a *Handler) agentHeartbeat(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	if c.Purpose != "device" || c.DeviceID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "device token required")
		return
	}
	var in struct {
		AgentVersion string `json:"agent_version"`
		IP           string `json:"ip"`
	}
	_ = decodeJSON(r, &in)

	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	_, err = conn.Exec(r.Context(), `UPDATE devices SET online = true, last_seen = now(),
		agent_version = COALESCE(NULLIF($1,''), agent_version), ip_address = COALESCE(NULLIF($2,''), ip_address)
		WHERE id = $3`, in.AgentVersion, in.IP, c.DeviceID)
	if err != nil {
		serverError(w, err)
		return
	}
	_, _ = conn.Exec(r.Context(), `UPDATE agents SET last_seen = now(), status = 'healthy' WHERE device_id = $1`, c.DeviceID)
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (a *Handler) agentInventory(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	if c.Purpose != "device" || c.DeviceID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "device token required")
		return
	}
	var in struct {
		Hardware map[string]any `json:"hardware"`
		Software []struct {
			Name        string `json:"name"`
			Version     string `json:"version"`
			Publisher   string `json:"publisher"`
			InstallPath string `json:"install_path"`
			PackageID   string `json:"package_id"`
			InstallDate string `json:"install_date"`
		} `json:"software"`
		Network []struct {
			Iface string `json:"iface"`
			IPv4  string `json:"ipv4"`
			IPv6  string `json:"ipv6"`
			MAC   string `json:"mac"`
			SSID  string `json:"ssid"`
			Gateway string `json:"gateway"`
		} `json:"network"`
	}
	if err := decodeJSON(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "invalid body")
		return
	}

	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	// Update hardware-derived device fields
	hw := in.Hardware
	set := func(k string) *string {
		if v, ok := hw[k].(string); ok && v != "" {
			return &v
		}
		return nil
	}
	_, err = conn.Exec(r.Context(), `UPDATE devices SET
		os_version = COALESCE($1, os_version), os_build = COALESCE($2, os_build),
		manufacturer = COALESCE($3, manufacturer), model = COALESCE($4, model),
		cpu = COALESCE($5, cpu), ram_mb = COALESCE($6, ram_mb), storage_mb = COALESCE($7, storage_mb),
		gpu = COALESCE($8, gpu), mac_address = COALESCE($9, mac_address), updated_at = now()
		WHERE id = $10`,
		set("os_version"), set("os_build"), set("manufacturer"), set("model"), set("cpu"),
		hw["ram_mb"], hw["storage_mb"], set("gpu"), set("mac_address"), c.DeviceID)
	if err != nil {
		serverError(w, err)
		return
	}

	// Replace software inventory
	_, _ = conn.Exec(r.Context(), `DELETE FROM device_software WHERE device_id = $1`, c.DeviceID)
	for _, sw := range in.Software {
		if sw.Name == "" {
			continue
		}
		var softwareID string
		err = conn.QueryRow(r.Context(), `INSERT INTO software (tenant_id, name, publisher)
			VALUES ($1, $2, NULLIF($3,'')) ON CONFLICT DO NOTHING RETURNING id`, c.TenantID, sw.Name, sw.Publisher).Scan(&softwareID)
		if err != nil {
			// fetch existing
			_ = conn.QueryRow(r.Context(), `SELECT id FROM software WHERE name = $1`, sw.Name).Scan(&softwareID)
		}
		if softwareID == "" {
			continue
		}
		_, _ = conn.Exec(r.Context(), `INSERT INTO device_software (tenant_id, device_id, software_id, version,
			install_path, package_id, publisher, detected_at)
			VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), now())`,
			c.TenantID, c.DeviceID, softwareID, sw.Version, sw.InstallPath, sw.PackageID, sw.Publisher)
	}

	// Replace network inventory
	_, _ = conn.Exec(r.Context(), `DELETE FROM device_network WHERE device_id = $1`, c.DeviceID)
	for i, n := range in.Network {
		if n.IPv4 == "" && n.MAC == "" {
			continue
		}
		_, _ = conn.Exec(r.Context(), `INSERT INTO device_network (tenant_id, device_id, iface, ipv4, ipv6, mac, ssid, gateway, is_primary, captured_at)
			VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), NULLIF($6,''), NULLIF($7,''), NULLIF($8,''), $9, now())`,
			c.TenantID, c.DeviceID, n.Iface, n.IPv4, n.IPv6, n.MAC, n.SSID, n.Gateway, i == 0)
	}

	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (a *Handler) agentJobResult(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	if c.Purpose != "device" || c.DeviceID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "device token required")
		return
	}
	jobTargetID := r.PathValue("jobTargetID")
	var in struct {
		Status   string `json:"status"`
		ExitCode *int   `json:"exit_code"`
		Stdout   string `json:"stdout"`
		Stderr   string `json:"stderr"`
		Attempt  int    `json:"attempt"`
	}
	if err := decodeJSON(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "invalid body")
		return
	}
	if in.Attempt < 1 {
		in.Attempt = 1
	}

	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	var jobID string
	err = conn.QueryRow(r.Context(), `SELECT job_id FROM job_targets WHERE id = $1 AND device_id = $2`,
		jobTargetID, c.DeviceID).Scan(&jobID)
	if err != nil {
		httpx.Error(w, http.StatusForbidden, "forbidden", "job target not owned by device")
		return
	}

	_, err = conn.Exec(r.Context(), `INSERT INTO command_results (tenant_id, job_id, job_target_id, device_id,
		exit_code, stdout, stderr, attempt, status, collected_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
		ON CONFLICT (job_target_id, attempt) DO UPDATE SET status = EXCLUDED.status,
			exit_code = EXCLUDED.exit_code, stdout = EXCLUDED.stdout, stderr = EXCLUDED.stderr`,
		c.TenantID, jobID, jobTargetID, c.DeviceID, in.ExitCode, in.Stdout, in.Stderr, in.Attempt, in.Status)
	if err != nil {
		serverError(w, err)
		return
	}

	newStatus := "running"
	if in.Status == "completed" || in.Status == "failed" || in.Status == "expired" {
		newStatus = in.Status
	}
	_, _ = conn.Exec(r.Context(), `UPDATE job_targets SET status = $1, completed_at = CASE WHEN $2 THEN now() ELSE completed_at END
		WHERE id = $3`, newStatus, newStatus != "running", jobTargetID)

	// Notify workers to roll up the job
	msg, _ := json.Marshal(map[string]any{"job_id": jobID, "job_target_id": jobTargetID, "status": newStatus})
	_, _ = a.JS.Publish(app.SubjectResult, msg)

	writeJSON(w, http.StatusOK, map[string]any{"status": "accepted"})
}

func (a *Handler) agentJobPoll(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	if c.Purpose != "device" || c.DeviceID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "device token required")
		return
	}
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	rows, err := conn.Query(r.Context(), `SELECT jt.id, cm.code, cm.timeout_seconds FROM job_targets jt
		JOIN jobs j ON j.id = jt.job_id
		JOIN commands cm ON cm.id = j.command_id
		WHERE jt.device_id = $1 AND jt.status = 'queued' AND j.status = 'queued'`, c.DeviceID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id, code string
		var timeout int
		if err := rows.Scan(&id, &code, &timeout); err != nil {
			serverError(w, err)
			return
		}
		items = append(items, map[string]any{"job_target_id": id, "command": code, "timeout_seconds": timeout})
	}
	writeJSON(w, http.StatusOK, httpx.Page{Items: items, Page: 1, PageSize: len(items), Total: int64(len(items))})
}
