import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { query } from '../config/database.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(__dirname, '../migrations')

export async function migrate() {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  )

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const { rows } = await query('SELECT filename FROM schema_migrations WHERE filename = $1', [file])
    if (rows.length) continue

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    await query(sql)
    await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
    console.log(`Applied migration: ${file}`)
  }
}
