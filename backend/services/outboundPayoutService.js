import { randomUUID } from 'node:crypto'
import { query } from '../config/database.js'
import {
  getMobileMoneyPayoutStatus,
  normalizeRwandaPhone,
  requestMobileMoneyPayout,
  validateMobileMoneyPayoutConfig,
} from './mobileMoneyProviders.js'

const PAYOUT_TYPES = {
  transfer: {
    table: 'transfers',
    phoneColumn: 'to_phone',
    providerColumn: 'payout_method',
    completedStatus: 'approved',
  },
  withdrawal: {
    table: 'withdrawals',
    phoneColumn: 'phone_number',
    providerColumn: 'payout_method',
    completedStatus: 'completed',
  },
}

function payoutResult(row) {
  return {
    id: row.id,
    status: row.status,
    method: row.payout_method,
    phone: row.phone || '',
    amount: Number(row.amount) || 0,
    reference: row.payout_reference || null,
    providerStatus: row.provider_status || null,
  }
}

function payoutTable(type) {
  const config = PAYOUT_TYPES[type]
  if (!config) throw new Error('Unsupported payout type.')
  return config
}

export function createOutboundPayoutRequest({ phone, amount, method }) {
  if (!phone || !String(phone).trim()) throw new Error('A recipient phone number is required.')
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) throw new Error('Amount must be greater than zero.')
  if (!['mtn_momo', 'airtel_money'].includes(method)) {
    throw new Error('Choose MTN MoMo or Airtel Money as the payout provider.')
  }
  const normalizedPhone = normalizeRwandaPhone(phone)
  return { phone: normalizedPhone, amount: value, method }
}

export async function initiateOutboundPayout({ type, payoutId, businessId, branchId, approverId }) {
  const config = payoutTable(type)
  const { rows: payoutRows } = await query(
    `SELECT id, business_id, branch_id, ${config.phoneColumn} AS phone, amount,
            ${config.providerColumn} AS payout_method, status
     FROM ${config.table}
     WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3)`,
    [payoutId, businessId, branchId]
  )
  const payout = payoutRows[0]
  if (!payout) throw new Error(`${type === 'transfer' ? 'Transfer' : 'Withdrawal'} not found.`)
  if (payout.status !== 'pending') throw new Error('This payout is no longer pending approval.')
  const validated = createOutboundPayoutRequest({
    phone: payout.phone,
    amount: payout.amount,
    method: payout.payout_method,
  })
  validateMobileMoneyPayoutConfig(validated.method)
  const reference = randomUUID()
  const transactionId = randomUUID()
  const approvalFields = type === 'transfer'
    ? 'manager_approval = 1, manager_approved_by = $4, approved_at = NOW()'
    : 'approved_by = $4, approved_at = NOW()'
  const { rows: claimed } = await query(
    `UPDATE ${config.table}
     SET status = 'processing', ${approvalFields}, payout_reference = $5,
         provider_txn_id = $6, provider_status = 'REQUESTED',
         payout_requested_at = NOW(), provider_payload = '{}'::jsonb
     WHERE id = $1 AND business_id = $2
       AND ($3::uuid IS NULL OR branch_id = $3) AND status = 'pending'
     RETURNING id, status, ${config.providerColumn} AS payout_method,
               ${config.phoneColumn} AS phone, amount, payout_reference, provider_status`,
    [payoutId, businessId, branchId, approverId, reference, transactionId]
  )
  if (!claimed.length) throw new Error('This payout has already been approved or processed.')

  let providerResult
  try {
    providerResult = await requestMobileMoneyPayout({
      method: payout.payout_method,
      reference,
      transactionId,
      amount: validated.amount,
      phone: payout.phone,
    })
  } catch (error) {
    const notSent = error.payoutRequestSent === false
    const uncertain = error.ambiguous === true
    const status = notSent ? 'pending' : uncertain ? 'processing' : 'failed'
    const providerStatus = notSent ? 'NOT_SENT' : uncertain ? 'UNKNOWN' : 'FAILED'
    const { rows } = await query(
      `UPDATE ${config.table}
       SET status = $2,
           ${type === 'transfer'
             ? "manager_approval = CASE WHEN $2 = 'pending' THEN 0 ELSE manager_approval END, manager_approved_by = CASE WHEN $2 = 'pending' THEN NULL ELSE manager_approved_by END"
             : "approved_by = CASE WHEN $2 = 'pending' THEN NULL ELSE approved_by END"},
           approved_at = CASE WHEN $2 = 'pending' THEN NULL ELSE approved_at END,
           payout_reference = CASE WHEN $2 = 'pending' THEN NULL ELSE payout_reference END,
           provider_txn_id = CASE WHEN $2 = 'pending' THEN NULL ELSE provider_txn_id END,
           payout_requested_at = CASE WHEN $2 = 'pending' THEN NULL ELSE payout_requested_at END,
           provider_status = $3, provider_payload = $4
       WHERE id = $1 AND status = 'processing'
       RETURNING id, status, ${config.providerColumn} AS payout_method,
                 ${config.phoneColumn} AS phone, amount, payout_reference, provider_status`,
      [payoutId, status, providerStatus, JSON.stringify({ error: error.message })]
    )
    const result = payoutResult(rows[0] || claimed[0])
    result.message = notSent
      ? `No payout request was sent. ${error.message}`
      : uncertain
        ? 'The provider response is uncertain. Check payout status before any retry.'
        : error.message
    return result
  }

  const { rows } = await query(
    `UPDATE ${config.table}
     SET provider_txn_id = $2, provider_status = $3, provider_payload = $4
     WHERE id = $1 AND status = 'processing'
     RETURNING id, status, ${config.providerColumn} AS payout_method,
               ${config.phoneColumn} AS phone, amount, payout_reference, provider_status`,
    [payoutId, providerResult.providerTxnId, providerResult.providerStatus, JSON.stringify(providerResult)]
  )
  return payoutResult(rows[0] || claimed[0])
}

