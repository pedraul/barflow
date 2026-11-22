// Platform housekeeping that runs once a day:
//   - ends subscriptions whose period is over and emails the owner (once)
//   - emails a renewal reminder N days before the end (Settings → Subscription), once per period
//   - removes audit logs older than the retention period (Settings → Audit)
//   - makes automatic database backups and removes old ones (Settings → Backup)
// On a normal server it is checked every hour; on Vercel, the cron in vercel.json calls
// /api/internal/cron/daily. A database lock makes sure only one copy runs at a time.
import fs from 'fs'
import { query, pool } from '../config/database.js'
import { settingBool, settingNumber, settingText } from './platformSettings.js'
import { sendExpiryReminder, sendSubscriptionExpired } from './emailNotificationService.js'
import { forgetSubscriptionAccess } from './subscriptionAccess.js'
import { createBackup } from '../utils/backup.js'

const LOCK_ID = 74251301
const SCHEMA_SQL = `
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE platform_backups ADD COLUMN IF NOT EXISTS file_path TEXT;
`

async function ownerContact(businessId) {
  const { rows } = await query(
    `SELECT b.name AS business_name, b.contact_email, u.full_name AS owner_name, u.email AS owner_email
     FROM businesses b
     LEFT JOIN users u ON u.business_id = b.id AND u.role = 'owner'
     WHERE b.id = $1 LIMIT 1`,
    [businessId]
  )
  return rows[0] || null
}

export async function expireSubscriptions() {
  const { rows: expired } = await query(
    `UPDATE subscriptions
     SET is_active = FALSE, status = 'expired'
     WHERE is_active = TRUE AND payment_status = 'verified' AND cancelled_at IS NULL
       AND COALESCE(current_period_end, expiration_date) < NOW()
     RETURNING id, business_id, plan, COALESCE(current_period_end, expiration_date) AS ended_at`
  )
  for (const sub of expired) {
    forgetSubscriptionAccess(sub.business_id)
    const owner = await ownerContact(sub.business_id).catch(() => null)
    if (owner) {
      await sendSubscriptionExpired({
        businessName: owner.business_name,
        ownerName: owner.owner_name || 'Business Owner',
        ownerEmail: owner.owner_email || owner.contact_email,
        planName: sub.plan || 'N/A',
        expiryDate: sub.ended_at,
        businessId: sub.business_id,
      }).catch((err) => console.error('[daily] expiry email failed:', err.message))
    }
  }
  return expired.length
}

export async function sendRenewalReminders() {
  const days = await settingNumber('subscription_renewal_reminder_days', 7, { min: 1, max: 60 })
  // Only the latest subscription of each business; a renewal already bought in advance means no reminder.
  const { rows } = await query(
    `SELECT s.id, s.business_id, s.plan, COALESCE(s.current_period_end, s.expiration_date) AS ends_at
     FROM subscriptions s
     WHERE s.is_active = TRUE AND s.payment_status = 'verified' AND s.cancelled_at IS NULL
       AND COALESCE(s.current_period_end, s.expiration_date) BETWEEN NOW() AND NOW() + ($1 || ' days')::interval
       AND (s.reminder_sent_at IS NULL OR s.reminder_sent_at < s.start_date)
       AND NOT EXISTS (
         SELECT 1 FROM subscriptions later
         WHERE later.business_id = s.business_id AND later.id <> s.id AND later.payment_status = 'verified'
           AND COALESCE(later.current_period_end, later.expiration_date) > COALESCE(s.current_period_end, s.expiration_date)
       )`,
    [String(days)]
  )
  let sent = 0
  for (const sub of rows) {
    const owner = await ownerContact(sub.business_id).catch(() => null)
    if (!owner) continue
    const daysRemaining = Math.max(1, Math.ceil((new Date(sub.ends_at) - Date.now()) / 86_400_000))
    const ok = await sendExpiryReminder({
      businessName: owner.business_name,
      ownerName: owner.owner_name || 'Business Owner',
      ownerEmail: owner.owner_email || owner.contact_email,
      planName: sub.plan || 'N/A',
      expiryDate: sub.ends_at,
      daysRemaining,
      businessId: sub.business_id,
    }).catch(() => false)
    // Marked even when emails are switched off, so the reminder is not retried every day.
    await query('UPDATE subscriptions SET reminder_sent_at = NOW() WHERE id = $1', [sub.id])
    if (ok) sent += 1
  }
  return sent
}

