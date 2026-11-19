// Remembers which QR orders were placed from this device, so a customer sees
// only their own orders. localStorage survives re-scanning the QR code (which
// usually opens a fresh tab, losing sessionStorage).
const KEY = 'barflow.customerOrders'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    const cutoff = Date.now() - MAX_AGE_MS
    return Array.isArray(list) ? list.filter((o) => o && o.orderId && (o.placedAt || 0) > cutoff) : []
  } catch {
    return []
  }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* storage unavailable */ }
}

export function trackCustomerOrder({ orderId, businessId, branchId, tableNumber }) {
  if (!orderId) return
  const list = read().filter((o) => o.orderId !== orderId)
  list.push({ orderId: String(orderId), businessId: String(businessId || ''), branchId: String(branchId || ''), tableNumber: String(tableNumber || ''), placedAt: Date.now() })
  write(list)
}

export function getTrackedOrderIds(businessId) {
  return read()
    .filter((o) => !businessId || o.businessId === String(businessId))
    .map((o) => o.orderId)
}

export function untrackCustomerOrders(orderIds) {
  if (!orderIds?.length) return
  const drop = new Set(orderIds.map(String))
  write(read().filter((o) => !drop.has(o.orderId)))
}
