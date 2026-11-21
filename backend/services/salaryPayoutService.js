import { randomUUID } from 'node:crypto'
import { query } from '../config/database.js'
import {
  getMobileMoneyPayoutStatus,
  normalizeRwandaPhone,
  requestMobileMoneyPayout,
  validateMobileMoneyPayoutConfig,
} from './mobileMoneyProviders.js'

function payoutResult(row) {
  return {
    id: row.id,
    status: row.status,
    method: row.method,
    phone: row.phone || '',
    amount: Number(row.net_amount) || 0,
    reference: row.payout_reference || null,
    providerStatus: row.provider_status || null,
  }
}

export async function initiateSalaryPayout({ salaryPaymentId, businessId, branchId, approverId }) {
  const { rows: salaryRows } = await query(
    `SELECT id, business_id, branch_id, name, phone, method, net_amount, status
     FROM salary_payments
     WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3)`,
    [salaryPaymentId, businessId, branchId]
  )
  const salary = salaryRows[0]
  if (!salary) throw new Error('Payroll not found.')
  if (salary.status !== 'pending') throw new Error('This payroll is no longer awaiting approval.')
  if (!['mtn_momo', 'airtel_money'].includes(salary.method)) {
    throw new Error('Payroll payout method must be MTN MoMo or Airtel Money.')
  }
  const amount = Number(salary.net_amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payroll has an invalid net amount.')
  const phone = normalizeRwandaPhone(salary.phone)
  validateMobileMoneyPayoutConfig(salary.method)
  const reference = randomUUID()
  const transactionId = salary.method === 'mtn_momo' ? reference : randomUUID()

  const { rows: claimedRows } = await query(
    `UPDATE salary_payments
     SET status = 'processing', approved_by = $4, approved_at = NOW(),
         payout_reference = $5, provider_txn_id = $6,
         provider_status = 'REQUESTED', payout_requested_at = NOW(),
         provider_payload = '{}'::jsonb
     WHERE id = $1 AND business_id = $2
       AND ($3::uuid IS NULL OR branch_id = $3) AND status = 'pending'
     RETURNING id, status, method, phone, net_amount, payout_reference, provider_status`,
    [salaryPaymentId, businessId, branchId, approverId, reference, transactionId]
  )
  if (!claimedRows.length) throw new Error('This payroll has already been approved or processed.')

  let providerResult
  try {
    providerResult = await requestMobileMoneyPayout({
      method: salary.method,
      reference,
      transactionId,
      amount,
      phone,
    })
  } catch (error) {
    const notSubmitted = error.payoutRequestSent === false
    const uncertain = error.ambiguous === true
    const { rows } = await query(
      `UPDATE salary_payments
       SET status = $2, approved_by = CASE WHEN $2 = 'pending' THEN NULL ELSE approved_by END,
           approved_at = CASE WHEN $2 = 'pending' THEN NULL ELSE approved_at END,
           payout_reference = CASE WHEN $2 = 'pending' THEN NULL ELSE payout_reference END,
           provider_txn_id = CASE WHEN $2 = 'pending' THEN NULL ELSE provider_txn_id END,
           payout_requested_at = CASE WHEN $2 = 'pending' THEN NULL ELSE payout_requested_at END,
           provider_status = $3, provider_payload = $4
       WHERE id = $1 AND status = 'processing'
       RETURNING id, status, method, phone, net_amount, payout_reference, provider_status`,
      [
        salaryPaymentId,
        notSubmitted ? 'pending' : uncertain ? 'processing' : 'failed',
        notSubmitted ? 'NOT_SENT' : uncertain ? 'UNKNOWN' : 'FAILED',
        JSON.stringify({ error: error.message }),
      ]
    )
    const result = payoutResult(rows[0] || claimedRows[0])
    result.message = notSubmitted
      ? `No payout request was sent. ${error.message}`
      : uncertain
        ? 'The provider request timed out or returned an uncertain result. Check payout status before taking further action.'
        : error.message
    return result
  }

  const { rows } = await query(
    `UPDATE salary_payments
     SET provider_txn_id = $2, provider_status = $3, provider_payload = $4
     WHERE id = $1 AND status = 'processing'
     RETURNING id, status, method, phone, net_amount, payout_reference, provider_status`,
    [salaryPaymentId, providerResult.providerTxnId, providerResult.providerStatus, JSON.stringify(providerResult)]
  )
  return payoutResult(rows[0] || claimedRows[0])
}

export async function checkSalaryPayoutStatus({ salaryPaymentId, businessId, branchId }) {
  const { rows } = await query(
    `SELECT id, business_id, branch_id, name, phone, method, net_amount, status,
            payout_reference, provider_txn_id, provider_status
     FROM salary_payments
     WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3)`,
    [salaryPaymentId, businessId, branchId]
  )
  const salary = rows[0]
  if (!salary) throw new Error('Payroll not found.')
  if (salary.status !== 'processing') return payoutResult(salary)

  const providerResult = await getMobileMoneyPayoutStatus(salary)
  if (providerResult.status === 'completed') {
    const completed = await query(
      `UPDATE salary_payments
       SET status = 'Paid', paid_at = NOW(), provider_status = $2, provider_payload = $3
       WHERE id = $1 AND status = 'processing'
       RETURNING id`,
      [salaryPaymentId, providerResult.providerStatus, JSON.stringify(providerResult.payload || {})]
    )
    if (!completed.rows.length) {
      const { rows: currentRows } = await query(
        `SELECT id, status, method, phone, net_amount, payout_reference, provider_status
        FROM salary_payments WHERE id = $1 AND business_id = $2
          AND ($3::uuid IS NULL OR branch_id = $3)`,
        [salaryPaymentId, businessId, branchId]
      )
      return payoutResult(currentRows[0])
    }
  } else {
    const status = providerResult.status === 'failed' ? 'failed' : 'processing'
    await query(
      `UPDATE salary_payments
       SET status = $2, provider_status = $3, provider_payload = $4
       WHERE id = $1 AND status = 'processing' RETURNING id`,
      [salaryPaymentId, status, providerResult.providerStatus, JSON.stringify(providerResult.payload || {})]
    )
  }

  const { rows: updatedRows } = await query(
    `SELECT id, status, method, phone, net_amount, payout_reference, provider_status
     FROM salary_payments
     WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3)`,
    [salaryPaymentId, businessId, branchId]
  )
  return payoutResult(updatedRows[0])
}
