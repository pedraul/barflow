import { query } from '../config/database.js'
import { randomUUID } from 'node:crypto'
import { getMobileMoneyPaymentStatus, requestMobileMoneyPayment } from './mobileMoneyProviders.js'

/**
 * Payment Service
 * Handles payment processing for the QR self-ordering system
 * Supports: MTN MoMo, Airtel Money, Cash
 */

async function loadPayment(paymentId) {
  const { rows } = await query(
    `SELECT p.*, o.total_amount, o.table_number, o.order_number, o.customer_phone,
            b.name AS business_name
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     JOIN businesses b ON b.id = o.business_id
     WHERE p.id = $1`,
    [paymentId]
  )
  if (!rows.length) throw new Error('Payment not found')
  return rows[0]
}

export async function initiatePayment({ orderId, method, customerPhone }) {
  if (!['mtn_momo', 'airtel_money', 'cash'].includes(method)) {
    throw new Error(`Unsupported payment method: ${method}`)
  }
  const { rows: orderRows } = await query(
    `SELECT id, business_id, branch_id, total_amount, status, customer_phone
     FROM orders WHERE id = $1 LIMIT 1`,
    [orderId]
  )
  const order = orderRows[0]
  if (!order || ['Paid', 'Cancelled'].includes(order.status)) throw new Error('Order not found or no longer payable')

  const amount = Number(order.total_amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Order has an invalid payment amount')
  const phone = String(customerPhone || '').trim()
  if (method !== 'cash' && !phone) throw new Error('A customer mobile number is required')

  const { rows: pendingPayments } = await query(
    `SELECT id, reference, method, provider_status
     FROM payments
     WHERE order_id = $1 AND paid_at IS NULL
       AND COALESCE(provider_status, 'PENDING') NOT IN ('FAILED', 'TF', 'CANCELLED')
     LIMIT 1`,
    [order.id]
  )
  if (pendingPayments.length) {
    const pending = pendingPayments[0]
    if (pending.method !== method) {
      throw new Error('A payment is already in progress for this order. Check its status before choosing another method.')
    }
    return {
      paymentId: pending.id,
      reference: pending.reference,
      success: true,
      ...(method === 'cash'
        ? await verifyPayment(pending.id)
        : { status: 'pending' }),
      message: method === 'cash'
        ? 'Cash payment completed automatically.'
        : 'A payment request is already in progress. Approve it on your phone or wait for provider confirmation.',
    }
  }

  const reference = randomUUID()
  const { rows: paymentRows } = await query(
    `INSERT INTO payments
       (order_id, business_id, branch_id, method, amount, reference, paid_at, provider, provider_status)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, 'PENDING')
     RETURNING id`,
    [order.id, order.business_id, order.branch_id, method, amount, reference, method === 'cash' ? null : method]
  )
  const paymentId = paymentRows[0].id

  if (method === 'cash') {
    if (phone) await query('UPDATE orders SET customer_phone = $1 WHERE id = $2', [phone, order.id])
    const completed = await verifyPayment(paymentId)
    return {
      paymentId,
      reference,
      success: true,
      message: 'Cash payment completed automatically.',
      ...completed,
    }
  }

  try {
    const providerPayment = await requestMobileMoneyPayment({ method, reference, amount, phone })
    await query(
      `UPDATE payments SET provider = $2, provider_txn_id = $3, provider_status = $4
       WHERE id = $1 RETURNING id`,
      [paymentId, providerPayment.provider, providerPayment.providerTxnId, providerPayment.providerStatus]
    )
    await query('UPDATE orders SET customer_phone = $1 WHERE id = $2', [phone, order.id])
  } catch (error) {
    await query(
      `UPDATE payments SET provider_status = 'FAILED', provider_payload = $2
       WHERE id = $1 RETURNING id`,
      [paymentId, JSON.stringify({ error: error.message })]
    )
    throw error
  }

  return {
    paymentId,
    reference,
    success: true,
    message: `A payment request for ${formatCurrency(amount)} was sent to ${phone}. Approve it on your phone; this page will update when the provider confirms it.`,
    status: 'pending',
  }
}

async function completePayment(payment, providerStatus, providerPayload) {
  const existingReceipt = await query(
    `SELECT receipt_data FROM receipts WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [payment.order_id]
  )
  const storedReceipt = existingReceipt.rows[0]?.receipt_data
  if (storedReceipt && storedReceipt.reference !== payment.reference) {
    throw new Error('This order already has a receipt for another payment. Contact the business to reconcile this transaction.')
  }
  const receipt = storedReceipt || await generateReceipt({
      orderId: payment.order_id,
      paymentMethod: payment.method,
      amount: payment.amount,
      reference: payment.reference,
      businessName: payment.business_name,
      tableNumber: payment.table_number,
      orderNumber: payment.order_number,
      customerPhone: payment.customer_phone,
    })
  await query(
    `UPDATE orders
     SET status = 'Paid', payment_method = $2, completed_at = NOW()
     WHERE id = $1 AND status != 'Paid'`,
    [payment.order_id, payment.method]
  )
  await query(
    `INSERT INTO order_status_history (order_id, status, changed_by, note)
     SELECT $1, 'Paid', 'system', 'Payment completed via ' || $2
     WHERE NOT EXISTS (
       SELECT 1 FROM order_status_history WHERE order_id = $1 AND status = 'Paid'
     )`,
    [payment.order_id, payment.method]
  )
  await query(
     `UPDATE payments
      SET paid_at = COALESCE(paid_at, NOW()), provider_status = $2, provider_payload = $3
      WHERE id = $1 RETURNING id`,
     [payment.id, providerStatus, JSON.stringify(providerPayload || {})]
  )
  return { verified: true, status: 'completed', receipt, smsSent: false }
}

export async function verifyPayment(paymentId) {
  const payment = await loadPayment(paymentId)
  if (payment.paid_at) {
    const receiptResult = await query(
      `SELECT receipt_data FROM receipts WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [payment.order_id]
    )
    if (!receiptResult.rows[0]?.receipt_data) throw new Error('Payment is marked paid but its receipt is missing')
    return {
      verified: true,
      status: 'completed',
      receipt: receiptResult.rows[0]?.receipt_data || null,
      smsSent: false,
    }
  }
  if (payment.method === 'cash') {
    return completePayment(payment, 'CASH_AUTO_COMPLETED', { automatic: true })
  }

  const providerResult = await getMobileMoneyPaymentStatus(payment)
  await query(
    `UPDATE payments SET provider_status = $2, provider_payload = $3 WHERE id = $1 RETURNING id`,
    [paymentId, providerResult.providerStatus, JSON.stringify(providerResult.payload || {})]
  )
  if (providerResult.status === 'completed') {
    return completePayment(payment, providerResult.providerStatus, providerResult.payload)
  }
  if (providerResult.status === 'failed') {
    return { verified: false, status: 'failed', providerStatus: providerResult.providerStatus, receipt: null, smsSent: false }
  }
  return { verified: false, status: 'pending', providerStatus: providerResult.providerStatus, receipt: null, smsSent: false }
}

