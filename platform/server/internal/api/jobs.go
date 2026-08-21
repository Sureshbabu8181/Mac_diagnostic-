package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/sunrise-mdm/platform/server/internal/app"
	"github.com/sunrise-mdm/platform/server/internal/auth"
	"github.com/sunrise-mdm/platform/server/internal/db"
	"github.com/sunrise-mdm/platform/server/internal/httpx"
)

type jobCreateRequest struct {
	CommandCode string         `json:"command_code"`
	CommandID   string         `json:"command_id"`
	Targets     jobTargetsBody `json:"targets"`
	ScheduledFor *time.Time    `json:"scheduled_for"`
	Args        map[string]any `json:"args"`
}

type jobTargetsBody struct {
	DeviceIDs []string `json:"device_ids"`
	GroupIDs  []string `json:"group_ids"`
}

type dispatchMessage struct {
	TenantID string         `json:"tenant_id"`
	JobID    string         `json:"job_id"`
	Command  string         `json:"command"`
	Args     map[string]any `json:"args"`
	Timeout  int            `json:"timeout"`
	Targets  []dispatchTarget `json:"targets"`
}

type dispatchTarget struct {
	JobTargetID string `json:"job_target_id"`
	DeviceID    string `json:"device_id"`
	DeviceUUID  string `json:"device_uuid"`
}

func (a *Handler) createJob(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	var in jobCreateRequest
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

	// Resolve command (by code or id)
	var commandID, commandCode, risk string
	var timeout int
	var requiresApproval bool
	if in.CommandCode != "" {
		err = conn.QueryRow(r.Context(), `SELECT id, code, risk, timeout_seconds, requires_approval
			FROM commands WHERE code = $1 AND active`, in.CommandCode).
			Scan(&commandID, &commandCode, &risk, &timeout, &requiresApproval)
	} else if in.CommandID != "" {
		err = conn.QueryRow(r.Context(), `SELECT id, code, risk, timeout_seconds, requires_approval
			FROM commands WHERE id = $1 AND active`, in.CommandID).
			Scan(&commandID, &commandCode, &risk, &timeout, &requiresApproval)
	}
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "unknown command")
		return
	}

	// Expand targets
	deviceIDs := []string{}
	seen := map[string]bool{}
	for _, id := range in.Targets.DeviceIDs {
		if !seen[id] {
			deviceIDs = append(deviceIDs, id)
			seen[id] = true
		}
	}
	if len(in.Targets.GroupIDs) > 0 {
		rows, err := conn.Query(r.Context(), `SELECT d.id, d.device_uuid FROM device_group_members m
			JOIN devices d ON d.id = m.device_id
			WHERE m.group_id = ANY($1) AND d.deleted_at IS NULL`, in.Targets.GroupIDs)
		if err != nil {
			serverError(w, err)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var id, uuid string
			if err := rows.Scan(&id, &uuid); err != nil {
				serverError(w, err)
				return
			}
			if !seen[id] {
				deviceIDs = append(deviceIDs, id)
				seen[id] = true
			}
		}
	}
	if len(deviceIDs) == 0 {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "no devices matched")
		return
	}

	// Approval decision
	needApproval := requiresApproval
	status := "queued"
	if needApproval && !auth.HasPermission(c.Role, "jobs:approve") {
		status = "pending"
	}

	idsJSON, _ := json.Marshal(deviceIDs)
	approvedBy := ""
	if status == "queued" {
		approvedBy = c.UserID
	}

	var jobID string
	err = conn.QueryRow(r.Context(), `INSERT INTO jobs (tenant_id, command_id, target_type, target_ids,
		status, risk, requires_approval, created_by_user_id, approved_by_user_id, scheduled_for)
		VALUES ($1, $2, 'devices', $3, $4, $5, $6, $7, NULLIF($8, '')::uuid, $9) RETURNING id`,
		c.TenantID, commandID, idsJSON, status, risk, needApproval, c.UserID, approvedBy, in.ScheduledFor).Scan(&jobID)
	if err != nil {
		serverError(w, err)
		return
	}

	// Job targets
	type targetRow struct {
		ID  string
		UUID string
	}
	targets := []dispatchTarget{}
	for _, deviceID := range deviceIDs {
		var tid, tuuid string
		err = conn.QueryRow(r.Context(), `INSERT INTO job_targets (tenant_id, job_id, device_id, status)
			VALUES ($1, $2, $3, 'queued') RETURNING id`, c.TenantID, jobID, deviceID).Scan(&tid)
		if err != nil {
			serverError(w, err)
			return
		}
		_ = conn.QueryRow(r.Context(), `SELECT device_uuid FROM devices WHERE id = $1`, deviceID).Scan(&tuuid)
		targets = append(targets, dispatchTarget{JobTargetID: tid, DeviceID: deviceID, DeviceUUID: tuuid})
	}

	a.audit(r.Context(), conn, c, "job.created", "jobs", jobID, nil, map[string]any{
		"command": commandCode, "targets": len(targets), "status": status,
	})

	if status == "queued" {
		a.publishDispatch(dispatchMessage{
			TenantID: c.TenantID, JobID: jobID, Command: commandCode,
			Args: in.Args, Timeout: timeout, Targets: targets,
		})
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id": jobID, "status": status, "risk": risk, "device_count": len(targets),
	})
}

