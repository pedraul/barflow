// Owner-defined payment methods for the public "scan to pay" page.

export const PAYMENT_METHOD_TYPES = ['mtn_momo', 'momo_pay', 'airtel_money', 'bank', 'other']

const clean = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Validates and trims what the owner submitted. Drops empty entries. */
export function normalizePaymentMethods(input) {
  if (!Array.isArray(input)) return []
  return input
    .slice(0, 12)
    .map((m, index) => {
      const type = PAYMENT_METHOD_TYPES.includes(m?.type) ? m.type : 'other'
      return {
        id: clean(m?.id, 40) || `m${Date.now().toString(36)}${index}`,
        type,
        label: clean(m?.label, 60),
        accountName: clean(m?.accountName, 80),
        number: clean(m?.number, 60),
        bankName: clean(m?.bankName, 80),
        dialCode: clean(m?.dialCode, 40).replace(/[^0-9*#+]/g, ''),
        note: clean(m?.note, 200),
        enabled: m?.enabled !== false,
      }
    })
    .filter((m) => m.number || m.accountName || m.note)
}

/** Builds methods from the old single-value columns (before the list existed). */
export function legacyPaymentMethods(ps = {}) {
  const methods = []
  const name = ps.merchant_name || ''
  if (ps.mtn_momo_number) methods.push({ id: 'legacy-mtn', type: 'mtn_momo', label: '', accountName: name, number: ps.mtn_momo_number, bankName: '', dialCode: '', note: '', enabled: true })
  if (ps.merchant_code) methods.push({ id: 'legacy-code', type: 'momo_pay', label: '', accountName: name, number: ps.merchant_code, bankName: '', dialCode: '', note: '', enabled: true })
  if (ps.airtel_money_number) methods.push({ id: 'legacy-airtel', type: 'airtel_money', label: '', accountName: name, number: ps.airtel_money_number, bankName: '', dialCode: '', note: '', enabled: true })
  if (ps.bank_account) methods.push({ id: 'legacy-bank', type: 'bank', label: '', accountName: name, number: ps.bank_account, bankName: '', dialCode: '', note: '', enabled: true })
  return methods
}

/** Stored list, or the legacy fields converted when nothing is stored yet. */
export function readPaymentMethods(ps = {}) {
  const stored = Array.isArray(ps.payment_methods) ? ps.payment_methods : []
  return stored.length ? normalizePaymentMethods(stored) : legacyPaymentMethods(ps)
}
