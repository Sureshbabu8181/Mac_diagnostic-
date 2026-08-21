-- 008_seed.sql — roles, permissions, super admin, command library
INSERT INTO roles (name, description, is_system) VALUES
  ('Super Admin', 'Full cross-tenant access', true),
  ('IT Admin', 'Full access within tenant', true),
  ('Helpdesk', 'Tier-1 support', true),
  ('Asset Manager', 'Asset lifecycle management', true),
  ('Security Admin', 'Policies, compliance, patch approval', true),
  ('Read Only', 'Read-only dashboards and reports', true),
  ('Auditor', 'Read-only + audit logs', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (code, description) VALUES
  ('devices:read', 'View devices'),
  ('devices:write', 'Modify devices'),
  ('devices:commands', 'Run commands on devices'),
  ('assets:read', 'View assets'),
  ('assets:write', 'Modify assets and lifecycle'),
  ('users:read', 'View users'),
  ('users:manage', 'Manage users and roles'),
  ('groups:read', 'View groups'),
  ('groups:write', 'Manage groups'),
  ('software:read', 'View software'),
  ('software:deploy', 'Deploy software'),
  ('policies:read', 'View policies'),
  ('policies:write', 'Manage policies'),
  ('jobs:read', 'View jobs'),
  ('jobs:create', 'Create jobs'),
  ('jobs:approve', 'Approve high-risk jobs'),
  ('patches:read', 'View patches'),
  ('patches:approve', 'Approve patch deployments'),
  ('compliance:read', 'View compliance'),
  ('reports:read', 'View and export reports'),
  ('audit:read', 'View audit logs'),
  ('notifications:manage', 'Manage notification channels'),
  ('admin:tenants', 'Manage tenants (Super Admin)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('devices:read','devices:write','devices:commands','assets:read','assets:write',
   'users:read','groups:read','groups:write','software:read','software:deploy',
   'policies:read','policies:write','jobs:read','jobs:create','jobs:approve',
   'patches:read','patches:approve','compliance:read','reports:read','notifications:manage')
WHERE r.name = 'IT Admin' ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('devices:read','devices:write','devices:commands','jobs:read','jobs:create',
   'compliance:read','software:read')
WHERE r.name = 'Helpdesk' ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('assets:read','assets:write','devices:read')
WHERE r.name = 'Asset Manager' ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('devices:read','devices:commands','policies:read','policies:write',
   'patches:read','patches:approve','compliance:read','reports:read')
WHERE r.name = 'Security Admin' ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('devices:read','assets:read','users:read','groups:read','software:read',
   'policies:read','jobs:read','patches:read','compliance:read','reports:read')
WHERE r.name = 'Read Only' ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('audit:read','devices:read','assets:read','jobs:read','patches:read','compliance:read')
WHERE r.name = 'Auditor' ON CONFLICT DO NOTHING;

-- Seed Super Admin organization + user (password: Demo@12345 hashed below is a placeholder;
-- run server seed command to set a real hash)
INSERT INTO organizations (name, slug, region) VALUES ('Sunrise MDM', 'sunrise', 'us-east')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (tenant_id, email, display_name, status, password_hash)
SELECT o.id, 'admin@sunrise-mdm.test', 'Sunrise Admin', 'active',
       '$2a$10$e0MYzXyjpJS7Pd0RVvHwHe1Hl9ZJc2Lzj5qo1QnQvQFf0L2Q2e4G2'
FROM organizations o WHERE o.slug = 'sunrise'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, tenant_id, scope)
SELECT u.id, r.id, u.tenant_id, 'all'
FROM users u CROSS JOIN roles r
WHERE u.email = 'admin@sunrise-mdm.test' AND r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

-- Default command library (approved commands only)
INSERT INTO commands (tenant_id, name, code, platform, category, risk, requires_approval, description)
SELECT o.id, v.name, v.code, v.platform, v.category, v.risk, v.requires_approval, v.description
FROM organizations o
CROSS JOIN (VALUES
  ('Collect Inventory', 'collect_inventory', 'macos', 'inventory', 'low', false, 'Re-run hardware/software inventory'),
  ('Collect Inventory', 'collect_inventory', 'windows', 'inventory', 'low', false, 'Re-run hardware/software inventory'),
  ('Restart', 'restart', 'macos', 'system', 'high', true, 'Restart the device'),
  ('Restart', 'restart', 'windows', 'system', 'high', true, 'Restart the device'),
  ('Shutdown', 'shutdown', 'macos', 'system', 'high', true, 'Shut down the device'),
  ('Shutdown', 'shutdown', 'windows', 'system', 'high', true, 'Shut down the device'),
  ('Lock Screen', 'lock_screen', 'macos', 'system', 'medium', false, 'Lock the screen'),
  ('Lock Screen', 'lock_screen', 'windows', 'system', 'medium', false, 'Lock the screen'),
  ('Collect Logs', 'collect_logs', 'macos', 'diagnostics', 'low', false, 'Collect system logs'),
  ('Collect Logs', 'collect_logs', 'windows', 'diagnostics', 'low', false, 'Collect system logs'),
  ('Check Updates', 'check_updates', 'macos', 'patch', 'low', false, 'Check for available OS updates'),
  ('Check Updates', 'check_updates', 'windows', 'patch', 'low', false, 'Check for available OS updates')
) AS v(name, code, platform, category, risk, requires_approval, description)
WHERE o.slug = 'sunrise' ON CONFLICT DO NOTHING;
