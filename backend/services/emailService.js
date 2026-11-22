import { sendMail } from './mailer.js'

export async function sendVerificationEmail(toEmail, code, userName) {
  if (!toEmail) return false

  const subject = 'Your verification code'
  const text = `Hello ${userName || ''},\n\nYour verification code is: ${code}\n\nThis code will expire in 5 minutes.\n\nIf you did not request this code, please ignore this email.`

  try {
    await sendMail({ to: toEmail, subject, text })
    return true
  } catch (error) {
    console.error('Failed to send verification email:', error.message)
    return false
  }
}
