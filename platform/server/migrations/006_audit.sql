-- 006_audit.sql — audit, notifications, api keys
CREATE TABLE audit_logs (
  id           UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id),
  device_id    UUID REFERENCES devices(id),
  actor_type   TEXT NOT NULL DEFAULT 'admin',
  action       TEXT NOT NULL,
  resource_type TEXT,
  resource_id  TEXT,
  before       JSONB,
  after        JSONB,
  ip           TEXT,
  user_agent   TEXT,
  request_id   TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  channel      TEXT NOT NULL,
  targets      JSONB NOT NULL DEFAULT '[]',
  payload      JSONB,
  status       TEXT NOT NULL DEFAULT 'pending',
  sent_at      TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  key_hash          TEXT NOT NULL,
  prefix            TEXT NOT NULL,
  scopes            JSONB NOT NULL DEFAULT '[]',
  created_by_user_id UUID REFERENCES users(id),
  expires_at        TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  last_used_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_tenant ON audit_logs USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY notif_tenant ON notifications USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY akey_tenant ON api_keys USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX audit_logs_tenant_time ON audit_logs (tenant_id, occurred_at DESC);
