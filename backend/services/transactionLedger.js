// Encrypted ledger of financial transactions.
//
// Every time a payment, subscription payment, salary payment, withdrawal,
// transfer or refund is created or changes, a full snapshot of the row is
// encrypted with AES-256-GCM (utils/transactionCrypto.js) and appended here.
// The sealed record is bound to its table, row id and event, so it cannot be
// altered or moved without decryption failing (see scripts/verify-ledger.js).
import { pool } from '../config/database.js'
import { encryptRecord, decryptRecord, SEAL_VERSION } from '../utils/transactionCrypto.js'

export const FINANCIAL_TABLES = ['payments', 'platform_payments', 'salary_payments', 'withdrawals', 'transfers', 'refunds']

// Uses pool.query directly (not the wrapped query) so sealing never re-triggers itself.
let ledgerReady = null
function ensureLedgerTable() {
  if (!ledgerReady) {
    ledgerReady = pool.query(`
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
    `).catch((error) => {
      ledgerReady = null
      throw error
    })
  }
  return ledgerReady
}

export const ledgerContext = (entityType, entityId, event) => `barflow-ledger:${entityType}:${entityId}:${event}`

/**
 * Seals the current state of a financial row. Never throws: a sealing
 * problem is logged but must not break the payment that just happened.
 */
export async function sealTransaction(table, id, event = 'updated') {
  if (!FINANCIAL_TABLES.includes(table) || id == null) return false
  try {
    const { rows } = await pool.query(`SELECT row_to_json(t) AS row FROM ${table} t WHERE t.id = $1`, [id])
    const row = rows[0]?.row
    if (!row) return false
    const status = row.status || row.provider_status || ''
    const eventName = event === 'created' ? 'created' : `updated${status ? `:${String(status).toLowerCase()}` : ''}`
    const entityId = String(id)
    const sealed = encryptRecord(
      { table, id: entityId, event: eventName, sealedAt: new Date().toISOString(), row },
      ledgerContext(table, entityId, eventName)
    )
    if (!sealed) return false // no key configured (warned once in transactionCrypto)
    await ensureLedgerTable()
    await pool.query(
      `INSERT INTO transaction_ledger (business_id, entity_type, entity_id, event, key_version, sealed_record)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.business_id || null, table, entityId, eventName, SEAL_VERSION, sealed]
    )
    return true
  } catch (error) {
    console.error(`[ledger] Failed to seal ${table} ${id}:`, error.message)
    return false
  }
}

/** Seals a row found by another unique column (e.g. a payment reference). */
export async function sealTransactionBy(table, column, value, event = 'updated') {
  if (!FINANCIAL_TABLES.includes(table) || !['id', 'reference'].includes(column) || value == null) return false
  try {
    const { rows } = await pool.query(`SELECT id FROM ${table} WHERE ${column} = $1 LIMIT 1`, [value])
    return rows[0] ? sealTransaction(table, rows[0].id, event) : false
  } catch (error) {
    console.error(`[ledger] Failed to find ${table} by ${column}:`, error.message)
    return false
  }
}

/** Decrypts and checks one ledger row. Returns { ok, record | error }. */
export function verifyLedgerEntry(entry) {
  try {
    const record = decryptRecord(entry.sealed_record, ledgerContext(entry.entity_type, entry.entity_id, entry.event))
    return { ok: true, record }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

// Detects INSERT/UPDATE statements on financial tables (used by the query wrapper).
const FINANCIAL_WRITE_RE = new RegExp(`^\\s*(INSERT\\s+INTO|UPDATE)\\s+(${FINANCIAL_TABLES.join('|')})\\b`, 'i')

export async function sealAfterQuery(text, result) {
  const match = FINANCIAL_WRITE_RE.exec(String(text || ''))
  if (!match || !result?.rows?.length) return
  const table = match[2].toLowerCase()
  const event = /^\s*INSERT/i.test(match[1]) ? 'created' : 'updated'
  const ids = [...new Set(result.rows.map((r) => r?.id).filter((v) => v != null))]
  for (const id of ids) {
    await sealTransaction(table, id, event)
  }
}
