-- Receipt display settings per business

CREATE TABLE IF NOT EXISTS receipt_settings (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(business_id)
);