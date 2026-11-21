// One color per order status, used by every order card, heading and badge.
// solid: strong color (white text on top), tint: light card background,
// text: readable text color on the tint.
const STATUS_COLORS = {
  open: { label: 'New', solid: '#1d4ed8', tint: '#eff6ff', text: '#1e40af' },
  new: { label: 'New', solid: '#1d4ed8', tint: '#eff6ff', text: '#1e40af' },
  pending: { label: 'Pending', solid: '#c2410c', tint: '#fff7ed', text: '#9a3412' },
  preparing: { label: 'Preparing', solid: '#b45309', tint: '#fffbeb', text: '#92400e' },
  ready: { label: 'Ready', solid: '#15803d', tint: '#f0fdf4', text: '#166534' },
  served: { label: 'Served', solid: '#6d28d9', tint: '#f5f3ff', text: '#5b21b6' },
  delivered: { label: 'Served', solid: '#6d28d9', tint: '#f5f3ff', text: '#5b21b6' },
  paid: { label: 'Paid', solid: '#0f766e', tint: '#f0fdfa', text: '#115e59' },
  completed: { label: 'Paid', solid: '#0f766e', tint: '#f0fdfa', text: '#115e59' },
  cancelled: { label: 'Cancelled', solid: '#b91c1c', tint: '#fef2f2', text: '#991b1b' },
  canceled: { label: 'Cancelled', solid: '#b91c1c', tint: '#fef2f2', text: '#991b1b' },
}
const FALLBACK = { label: '', solid: '#0f172a', tint: '#f8fafc', text: '#334155' }

export function orderStatusColors(status) {
  const key = String(status || '').trim().toLowerCase()
  const found = STATUS_COLORS[key]
  return found || { ...FALLBACK, label: status ? String(status) : '' }
}

/** Card container style: colored left edge + light tint for the status. */
export function orderCardStyle(status, { edge = 6 } = {}) {
  const c = orderStatusColors(status)
  const key = String(status || '').trim().toLowerCase()
  const varName = STATUS_COLORS[key] ? (TINT_VAR[key] || key) : 'default'
  return {
    borderLeft: `${edge}px solid ${c.solid}`,
    // Tint comes from a CSS variable so dark mode can use a deeper shade (styles.css).
    backgroundColor: `var(--order-tint-${varName}, ${c.tint})`,
  }
}

const TINT_VAR = { new: 'open', delivered: 'served', completed: 'paid', canceled: 'cancelled' }
