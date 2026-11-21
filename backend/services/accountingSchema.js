// Makes sure the accountant tables exist and carry business/branch columns.
// Runs the same idempotent SQL as the accountant migrations, once per process,
// so the accountant pages work even where those migrations were not applied.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../config/database.js'

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FILES = [
  '20261121_scope_accounting_records.sql',
  '20261122_create_expenses_and_documents.sql',
]

let ready = null

export function ensureAccountingSchema() {
  if (!ready) {
    ready = (async () => {
      for (const file of FILES) {
        await pool.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
      }
    })().catch((error) => {
      ready = null
      throw error
    })
  }
  return ready
}

export default ensureAccountingSchema
