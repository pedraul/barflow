-- Scope accountant records to their business/branch (they were shared by every
-- business) and record how system transactions are matched to bank statement lines.
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
