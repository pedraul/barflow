import { query } from '../config/database.js'

/**
 * Payment Service
 * Handles payment processing for the QR self-ordering system
 * Supports: MTN MoMo, Airtel Money, Cash
 */

const PAYMENT_PROVIDERS = {
  mtn_momo: {
    name: 'MTN Mobile Money',
    ussdCode: '*182#',
    generateReference: () => 'MOMO-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase(),
  },
  airtel_money: {
    name: 'Airtel Money',
    ussdCode: '*500#',
    generateReference: () => 'AIRTEL-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase(),
  },
  cash: {
    name: 'Cash',
    ussdCode: null,
    generateReference: () => 'CASH-' + Date.now().toString(36).toUpperCase(),
  },
}

/**
 * Initiate a payment request
 * For mobile money: returns USSD instructions
 * For cash: marks as pending confirmation
 */
export async function initiatePayment({ orderId, amount, method, customerPhone, customerName }) {
  const provider = PAYMENT_PROVIDERS[method]
  if (!provider) {
    throw new Error(`Unsupported payment method: ${method}`)
  }

  const { rows: orderRows } = await query(
    `SELECT business_id, branch_id FROM orders WHERE id = $1 LIMIT 1`,
    [orderId]
  )
  if (!orderRows.length) throw new Error('Order not found')
  const orderContext = orderRows[0]

  const reference = provider.generateReference()

  const paymentResult = await query(
    `INSERT INTO payments (order_id, business_id, branch_id, method, amount, reference, paid_at, provider, provider_status)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, 'PENDING') RETURNING id`,
    [orderId, orderContext.business_id, orderContext.branch_id, method, amount, reference, method === 'cash' ? null : 'momo']
  )

  const paymentId = paymentResult.rows[0].id

  // If mobile money, return USSD simulation
  if (method === 'mtn_momo' || method === 'airtel_money') {
    return {
      paymentId,
      reference,
      success: true,
      message: `A USSD request has been sent to ${customerPhone}. Please check your phone and enter your PIN to complete payment of ${formatCurrency(amount)}.`,
      ussdDetails: {
        phone: customerPhone,
        amount: amount,
        provider: provider.name,
        ussdCode: provider.ussdCode,
        reference: reference,
        instructions: [
          `1. Dial ${provider.ussdCode} on your phone`,
          `2. Enter your Mobile Money PIN`,
          `3. Confirm payment of ${formatCurrency(amount)}`,
          `4. Wait for confirmation SMS`,
        ],
      },
      status: 'pending_ussd_confirmation',
    }
  }

  // For cash payment
  return {
    paymentId,
    reference,
    success: true,
    message: 'Cash payment recorded. Please pay at the counter.',
    status: 'pending_cash',
  }
}

/**
 * Verify a payment (simulate USSD confirmation callback)
 * In production, this would be a webhook from the mobile money provider
 */
export async function verifyPayment(paymentId) {
  // Get payment details
  const result = await query(
    `SELECT p.*, o.total_amount, o.table_number, o.order_number,
            b.name AS business_name
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     JOIN businesses b ON b.id = o.business_id
     WHERE p.id = $1`,
    [paymentId]
  )

  const payment = result.rows[0]
  if (!payment) {
    throw new Error('Payment not found')
  }

  if (!payment.paid_at) {
    await query(
      `UPDATE payments SET paid_at = NOW(), provider_status = 'SUCCESS' WHERE id = $1`,
      [paymentId]
    )
  }

  const existingReceipt = await query(
    `SELECT receipt_data FROM receipts WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [payment.order_id]
  )
  if (existingReceipt.rows[0]?.receipt_data) {
    return {
      verified: true,
      receipt: existingReceipt.rows[0].receipt_data,
      smsSent: false,
    }
  }

  // Generate receipt
  const receipt = await generateReceipt({
    orderId: payment.order_id,
    paymentMethod: payment.method,
    amount: payment.amount,
    reference: payment.reference,
    businessName: payment.business_name,
    tableNumber: payment.table_number,
    orderNumber: payment.order_number,
    customerPhone: payment.customer_phone,
  })

  // Update order status to Paid
  await query(
    `UPDATE orders
     SET status = 'Paid', payment_method = $2, completed_at = NOW()
     WHERE id = $1`,
    [payment.order_id, payment.method]
  )

  // Record status history
  await query(
    `INSERT INTO order_status_history (order_id, status, changed_by, note)
     VALUES ($1, 'Paid', 'system', 'Payment completed via ' || $2)`,
    [payment.order_id, payment.method]
  )

  // Simulate sending receipt via SMS/USSD
  let smsSent = false
  if (payment.customer_phone && payment.customer_phone !== 'N/A') {
    // In production, integrate with SMS provider (e.g., Twilio, Africa's Talking)
    // await sendSMS(payment.customer_phone, `Receipt ${receipt.receiptNumber} for order ${receipt.orderNumber}. Total: ${formatCurrency(amount)}. Thank you!`)
    smsSent = true
  }

  return {
    verified: true,
    receipt,
    smsSent,
  }
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
  PAYMENT_PROVIDERS,
}