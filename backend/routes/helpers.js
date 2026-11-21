import { query } from '../config/database.js'

let cachedBusinessId = null
export async function getBusinessId() {
  if (cachedBusinessId) return cachedBusinessId
  const { rows } = await query('SELECT id FROM businesses LIMIT 1')
  cachedBusinessId = rows[0]?.id
  return cachedBusinessId
}

export const mapUser = (u) => ({
  id: u.id,
  name: u.full_name,
  email: u.email,
  phone: u.phone || '',
  role: u.role,
  branch: u.branch_name || '',
  status: u.is_active ? 'Active' : 'Inactive',
  salary: Number(u.salary) || 0,
  bonus: Number(u.bonus) || 0,
  promotion: u.promotion || '',
  lastLogin: u.last_login ? new Date(u.last_login).toLocaleString() : 'Never',
})

export const mapOrder = (o) => {
  const legacyTableNumber = /^\d+$/.test(String(o.table_name || ''))
    ? Number(o.table_name)
    : null
  const tableNumber = o.table_number ?? legacyTableNumber
  const waiterName = o.waiter_name || o.waiterName || ''
  const walkInName = /^(walk[ -]?in)( customer)?$/i.test(String(o.table_name || '').trim())
  const displayName = o.source === 'waiter' && walkInName && waiterName
    ? `Waiter: ${waiterName}`
    : o.table_name || 'Walk-in'

  return {
    id: o.id,
    orderNumber: o.order_number,
    tableNumber,
    tableName: tableNumber != null ? `Table ${tableNumber}` : displayName,
    customer: displayName,
    customerPhone: o.customer_phone || '',
    items: (o.items || []).map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: Number(item.quantity),
      price: Number(item.price),
    })),
    total: Number(o.total_amount) || 0,
    status: o.status,
    createdAt: new Date(o.created_at).toLocaleString(),
    source: o.source || 'waiter',
    station: o.station || null,
    waiterId: o.waiter_id || o.user_id || null,
    waiterName,
  }
}