export async function purgeOldAuditLogs() {
  const days = await settingNumber('audit_log_retention_days', 90, { min: 7, max: 3650 })
  const { rowCount } = await query(`DELETE FROM audit_logs WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(days)])
  await query(`DELETE FROM login_attempts WHERE COALESCE(locked_until, last_failed_at) < NOW() - INTERVAL '1 day'`).catch(() => {})
  return rowCount || 0
}

const FREQUENCY_HOURS = { daily: 24, weekly: 24 * 7, monthly: 24 * 30 }

export async function recordBackup({ type = 'full', createdBy = 'Automatic backup' } = {}) {
  const filePath = await createBackup()
  const size = `${(fs.statSync(filePath).size / 1024 / 1024).toFixed(1)} MB`
  const name = `backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}_${type}`
  const { rows } = await query(
    `INSERT INTO platform_backups (backup_name, backup_type, file_size, status, created_by, file_path)
     VALUES ($1, $2, $3, 'completed', $4, $5) RETURNING *`,
    [name, type, size, createdBy, filePath]
  )
  return rows[0]
}

export async function automaticBackups() {
  const result = { created: null, removed: 0 }
  if (await settingBool('backup_auto_enabled', false)) {
    const frequency = await settingText('backup_frequency', 'daily')
    const hours = FREQUENCY_HOURS[frequency] || 24
    const { rows } = await query(`SELECT MAX(created_at) AS last FROM platform_backups WHERE status = 'completed'`)
    const last = rows[0]?.last ? new Date(rows[0].last).getTime() : 0
    if (Date.now() - last >= (hours - 1) * 3_600_000) {
      try {
        result.created = (await recordBackup({ type: 'full', createdBy: 'Automatic backup' })).backup_name
      } catch (error) {
        console.error('[daily] automatic backup failed:', error.message)
        result.error = error.message
      }
    }
  }
  const retention = await settingNumber('backup_retention_days', 30, { min: 1, max: 3650 })
  const { rows: old } = await query(
    `SELECT id, file_path FROM platform_backups WHERE created_at < NOW() - ($1 || ' days')::interval`,
    [String(retention)]
  )
  for (const b of old) {
    if (b.file_path) fs.promises.unlink(b.file_path).catch(() => {})
    await query('DELETE FROM platform_backups WHERE id = $1', [b.id])
    result.removed += 1
  }
  return result
}

/** Runs every job, at most once per ~23 hours unless forced. Returns a summary. */
export async function runDailyJobs({ force = false } = {}) {
  const client = await pool.connect()
  try {
    const { rows: lock } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID])
    if (!lock[0].ok) return { skipped: 'already running' }
    try {
      await pool.query(SCHEMA_SQL)
      const { rows: last } = await query(`SELECT setting_value FROM platform_settings WHERE setting_key = 'jobs_last_daily_run'`)
      const lastRun = last[0]?.setting_value ? new Date(last[0].setting_value).getTime() : 0
      if (!force && Date.now() - lastRun < 23 * 3_600_000) return { skipped: 'ran recently', lastRun: new Date(lastRun).toISOString() }

      const summary = {}
      const step = async (name, fn) => {
        try { summary[name] = await fn() } catch (error) {
          console.error(`[daily] ${name} failed:`, error.message)
          summary[name] = { error: error.message }
        }
      }
      await step('expiredSubscriptions', expireSubscriptions)
      await step('renewalReminders', sendRenewalReminders)
      await step('auditLogsRemoved', purgeOldAuditLogs)
      await step('backups', automaticBackups)

      await query(
        `INSERT INTO platform_settings (setting_key, setting_value, setting_group) VALUES ('jobs_last_daily_run', $1, 'system')
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
        [new Date().toISOString()]
      )
      console.log('[daily] done:', JSON.stringify(summary))
      return { ran: true, ...summary }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID])
    }
  } finally {
    client.release()
  }
}

/** Long-running servers: check every hour (the job itself runs once a day). */
export function startDailyJobTimer() {
  if (process.env.VERCEL) return // Vercel uses the cron in vercel.json instead
  const tick = () => runDailyJobs().catch((error) => console.error('[daily] run failed:', error.message))
  setTimeout(tick, 60_000)
  setInterval(tick, 3_600_000).unref?.()
}