export async function confirmCashPayment(paymentId, { businessId, branchId }) {
  const payment = await loadPayment(paymentId)
  if (payment.method !== 'cash' || payment.business_id !== businessId || payment.branch_id !== branchId) {
    throw new Error('Cash payment not found for this branch')
  }
  if (payment.paid_at) return verifyPayment(paymentId)
  return completePayment(payment, 'CASH_RECEIVED', { confirmedBy: 'staff' })
}

/**
 * Generate a receipt after successful payment
 */
async function generateReceipt({ orderId, paymentMethod, amount, reference, businessName, tableNumber, orderNumber, customerPhone }) {
  const receiptNumber = 'RCP-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase()

  // Get order items
  const itemsResult = await query(
    `SELECT p.name, p.image_url, oi.quantity, oi.unit_price, oi.line_total
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1`,
    [orderId]
  )

  const orderDetails = await query(
    `SELECT o.table_number, o.order_number, o.source,
            u.full_name AS waiter_name
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [orderId]
  )
  const waiterName = orderDetails.rows[0]?.waiter_name || null

  let resolvedBusinessName = businessName
  if (!resolvedBusinessName) {
    const businessResult = await query(
      `SELECT b.name
       FROM orders o
       JOIN businesses b ON b.id = o.business_id
       WHERE o.id = $1`,
      [orderId]
    )
    resolvedBusinessName = businessResult.rows[0]?.name || 'BarFlow'
  }

  const receiptData = {
    receiptNumber,
    businessName: resolvedBusinessName,
    tableNumber: tableNumber || orderDetails.rows[0]?.table_number || 'N/A',
    orderNumber: orderNumber || orderDetails.rows[0]?.order_number || 'N/A',
    paymentMethod,
    amount,
    reference,
    customerPhone: customerPhone || 'N/A',
    waiterName: waiterName || (orderDetails.rows[0]?.source === 'waiter' ? 'Waiter' : 'Operator'),
    items: itemsResult.rows.map(item => ({
      name: item.name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
    total: amount,
    date: new Date().toLocaleString(),
  }

  // Save receipt to database
  await query(
    `INSERT INTO receipts (order_id, receipt_number, payment_method, amount_paid, customer_phone, receipt_data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, receiptNumber, paymentMethod, amount, customerPhone, JSON.stringify(receiptData)]
  )

  return receiptData
}

function formatCurrency(amount) {
  return 'RWF ' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default {
  initiatePayment,
  verifyPayment,
  confirmCashPayment,
}
