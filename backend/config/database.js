import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

// Encrypt the connection to the database (TLS) whenever it is not on this machine.
// - If DATABASE_URL already sets sslmode, pg follows it.
// - DB_SSL=false turns TLS off (only for databases that don't support it).
// - DB_SSL_STRICT=true also verifies the server certificate.
function sslConfig(connectionString) {
  if (String(process.env.DB_SSL).toLowerCase() === 'false') return false
  try {
    const url = new URL(connectionString)
    if (url.searchParams.has('sslmode')) return undefined
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    if (isLocal) return false
    return { rejectUnauthorized: String(process.env.DB_SSL_STRICT).toLowerCase() === 'true' }
  } catch {
    return undefined
  }
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
