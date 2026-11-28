import crypto from 'crypto'
import { query } from '../config/database.js'
import bcrypt from 'bcryptjs'
import { logAudit, getClientIp } from '../utils/audit.js'
import { sendPasswordResetEmail, sendPasswordResetConfirmationEmail } from '../services/emailNotificationService.js'

const mapUser = (u) => ({
  id: u.id,
  name: u.full_name,
  email: u.email,
  phone: u.phone || '',
  role: u.role,
  branch: u.branch_name || '',
  status: u.is_active ? 'Active' : 'Inactive',
  salary: Number(u.salary) || 0,
  lastLogin: u.last_login ? new Date(u.last_login).toLocaleString() : 'Never',
})

export async function login(req, res) {
  const { role } = req.body
  if (!role) return res.status(400).json({ error: 'Role is required.' })
  try {
    const { rows } = await query(
      `SELECT u.*, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.role = $1 AND u.is_active = TRUE LIMIT 1`,
      [role]
    )
    if (!rows.length) return res.status(404).json({ error: 'No active user for this role.' })
    const u = rows[0]
    res.json({ id: u.id, name: u.full_name, email: u.email, phone: u.phone || '', role: u.role, branch: u.branch_name || '' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function forgotPassword(req, res) {
  const { email } = req.body
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' })
  }

  const normalizedEmail = email.trim().toLowerCase()
  try {
    const { rows: userRows } = await query(
      `SELECT id, email, full_name FROM users WHERE LOWER(email) = $1 AND is_active = TRUE LIMIT 1`,
      [normalizedEmail]
    )

    let account = null
    let accountType = 'user'

    if (userRows.length) {
      account = userRows[0]
      accountType = 'user'
    } else {
      const { rows: adminRows } = await query(
        `SELECT id, email, full_name FROM platform_admins WHERE LOWER(email) = $1 AND is_active = TRUE LIMIT 1`,
        [normalizedEmail]
      )
      if (adminRows.length) {
        account = adminRows[0]
        accountType = 'platform_admin'
      }
    }

    if (!account) {
      return res.json({ success: true, message: 'If an account exists, password reset instructions have been sent to the provided email.' })
    }

    const resetToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${encodeURIComponent(resetToken)}`

    await query(
      `INSERT INTO password_reset_tokens (user_id, platform_admin_id, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [accountType === 'user' ? account.id : null, accountType === 'platform_admin' ? account.id : null, resetToken, expiresAt]
    )

    await sendPasswordResetEmail({
      email: account.email,
      name: account.full_name,
      resetUrl,
    })

await logAudit({
       userId: accountType === 'user' ? account.id : null,
       actorName: account.full_name || account.email,
       action: 'Requested password reset',
       targetModule: 'Authentication',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    res.json({
      success: true,
      message: 'If an account exists, password reset instructions have been sent to the provided email.',
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export async function resetPassword(req, res) {
  const { token, password } = req.body
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required.' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must include uppercase, lowercase, and numeric characters.' })
  }

  try {
    const { rows } = await query(
      `SELECT prt.*, u.email AS user_email, u.full_name AS user_name, a.email AS admin_email, a.full_name AS admin_name
       FROM password_reset_tokens prt
       LEFT JOIN users u ON u.id = prt.user_id
       LEFT JOIN platform_admins a ON a.id = prt.platform_admin_id
       WHERE prt.token = $1 AND prt.used = FALSE AND prt.expires_at > NOW() LIMIT 1`,
      [token]
    )

    if (!rows.length) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' })
    }

    const resetToken = rows[0]
    const passwordHash = await bcrypt.hash(password, 10)
    let targetEmail = null
    let targetName = null

    if (resetToken.user_id) {
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetToken.user_id])
      targetEmail = resetToken.user_email
      targetName = resetToken.user_name
    } else if (resetToken.platform_admin_id) {
      await query('UPDATE platform_admins SET password_hash = $1 WHERE id = $2', [passwordHash, resetToken.platform_admin_id])
      targetEmail = resetToken.admin_email
      targetName = resetToken.admin_name
    } else {
      return res.status(400).json({ error: 'Invalid reset token account.' })
    }

    await query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [resetToken.id])

    await sendPasswordResetConfirmationEmail({
      email: targetEmail,
      name: targetName,
    })

await logAudit({
       userId: resetToken.user_id || null,
       actorName: targetName || 'System',
       action: 'Reset password via forgot-password flow',
       targetModule: 'Authentication',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })

    res.json({ success: true, message: 'Password has been reset successfully.' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
