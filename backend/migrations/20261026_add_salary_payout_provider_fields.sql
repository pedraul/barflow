ALTER TABLE salary_payments
  ADD COLUMN IF NOT EXISTS payout_reference VARCHAR(128),
  ADD COLUMN IF NOT EXISTS provider_txn_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(64),
  ADD COLUMN IF NOT EXISTS provider_payload JSONB,
  ADD COLUMN IF NOT EXISTS payout_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS salary_payments_processing_payouts_idx
  ON salary_payments (business_id, branch_id, payout_requested_at)
  WHERE status = 'processing';
