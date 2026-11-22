// Where subscription money goes, and how each payment records it.
//
// For MTN MoMo and Airtel Money the platform admin chooses (Settings → Payment):
//   manual - owners send the money to the platform's own receiving number (or merchant pay code)
//            and the admin confirms the payment in Payments. Works without provider API keys.
//   api    - the app sends a "request to pay" through the provider's merchant API; the money
//            lands in the merchant account that owns the API keys set on the server.
// Bank transfer is always confirmed by the admin.
//
// Every payment stores where it was meant to go (pay_to) at the moment it was created, so
// changing the receiving number later never rewrites history.
import { query } from '../config/database.js'

let ready = null
export function ensurePaymentCollectionSchema() {
  if (!ready) {
    ready = (async () => {
      await query(
        `ALTER TABLE platform_payments
           ADD COLUMN IF NOT EXISTS pay_to TEXT,
           ADD COLUMN IF NOT EXISTS payer_phone TEXT,
           ADD COLUMN IF NOT EXISTS payer_reference TEXT,
           ADD COLUMN IF NOT EXISTS review_note TEXT`
      )
      // "settled" is used by Payments → Settle but was missing from the allowed statuses.
      await query('ALTER TABLE platform_payments DROP CONSTRAINT IF EXISTS platform_payments_status_check')
      await query(
        `ALTER TABLE platform_payments ADD CONSTRAINT platform_payments_status_check
           CHECK (status IN ('paid', 'settled', 'pending', 'failed', 'refunded'))`
      )
    })().catch((error) => { ready = null; throw error })
  }
  return ready
}

export const PROVIDER_LABEL = { mtn_momo: 'MTN MoMo', airtel_money: 'Airtel Money', bank_transfer: 'Bank transfer' }

/** 250788123456 -> 0788 123 456 (how people in Rwanda read a number). */
export function displayPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  const local = digits.startsWith('250') ? `0${digits.slice(3)}` : digits
  return /^07\d{8}$/.test(local) ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : String(value || '')
}

/** One line describing where a payment must be sent, stored on the payment. */
export function payToText(method, option) {
  if (method === 'bank_transfer') return option?.account || ''
  if (option?.mode === 'api') return `${PROVIDER_LABEL[method]} merchant account (automatic)`
  const parts = []
  if (option?.number) parts.push(displayPhone(option.number))
  if (option?.name) parts.push(option.name)
  if (option?.code) parts.push(`pay code ${option.code}`)
  return parts.join(' · ')
}

/** Short reference the owner writes on the transfer and the admin searches for. */
export const shortReference = (reference) => String(reference || '').slice(0, 8).toUpperCase()

/** True when this pending payment waits for the admin rather than for a provider. */
export function awaitsAdminConfirmation(payment) {
  return payment.payment_method === 'bank_transfer'
    || ['AWAITING_BANK_TRANSFER', 'AWAITING_MANUAL_CONFIRMATION'].includes(payment.provider_status)
}
