import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

// Database connection encryption (TLS).
// - If DATABASE_URL sets sslmode (e.g. ?sslmode=require), pg follows it.
// - DB_SSL=true turns TLS on for a database that supports it;
//   DB_SSL_STRICT=true also verifies the server certificate.
// TLS is never forced otherwise: a database without TLS support would refuse
// every connection and take the whole API down.
function sslConfig(connectionString) {
  try {
    const url = new URL(connectionString)
    if (url.searchParams.has('sslmode')) return undefined
  } catch {
    return undefined
  }
  if (String(process.env.DB_SSL).toLowerCase() !== 'true') return undefined
  return { rejectUnauthorized: String(process.env.DB_SSL_STRICT).toLowerCase() === 'true' }
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(process.env.DATABASE_URL),
})

// Loaded lazily to avoid a circular import (the ledger uses the pool).
let ledgerModule = null
async function sealFinancialWrite(text, result) {
  if (!/^\s*(INSERT\s+INTO|UPDATE)\s+(payments|platform_payments|salary_payments|withdrawals|transfers|refunds)\b/i.test(String(text || ''))) return
  try {
    ledgerModule = ledgerModule || await import('../services/transactionLedger.js')
    await ledgerModule.sealAfterQuery(text, result)
  } catch (error) {
    console.error('[ledger] sealing hook failed:', error.message)
  }
}

export async function query(text, params = []) {
  const result = await pool.query(text, params)
  // Every financial write is sealed with AES-256-GCM into transaction_ledger.
  await sealFinancialWrite(text, result)
  return result
}

export { pool }
export default pool
