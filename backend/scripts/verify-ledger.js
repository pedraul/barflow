// Decrypts every sealed financial transaction and reports any that fail
// AES-256-GCM authentication (tampered, moved or sealed with another key).
//   node scripts/verify-ledger.js            -> summary
//   node scripts/verify-ledger.js --show 5   -> also print the 5 newest decrypted records
import 'dotenv/config'
import { pool } from '../config/database.js'
import { verifyLedgerEntry } from '../services/transactionLedger.js'
import { isTransactionEncryptionConfigured } from '../utils/transactionCrypto.js'

if (!isTransactionEncryptionConfigured()) {
  console.error('TRANSACTION_ENCRYPTION_KEY is not set (or invalid). Cannot verify the ledger.')
  process.exit(1)
}

const showIndex = process.argv.indexOf('--show')
const show = showIndex > -1 ? Number(process.argv[showIndex + 1]) || 5 : 0

try {
  const { rows } = await pool.query('SELECT * FROM transaction_ledger ORDER BY id DESC')
  let ok = 0
  const failed = []
  rows.forEach((entry, index) => {
    const result = verifyLedgerEntry(entry)
    if (result.ok) {
      ok++
      if (index < show) console.log(JSON.stringify({ ledgerId: entry.id, ...result.record }, null, 2))
    } else {
      failed.push({ ledgerId: entry.id, entity: `${entry.entity_type}:${entry.entity_id}`, event: entry.event, error: result.error })
    }
  })
  console.log(`Ledger entries: ${rows.length} | verified: ${ok} | FAILED: ${failed.length}`)
  failed.slice(0, 50).forEach((f) => console.log('  FAILED', f))
  process.exitCode = failed.length ? 2 : 0
} catch (error) {
  console.error(error.message.includes('does not exist') ? 'No ledger yet (no transactions sealed).' : error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
