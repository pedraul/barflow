-- Documents uploaded by the accountant (receipts, invoices, statements, contracts...).
-- Files are kept in the database so they survive serverless deploys.
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

-- Business expenses recorded by the accountant (rent, utilities, supplies...).
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
