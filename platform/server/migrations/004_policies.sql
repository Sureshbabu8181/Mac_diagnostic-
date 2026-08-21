-- 004_policies.sql — policies, compliance, maintenance windows
CREATE TABLE policies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  type              TEXT NOT NULL,
  config            JSONB NOT NULL DEFAULT '{}',
  precedence        INT NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE policy_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_id   UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compliance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  policy_id   UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  details     JSONB,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, policy_id)
);

CREATE TABLE compliance_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  snapshot    JSONB NOT NULL DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_windows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'global',
  target_id   UUID,
  days        JSONB NOT NULL DEFAULT '[]',
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY pol_tenant ON policies USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY pa_tenant ON policy_assignments USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY comp_tenant ON compliance USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY cs_tenant ON compliance_snapshots USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY mw_tenant ON maintenance_windows USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
