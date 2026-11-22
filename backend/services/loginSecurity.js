// Sign-in protection from Settings → Security:
//   - max login attempts: after that many wrong passwords the account is locked for LOCK_MINUTES.
//   - session timeout: a sign-in is valid for that many minutes, then the person signs in again.
// The platform admin sets the platform values; a business owner may set stricter values
// for their own business (the stricter of the two applies).
import { query, pool } from '../config/database.js'
import { settingNumber } from './platformSettings.js'

export const LOCK_MINUTES = 15

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS login_attempts (
  identifier TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_failed_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ
);
`
let ready = null
function ensureSchema() {
  if (!ready) {
    ready = pool.query(SCHEMA_SQL).then(() => true).catch((error) => {
      ready = null
      console.error('[login-security] schema setup failed:', error.message)
      throw error
    })
  }
  return ready
}

// Business-level security values, cached briefly (read on every request for session checks).
const businessCache = new Map()
async function businessSecurity(businessId) {
  if (!businessId) return {}
  const hit = businessCache.get(businessId)
  if (hit && Date.now() - hit.at < 15_000) return hit.value
  let value = {}
  try {
    const { rows } = await query(
      `SELECT setting_key, setting_value FROM system_settings
       WHERE business_id = $1 AND setting_key IN ('max_login_attempts', 'session_timeout')`,
      [businessId]
    )
    value = Object.fromEntries(rows.map((r) => [r.setting_key, Number(r.setting_value)]))
  } catch { /* table missing: no business overrides */ }
  businessCache.set(businessId, { at: Date.now(), value })
  return value
}

const stricter = (platformValue, businessValue) =>
  Number.isFinite(businessValue) && businessValue > 0 ? Math.min(platformValue, businessValue) : platformValue

export async function maxLoginAttempts(businessId = null) {
  const platform = await settingNumber('security_max_login_attempts', 5, { min: 3, max: 50 })
  return stricter(platform, (await businessSecurity(businessId)).max_login_attempts)
}

export async function sessionTimeoutMinutes(businessId = null) {
  const platform = await settingNumber('security_session_timeout', 480, { min: 5, max: 7 * 24 * 60 })
  return stricter(platform, (await businessSecurity(businessId)).session_timeout)
}

const key = (kind, identifier) => `${kind}:${String(identifier || '').trim().toLowerCase()}`

/** Minutes left on a lock, or 0 when the account may try to sign in. */
export async function lockedMinutes(kind, identifier) {
  try {
    await ensureSchema()
    const { rows } = await query('SELECT locked_until FROM login_attempts WHERE identifier = $1', [key(kind, identifier)])
    const until = rows[0]?.locked_until ? new Date(rows[0].locked_until).getTime() : 0
    return until > Date.now() ? Math.ceil((until - Date.now()) / 60000) : 0
  } catch {
    return 0
  }
}

/** Records a wrong password. Returns { locked, remaining }. */
export async function recordFailedLogin(kind, identifier, businessId = null) {
  try {
    await ensureSchema()
    const max = await maxLoginAttempts(businessId)
    // Failures older than the lock window do not count any more.
    const { rows } = await query(
      `INSERT INTO login_attempts (identifier, failed_count, last_failed_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (identifier) DO UPDATE SET
         failed_count = CASE WHEN login_attempts.last_failed_at < NOW() - ($2 || ' minutes')::interval
                             OR (login_attempts.locked_until IS NOT NULL AND login_attempts.locked_until < NOW())
                        THEN 1 ELSE login_attempts.failed_count + 1 END,
         last_failed_at = NOW(),
         locked_until = CASE WHEN login_attempts.locked_until < NOW() THEN NULL ELSE login_attempts.locked_until END
       RETURNING failed_count`,
      [key(kind, identifier), String(LOCK_MINUTES)]
    )
    const count = rows[0].failed_count
    if (count >= max) {
      await query(
        `UPDATE login_attempts SET locked_until = NOW() + ($2 || ' minutes')::interval WHERE identifier = $1`,
        [key(kind, identifier), String(LOCK_MINUTES)]
      )
      return { locked: true, remaining: 0 }
    }
    return { locked: false, remaining: max - count }
  } catch (error) {
    console.error('[login-security] could not record failed login:', error.message)
    return { locked: false, remaining: null }
  }
}

export async function clearFailedLogins(kind, identifier) {
  try {
    await ensureSchema()
    await query('DELETE FROM login_attempts WHERE identifier = $1', [key(kind, identifier)])
  } catch { /* nothing to clear */ }
}

export function lockedResponse(res, minutes) {
  return res.status(429).json({
    error: `Too many wrong passwords. This account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`,
    code: 'ACCOUNT_LOCKED',
  })
}

export function wrongPasswordMessage(result, fallback) {
  if (result?.locked) return `Too many wrong passwords. This account is locked for ${LOCK_MINUTES} minutes.`
  if (Number.isFinite(result?.remaining) && result.remaining <= 2) {
    return `${fallback} ${result.remaining} attempt${result.remaining === 1 ? '' : 's'} left before the account is locked.`
  }
  return fallback
}
