import { query } from '../config/database.js'
import { sendVerificationEmail } from './emailService.js'

// ──────────────────────────────────────────────
// Helper: check if email notifications are enabled
// ──────────────────────────────────────────────
async function isEmailNotificationsEnabled() {
  try {
    const { rows } = await query(
      `SELECT setting_value FROM platform_settings WHERE setting_key = 'email_notifications_enabled' LIMIT 1`
    )
    if (rows.length) {
      return rows[0].setting_value === 'true' || rows[0].setting_value === '1'
    }
    // Default to enabled if setting doesn't exist yet
    return true
  } catch (e) {
    console.error('Failed to check email notifications setting:', e.message)
    return true // Default to enabled on error
  }
}

async function isNotificationEnabled(settingKey, businessId = null) {
  // 1. Platform master switch (super admin).
  if (!(await isEmailNotificationsEnabled())) return false
  try {
    // 2. Platform-wide switch for this notification type (super admin), if set.
    const { rows } = await query(
      `SELECT setting_value FROM platform_settings WHERE setting_key = $1 LIMIT 1`,
      [settingKey]
    )
    if (rows.length && !isOn(rows[0].setting_value)) return false

    // 3. The business owner's own preference (Settings → Notifications).
    if (businessId) {
      const { rows: own } = await query(
        `SELECT setting_value FROM system_settings
         WHERE business_id = $1 AND setting_key = $2
         ORDER BY updated_at DESC LIMIT 1`,
        [businessId, settingKey]
      )
      if (own.length) return isOn(own[0].setting_value)
    }
    // Not configured anywhere: notifications are on by default.
    return true
  } catch (e) {
    console.error(`Failed to check notification setting (${settingKey}):`, e.message)
    return true
  }
}

const isOn = (value) => value === true || value === 'true' || value === '1' || value === 1