func (a *Handler) publishDispatch(m dispatchMessage) {
	b, _ := json.Marshal(m)
	_, _ = a.JS.Publish(app.SubjectDispatch, b)
}

func (a *Handler) approveJob(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	id := r.PathValue("id")
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	var status string
	err = conn.QueryRow(r.Context(), `SELECT status FROM jobs WHERE id = $1 FOR UPDATE`, id).Scan(&status)
	if err != nil {
		writeNotFound(w)
		return
	}
	if status != "pending" {
		httpx.Error(w, http.StatusConflict, "conflict", "job is not pending")
		return
	}
	if _, err := conn.Exec(r.Context(), `UPDATE jobs SET status='queued', approved_by_user_id=$1, updated_at=now() WHERE id=$2`,
		c.UserID, id); err != nil {
		serverError(w, err)
		return
	}
	a.audit(r.Context(), conn, c, "job.approved", "jobs", id, nil, map[string]string{"approved_by": c.UserID})

	// Re-dispatch pending targets
	rows, err := conn.Query(r.Context(), `SELECT jt.id, d.device_uuid, jt.device_id FROM job_targets jt
		JOIN jobs j ON j.id = jt.job_id JOIN devices d ON d.id = jt.device_id
		WHERE jt.job_id = $1 AND jt.status = 'pending'`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	targets := []dispatchTarget{}
	for rows.Next() {
		var t dispatchTarget
		var tid string
		if err := rows.Scan(&tid, &t.DeviceUUID, &t.DeviceID); err != nil {
			serverError(w, err)
			return
		}
		t.JobTargetID = tid
		targets = append(targets, t)
	}
	rows.Close()
	if len(targets) > 0 {
		var commandCode string
		var timeout int
		_ = conn.QueryRow(r.Context(), `SELECT c.code, c.timeout_seconds FROM commands c
			JOIN jobs j ON j.command_id = c.id WHERE j.id = $1`, id).Scan(&commandCode, &timeout)
		a.publishDispatch(dispatchMessage{TenantID: c.TenantID, JobID: id, Command: commandCode,
			Args: map[string]any{}, Timeout: timeout, Targets: targets})
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "queued"})
}

func (a *Handler) listJobs(w http.ResponseWriter, r *http.Request) {
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
	if s := r.URL.Query().Get("status"); s != "" {
		where += " AND status = $" + itoa(argi)
		args = append(args, s)
		argi++
	}

	var total int64
	if err := conn.QueryRow(r.Context(), "SELECT count(*) FROM jobs "+where, args...).Scan(&total); err != nil {
		serverError(w, err)
		return
	}
	rows, err := conn.Query(r.Context(), `SELECT id, command_id, package_id, target_type, target_ids, status,
		risk, requires_approval, created_by_user_id, approved_by_user_id, scheduled_for, expires_at, created_at, updated_at
		FROM jobs `+where+` ORDER BY created_at DESC LIMIT $`+itoa(argi)+` OFFSET $`+itoa(argi+1),
		append(args, size, (page-1)*size)...)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id, targetType, status, risk string
		var commandID, pkgID, createdBy, approvedBy *string
		var targetIDs []byte
		var requiresApproval bool
		var scheduled, expires, createdAt, updatedAt *time.Time
		if err := rows.Scan(&id, &commandID, &pkgID, &targetType, &targetIDs, &status, &risk,
			&requiresApproval, &createdBy, &approvedBy, &scheduled, &expires, &createdAt, &updatedAt); err != nil {
			serverError(w, err)
			return
		}
		var tids []string
		_ = jsonUnmarshal(targetIDs, &tids)
		items = append(items, map[string]any{
			"id": id, "command_id": commandID, "package_id": pkgID, "target_type": targetType,
			"target_ids": tids, "status": status, "risk": risk, "requires_approval": requiresApproval,
			"created_by_user_id": createdBy, "approved_by_user_id": approvedBy, "scheduled_for": scheduled,
			"expires_at": expires, "created_at": createdAt, "updated_at": updatedAt,
		})
	}
	writeJSON(w, http.StatusOK, httpx.Page{Items: items, Page: page, PageSize: size, Total: total})
}

