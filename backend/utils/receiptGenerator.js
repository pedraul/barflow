export function generateReceipt({ orderId, items, total, business = 'BarFlow' }) {
  const lines = items.map((item) => `${item.name} x${item.quantity} = ${item.price * item.quantity}`)
  return [`${business}`, `Order ${orderId}`, ...lines, `Total: ${total}`].join('\n')
}

export default { generateReceipt }
