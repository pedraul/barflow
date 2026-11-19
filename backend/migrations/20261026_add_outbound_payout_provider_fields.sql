ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS payout_method VARCHAR(32),
  ADD COLUMN IF NOT EXISTS payout_reference VARCHAR(128),
  ADD COLUMN IF NOT EXISTS provider_txn_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(64),
  ADD COLUMN IF NOT EXISTS provider_payload JSONB,
  ADD COLUMN IF NOT EXISTS payout_requested_at TIMESTAMPTZ;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS payout_method VARCHAR(32),
  ADD COLUMN IF NOT EXISTS payout_reference VARCHAR(128),
  ADD COLUMN IF NOT EXISTS provider_txn_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(64),
  ADD COLUMN IF NOT EXISTS provider_payload JSONB,
  ADD COLUMN IF NOT EXISTS payout_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS withdrawals_processing_payouts_idx
  ON withdrawals (business_id, branch_id, payout_requested_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS transfers_processing_payouts_idx
  ON transfers (business_id, branch_id, payout_requested_at)
  WHERE status = 'processing';
