ALTER TABLE platform_payments
  ADD COLUMN IF NOT EXISTS provider_txn_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(64),
  ADD COLUMN IF NOT EXISTS provider_payload JSONB;

CREATE INDEX IF NOT EXISTS platform_payments_pending_business_idx
  ON platform_payments (business_id, created_at DESC)
  WHERE status = 'pending';
