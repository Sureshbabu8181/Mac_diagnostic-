-- 002_devices.sql — devices, assets, groups, tracking
CREATE TABLE devices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_uuid      TEXT NOT NULL,
  asset_id         UUID,
  hostname         TEXT,
  os               TEXT,
  os_version       TEXT,
  os_build         TEXT,
  kernel           TEXT,
  manufacturer     TEXT,
  model            TEXT,
  serial_number    TEXT,
  cpu              TEXT,
  ram_mb           BIGINT,
  storage_mb       BIGINT,
  gpu              TEXT,
  mac_address      TEXT,
  ip_address       TEXT,
  last_seen        TIMESTAMPTZ,
  online           BOOLEAN NOT NULL DEFAULT false,
  first_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  enrolled_at      TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'pending',
  tags             JSONB NOT NULL DEFAULT '[]',
  department_id    UUID REFERENCES departments(id),
  assigned_user_id UUID REFERENCES users(id),
  location         TEXT,
  location_consent BOOLEAN NOT NULL DEFAULT false,
  encryption_status TEXT,
  battery_health   TEXT,
  agent_version    TEXT,
  compliance_score NUMERIC(5,2),
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, serial_number),
  UNIQUE (tenant_id, device_uuid)
);

CREATE TABLE device_network (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  iface       TEXT,
  ipv4        TEXT,
  ipv6        TEXT,
  mac         TEXT,
  ssid        TEXT,
  gateway     TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE device_login_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  username    TEXT,
  event_type  TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE device_location_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id         UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  lat               DOUBLE PRECISION,
  lon               DOUBLE PRECISION,
  source            TEXT,
  consent_verified  BOOLEAN NOT NULL DEFAULT false,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX device_location_events_captured ON device_location_events (captured_at);

CREATE TABLE assets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_tag        TEXT,
  serial_number    TEXT,
  hostname         TEXT,
  manufacturer     TEXT,
  model            TEXT,
  device_id        UUID REFERENCES devices(id),
  vendor           TEXT,
  purchase_date    DATE,
  warranty_until   DATE,
  assigned_user_id UUID REFERENCES users(id),
  department_id    UUID REFERENCES departments(id),
  location         TEXT,
  status           TEXT NOT NULL DEFAULT 'procured',
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE asset_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id          UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  field             TEXT NOT NULL,
  old_value         JSONB,
  new_value         JSONB,
  changed_by_user_id UUID REFERENCES users(id),
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE device_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  kind        TEXT NOT NULL DEFAULT 'static',
  parent_id   UUID REFERENCES device_groups(id),
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE device_group_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  group_id  UUID NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  UNIQUE (group_id, device_id)
);

CREATE TABLE device_group_rules (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  group_id  UUID NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  operator  TEXT NOT NULL DEFAULT 'eq',
  value     JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE tags (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  color     TEXT,
  UNIQUE (tenant_id, name)
);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_network ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_login_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_location_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_group_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY d_tenant ON devices USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY dn_tenant ON device_network USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY dle_tenant ON device_login_events USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY dloc_tenant ON device_location_events USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY a_tenant ON assets USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY ah_tenant ON asset_history USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY dg_tenant ON device_groups USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY dgm_tenant ON device_group_members USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY dgr_tenant ON device_group_rules USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY t_tenant ON tags USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX devices_tenant_status ON devices (tenant_id, status);
CREATE INDEX devices_tenant_os ON devices (tenant_id, os);
CREATE INDEX devices_hostname ON devices (hostname);