// ──────────────────────────────────────────────
// Helper: record sent email in the database
// ──────────────────────────────────────────────
async function recordEmail({ businessId, recipientEmail, recipientName, subject, body, notificationType, status = 'sent', errorMessage = null }) {
  try {
    await query(
      `INSERT INTO email_notifications (business_id, recipient_email, recipient_name, subject, body, notification_type, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [businessId || null, recipientEmail, recipientName || null, subject, body || null, notificationType, status, errorMessage]
    )
  } catch (e) {
    console.error('Failed to record email notification:', e.message)
  }
}

// ──────────────────────────────────────────────
// Helper: send email via nodemailer + record it
// ──────────────────────────────────────────────
async function sendAndRecord({ toEmail, toName, subject, text, html, notificationType, businessId }) {
  if (!toEmail) return false

  try {
    const { default: nodemailer } = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    })

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'BarFlow <no-reply@barflow.com>',
      to: toEmail,
      subject,
      text: text || '',
      html: html || text || '',
    })

    await recordEmail({
      businessId,
      recipientEmail: toEmail,
      recipientName: toName,
      subject,
      body: html || text,
      notificationType,
      status: 'sent',
    })
    return true
  } catch (error) {
    console.error(`Failed to send email (${notificationType}):`, error.message)
    await recordEmail({
      businessId,
      recipientEmail: toEmail,
      recipientName: toName,
      subject,
      body: html || text,
      notificationType,
      status: 'failed',
      errorMessage: error.message,
    })
    return false
  }
}

// ──────────────────────────────────────────────
// 1. Business Registration Confirmation (to owner)
// ──────────────────────────────────────────────
export async function sendRegistrationConfirmation({ businessName, ownerName, ownerEmail, businessId }) {
  if (!(await isNotificationEnabled('notify_registration', businessId))) return false
  const subject = `Welcome to BarFlow – ${businessName} Registration Confirmed`
  const text = `Hello ${ownerName || 'Business Owner'},

Thank you for registering ${businessName} on BarFlow!

Your business has been registered successfully. Here are your registration details:

  Business Name: ${businessName}
  Registration Date: ${new Date().toLocaleDateString()}

Next Steps:
1. Select a subscription plan that suits your business needs
2. Complete the payment process to activate your account
3. Once payment is verified, you will have full access to all BarFlow features

If you have any questions, please contact our support team.

Best regards,
The BarFlow Team`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Welcome to BarFlow!</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Hello <strong>${ownerName || 'Business Owner'}</strong>,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Thank you for registering <strong>${businessName}</strong> on BarFlow!</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Your business has been registered successfully. Here are your registration details:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Business Name</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${businessName}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Registration Date</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${new Date().toLocaleDateString()}</td></tr>
      </table>
      <h3 style="color: #667eea; margin-top: 20px;">Next Steps:</h3>
      <ol style="color: #333; font-size: 15px; line-height: 1.8;">
        <li>Select a subscription plan that suits your business needs</li>
        <li>Complete the payment process to activate your account</li>
        <li>Once payment is verified, you will have full access to all BarFlow features</li>
      </ol>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">If you have any questions, please contact our support team.</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Best regards,<br><strong>The BarFlow Team</strong></p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} BarFlow. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return sendAndRecord({
    toEmail: ownerEmail,
    toName: ownerName,
    subject,
    text,
    html,
    notificationType: 'registration_confirmation',
    businessId,
  })
}

// ──────────────────────────────────────────────
// 2. New Business Registration Notification (to admin)
// ──────────────────────────────────────────────
export async function sendAdminNewBusinessNotification({ businessName, ownerName, ownerEmail, ownerPhone, registrationDate, businessId }) {
  if (!(await isEmailNotificationsEnabled())) return false
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.SMTP_USER || 'admin@barflow.com'
  const subject = `New Business Registration: ${businessName}`
  const text = `A new business has registered on BarFlow.

  Business Name: ${businessName}
  Owner Name: ${ownerName || 'N/A'}
  Owner Email: ${ownerEmail}
  Owner Phone: ${ownerPhone || 'N/A'}
  Registration Date: ${registrationDate || new Date().toLocaleDateString()}

Please review and verify this business registration.`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">New Business Registration</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6;">A new business has registered on BarFlow.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Business Name</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${businessName}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Owner Name</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${ownerName || 'N/A'}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Owner Email</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${ownerEmail}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Owner Phone</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${ownerPhone || 'N/A'}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Registration Date</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${registrationDate || new Date().toLocaleDateString()}</td></tr>
      </table>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Please review and verify this business registration from the admin dashboard.</p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} BarFlow. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return sendAndRecord({
    toEmail: adminEmail,
    toName: 'Platform Admin',
    subject,
    text,
    html,
    notificationType: 'admin_new_business',
    businessId,
  })
}

// ──────────────────────────────────────────────
// 3. Subscription Activation Confirmation (to owner)
// ──────────────────────────────────────────────
export async function sendSubscriptionActivation({ businessName, ownerName, ownerEmail, planName, activationDate, expiryDate, amount, businessId }) {
  if (!(await isNotificationEnabled('notify_subscription_activation', businessId))) return false
  const subject = `Subscription Activated – ${planName} Plan for ${businessName}`
  const text = `Hello ${ownerName || 'Business Owner'},

Great news! Your subscription for ${businessName} has been activated successfully.

  Plan: ${planName}
  Activation Date: ${activationDate || new Date().toLocaleDateString()}
  Expiry Date: ${expiryDate || 'N/A'}
  Amount Paid: ${amount ? `RWF ${Number(amount).toLocaleString()}` : 'N/A'}

All BarFlow services are now available for your business. You can start managing your operations right away.

Thank you for choosing BarFlow!

Best regards,
The BarFlow Team`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Subscription Activated! 🎉</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Hello <strong>${ownerName || 'Business Owner'}</strong>,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Great news! Your subscription for <strong>${businessName}</strong> has been activated successfully.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Plan</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${planName}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Activation Date</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${activationDate || new Date().toLocaleDateString()}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Expiry Date</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${expiryDate || 'N/A'}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Amount Paid</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${amount ? `RWF ${Number(amount).toLocaleString()}` : 'N/A'}</td></tr>
      </table>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">All BarFlow services are now available for your business. You can start managing your operations right away.</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Thank you for choosing BarFlow!</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Best regards,<br><strong>The BarFlow Team</strong></p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} BarFlow. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return sendAndRecord({
    toEmail: ownerEmail,
    toName: ownerName,
    subject,
    text,
    html,
    notificationType: 'subscription_activation',
    businessId,
  })
}

// ──────────────────────────────────────────────
// 4. Subscription Activation Notification (to admin)
// ──────────────────────────────────────────────
export async function sendAdminSubscriptionActivation({ businessName, ownerName, ownerEmail, planName, amount, businessId }) {
  if (!(await isEmailNotificationsEnabled())) return false
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.SMTP_USER || 'admin@barflow.com'
  const subject = `Subscription Payment Verified – ${businessName}`
  const text = `A subscription payment has been verified for ${businessName}.

  Business Name: ${businessName}
  Owner Name: ${ownerName || 'N/A'}
  Owner Email: ${ownerEmail}
  Plan: ${planName}
  Amount: ${amount ? `RWF ${Number(amount).toLocaleString()}` : 'N/A'}

The business account has been activated successfully.`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Payment Verified</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6;">A subscription payment has been verified for <strong>${businessName}</strong>.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Business Name</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${businessName}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Owner Name</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${ownerName || 'N/A'}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Owner Email</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${ownerEmail}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Plan</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${planName}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Amount</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${amount ? `RWF ${Number(amount).toLocaleString()}` : 'N/A'}</td></tr>
      </table>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">The business account has been activated successfully.</p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} BarFlow. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return sendAndRecord({
    toEmail: adminEmail,
    toName: 'Platform Admin',
    subject,
    text,
    html,
    notificationType: 'admin_subscription_activation',
    businessId,
  })
}

// ──────────────────────────────────────────────
// 5. Subscription Expiry Reminder (to owner)
// ──────────────────────────────────────────────
export async function sendExpiryReminder({ businessName, ownerName, ownerEmail, planName, expiryDate, daysRemaining, businessId }) {
  if (!(await isNotificationEnabled('notify_expiry_reminder', businessId))) return false
  const subject = `Subscription Expiry Reminder – ${daysRemaining} Day${daysRemaining !== 1 ? 's' : ''} Left`
  const text = `Hello ${ownerName || 'Business Owner'},

This is a reminder that your ${planName} subscription for ${businessName} will expire in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}.

  Plan: ${planName}
  Expiry Date: ${expiryDate ? new Date(expiryDate).toLocaleDateString() : 'N/A'}
  Days Remaining: ${daysRemaining}

To avoid any interruption in service, please renew your subscription before the expiry date.

If you have already renewed, please disregard this message.

Best regards,
The BarFlow Team`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Subscription Expiry Reminder</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Hello <strong>${ownerName || 'Business Owner'}</strong>,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">This is a reminder that your <strong>${planName}</strong> subscription for <strong>${businessName}</strong> will expire in <strong>${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</strong>.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Plan</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${planName}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Expiry Date</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${expiryDate ? new Date(expiryDate).toLocaleDateString() : 'N/A'}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Days Remaining</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${daysRemaining}</td></tr>
      </table>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">To avoid any interruption in service, please renew your subscription before the expiry date.</p>
      <p style="color: #999; font-size: 14px; font-style: italic;">If you have already renewed, please disregard this message.</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Best regards,<br><strong>The BarFlow Team</strong></p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} BarFlow. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return sendAndRecord({
    toEmail: ownerEmail,
    toName: ownerName,
    subject,
    text,
    html,
    notificationType: 'expiry_reminder',
    businessId,
  })
}

// ──────────────────────────────────────────────
// Password Reset Request Email
// ──────────────────────────────────────────────
export async function sendPasswordResetEmail({ email, name, resetUrl }) {
  if (!(await isEmailNotificationsEnabled())) return false
  const subject = 'BarFlow Password Reset Instructions'
  const text = `Hello ${name || 'BarFlow User'},

We received a request to reset the password for your BarFlow account.

To reset your password, click the link below or paste it into your browser:

${resetUrl}

This link will expire in 15 minutes.

If you did not request a password reset, please ignore this email.

Thank you,
The BarFlow Team`
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #5b21b6 0%, #2563eb 100%); padding: 30px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 24px;">Password Reset Requested</h1>
    </div>
    <div style="padding: 30px; color: #333;">
      <p>Hello <strong>${name || 'BarFlow User'}</strong>,</p>
      <p>We received a request to reset the password for your BarFlow account.</p>
      <p style="margin: 24px 0;"><a href="${resetUrl}" style="display: inline-block; padding: 14px 24px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px;">Reset Password</a></p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #1d4ed8;">${resetUrl}</p>
      <p>This link will expire in 15 minutes. If you did not request a password reset, please ignore this email.</p>
      <p>Thank you,<br>The BarFlow Team</p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} BarFlow. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return sendAndRecord({
    toEmail: email,
    toName: name,
    subject,
    text,
    html,
    notificationType: 'password_reset_request',
  })
}

// ──────────────────────────────────────────────
// Password Reset Confirmation Email
// ──────────────────────────────────────────────
export async function sendPasswordResetConfirmationEmail({ email, name }) {
  if (!(await isEmailNotificationsEnabled())) return false
  const subject = 'Your BarFlow Password Has Been Changed'
  const text = `Hello ${name || 'BarFlow User'},

Your BarFlow password has been successfully changed.

If you did not make this change, please contact BarFlow support immediately.

Thank you,
The BarFlow Team`
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 24px;">Password Changed</h1>
    </div>
    <div style="padding: 30px; color: #333;">
      <p>Hello <strong>${name || 'BarFlow User'}</strong>,</p>
      <p>Your BarFlow password has been successfully changed.</p>
      <p>If you did not make this change, please contact BarFlow support immediately.</p>
      <p>Thank you,<br>The BarFlow Team</p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} BarFlow. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return sendAndRecord({
    toEmail: email,
    toName: name,
    subject,
    text,
    html,
    notificationType: 'password_reset_confirmation',
  })
}

// ──────────────────────────────────────────────
// 6. Subscription Expired Notification (to owner)
// ──────────────────────────────────────────────
export async function sendSubscriptionExpired({ businessName, ownerName, ownerEmail, planName, expiryDate, businessId }) {
  if (!(await isNotificationEnabled('notify_subscription_expired', businessId))) return false
  const subject = `Subscription Expired – ${businessName}`
  const text = `Hello ${ownerName || 'Business Owner'},

Your ${planName} subscription for ${businessName} has expired as of ${expiryDate ? new Date(expiryDate).toLocaleDateString() : 'N/A'}.

As a result, access to operational features has been restricted. To continue using BarFlow services, please renew your subscription immediately.

If you have any questions or need assistance, please contact our support team.

Best regards,
The BarFlow Team`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #f5576c 0%, #ff6a88 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Subscription Expired</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Hello <strong>${ownerName || 'Business Owner'}</strong>,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Your <strong>${planName}</strong> subscription for <strong>${businessName}</strong> has expired as of <strong>${expiryDate ? new Date(expiryDate).toLocaleDateString() : 'N/A'}</strong>.</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">As a result, access to operational features has been restricted. To continue using BarFlow services, please renew your subscription immediately.</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">If you have any questions or need assistance, please contact our support team.</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Best regards,<br><strong>The BarFlow Team</strong></p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} BarFlow. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return sendAndRecord({
    toEmail: ownerEmail,
    toName: ownerName,
    subject,
    text,
    html,
    notificationType: 'subscription_expired',
    businessId,
  })
}

// ──────────────────────────────────────────────
// 7. Subscription Renewal Confirmation (to owner)
// ──────────────────────────────────────────────
export async function sendRenewalConfirmation({ businessName, ownerName, ownerEmail, planName, newExpiryDate, amount, businessId }) {
  if (!(await isNotificationEnabled('notify_renewal_confirmation', businessId))) return false
  const subject = `Subscription Renewed – ${planName} Plan for ${businessName}`
  const text = `Hello ${ownerName || 'Business Owner'},

Your subscription for ${businessName} has been renewed successfully!

  Plan: ${planName}
  New Expiry Date: ${newExpiryDate ? new Date(newExpiryDate).toLocaleDateString() : 'N/A'}
  Amount Paid: ${amount ? `RWF ${Number(amount).toLocaleString()}` : 'N/A'}

All BarFlow services are now fully accessible. Thank you for continuing with BarFlow!

Best regards,
The BarFlow Team`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Subscription Renewed! 🎉</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Hello <strong>${ownerName || 'Business Owner'}</strong>,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Your subscription for <strong>${businessName}</strong> has been renewed successfully!</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Plan</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${planName}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">New Expiry Date</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${newExpiryDate ? new Date(newExpiryDate).toLocaleDateString() : 'N/A'}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Amount Paid</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${amount ? `RWF ${Number(amount).toLocaleString()}` : 'N/A'}</td></tr>
      </table>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">All BarFlow services are now fully accessible. Thank you for continuing with BarFlow!</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Best regards,<br><strong>The BarFlow Team</strong></p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} BarFlow. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return sendAndRecord({
    toEmail: ownerEmail,
    toName: ownerName,
    subject,
    text,
    html,
    notificationType: 'renewal_confirmation',
    businessId,
  })
}

// ──────────────────────────────────────────────
// 8. Account Suspended/Deactivated Notification (to owner)
// ──────────────────────────────────────────────
export async function sendAccountSuspended({ businessName, ownerName, ownerEmail, reason, businessId }) {
  if (!(await isNotificationEnabled('notify_account_suspended', businessId))) return false
  const subject = `Account Suspended – ${businessName}`
  const text = `Hello ${ownerName || 'Business Owner'},

Your business account for ${businessName} has been suspended by the platform administrator.

  Business Name: ${businessName}
  Status: Suspended
  Reason: ${reason || 'Violation of platform terms of service'}

As a result, access to all BarFlow services has been temporarily restricted. If you believe this is an error or would like to resolve this issue, please contact our support team.

Best regards,
The BarFlow Team`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #f5576c 0%, #ff6a88 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Account Suspended</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Hello <strong>${ownerName || 'Business Owner'}</strong>,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Your business account for <strong>${businessName}</strong> has been suspended by the platform administrator.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Business Name</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${businessName}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Status</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #e74c3c; font-weight: bold;">Suspended</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Reason</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${reason || 'Violation of platform terms of service'}</td></tr>
      </table>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">As a result, access to all BarFlow services has been temporarily restricted. If you believe this is an error or would like to resolve this issue, please contact our support team.</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Best regards,<br><strong>The BarFlow Team</strong></p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} BarFlow. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return sendAndRecord({
    toEmail: ownerEmail,
    toName: ownerName,
    subject,
    text,
    html,
    notificationType: 'account_suspended',
    businessId,
  })
}

// ──────────────────────────────────────────────
// 9. Account Reactivated Notification (to owner)
// ──────────────────────────────────────────────
export async function sendAccountReactivated({ businessName, ownerName, ownerEmail, businessId }) {
  if (!(await isNotificationEnabled('notify_account_reactivated', businessId))) return false
  const subject = `Account Reactivated – ${businessName}`
  const text = `Hello ${ownerName || 'Business Owner'},

Great news! Your business account for ${businessName} has been reactivated by the platform administrator.

  Business Name: ${businessName}
  Status: Active

All BarFlow services are now fully accessible again. You can resume managing your operations.

If you have any questions, please contact our support team.

Best regards,
The BarFlow Team`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Account Reactivated! 🎉</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Hello <strong>${ownerName || 'Business Owner'}</strong>,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Great news! Your business account for <strong>${businessName}</strong> has been reactivated by the platform administrator.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Business Name</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: bold;">${businessName}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Status</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #27ae60; font-weight: bold;">Active</td></tr>
      </table>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">All BarFlow services are now fully accessible again. You can resume managing your operations.</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">If you have any questions, please contact our support team.</p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">Best regards,<br><strong>The BarFlow Team</strong></p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 12px;">
      <p>&copy; ${new Date().getFullYear()} BarFlow. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

  return sendAndRecord({
    toEmail: ownerEmail,
    toName: ownerName,
    subject,
    text,
    html,
    notificationType: 'account_reactivated',
    businessId,
  })
}

// ──────────────────────────────────────────────
// 10. Get email notification history
// ──────────────────────────────────────────────
export async function getEmailNotifications({ businessId, limit = 50, offset = 0 }) {
  try {
    let sql = 'SELECT * FROM email_notifications WHERE 1=1'
    const params = []
    if (businessId) {
      sql += ' AND business_id = $' + (params.length + 1)
      params.push(businessId)
    }
    sql += ' ORDER BY sent_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
    params.push(limit, offset)

    const { rows } = await query(sql, params)
    return rows.map(r => ({
      id: r.id,
      businessId: r.business_id,
      recipientEmail: r.recipient_email,
      recipientName: r.recipient_name,
      subject: r.subject,
      notificationType: r.notification_type,
      status: r.status,
      errorMessage: r.error_message,
      sentAt: r.sent_at,
    }))
  } catch (error) {
    console.error('Failed to fetch email notifications:', error.message)
    return []
  }
}