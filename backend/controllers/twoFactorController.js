import { query } from '../config/database.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { sendVerificationEmail } from '../services/emailService.js'

export async function getTwoFactorSettings(req, res) {
  try {
    const businessId = req.query.businessId || req.user?.businessId
    let settings = null

    if (businessId) {
      const { rows } = await query(
        'SELECT * FROM two_factor_settings WHERE business_id = $1 LIMIT 1',
        [businessId]
      )
      if (rows.length) {
        settings = rows[0]
      }
    }

  if (!settings) {
    const { rows } = await query(
      "SELECT * FROM two_factor_settings WHERE scope = 'platform' AND business_id IS NULL LIMIT 1"
    )
      if (rows.length) {
        settings = rows[0]
      }
    }

    if (!settings) {
      return res.json({ isEnabled: false, method: 'email', scope: 'platform', businessId: null })
    }

    res.json({
      id: settings.id,
      isEnabled: settings.is_enabled,
      method: settings.method,
      scope: settings.scope,
      businessId: settings.business_id,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function updateTwoFactorSettings(req, res) {
  try {
    const { isEnabled, method, scope, businessId } = req.body
    if (!['email', 'sms', 'authenticator'].includes(method)) {
      return res.status(400).json({ error: "Invalid 2FA method. Use email, sms, or authenticator." })
    }
    if (!['platform', 'business'].includes(scope)) {
      return res.status(400).json({ error: "Invalid scope. Use platform or business." })
    }

    const effectiveBusinessId = scope === 'business' ? businessId : null

    const { rows } = await query(
      `INSERT INTO two_factor_settings (scope, business_id, is_enabled, method, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (scope, business_id) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         method = EXCLUDED.method,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [scope, effectiveBusinessId, !!isEnabled, method]
    )

    await logAudit({
      userId: req.user?.id,
      actorName: req.user?.full_name || req.user?.email || 'System',
      action: `${isEnabled ? 'Enabled' : 'Disabled'} 2FA (${method}) for ${scope}${effectiveBusinessId ? ' business' : ''}`,
      targetModule: 'Security',
      ipAddress: getClientIp(req),
    })

    res.json({
      id: rows[0].id,
      isEnabled: rows[0].is_enabled,
      method: rows[0].method,
      scope: rows[0].scope,
      businessId: rows[0].business_id,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function sendTwoFactorCode(req, res) {
  try {
    const { email, userId, method } = req.body
    if (!email || !userId) {
      return res.status(400).json({ error: 'Email and userId are required.' })
    }

    const normalizedMethod = method === 'sms' || method === 'authenticator' ? 'email' : (method || 'email')

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    await query(
      `INSERT INTO two_factor_codes (user_id, code, method, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, code, normalizedMethod, expiresAt]
    )

    const { rows: userRows } = await query('SELECT full_name, email FROM users WHERE id = $1', [userId])
    const userName = userRows[0]?.full_name || ''

    let emailSent = true
    if (normalizedMethod === 'email') {
      emailSent = await sendVerificationEmail(email, code, userName)
    }

    await logAudit({
      userId,
      actorName: userName || email,
      action: 'Sent 2FA verification code',
      targetModule: 'Security',
      ipAddress: getClientIp(req),
    })

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send verification email. Please check SMTP configuration.' })
    }

    res.json({ success: true, message: 'Verification code sent.' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function verifyTwoFactorCode(req, res) {
  try {
    const { userId, code } = req.body
    if (!userId || !code) {
      return res.status(400).json({ error: 'UserId and code are required.' })
    }

    const { rows } = await query(
      `SELECT * FROM two_factor_codes
       WHERE user_id = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId, code]
    )

    if (!rows.length) {
      return res.status(400).json({ error: 'Invalid or expired verification code.' })
    }

    await query('UPDATE two_factor_codes SET used = TRUE WHERE id = $1', [rows[0].id])

    await logAudit({
      userId,
      actorName: 'System',
      action: 'Verified 2FA code',
      targetModule: 'Security',
      ipAddress: getClientIp(req),
    })

    res.json({ success: true, message: 'Verification successful.' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
