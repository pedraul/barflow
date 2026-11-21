// Makes sure the accountant tables exist and carry business/branch columns.
// Same idempotent SQL as migrations 20261121_scope_accounting_records.sql and
// 20261122_create_expenses_and_documents.sql, embedded here (not read from
// disk) because serverless bundles such as Vercel's do not ship the .sql files.
import { pool } from '../config/database.js'

const SCOPE_ACCOUNTING_RECORDS = `
ALTER TABLE reconciliations
  ADD COLUMN IF NOT EXISTS business_id UUID,
  ADD COLUMN IF NOT EXISTS branch_id UUID,
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS matched_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS business_id UUID,
  ADD COLUMN IF NOT EXISTS branch_id UUID;

ALTER TABLE bank_statements
  ADD COLUMN IF NOT EXISTS business_id UUID,
  ADD COLUMN IF NOT EXISTS branch_id UUID;

ALTER TABLE bank_statement_transactions
  ADD COLUMN IF NOT EXISTS business_id UUID,
  ADD COLUMN IF NOT EXISTS branch_id UUID,
  ADD COLUMN IF NOT EXISTS bank_account TEXT;

ALTER TABLE adjustments
  ADD COLUMN IF NOT EXISTS business_id UUID,
  ADD COLUMN IF NOT EXISTS branch_id UUID,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT;

CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id BIGSERIAL PRIMARY KEY,
  business_id UUID NOT NULL,
  branch_id UUID,
  entry_type TEXT NOT NULL,
  entry_id UUID NOT NULL,
  statement_line_id UUID,
  matched_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_type, entry_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_matches_line_idx
  ON reconciliation_matches (statement_line_id) WHERE statement_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reconciliations_business_idx ON reconciliations (business_id, created_at);
CREATE INDEX IF NOT EXISTS reports_business_idx ON reports (business_id, created_at);
CREATE INDEX IF NOT EXISTS bank_statement_transactions_business_idx ON bank_statement_transactions (business_id, branch_id);
CREATE INDEX IF NOT EXISTS adjustments_business_idx ON adjustments (business_id, branch_id);
`

const EXPENSES_AND_DOCUMENTS = `
CREATE TABLE IF NOT EXISTS accounting_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  branch_id UUID,
  category TEXT NOT NULL DEFAULT 'Other',
  description TEXT,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content BYTEA NOT NULL,
  processed_as TEXT,
  processed_count INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS accounting_documents_business_idx ON accounting_documents (business_id, branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  branch_id UUID,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  account TEXT NOT NULL DEFAULT 'Cash Till',
  vendor TEXT,
  reference TEXT,
  document_id UUID REFERENCES accounting_documents(id) ON DELETE SET NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS expenses_business_idx ON expenses (business_id, branch_id, expense_date DESC);
`

// Transfers need the payout columns (also migration 20261026_add_outbound_payout_provider_fields.sql).
const TRANSFER_PAYOUT_COLUMNS = `
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS payout_method VARCHAR(32),
  ADD COLUMN IF NOT EXISTS payout_reference VARCHAR(128),
  ADD COLUMN IF NOT EXISTS provider_txn_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(64),
  ADD COLUMN IF NOT EXISTS provider_payload JSONB,
  ADD COLUMN IF NOT EXISTS payout_requested_at TIMESTAMPTZ;
`

let ready = null

export function ensureAccountingSchema() {
  if (!ready) {
    ready = (async () => {
      for (const sql of [SCOPE_ACCOUNTING_RECORDS, EXPENSES_AND_DOCUMENTS, TRANSFER_PAYOUT_COLUMNS]) {
        await pool.query(sql)
      }
    })().catch((error) => {
      ready = null
      console.error('[accounting] schema setup failed:', error.message)
      throw error
    })
  }
  return ready
}

export default ensureAccountingSchema
