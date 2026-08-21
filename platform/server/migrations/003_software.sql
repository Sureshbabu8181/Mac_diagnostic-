-- 003_software.sql — software inventory & deployment
CREATE TABLE software (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  publisher   TEXT,
  category    TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE software_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  software_id  UUID NOT NULL REFERENCES software(id) ON DELETE CASCADE,
  version      TEXT NOT NULL,
  release_date DATE,
  is_latest    BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE device_software (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id    UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  software_id  UUID NOT NULL REFERENCES software(id),
  version      TEXT,
  install_path TEXT,
  package_id   TEXT,
  publisher    TEXT,
  install_date DATE,
  detected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX device_software_device ON device_software (tenant_id, device_id);

CREATE TABLE software_usage (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id      UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  software_id    UUID NOT NULL REFERENCES software(id),
  user_id        UUID REFERENCES users(id),
  launches       BIGINT NOT NULL DEFAULT 0,
  active_seconds BIGINT NOT NULL DEFAULT 0,
  day            DATE NOT NULL,
  UNIQUE (device_id, software_id, user_id, day)
);

CREATE TABLE packages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  software_id       UUID REFERENCES software(id),
  platform          TEXT NOT NULL,
  file_key          TEXT NOT NULL,
  sha256            TEXT NOT NULL,
  size_bytes        BIGINT,
  signature         TEXT,
  install_command   TEXT,
  uninstall_command TEXT,
  detection_rule    JSONB NOT NULL DEFAULT '{}',
  deployment_type   TEXT NOT NULL DEFAULT 'optional',
  version           TEXT,
  reboot_required   BOOLEAN NOT NULL DEFAULT false,
  source            TEXT NOT NULL DEFAULT 'admin_upload',
  status            TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE deployments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  package_id          UUID NOT NULL REFERENCES packages(id),
  ring                TEXT NOT NULL DEFAULT 'production',
  status              TEXT NOT NULL DEFAULT 'pending',
  created_by_user_id  UUID REFERENCES users(id),
  approved_by_user_id UUID REFERENCES users(id),
  scheduled_for       TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE deployment_targets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  device_id     UUID REFERENCES devices(id),
  group_id      UUID REFERENCES device_groups(id),
  status        TEXT NOT NULL DEFAULT 'pending',
  result        JSONB
);

ALTER TABLE software ENABLE ROW LEVEL SECURITY;
ALTER TABLE software_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_software ENABLE ROW LEVEL SECURITY;
ALTER TABLE software_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY s_tenant ON software USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY sv_tenant ON software_versions USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY ds_tenant ON device_software USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY su_tenant ON software_usage USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY p_tenant ON packages USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY dep_tenant ON deployments USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY dept_tenant ON deployment_targets USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
