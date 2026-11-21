-- Owner-defined payment methods shown on the public "scan to pay" page
-- (MTN MoMo number, MoMo Pay code, Airtel Money, bank account, other).
ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb;
