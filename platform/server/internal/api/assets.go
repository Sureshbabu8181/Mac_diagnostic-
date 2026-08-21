package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/sunrise-mdm/platform/server/internal/auth"
	"github.com/sunrise-mdm/platform/server/internal/db"
	"github.com/sunrise-mdm/platform/server/internal/httpx"
)

func itoa(i int) string { return strconv.Itoa(i) }

func jsonUnmarshal(b []byte, v any) error {
	if len(b) == 0 {
		return nil
	}
	return json.Unmarshal(b, v)
}

const validAssetStatuses = "procurement,receiving,inventory,assignment,active,repair,reassignment,return,retirement,disposal"

func (a *Handler) listAssets(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	page, size := httpx.Pagination(r)
	where := "WHERE deleted_at IS NULL"
	if s := r.URL.Query().Get("status"); s != "" {
		where += " AND status = '" + s + "'"
	}

	var total int64
	if err := conn.QueryRow(r.Context(), "SELECT count(*) FROM assets "+where).Scan(&total); err != nil {
		serverError(w, err)
		return
	}

	rows, err := conn.Query(r.Context(), `SELECT id, asset_tag, serial_number, hostname, manufacturer, model,
		device_id, vendor, purchase_date, warranty_until, assigned_user_id, department_id, location, status, created_at
		FROM assets `+where+` ORDER BY created_at DESC LIMIT $1 OFFSET $2`, size, (page-1)*size)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var id, status, createdAt string
		var tag, serial, hostname, mfr, model, deviceID, vendor, purchaseDate, warranty, userID, deptID, loc *string
		if err := rows.Scan(&id, &tag, &serial, &hostname, &mfr, &model, &deviceID, &vendor,
			&purchaseDate, &warranty, &userID, &deptID, &loc, &status, &createdAt); err != nil {
			serverError(w, err)
			return
		}
		items = append(items, map[string]any{
			"id": id, "asset_tag": tag, "serial_number": serial, "hostname": hostname,
			"manufacturer": mfr, "model": model, "device_id": deviceID, "vendor": vendor,
			"purchase_date": purchaseDate, "warranty_until": warranty, "assigned_user_id": userID,
			"department_id": deptID, "location": loc, "status": status, "created_at": createdAt,
		})
	}
	writeJSON(w, http.StatusOK, httpx.Page{Items: items, Page: page, PageSize: size, Total: total})
}

func (a *Handler) getAsset(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	id := r.PathValue("id")
	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	var asset map[string]any
	var row struct {
		ID, Status string
		Tag, Serial, Hostname, Mfr, Model, DeviceID, Vendor, PurchaseDate, Warranty, UserID, DeptID, Loc *string
	}
	err = conn.QueryRow(r.Context(), `SELECT id, asset_tag, serial_number, hostname, manufacturer, model,
		device_id, vendor, purchase_date, warranty_until, assigned_user_id, department_id, location, status
		FROM assets WHERE id = $1 AND deleted_at IS NULL`, id).Scan(
		&row.ID, &row.Tag, &row.Serial, &row.Hostname, &row.Mfr, &row.Model, &row.DeviceID, &row.Vendor,
		&row.PurchaseDate, &row.Warranty, &row.UserID, &row.DeptID, &row.Loc, &row.Status)
	if err != nil {
		writeNotFound(w)
		return
	}
	asset = map[string]any{"id": row.ID, "asset_tag": row.Tag, "serial_number": row.Serial,
		"hostname": row.Hostname, "manufacturer": row.Mfr, "model": row.Model, "device_id": row.DeviceID,
		"vendor": row.Vendor, "purchase_date": row.PurchaseDate, "warranty_until": row.Warranty,
		"assigned_user_id": row.UserID, "department_id": row.DeptID, "location": row.Loc, "status": row.Status}

	histRows, err := conn.Query(r.Context(), `SELECT field, old_value, new_value, occurred_at
		FROM asset_history WHERE asset_id = $1 ORDER BY occurred_at DESC LIMIT 50`, id)
	if err != nil {
		serverError(w, err)
		return
	}
	defer histRows.Close()
	history := []map[string]any{}
	for histRows.Next() {
		var field string
		var oldV, newV []byte
		var occurred time.Time
		if err := histRows.Scan(&field, &oldV, &newV, &occurred); err != nil {
			serverError(w, err)
			return
		}
		var ov, nv any
		_ = jsonUnmarshal(oldV, &ov)
		_ = jsonUnmarshal(newV, &nv)
		history = append(history, map[string]any{"field": field, "old_value": ov, "new_value": nv, "occurred_at": occurred})
	}

	writeJSON(w, http.StatusOK, map[string]any{"asset": asset, "history": history})
}

