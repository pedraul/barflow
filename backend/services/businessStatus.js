// Business account status: suspension, deactivation and permanent deletion.
//
// Statuses
//   suspended                 - blocked by the platform admin (policy, payment dispute, ...). Nobody can sign in.
//   deactivated by 'platform' - closed by the platform admin (business closed, inactive, ...). Nobody can sign in.
//   deactivated by 'owner'    - paused by the owner. Staff cannot sign in; the owner can, to reactivate it.
import { query, pool } from '../config/database.js'

// Embedded (not a .sql file) because serverless bundles do not ship migration files.
const SCHEMA_SQL = `
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS is_deactivated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deactivated_by TEXT,
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
`

let ready = null
export function ensureBusinessStatusSchema() {
  if (!ready) {
    ready = pool.query(SCHEMA_SQL).then(() => true).catch((error) => {
      ready = null
      console.error('[business-status] schema setup failed:', error.message)
      throw error
    })
  }
  return ready
}

/**
 * Why this user may not use the business right now, or null when access is allowed.
 * `business` needs is_suspended, is_deactivated, deactivated_by and status_reason.
 */
export function businessAccessBlock(business, role) {
  if (!business) return null
  const reason = String(business.status_reason || '').trim()
  const withReason = (text) => (reason ? `${text} Reason: ${reason}` : text)
  if (business.is_suspended) {
    return {
      status: 403,
      code: 'BUSINESS_SUSPENDED',
      error: withReason('Your business account has been suspended by the platform administrator. Contact support.'),
      reason,
    }
  }
  if (business.is_deactivated) {
    const byOwner = business.deactivated_by === 'owner'
    if (byOwner && String(role || '').toLowerCase() === 'owner') return null
    return {
      status: 403,
      code: 'BUSINESS_DEACTIVATED',
      error: byOwner
        ? 'This business has been paused by its owner. Contact your business owner.'
        : withReason('This business account has been deactivated by the platform administrator. Contact support.'),
      reason,
    }
  }
  return null
}

export async function loadBusinessStatus(businessId) {
  await ensureBusinessStatusSchema().catch(() => {})
  const { rows } = await query(
    `SELECT id, name, is_verified, is_suspended,
            COALESCE(is_deactivated, FALSE) AS is_deactivated, deactivated_by, status_reason, status_changed_at
     FROM businesses WHERE id = $1`,
    [businessId]
  )
  return rows[0] || null
}

/** Describes a business's status for the owner and the platform admin. */
export function describeStatus(b) {
  if (!b) return null
  return {
    state: b.is_suspended ? 'suspended' : b.is_deactivated ? 'deactivated' : 'active',
    deactivatedBy: b.is_deactivated ? (b.deactivated_by || 'platform') : null,
    reason: b.status_reason || '',
    changedAt: b.status_changed_at || null,
  }
}

/**
 * Permanently deletes a business and every row that belongs to it, in one transaction.
 * Rows are removed in whatever order the foreign keys allow: each pass deletes what it can
 * (inside a savepoint) and the rest is retried, so no table list has to be kept in sync.
 */
export async function deleteBusinessCompletely(businessId, { dryRun = false } = {}) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: biz } = await client.query('SELECT id, name FROM businesses WHERE id = $1 FOR UPDATE', [businessId])
    if (!biz.length) {
      await client.query('ROLLBACK')
      return null
    }

    const { rows: tableRows } = await client.query(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'business_id' AND table_name <> 'businesses'`
    )
    const businessTables = new Set(tableRows.map((r) => r.table_name))

    // Foreign keys from tables WITHOUT business_id into business tables (order_items, shifts, ...):
    // their rows are removed through the parent rows they point to.
    const { rows: fks } = await client.query(
      `SELECT tc.table_name AS child, kcu.column_name AS col, ccu.table_name AS parent, ccu.column_name AS parent_col
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`
    )

    const ident = (name) => `"${String(name).replace(/"/g, '""')}"`
    const steps = []
    for (const fk of fks) {
      if (businessTables.has(fk.child) || fk.child === 'businesses') continue
      if (!businessTables.has(fk.parent)) continue
      steps.push({
        label: `${fk.child} (via ${fk.parent})`,
        sql: `DELETE FROM ${ident(fk.child)} WHERE ${ident(fk.col)} IN (SELECT ${ident(fk.parent_col)} FROM ${ident(fk.parent)} WHERE business_id::text = $1::text)`,
      })
    }
    for (const table of businessTables) {
      steps.push({ label: table, sql: `DELETE FROM ${ident(table)} WHERE business_id::text = $1::text` })
    }

    let pending = steps
    let lastError = null
    for (let pass = 0; pending.length && pass < steps.length + 2; pass += 1) {
      const failed = []
      for (const step of pending) {
        await client.query('SAVEPOINT del_step')
        try {
          await client.query(step.sql, [businessId])
          await client.query('RELEASE SAVEPOINT del_step')
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT del_step')
          lastError = `${step.label}: ${error.message}`
          failed.push(step)
        }
      }
      if (failed.length === pending.length) break // no progress
      pending = failed
    }
    if (pending.length) throw new Error(`Could not remove all business data (${lastError}).`)

    await client.query('DELETE FROM businesses WHERE id = $1', [businessId])
    // dryRun: everything above ran, then is undone (used to check a deletion would succeed).
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT')
    return { id: biz[0].id, name: biz[0].name }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