export async function checkOutboundPayoutStatus({ type, payoutId, businessId, branchId }) {
  const config = payoutTable(type)
  const { rows } = await query(
    `SELECT id, business_id, branch_id, ${config.phoneColumn} AS phone, amount,
            ${config.providerColumn} AS payout_method, status, payout_reference,
            provider_txn_id, provider_status
     FROM ${config.table}
     WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3)`,
    [payoutId, businessId, branchId]
  )
  const payout = rows[0]
  if (!payout) throw new Error(`${type === 'transfer' ? 'Transfer' : 'Withdrawal'} not found.`)
  if (payout.status !== 'processing') return payoutResult(payout)

  const result = await getMobileMoneyPayoutStatus({
    method: payout.payout_method,
    provider_reference: payout.payout_reference,
    provider_txn_id: payout.provider_txn_id,
    amount: payout.amount,
  })
  const successfulStatus = config.completedStatus
  if (result.status === 'completed') {
    await query(
      `UPDATE ${config.table}
       SET status = $2, provider_status = $3, provider_payload = $4
       WHERE id = $1 AND status = 'processing'`,
      [payoutId, successfulStatus, result.providerStatus, JSON.stringify(result.payload || {})]
    )
  } else {
    const status = result.status === 'failed' ? 'failed' : 'processing'
    await query(
      `UPDATE ${config.table}
       SET status = $2, provider_status = $3, provider_payload = $4
       WHERE id = $1 AND status = 'processing'`,
      [payoutId, status, result.providerStatus, JSON.stringify(result.payload || {})]
    )
  }

  const { rows: updated } = await query(
    `SELECT id, status, ${config.providerColumn} AS payout_method,
            ${config.phoneColumn} AS phone, amount, payout_reference, provider_status
     FROM ${config.table}
     WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3)`,
    [payoutId, businessId, branchId]
  )
  return payoutResult(updated[0])
}
