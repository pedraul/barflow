import { query } from './config/database.js'

const stmts = [
  `CREATE TABLE IF NOT EXISTS withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    purpose TEXT NOT NULL,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    initiated_by UUID NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'pending', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    from_user UUID NOT NULL REFERENCES users(id),
    to_user UUID REFERENCES users(id),
    to_phone TEXT,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    description TEXT,
    manager_approval INTEGER NOT NULL DEFAULT 0 CHECK(manager_approval IN (0, 1)),
    manager_approved_by UUID REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS revenue_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('received', 'stock_ordered', 'stock_sold')),
    description TEXT,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    reference_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
]

for (const sql of stmts) {
  try {
    await query(sql)
    console.log('OK:', sql.slice(0, 50).replace(/\s+/g, ' '))
  } catch (e) {
    console.log('ERR:', sql.slice(0, 50).replace(/\s+/g, ' '), '->', e.message)
  }
}
console.log('DONE')
