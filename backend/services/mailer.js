// One email transport for the whole backend.
// Accounts are tried in order: the SMTP account in Settings → Email (platform admin), then the
// account in the environment (EMAIL_USER / EMAIL_APP_PASSWORD or SMTP_USER / SMTP_PASS).
// If one is rejected (wrong password), the next is used, so a bad entry in Settings does not
// stop password-reset and other emails.
import nodemailer from 'nodemailer'
import { getPlatformSettings } from './platformSettings.js'

const transporters = new Map()
const filled = (v) => v !== undefined && v !== null && String(v).trim() !== ''

async function candidateAccounts() {
  const s = await getPlatformSettings()
  const list = []
  if (filled(s.email_smtp_user) && filled(s.email_smtp_password)) {
    list.push({
      source: 'settings',
      host: filled(s.email_smtp_host) ? s.email_smtp_host : 'smtp.gmail.com',
      port: Number(s.email_smtp_port) || 587,
      user: String(s.email_smtp_user).trim(),
      pass: String(s.email_smtp_password),
    })
  }
  const envUser = [process.env.SMTP_USER, process.env.EMAIL_USER].find(filled)
  const envPass = [process.env.SMTP_PASS, process.env.EMAIL_APP_PASSWORD, process.env.EMAIL_PASSWORD].find(filled)
  if (envUser && envPass) {
    list.push({
      source: 'environment',
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      user: envUser.trim(),
      pass: envPass,
    })
  }
  const seen = new Set()
  return list.filter((a) => {
    const key = `${a.host}|${a.user}|${a.pass}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function transporterFor(account) {
  const key = `${account.host}|${account.port}|${account.user}|${account.pass}`
  if (!transporters.has(key)) {
    transporters.set(key, nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.port === 465,
      auth: { user: account.user, pass: account.pass },
    }))
  }
  return transporters.get(key)
}

async function fromHeader(account) {
  const s = await getPlatformSettings()
  const name = [s.email_from_name, s.platform_name].find(filled) || 'BarFlow'
  // Gmail only sends from the signed-in address (or its verified aliases).
  const isGmail = /gmail\.com$/i.test(account.host) || /@gmail\.com$/i.test(account.user)
  const address = !isGmail && filled(s.email_from_address) ? s.email_from_address : account.user
  return process.env.SMTP_FROM || `${name.replace(/[<>"]/g, '')} <${address}>`
}

export async function mailConfigured() {
  return (await candidateAccounts()).length > 0
}

/** Sends one email. Throws (with the provider's reason) when no account can send it. */
export async function sendMail({ to, subject, text, html }) {
  const accounts = await candidateAccounts()
  if (!accounts.length) throw new Error('Email is not configured. Set the SMTP account in Settings → Email.')
  let lastError = null
  for (const account of accounts) {
    try {
      const info = await transporterFor(account).sendMail({
        from: await fromHeader(account),
        to,
        subject,
        text: text || '',
        html: html || text || '',
      })
      return { ...info, account: account.source }
    } catch (error) {
      lastError = error
      const authProblem = error.code === 'EAUTH' || /invalid login|username and password|credentials/i.test(error.message)
      console.error(`[mailer] ${account.source} account could not send: ${error.message.split('\n')[0]}`)
      if (!authProblem) break // a delivery problem, not a login problem: another account will not help
    }
  }
  throw lastError
}
