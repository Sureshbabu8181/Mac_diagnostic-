-- 005_jobs.sql — commands, jobs, agents, tokens
CREATE TABLE commands (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  code               TEXT NOT NULL,
  platform           TEXT NOT NULL,
  category           TEXT,
  risk               TEXT NOT NULL DEFAULT 'low',
  args_schema        JSONB NOT NULL DEFAULT '{}',
  timeout_seconds    INT NOT NULL DEFAULT 600,
  max_retries        INT NOT NULL DEFAULT 3,
  requires_approval  BOOLEAN NOT NULL DEFAULT false,
  approved_for_roles JSONB NOT NULL DEFAULT '[]',
  description        TEXT,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  command_id        UUID REFERENCES commands(id),
  package_id        UUID REFERENCES packages(id),
  target_type       TEXT NOT NULL,
  target_ids        JSONB NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'pending',
  risk              TEXT NOT NULL DEFAULT 'low',
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id UUID REFERENCES users(id),
  approved_by_user_id UUID REFERENCES users(id),
  confirmation_payload JSONB,
  scheduled_for     TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_targets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  device_id    UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMPTZ,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (job_id, device_id)
);

CREATE TABLE command_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_target_id UUID NOT NULL REFERENCES job_targets(id) ON DELETE CASCADE,
  device_id    UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  exit_code    INT,
  stdout       TEXT,
  stderr       TEXT,
  error        TEXT,
  duration_ms  BIGINT,
  attempt      INT NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'running',
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_target_id, attempt)
);

CREATE TABLE agents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id    UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  version      TEXT,
  os           TEXT,
  arch         TEXT,
  installed_at TIMESTAMPTZ,
  last_seen    TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'healthy',
  update_state TEXT
);

CREATE TABLE agent_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version     TEXT NOT NULL,
  platform    TEXT NOT NULL,
  arch        TEXT NOT NULL,
  file_key    TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  signature   TEXT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ring        TEXT NOT NULL DEFAULT 'it',
  active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  purpose     TEXT NOT NULL DEFAULT 'session'
);

CREATE TABLE enrollment_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash        TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id),
  expires_at        TIMESTAMPTZ NOT NULL,
  max_uses          INT,
  used_count        INT NOT NULL DEFAULT 0,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY cmd_tenant ON commands USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY job_tenant ON jobs USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY jt_tenant ON job_targets USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY cr_tenant ON command_results USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY ag_tenant ON agents USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY dt_tenant ON device_tokens USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY et_tenant ON enrollment_tokens USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
