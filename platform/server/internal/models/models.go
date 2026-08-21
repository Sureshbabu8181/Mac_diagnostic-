package models

import "time"

type Device struct {
	ID              string     `json:"id"`
	DeviceUUID      string     `json:"device_uuid"`
	Hostname        *string    `json:"hostname"`
	OS              *string    `json:"os"`
	OSVersion       *string    `json:"os_version"`
	OSBuild         *string    `json:"os_build"`
	Manufacturer    *string    `json:"manufacturer"`
	Model           *string    `json:"model"`
	SerialNumber    *string    `json:"serial_number"`
	CPU             *string    `json:"cpu"`
	RAMMB           *int64     `json:"ram_mb"`
	StorageMB       *int64     `json:"storage_mb"`
	GPU             *string    `json:"gpu"`
	MACAddress      *string    `json:"mac_address"`
	IPAddress       *string    `json:"ip_address"`
	LastSeen        *time.Time `json:"last_seen"`
	Online          bool       `json:"online"`
	Status          string     `json:"status"`
	Tags            []string   `json:"tags"`
	DepartmentID    *string    `json:"department_id"`
	AssignedUserID  *string    `json:"assigned_user_id"`
	LocationConsent bool       `json:"location_consent"`
	EncryptionStatus *string   `json:"encryption_status"`
	BatteryHealth   *string    `json:"battery_health"`
	AgentVersion    *string    `json:"agent_version"`
	ComplianceScore *float64   `json:"compliance_score"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type Asset struct {
	ID          string     `json:"id"`
	AssetTag    *string    `json:"asset_tag"`
	SerialNumber *string   `json:"serial_number"`
	Hostname    *string    `json:"hostname"`
	Manufacturer *string   `json:"manufacturer"`
	Model       *string    `json:"model"`
	DeviceID    *string    `json:"device_id"`
	Vendor      *string    `json:"vendor"`
	PurchaseDate *string   `json:"purchase_date"`
	WarrantyUntil *string  `json:"warranty_until"`
	AssignedUserID *string `json:"assigned_user_id"`
	DepartmentID *string   `json:"department_id"`
	Location    *string    `json:"location"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
}

type Job struct {
	ID                string     `json:"id"`
	CommandID         *string    `json:"command_id"`
	PackageID         *string    `json:"package_id"`
	TargetType        string     `json:"target_type"`
	TargetIDs         []string   `json:"target_ids"`
	Status            string     `json:"status"`
	Risk              string     `json:"risk"`
	RequiresApproval  bool       `json:"requires_approval"`
	CreatedByUserID   *string    `json:"created_by_user_id"`
	ApprovedByUserID  *string    `json:"approved_by_user_id"`
	ScheduledFor      *time.Time `json:"scheduled_for"`
	ExpiresAt         *time.Time `json:"expires_at"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}
