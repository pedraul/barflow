export function getOrderLocation(order, prefixTable = true) {
  if (order?.tableNumber != null && order.tableNumber !== '') {
    return prefixTable ? `Table ${order.tableNumber}` : String(order.tableNumber)
  }

  const customer = order?.customerName || order?.customer || order?.tableName || order?.table
  const isWalkIn = !customer || /^(walk[ -]?in)( customer)?$/i.test(String(customer).trim())
  const waiterName = order?.waiterName || order?.waiter_name
  const isWaiterOrder = String(order?.source || '').toLowerCase() === 'waiter' || Boolean(order?.waiterId || order?.waiter_id)

  if (isWalkIn && isWaiterOrder && waiterName) return `Waiter: ${waiterName}`
  return customer || 'Walk-in'
}
