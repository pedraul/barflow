-- Per-worker access grants, managed by the business owner.
CREATE TABLE IF NOT EXISTS user_permissions (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS user_permissions_business_idx ON user_permissions (business_id);
