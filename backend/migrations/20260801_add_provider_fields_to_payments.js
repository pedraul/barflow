// Migration: add provider fields to payments table
import { query } from '../config/database.js'

export async function up() {
  await query(`ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS provider VARCHAR(64),
    ADD COLUMN IF NOT EXISTS provider_txn_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS provider_status VARCHAR(64),
    ADD COLUMN IF NOT EXISTS provider_payload JSONB`)
}

export async function down() {
  await query(`ALTER TABLE payments
    DROP COLUMN IF EXISTS provider_payload,
    DROP COLUMN IF EXISTS provider_status,
    DROP COLUMN IF EXISTS provider_txn_id,
    DROP COLUMN IF EXISTS provider`)
}
