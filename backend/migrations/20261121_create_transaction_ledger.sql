-- Encrypted (AES-256-GCM) snapshots of every financial transaction event.
-- Written by services/transactionLedger.js; check with scripts/verify-ledger.js.
CREATE TABLE IF NOT EXISTS transaction_ledger (
  id BIGSERIAL PRIMARY KEY,
  business_id UUID,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event TEXT NOT NULL,
  key_version TEXT NOT NULL,
  sealed_record TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transaction_ledger_entity_idx ON transaction_ledger (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS transaction_ledger_business_idx ON transaction_ledger (business_id, created_at);
