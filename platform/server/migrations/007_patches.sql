-- 007_patches.sql — patch management module
CREATE TABLE patches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source             TEXT NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT,
  severity           TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT 'os',
  kb_number          TEXT,
  cve_ids            JSONB NOT NULL DEFAULT '[]',
  release_date       DATE,
  target_os          TEXT,
  reboot_required    BOOLEAN NOT NULL DEFAULT false,
  supersedes         JSONB NOT NULL DEFAULT '[]',
  superseded_by      JSONB NOT NULL DEFAULT '[]',
  rollback_supported BOOLEAN NOT NULL DEFAULT false,
  rollback_method    JSONB,
  download_url       TEXT,
  install_method     JSONB NOT NULL DEFAULT '{}',
  detection_rule     JSONB NOT NULL DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'discovered',
  risk_score         NUMERIC(5,2),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patch_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patch_id       UUID NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  version        TEXT NOT NULL,
  build          TEXT,
  available_from TEXT,
  is_installed   BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE patch_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patch_id        UUID NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  product         TEXT NOT NULL,
  product_version TEXT
);

CREATE TABLE patch_cves (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patch_id      UUID NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  cve_id        TEXT NOT NULL,
  cvss_score    NUMERIC(4,1),
  severity      TEXT,
  description   TEXT,
  fixed_version TEXT
);

CREATE TABLE patch_packages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patch_id          UUID NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  package_id        UUID REFERENCES packages(id),
  file_key          TEXT,
  sha256            TEXT,
  signature         TEXT,
  install_command   TEXT,
  uninstall_command TEXT,
  reboot_required   BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE patch_policies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  severity          TEXT NOT NULL,
  approval          TEXT NOT NULL DEFAULT 'manual',
  rings             JSONB NOT NULL DEFAULT '[]',
  delay_hours       INT NOT NULL DEFAULT 0,
  maintenance_window_id UUID REFERENCES maintenance_windows(id),
  max_retries       INT NOT NULL DEFAULT 3,
  force_reboot      BOOLEAN NOT NULL DEFAULT false,
  user_notification JSONB NOT NULL DEFAULT '{}',
  target_type       TEXT NOT NULL DEFAULT 'org',
  target_id         UUID,
  auto_approve_rules JSONB NOT NULL DEFAULT '{}',
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patch_deployments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patch_id            UUID NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  policy_id           UUID REFERENCES patch_policies(id),
  ring                TEXT NOT NULL DEFAULT 'pilot',
  status              TEXT NOT NULL DEFAULT 'scheduled',
  created_by_user_id  UUID REFERENCES users(id),
  approved_by_user_id UUID REFERENCES users(id),
  scheduled_for       TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  promoted_to         TEXT
);

CREATE TABLE patch_deployment_targets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deployment_id UUID NOT NULL REFERENCES patch_deployments(id) ON DELETE CASCADE,
  device_id     UUID REFERENCES devices(id),
  group_id      UUID REFERENCES device_groups(id),
  status        TEXT NOT NULL DEFAULT 'pending',
  result        JSONB
);

CREATE TABLE patch_results (
  id                 UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patch_id           UUID NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  deployment_id      UUID REFERENCES patch_deployments(id),
  device_id          UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status             TEXT NOT NULL,
  exit_code          INT,
  logs               TEXT,
  failure_reason     TEXT,
  recommended_action TEXT,
  attempts           INT NOT NULL DEFAULT 1,
  reboot_status      TEXT,
  captured_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, captured_at)
) PARTITION BY RANGE (captured_at);

CREATE TABLE patch_results_default PARTITION OF patch_results DEFAULT;

CREATE TABLE patch_exclusions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patch_id            UUID NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  device_id           UUID REFERENCES devices(id),
  group_id            UUID REFERENCES device_groups(id),
  reason              TEXT NOT NULL,
  requested_by_user_id UUID REFERENCES users(id),
  approved_by_user_id UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL
);

CREATE TABLE patch_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patch_id        UUID NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  deployment_id   UUID REFERENCES patch_deployments(id),
  action          TEXT NOT NULL,
  approver_user_id UUID REFERENCES users(id),
  notes           TEXT,
  decided_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patch_reboots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id          UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  patch_id           UUID REFERENCES patches(id),
  deployment_id      UUID REFERENCES patch_deployments(id),
  status             TEXT NOT NULL DEFAULT 'required',
  deadline           TIMESTAMPTZ,
  deferred_by_user_id UUID REFERENCES users(id),
  notified_at        TIMESTAMPTZ,
  forced_at          TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ
);

ALTER TABLE patches ENABLE ROW LEVEL SECURITY;
ALTER TABLE patch_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patch_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE patch_cves ENABLE ROW LEVEL SECURITY;
ALTER TABLE patch_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE patch_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE patch_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE patch_deployment_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE patch_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE patch_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patch_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE patch_reboots ENABLE ROW LEVEL SECURITY;

CREATE POLICY pat_tenant ON patches USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY pv_tenant ON patch_versions USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY ppr_tenant ON patch_products USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY pc_tenant ON patch_cves USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY ppk_tenant ON patch_packages USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY ppol_tenant ON patch_policies USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY pd_tenant ON patch_deployments USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY pdt_tenant ON patch_deployment_targets USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY pr_tenant ON patch_results USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY pe_tenant ON patch_exclusions USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY pap_tenant ON patch_approvals USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY preb_tenant ON patch_reboots USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX patches_tenant_severity ON patches (tenant_id, severity);
CREATE INDEX patch_results_tenant_time ON patch_results (tenant_id, captured_at DESC);
