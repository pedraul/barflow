// Payment method types the owner can offer on the "scan to pay" page.
// suggestDial: a common Rwanda USSD pattern the owner can choose to use (editable).
export const PAYMENT_METHOD_TYPES = {
  mtn_momo: {
    label: 'MTN Mobile Money',
    numberLabel: 'MoMo phone number',
    numberPlaceholder: 'e.g. 0788123456',
    accent: '#ca8a04',
    tint: '#fefce8',
    suggestDial: (n) => (n ? `*182*1*1*${n.replace(/\s+/g, '')}#` : ''),
  },
  momo_pay: {
    label: 'MoMo Pay (merchant code)',
    numberLabel: 'Merchant code',
    numberPlaceholder: 'e.g. 123456',
    accent: '#ca8a04',
    tint: '#fefce8',
    suggestDial: (n) => (n ? `*182*8*1*${n.replace(/\s+/g, '')}#` : ''),
  },
  airtel_money: {
    label: 'Airtel Money',
    numberLabel: 'Airtel phone number',
    numberPlaceholder: 'e.g. 0733123456',
    accent: '#dc2626',
    tint: '#fef2f2',
    suggestDial: null,
  },
  bank: {
    label: 'Bank transfer',
    numberLabel: 'Account number',
    numberPlaceholder: 'e.g. 40001-0001234567-00',
    accent: '#1d4ed8',
    tint: '#eff6ff',
    suggestDial: null,
  },
  other: {
    label: 'Other',
    numberLabel: 'Number / reference',
    numberPlaceholder: 'e.g. phone, code or account',
    accent: '#475569',
    tint: '#f8fafc',
    suggestDial: null,
  },
}

export const PAYMENT_METHOD_TYPE_KEYS = Object.keys(PAYMENT_METHOD_TYPES)

export const methodType = (type) => PAYMENT_METHOD_TYPES[type] || PAYMENT_METHOD_TYPES.other

/** Display title: the owner's custom label, else the type name. */
export const methodTitle = (method, t = (s) => s) =>
  method?.label || t(methodType(method?.type).label)

/** tel: link that dials a USSD code (# must be encoded). */
export const dialHref = (code) => (code ? `tel:${String(code).replace(/#/g, '%23')}` : '')

export const newPaymentMethod = (type = 'mtn_momo') => ({
  id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  type,
  label: '',
  accountName: '',
  number: '',
  bankName: '',
  dialCode: '',
  note: '',
  enabled: true,
})
