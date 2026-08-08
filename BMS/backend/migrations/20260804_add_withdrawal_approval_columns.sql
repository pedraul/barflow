-- Add approval tracking columns to withdrawals for manager approval workflow

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