func (a *Handler) createAsset(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	var in struct {
		AssetTag    string `json:"asset_tag"`
		SerialNumber string `json:"serial_number"`
		Hostname    string `json:"hostname"`
		Manufacturer string `json:"manufacturer"`
		Model       string `json:"model"`
		Vendor      string `json:"vendor"`
		PurchaseDate string `json:"purchase_date"`
		WarrantyUntil string `json:"warranty_until"`
		Status      string `json:"status"`
	}
	if err := decodeJSON(r, &in); err != nil {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "invalid body")
		return
	}
	if in.Status == "" {
		in.Status = "procurement"
	}

	conn, err := db.TenantConn(r.Context(), a.DB, c.TenantID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer conn.Release()

	var id string
	err = conn.QueryRow(r.Context(), `INSERT INTO assets (tenant_id, asset_tag, serial_number, hostname,
		manufacturer, model, vendor, purchase_date, warranty_until, status)
		VALUES ($1, NULLIF($2,''), NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), NULLIF($6,''),
		NULLIF($7,''), NULLIF($8,'')::date, NULLIF($9,'')::date, $10) RETURNING id`,
		c.TenantID, in.AssetTag, in.SerialNumber, in.Hostname, in.Manufacturer, in.Model,
		in.Vendor, in.PurchaseDate, in.WarrantyUntil, in.Status).Scan(&id)
	if err != nil {
		serverError(w, err)
		return
	}
	a.audit(r.Context(), conn, c, "asset.created", "assets", id, nil, map[string]any{"status": in.Status})
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (a *Handler) assetTransition(w http.ResponseWriter, r *http.Request) {
	c := auth.ClaimsFrom(r.Context())
	id := r.PathValue("id")
	var in struct {
		Status string `json:"status"`
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

	var current string
	err = conn.QueryRow(r.Context(), `SELECT status FROM assets WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, id).Scan(&current)
	if err != nil {
		writeNotFound(w)
		return
	}
	if !validTransition(current, in.Status) {
		httpx.Error(w, http.StatusConflict, "conflict", "invalid lifecycle transition: "+current+" -> "+in.Status)
		return
	}

	if _, err := conn.Exec(r.Context(), `UPDATE assets SET status = $1, updated_at = now() WHERE id = $2`, in.Status, id); err != nil {
		serverError(w, err)
		return
	}
	if _, err := conn.Exec(r.Context(), `INSERT INTO asset_history (tenant_id, asset_id, field, old_value, new_value, changed_by_user_id)
		VALUES ($1, $2, 'status', to_jsonb($3::text), to_jsonb($4::text), $5)`,
		c.TenantID, id, current, in.Status, c.UserID); err != nil {
		serverError(w, err)
		return
	}
	a.audit(r.Context(), conn, c, "asset.transition", "assets", id, map[string]string{"from": current}, map[string]string{"to": in.Status})
	writeJSON(w, http.StatusOK, map[string]string{"status": in.Status})
}

func validTransition(from, to string) bool {
	if from == to {
		return true
	}
	allowed := map[string][]string{
		"procurement":  {"receiving", "retirement"},
		"receiving":    {"inventory", "retirement"},
		"inventory":    {"assignment", "retirement", "disposal"},
		"assignment":   {"active", "repair", "return", "reassignment"},
		"active":       {"repair", "return", "reassignment", "retirement"},
		"repair":       {"active", "retirement"},
		"reassignment": {"active", "assignment", "return"},
		"return":       {"inventory", "retirement", "disposal"},
		"retirement":   {"disposal"},
		"disposal":     {},
	}
	for _, t := range allowed[from] {
		if t == to {
			return true
		}
	}
	return false
}
