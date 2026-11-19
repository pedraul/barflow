-- Staff shifts: every non-owner role clocks in/out so owners and managers
-- can track attendance and per-worker performance.
CREATE TABLE IF NOT EXISTS staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  start_note TEXT,
  end_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- A user can only have one open shift at a time.
CREATE UNIQUE INDEX IF NOT EXISTS staff_shifts_one_open_per_user
  ON staff_shifts (user_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_shifts_business_started_idx
  ON staff_shifts (business_id, started_at DESC);

CREATE INDEX IF NOT EXISTS staff_shifts_branch_started_idx
  ON staff_shifts (branch_id, started_at DESC);