func (a *Handler) getJob(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	id := r.PathValue("id")
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	row := conn.QueryRow(r.Context(), `SELECT id, command_id, package_id, target_type, target_ids, status,
		risk, requires_approval, created_by_user_id, approved_by_user_id, scheduled_for, expires_at, created_at, updated_at
		FROM jobs WHERE id = $1`, id)
	var jobID, targetType, status, risk string
	var commandID, pkgID, createdBy, approvedBy *string
	var targetIDs []byte
	var requiresApproval bool
	var scheduled, expires, createdAt, updatedAt *time.Time
	if err := row.Scan(&jobID, &commandID, &pkgID, &targetType, &targetIDs, &status, &risk,
		&requiresApproval, &createdBy, &approvedBy, &scheduled, &expires, &createdAt, &updatedAt); err != nil {
		writeNotFound(w)
		return
	}

	resultRows, err := conn.Query(r.Context(), `SELECT jt.device_id, jt.status, cr.exit_code, cr.stdout, cr.stderr, cr.attempt, cr.collected_at
		FROM job_targets jt LEFT JOIN command_results cr ON cr.job_target_id = jt.id AND cr.attempt = (SELECT max(attempt) FROM command_results WHERE job_target_id = jt.id)
		WHERE jt.job_id = $1`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	defer resultRows.Close()
	results := []map[string]any{}
	for resultRows.Next() {
		var deviceID, tstatus string
		var exitCode *int
		var stdout, stderr *string
		var attempt *int
		var collected *time.Time
		if err := resultRows.Scan(&deviceID, &tstatus, &exitCode, &stdout, &stderr, &attempt, &collected); err != nil {
			serverError(w, err)
			return
		}
		results = append(results, map[string]any{
			"device_id": deviceID, "status": tstatus, "exit_code": exitCode,
			"stdout": stdout, "stderr": stderr, "attempt": attempt, "collected_at": collected,
		})
	}

	var tids []string
	_ = jsonUnmarshal(targetIDs, &tids)
	writeJSON(w, http.StatusOK, map[string]any{
		"job": map[string]any{
			"id": jobID, "command_id": commandID, "package_id": pkgID, "target_type": targetType,
			"target_ids": tids, "status": status, "risk": risk, "requires_approval": requiresApproval,
			"created_by_user_id": createdBy, "approved_by_user_id": approvedBy, "scheduled_for": scheduled,
			"expires_at": expires, "created_at": createdAt, "updated_at": updatedAt,
		},
		"results": results,
	})
}

func (a *Handler) listCommands(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	rows, err := conn.Query(r.Context(), `SELECT id, name, code, platform, category, risk, timeout_seconds,
		max_retries, requires_approval, description FROM commands WHERE active ORDER BY platform, name`)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id, name, code, platform, category, risk, desc string
		var timeout, retries int
		var reqApproval bool
		if err := rows.Scan(&id, &name, &code, &platform, &category, &risk, &timeout, &retries, &reqApproval, &desc); err != nil {
			serverError(w, err)
			return
		}
		items = append(items, map[string]any{
			"id": id, "name": name, "code": code, "platform": platform, "category": category,
			"risk": risk, "timeout_seconds": timeout, "max_retries": retries, "requires_approval": reqApproval, "description": desc,
		})
	}
	writeJSON(w, http.StatusOK, httpx.Page{Items: items, Page: 1, PageSize: len(items), Total: int64(len(items))})
}
