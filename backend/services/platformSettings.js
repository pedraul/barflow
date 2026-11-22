// Platform-wide settings (super admin → Settings), read with a short cache so every
// request can check them cheaply. Call invalidatePlatformSettings() after saving.
import { query } from '../config/database.js'

const TTL_MS = 15_000
let cache = null
let cachedAt = 0
let loading = null

export async function getPlatformSettings() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache
  if (!loading) {
    loading = query('SELECT setting_key, setting_value FROM platform_settings')
      .then(({ rows }) => {
        cache = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]))
        cachedAt = Date.now()
        return cache
      })
      .catch((error) => {
        console.error('[platform-settings] could not load settings:', error.message)
        return cache || {}
      })
      .finally(() => { loading = null })
  }
  return loading
}

export function invalidatePlatformSettings() {
  cache = null
  cachedAt = 0
}

const isOn = (value) => value === true || ['true', '1', 'yes', 'on'].includes(String(value ?? '').toLowerCase())

export async function settingBool(key, fallback = false) {
  const value = (await getPlatformSettings())[key]
  return value === undefined || value === null || value === '' ? fallback : isOn(value)
}

export async function settingNumber(key, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = (await getPlatformSettings())[key]
  const value = Number(raw)
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export async function settingText(key, fallback = '') {
  const value = (await getPlatformSettings())[key]
  return value === undefined || value === null || String(value).trim() === '' ? fallback : String(value)
}

/** Minimum password length set by the platform admin (never below 6). */
export async function minPasswordLength() {
  return settingNumber('security_min_password_length', 8, { min: 6, max: 64 })
}

/** Returns an error message when the password is too weak, otherwise null. */
export async function passwordPolicyError(password) {
  const min = await minPasswordLength()
  const value = String(password || '')
  if (value.length < min) return `The password must be at least ${min} characters.`
  return null
}

/** IPs allowed to use the platform admin area ([] = no restriction). */
export async function adminIpWhitelist() {
  return (await settingText('security_ip_whitelist', ''))
    .split(/[\s,]+/)
    .map((ip) => ip.trim())
    .filter(Boolean)
}

/** The caller's IP, honouring the app's 'trust proxy' setting (not a raw, spoofable header). */
export function requestIp(req) {
  return normalizeIp(req.ip || req.socket?.remoteAddress || '')
}

export function normalizeIp(ip = '') {
  const value = String(ip || '').trim()
  if (value === '::1') return '127.0.0.1'
  return value.replace(/^::ffff:/i, '')
}

export function ipAllowed(ip, whitelist) {
  if (!whitelist.length) return true
  const value = normalizeIp(ip)
  return whitelist.some((entry) => {
    const allowed = normalizeIp(entry)
    if (allowed.endsWith('*')) return value.startsWith(allowed.slice(0, -1))
    return allowed === value
  })
}

/** Payment methods owners can use for their subscription, from Settings → Payment. */
export async function subscriptionPaymentOptions() {
  const s = await getPlatformSettings()
  return {
    mtn_momo: { enabled: s.payment_momo_enabled === undefined ? true : isOn(s.payment_momo_enabled), code: s.payment_momo_code || '' },
    airtel_money: { enabled: s.payment_airtel_enabled === undefined ? true : isOn(s.payment_airtel_enabled), code: s.payment_airtel_code || '' },
    bank_transfer: {
      enabled: isOn(s.payment_bank_enabled) && String(s.payment_bank_account || '').trim() !== '',
      account: s.payment_bank_account || '',
    },
  }
}

/**
 * Public address of the web app, used in links inside emails (password reset, ...).
 * Settings → Platform Info → App address, else FRONTEND_URL. A localhost origin is accepted
 * only for local development: trusting any Origin header would let an attacker receive reset links.
 */
export async function appBaseUrl(req = null) {
  const configured = (await settingText('platform_app_url', '')) || process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || ''
  if (configured.trim()) return configured.trim().replace(/\/+$/, '')
  const origin = String(req?.headers?.origin || '')
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin
  return null
}

/** Public, non-secret platform details for the login page, emails, QR codes, ... */
export async function publicPlatformInfo() {
  const s = await getPlatformSettings()
  return {
    name: s.platform_name || 'BarFlow',
    logo: s.platform_logo || '',
    description: s.platform_description || '',
    website: s.platform_website || '',
    contactEmail: s.platform_contact_email || '',
    contactPhone: s.platform_contact_phone || '',
    language: s.platform_language || 'en',
    currency: s.platform_currency || 'RWF',
    timezone: s.platform_timezone || 'Africa/Kigali',
    qr: {
      size: Math.min(1024, Math.max(96, Number(s.qr_default_size) || 256)),
      errorCorrection: ['L', 'M', 'Q', 'H'].includes(s.qr_error_correction) ? s.qr_error_correction : 'M',
      includeLogo: s.qr_include_logo === undefined ? false : isOn(s.qr_include_logo),
    },
    security: {
      minPasswordLength: Math.min(64, Math.max(6, Number(s.security_min_password_length) || 8)),
    },
    maintenance: {
      enabled: isOn(s.maintenance_mode),
      message: s.maintenance_message || 'The platform is undergoing maintenance. Please try again later.',
    },
  }
}
