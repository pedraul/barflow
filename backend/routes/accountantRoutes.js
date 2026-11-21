import { Router } from 'express'
import { query } from '../config/database.js'
import authMiddleware from '../middleware/authMiddleware.js'
import roleMiddleware from '../middleware/roleMiddleware.js'
import { logAudit, getClientIp } from '../utils/audit.js'
import { getBranchContext } from '../middleware/branchContext.js'
import { getFinancialSummary, PAID_ORDER_SQL } from '../services/financialSummaryService.js'
import { createOutboundPayoutRequest } from '../services/outboundPayoutService.js'
import { ensureAccountingSchema } from '../services/accountingSchema.js'
import {
  ACCOUNTS,
  ORDER_METHOD_SQL,
  autoMatch,
  buildReportData,
  getAccountantDashboard,
  listReconciliation,
  matchItems,
  methodLabel,
  unmatchItem,
} from '../services/accountingService.js'

const router = Router()

const accountantOnly = [authMiddleware, roleMiddleware('accountant')]

const actorName = (req) => req.user?.full_name || req.user?.email || 'Accountant'
const sendError = (res, error) => res.status(error.status || 500).json({ error: error.message })

async function audit(req, action, targetModule) {
  await logAudit({
    userId: req.user?.id,
    actorName: actorName(req),
    action,
    targetModule,
    ipAddress: getClientIp(req),
    businessId: req.user?.businessId,
  }).catch(() => {})
}

// Transfers are saved as "<recipient>: <purpose>".
function splitTransferDescription(description = '') {
  const text = String(description || '')
  const index = text.indexOf(': ')
  return index > 0 ? { name: text.slice(0, index), purpose: text.slice(index + 2) } : { name: '', purpose: text }
}

// GET /api/accountant/summary?period=&cashFlowPeriod=&expensePeriod=
router.get('/summary', ...accountantOnly, async (req, res) => {
  try {
    const { businessId, branchId } = await getBranchContext(req)
    const dashboard = await getAccountantDashboard(businessId, branchId, {
      period: req.query.period,
      cashFlowPeriod: req.query.cashFlowPeriod,
      expensePeriod: req.query.expensePeriod,
    })
    res.json(dashboard)
  } catch (error) {
    sendError(res, error)
  }
})

// GET /api/accountant/transfers
router.get('/transfers', ...accountantOnly, async (req, res) => {
  try {
    const { businessId, branchId } = await getBranchContext(req)
    const { rows } = await query(
      `SELECT t.*
       FROM transfers t
       WHERE t.business_id = $1 AND ($2::uuid IS NULL OR t.branch_id = $2::uuid)
       ORDER BY t.created_at DESC`,
      [businessId, branchId || null]
    )
    res.json(
      rows.map((r) => {
        const { name, purpose } = splitTransferDescription(r.description)
        return {
          id: r.id,
          name: name || r.to_phone,
          phone: r.to_phone,
          amount: Number(r.amount),
          purpose,
          status: r.status,
          method: r.payout_method || null,
          payoutReference: r.payout_reference || null,
          providerStatus: r.provider_status || null,
          date: new Date(r.created_at).toLocaleString(),
        }
      })
    )
  } catch (error) {
    sendError(res, error)
  }
})

// POST /api/accountant/transfers
router.post('/transfers', ...accountantOnly, async (req, res) => {
  const { name, phone, amount, purpose, method } = req.body
  if (!name || !phone || !amount || !purpose) {
    return res.status(400).json({ error: 'All fields are required.' })
  }
  try {
    const payout = createOutboundPayoutRequest({ phone, amount, method })
    const scope = await getBranchContext(req, { requestedBranchId: req.body.branchId, allowOwnerAll: false })
    const { rows } = await query(
      `INSERT INTO transfers (business_id, branch_id, from_user, to_phone, amount, description, status, payout_method)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7) RETURNING id`,
      [scope.businessId, scope.branchId, req.user?.id, payout.phone, payout.amount, `${String(name).trim()}: ${String(purpose).trim()}`, payout.method]
    )
    await audit(req, `Created ${payout.method} transfer of ${payout.amount} to ${name} (${payout.phone})`, 'Transfers')
    res.status(201).json({ id: rows[0].id })
  } catch (error) {
    const status = /required|greater than zero|Choose MTN|phone/i.test(error.message) ? 400 : 500
    res.status(status).json({ error: error.message })
  }
})

// GET /api/accountant/refunds
router.get('/refunds', ...accountantOnly, async (req, res) => {
  try {
    const { businessId, branchId } = await getBranchContext(req)
    const { from, to } = req.query
    const fromIso = from && !Number.isNaN(new Date(from).getTime()) ? new Date(from).toISOString() : null
    const toIso = to && !Number.isNaN(new Date(`${to}T23:59:59`).getTime()) ? new Date(`${to}T23:59:59`).toISOString() : null
    const { rows } = await query(
      `SELECT r.id, r.amount, r.reason, r.status, r.approved_by, r.created_at, o.order_number
       FROM refunds r
       LEFT JOIN orders o ON o.id = r.order_id
       WHERE r.business_id = $1 AND ($2::uuid IS NULL OR r.branch_id = $2::uuid)
         AND ($3::timestamptz IS NULL OR r.created_at >= $3::timestamptz)
         AND ($4::timestamptz IS NULL OR r.created_at <= $4::timestamptz)
       ORDER BY r.created_at DESC`,
      [businessId, branchId || null, fromIso, toIso]
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        orderNumber: r.order_number || null,
        amount: Number(r.amount),
        reason: r.reason,
        status: r.status,
        approvedBy: r.approved_by,
        date: new Date(r.created_at).toLocaleString(),
      }))
    )
  } catch (error) {
    sendError(res, error)
  }
})

// GET /api/accountant/reconciliations  (history of reconciliation actions)
router.get('/reconciliations', ...accountantOnly, async (req, res) => {
  try {
    await ensureAccountingSchema()
    const { businessId, branchId } = await getBranchContext(req)
    const { rows } = await query(
      `SELECT id, action, recorded, banked, difference, matched_count, actor, created_at
       FROM reconciliations
       WHERE business_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid)
       ORDER BY created_at DESC
       LIMIT 200`,
      [businessId, branchId || null]
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        action: r.action || 'Reconciliation',
        recorded: Number(r.recorded),
        banked: Number(r.banked),
        difference: Number(r.difference),
        matchedCount: Number(r.matched_count) || 0,
        actor: r.actor,
        date: new Date(r.created_at).toLocaleString(),
      }))
    )
  } catch (error) {
    sendError(res, error)
  }
})

// POST /api/accountant/reconciliations  (records a manual cash count / bank check)
router.post('/reconciliations', ...accountantOnly, async (req, res) => {
  const { recorded, banked } = req.body
  if (recorded == null || banked == null || !Number.isFinite(Number(recorded)) || !Number.isFinite(Number(banked))) {
    return res.status(400).json({ error: 'Recorded and banked amounts are required.' })
  }
  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    const difference = Number(recorded) - Number(banked)
    const { rows } = await query(
      `INSERT INTO reconciliations (business_id, branch_id, action, recorded, banked, difference, actor)
       VALUES ($1, $2, 'Balance check', $3, $4, $5, $6) RETURNING id`,
      [scope.businessId, scope.branchId || null, Number(recorded), Number(banked), difference, actorName(req)]
    )
    await audit(req, `Created reconciliation: recorded=${recorded}, banked=${banked}, difference=${difference}`, 'Reconciliation')
    res.status(201).json({ id: rows[0].id, difference })
  } catch (error) {
    sendError(res, error)
  }
})

// GET /api/accountant/reconciliation-transactions?status=&type=&bankAccount=&search=&from=&to=
router.get('/reconciliation-transactions', ...accountantOnly, async (req, res) => {
  try {
    const { businessId, branchId } = await getBranchContext(req)
    const { status, type, bankAccount, search, from, to } = req.query
    const { items } = await listReconciliation(businessId, branchId, {
      status, type, bankAccount: bankAccount === 'All Accounts' ? '' : bankAccount, search, from, to,
    })
    res.json(
      items.map((i) => ({
        ...i,
        date: i.date ? new Date(i.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
        rawDate: i.date,
      }))
    )
  } catch (error) {
    sendError(res, error)
  }
})

// POST /api/accountant/reconciliation/match  { ids: [...] }
router.post('/reconciliation/match', ...accountantOnly, async (req, res) => {
  try {
    const scope = await getBranchContext(req)
    const result = await matchItems(scope, req.body?.ids, actorName(req))
    await audit(req, `Matched ${result.matched} reconciliation item(s)`, 'Reconciliation')
    res.json(result)
  } catch (error) {
    sendError(res, error)
  }
})

// POST /api/accountant/reconciliation/auto-match
router.post('/reconciliation/auto-match', ...accountantOnly, async (req, res) => {
  try {
    const scope = await getBranchContext(req)
    const result = await autoMatch(scope, actorName(req))
    await audit(req, `Auto-matched ${result.matched} statement line(s)`, 'Reconciliation')
    res.json(result)
  } catch (error) {
    sendError(res, error)
  }
})

// POST /api/accountant/reconciliation/unmatch  { id }
router.post('/reconciliation/unmatch', ...accountantOnly, async (req, res) => {
  try {
    const scope = await getBranchContext(req)
    const result = await unmatchItem(scope, req.body?.id, actorName(req))
    await audit(req, `Unmatched reconciliation item ${req.body?.id}`, 'Reconciliation')
    res.json(result)
  } catch (error) {
    sendError(res, error)
  }
})

// ---------------------------------------------------------------- documents

const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024 // keeps uploads under the hosting request limit
const DOCUMENT_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  csv: 'text/csv',
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
}
export const DOCUMENT_CATEGORIES = ['Receipt', 'Invoice', 'Expense list', 'Bank statement', 'Mobile money statement', 'Tax document', 'Contract', 'Payroll', 'Other']

function decodeDocument(document) {
  const filename = String(document?.filename || '').trim().slice(0, 255)
  const extension = filename.split('.').pop()?.toLowerCase()
  if (!filename || !DOCUMENT_TYPES[extension]) {
    throw Object.assign(new Error('Allowed files: PDF, images (PNG, JPG, WEBP), CSV, Excel, Word and text files.'), { status: 400 })
  }
  const base64 = String(document?.data || '').replace(/^data:[^;]*;base64,/, '')
  if (!base64 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) throw Object.assign(new Error('The file could not be read.'), { status: 400 })
  const content = Buffer.from(base64, 'base64')
  if (!content.length) throw Object.assign(new Error('The file is empty.'), { status: 400 })
  if (content.length > MAX_DOCUMENT_BYTES) throw Object.assign(new Error('Files can be at most 3 MB.'), { status: 413 })
  return { filename, mimeType: DOCUMENT_TYPES[extension], content }
}

async function saveDocument(scope, req, document, { category = 'Other', description = '' } = {}) {
  const { filename, mimeType, content } = decodeDocument(document)
  const { rows } = await query(
    `INSERT INTO accounting_documents (business_id, branch_id, category, description, filename, mime_type, size_bytes, content, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, category, description, filename, mime_type, size_bytes, created_at`,
    [scope.businessId, scope.branchId || null, DOCUMENT_CATEGORIES.includes(category) ? category : 'Other',
      String(description || '').trim().slice(0, 500) || null, filename, mimeType, content.length, content, actorName(req)]
  )
  return rows[0]
}

async function markDocumentProcessed(scope, documentId, processedAs, count) {
  if (!documentId) return
  await query(
    `UPDATE accounting_documents SET processed_as = $1, processed_count = processed_count + $2
     WHERE id = $3 AND business_id = $4`,
    [processedAs, count, documentId, scope.businessId]
  ).catch(() => {})
}

async function documentBelongsTo(scope, documentId) {
  if (!documentId) return null
  const { rows } = await query(
    `SELECT id FROM accounting_documents WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3::uuid)`,
    [documentId, scope.businessId, scope.branchId || null]
  ).catch(() => ({ rows: [] }))
  return rows[0]?.id || null
}

const mapDocument = (r) => ({
  id: r.id,
  category: r.category,
  description: r.description || '',
  filename: r.filename,
  mimeType: r.mime_type,
  size: Number(r.size_bytes) || 0,
  processedAs: r.processed_as || null,
  processedCount: Number(r.processed_count) || 0,
  expenseCount: Number(r.expense_count) || 0,
  uploadedBy: r.uploaded_by || '',
  createdAt: r.created_at,
})

// GET /api/accountant/documents?category=&search=
router.get('/documents', ...accountantOnly, async (req, res) => {
  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    const { rows } = await query(
      `SELECT d.id, d.category, d.description, d.filename, d.mime_type, d.size_bytes, d.processed_as, d.processed_count,
              d.uploaded_by, d.created_at,
              (SELECT COUNT(*) FROM expenses e WHERE e.document_id = d.id) AS expense_count
       FROM accounting_documents d
       WHERE d.business_id = $1 AND ($2::uuid IS NULL OR d.branch_id = $2::uuid)
         AND ($3::text IS NULL OR d.category = $3)
         AND ($4::text IS NULL OR d.filename ILIKE '%' || $4 || '%' OR d.description ILIKE '%' || $4 || '%')
       ORDER BY d.created_at DESC
       LIMIT 500`,
      [scope.businessId, scope.branchId || null, req.query.category || null, String(req.query.search || '').trim() || null]
    )
    res.json({ categories: DOCUMENT_CATEGORIES, documents: rows.map(mapDocument) })
  } catch (error) {
    sendError(res, error)
  }
})

// POST /api/accountant/documents  { filename, data (base64), category, description }
router.post('/documents', ...accountantOnly, async (req, res) => {
  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    const doc = await saveDocument(scope, req, req.body, { category: req.body?.category, description: req.body?.description })
    await audit(req, `Uploaded document "${doc.filename}" (${doc.category})`, 'Documents')
    res.status(201).json(mapDocument(doc))
  } catch (error) {
    sendError(res, error)
  }
})

// GET /api/accountant/documents/:id/download
router.get('/documents/:id/download', ...accountantOnly, async (req, res) => {
  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    const { rows } = await query(
      `SELECT filename, mime_type, content FROM accounting_documents
       WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3::uuid)`,
      [req.params.id, scope.businessId, scope.branchId || null]
    )
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' })
    const { filename, mime_type: mimeType, content } = rows[0]
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/["\\\r\n]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.setHeader('Content-Length', content.length)
    res.end(content)
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Document not found.' })
    sendError(res, error)
  }
})

// DELETE /api/accountant/documents/:id  (expenses linked to it are kept)
router.delete('/documents/:id', ...accountantOnly, async (req, res) => {
  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    const { rows } = await query(
      `DELETE FROM accounting_documents WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3::uuid)
       RETURNING filename`,
      [req.params.id, scope.businessId, scope.branchId || null]
    )
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' })
    await audit(req, `Deleted document "${rows[0].filename}"`, 'Documents')
    res.json({ deleted: true })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Document not found.' })
    sendError(res, error)
  }
})

// ---------------------------------------------------------------- expenses

export const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Supplies', 'Transport', 'Maintenance & repairs', 'Marketing', 'Taxes & fees', 'Bank charges', 'Internet & phone', 'Cleaning', 'Security', 'Other']
const EXPENSE_METHODS = ['cash', 'mtn_momo', 'airtel_money', 'bank', 'card']

function parseExpense(input, { strict = true } = {}) {
  const errors = []
  const category = String(input?.category || '').trim().slice(0, 60) || (strict ? '' : 'Other')
  const description = String(input?.description || '').trim().slice(0, 500)
  const amount = parseAmount(input?.amount)
  const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let dateText = String(input?.date || '').trim() || localDay(new Date())
  // dd/mm/yyyy (common in Rwanda) -> yyyy-mm-dd
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateText)) dateText = dateText.split('/').reverse().map((p) => p.padStart(2, '0')).join('-')
  const isoDay = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? dateText : null
  const date = new Date(isoDay ? `${isoDay}T12:00:00` : dateText)
  const rawMethod = String(input?.method || input?.paymentMethod || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const method = EXPENSE_METHODS.includes(rawMethod) ? rawMethod
    : /momo|mtn/.test(rawMethod) ? 'mtn_momo'
      : /airtel/.test(rawMethod) ? 'airtel_money'
        : /bank|transfer/.test(rawMethod) ? 'bank'
          : /card|pos/.test(rawMethod) ? 'card'
            : 'cash'
  const account = ACCOUNTS.includes(input?.account) ? input.account
    : method === 'cash' ? 'Cash Till' : ['mtn_momo', 'airtel_money'].includes(method) ? 'Mobile Money' : 'Bank / Card'
  const tomorrow = Date.now() + 24 * 60 * 60 * 1000

  if (!category) errors.push('category')
  if (!description) errors.push('description')
  if (!Number.isFinite(amount) || amount === 0) errors.push('amount')
  if (Number.isNaN(date.getTime()) || date.getTime() > tomorrow) errors.push('date')
  return {
    errors,
    value: {
      category,
      description,
      amount: Math.round(Math.abs(amount) * 100) / 100,
      date: Number.isNaN(date.getTime()) ? null : (isoDay || localDay(date)),
      method,
      account,
      vendor: String(input?.vendor || input?.supplier || '').trim().slice(0, 200) || null,
      reference: String(input?.reference || '').trim().slice(0, 200) || null,
    },
  }
}

async function insertExpense(scope, req, e, documentId = null) {
  const { rows } = await query(
    `INSERT INTO expenses (business_id, branch_id, category, description, amount, expense_date, payment_method, account, vendor, reference, document_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [scope.businessId, scope.branchId || null, e.category, e.description, e.amount, e.date, e.method, e.account, e.vendor, e.reference, documentId, actorName(req)]
  )
  return rows[0].id
}

// GET /api/accountant/expenses?from=&to=&category=
router.get('/expenses', ...accountantOnly, async (req, res) => {
  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    const { from, to, category } = req.query
    const { rows } = await query(
      `SELECT e.*, TO_CHAR(e.expense_date, 'YYYY-MM-DD') AS expense_day, d.filename AS document_name
       FROM expenses e
       LEFT JOIN accounting_documents d ON d.id = e.document_id
       WHERE e.business_id = $1 AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)
         AND ($3::date IS NULL OR e.expense_date >= $3::date)
         AND ($4::date IS NULL OR e.expense_date <= $4::date)
         AND ($5::text IS NULL OR e.category = $5)
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT 1000`,
      [scope.businessId, scope.branchId || null, from || null, to || null, category || null]
    )
    res.json({
      categories: EXPENSE_CATEGORIES,
      accounts: ACCOUNTS,
      expenses: rows.map((r) => ({
        id: r.id,
        category: r.category,
        description: r.description,
        amount: Number(r.amount),
        date: r.expense_day,
        method: r.payment_method,
        methodLabel: methodLabel(r.payment_method),
        account: r.account,
        vendor: r.vendor || '',
        reference: r.reference || '',
        documentId: r.document_id || null,
        documentName: r.document_name || null,
        createdBy: r.created_by || '',
        createdAt: r.created_at,
      })),
    })
  } catch (error) {
    if (/invalid input syntax for type date/i.test(error.message)) return res.status(400).json({ error: 'Invalid date filter.' })
    sendError(res, error)
  }
})

// POST /api/accountant/expenses  { category, description, amount, date, method, account, vendor, reference, document? }
router.post('/expenses', ...accountantOnly, async (req, res) => {
  const { errors, value } = parseExpense(req.body)
  if (errors.length) {
    return res.status(400).json({ error: `Check these fields: ${errors.join(', ')}. The amount must not be zero and the date cannot be in the future.` })
  }
  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    let documentId = null
    if (req.body.document?.data) {
      const doc = await saveDocument(scope, req, req.body.document, { category: 'Receipt', description: `${value.category}: ${value.description}` })
      documentId = doc.id
      await markDocumentProcessed(scope, documentId, 'expense', 1)
    } else if (req.body.documentId) {
      documentId = await documentBelongsTo(scope, req.body.documentId)
    }
    const id = await insertExpense(scope, req, value, documentId)
    await audit(req, `Recorded expense ${value.amount} (${value.category}: ${value.description})`, 'Expenses')
    res.status(201).json({ id, documentId })
  } catch (error) {
    sendError(res, error)
  }
})

// POST /api/accountant/expenses/import  { rows: [...], documentId? } — rows read from a spreadsheet
router.post('/expenses/import', ...accountantOnly, async (req, res) => {
  const input = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (!input.length) return res.status(400).json({ error: 'No expense rows were found in the file.' })
  if (input.length > 2000) return res.status(400).json({ error: 'Import at most 2000 expenses at a time.' })
  const valid = []
  const skipped = []
  input.forEach((row, index) => {
    const { errors, value } = parseExpense(row, { strict: false })
    if (errors.length) skipped.push({ row: index + 2, problems: errors })
    else valid.push(value)
  })
  if (!valid.length) {
    return res.status(400).json({ error: 'No valid rows. Each row needs a description, a non-zero amount and a valid date.', skipped: skipped.slice(0, 50) })
  }
  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    const documentId = await documentBelongsTo(scope, req.body.documentId)
    for (const expense of valid) await insertExpense(scope, req, expense, documentId)
    await markDocumentProcessed(scope, documentId, 'expenses', valid.length)
    const total = valid.reduce((sum, e) => sum + e.amount, 0)
    await audit(req, `Imported ${valid.length} expenses totalling ${total}`, 'Expenses')
    res.status(201).json({ imported: valid.length, total, skipped: skipped.slice(0, 50), skippedCount: skipped.length })
  } catch (error) {
    sendError(res, error)
  }
})

// DELETE /api/accountant/expenses/:id
router.delete('/expenses/:id', ...accountantOnly, async (req, res) => {
  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    const { rows } = await query(
      `DELETE FROM expenses WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3::uuid)
       RETURNING amount, category, description`,
      [req.params.id, scope.businessId, scope.branchId || null]
    )
    if (!rows.length) return res.status(404).json({ error: 'Expense not found.' })
    await query(`DELETE FROM reconciliation_matches WHERE entry_type = 'expense' AND entry_id = $1`, [req.params.id]).catch(() => {})
    await audit(req, `Deleted expense ${rows[0].amount} (${rows[0].category}: ${rows[0].description})`, 'Expenses')
    res.json({ deleted: true })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Expense not found.' })
    sendError(res, error)
  }
})

// GET /api/accountant/payments
router.get('/payments', ...accountantOnly, async (req, res) => {
  try {
    const { businessId, branchId } = await getBranchContext(req)
    const { rows } = await query(
      `SELECT p.id, p.order_id, p.method::text AS method, p.amount, p.reference, p.paid_at,
              o.order_number, o.table_number, o.table_name
       FROM payments p
       LEFT JOIN orders o ON o.id = p.order_id
       WHERE p.business_id = $1 AND ($2::uuid IS NULL OR p.branch_id = $2::uuid)
       ORDER BY p.paid_at DESC NULLS LAST`,
      [businessId, branchId || null]
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        orderId: r.order_id,
        orderNumber: r.order_number || null,
        table: r.table_number != null ? `Table ${r.table_number}` : r.table_name || null,
        method: r.method,
        methodLabel: methodLabel(r.method),
        amount: Number(r.amount),
        reference: r.reference,
        date: r.paid_at ? new Date(r.paid_at).toLocaleString() : '',
      }))
    )
  } catch (error) {
    sendError(res, error)
  }
})

// GET /api/accountant/sales?from=&to=  (paid orders)
router.get('/sales', ...accountantOnly, async (req, res) => {
  try {
    const { businessId, branchId } = await getBranchContext(req)
    const { from, to } = req.query
    const fromIso = from && !Number.isNaN(new Date(from).getTime()) ? new Date(from).toISOString() : null
    const toIso = to && !Number.isNaN(new Date(`${to}T23:59:59`).getTime()) ? new Date(`${to}T23:59:59`).toISOString() : null
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.table_number, o.table_name, o.total_amount, o.status, o.source, o.created_at,
              ${ORDER_METHOD_SQL} AS method, u.full_name AS waiter_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.business_id = $1 AND ($2::uuid IS NULL OR o.branch_id = $2::uuid)
         AND ($3::timestamptz IS NULL OR o.created_at >= $3::timestamptz)
         AND ($4::timestamptz IS NULL OR o.created_at <= $4::timestamptz)
         AND ${PAID_ORDER_SQL}
       ORDER BY o.created_at DESC`,
      [businessId, branchId || null, fromIso, toIso]
    )
    const orders = rows.map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      tableNumber: r.table_number,
      table: r.table_number != null
        ? `Table ${r.table_number}`
        : r.source === 'waiter' && /^(walk[ -]?in)( customer)?$/i.test(String(r.table_name || '').trim()) && r.waiter_name
          ? `Waiter: ${r.waiter_name}`
          : r.table_name || 'Walk-in',
      total: Number(r.total_amount),
      status: r.status,
      source: r.source,
      method: methodLabel(r.method),
      date: new Date(r.created_at).toLocaleString(),
    }))
    res.json(orders)
  } catch (error) {
    sendError(res, error)
  }
})

// GET /api/accountant/purchases  (stock items and their value at cost)
router.get('/purchases', ...accountantOnly, async (req, res) => {
  try {
    const scope = await getBranchContext(req)
    res.json(await buildReportData('purchases', scope))
  } catch (error) {
    sendError(res, error)
  }
})

// GET /api/accountant/taxes
router.get('/taxes', ...accountantOnly, async (req, res) => {
  try {
    const { businessId, branchId } = await getBranchContext(req)
    const summary = await getFinancialSummary(businessId, branchId)
    const { rows: vatOrderRows } = await query(
      `SELECT o.id, o.order_number, o.table_number, o.table_name, o.total_amount, o.tax_amount, o.status, o.created_at
       FROM orders o
       WHERE o.business_id = $1 AND ($2::uuid IS NULL OR o.branch_id = $2::uuid)
         AND ${PAID_ORDER_SQL}
       ORDER BY o.created_at DESC
       LIMIT 50`,
      [businessId, branchId || null]
    )

    res.json({
      vatCollected: summary.vatTotal,
      // Input VAT on purchases is not recorded, so the whole output VAT is payable.
      vatPaid: null,
      vatPayable: summary.vatTotal,
      vatInputTracked: false,
      totalSales: summary.totalSales,
      totalExpenses: summary.expenses,
      payrollExpenses: summary.salaries,
      reconciledOrders: summary.paidOrders,
      transactions: vatOrderRows.map((r) => ({
        id: r.id,
        orderNumber: r.order_number,
        table: r.table_number != null ? `Table ${r.table_number}` : r.table_name,
        total: Number(r.total_amount),
        vat: Number(r.tax_amount ?? Number(r.total_amount) * 0.18),
        status: r.status,
        date: new Date(r.created_at).toLocaleString(),
      })),
    })
  } catch (error) {
    sendError(res, error)
  }
})

// GET /api/accountant/chart-of-accounts
router.get('/chart-of-accounts', ...accountantOnly, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, category, type, balance, created_at
       FROM accounts
       ORDER BY category, name`
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        type: r.type,
        balance: Number(r.balance) || 0,
        createdAt: new Date(r.created_at).toLocaleString(),
      }))
    )
  } catch (error) {
    if (error.message.includes('does not exist')) {
      return res.json([])
    }
    sendError(res, error)
  }
})

// GET /api/accountant/reports
router.get('/reports', ...accountantOnly, async (req, res) => {
  try {
    await ensureAccountingSchema()
    const { businessId, branchId } = await getBranchContext(req)
    const summary = await getFinancialSummary(businessId, branchId)
    const scope = [businessId, branchId || null]
    const { rows: paymentRows } = await query(
      `SELECT COUNT(*) AS payments, COALESCE(SUM(amount), 0) AS total_payments
       FROM payments WHERE business_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid)`,
      scope
    )
    const { rows: refundRows } = await query(
      `SELECT COUNT(*) AS refunds
       FROM refunds WHERE LOWER(status::text) = 'approved' AND business_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid)`,
      scope
    )
    const { rows: reportRows } = await query(
      `SELECT id, category, title, format, generated_by, created_at, data->>'from' AS date_from, data->>'to' AS date_to,
              jsonb_array_length(COALESCE(data->'rows', '[]'::jsonb)) AS row_count
       FROM reports
       WHERE business_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid)
       ORDER BY created_at DESC
       LIMIT 50`,
      scope
    )

    res.json({
      orders: summary.paidOrders,
      revenue: summary.totalSales,
      payments: Number(paymentRows[0]?.payments || 0),
      totalPayments: Number(paymentRows[0]?.total_payments || 0),
      refunds: Number(refundRows[0]?.refunds || 0),
      totalRefunds: summary.refunds,
      totalSalaries: summary.salaries,
      totalExpenses: summary.expenses,
      profit: summary.netProfit,
      records: reportRows.map((r) => ({
        id: r.id,
        category: r.category,
        title: r.title,
        format: r.format,
        generatedBy: r.generated_by,
        from: r.date_from || null,
        to: r.date_to || null,
        rowCount: Number(r.row_count) || 0,
        createdAt: new Date(r.created_at).toLocaleString(),
      })),
    })
  } catch (error) {
    sendError(res, error)
  }
})

// POST /api/accountant/reports  { category, title, format, from, to }
router.post('/reports', ...accountantOnly, async (req, res) => {
  const { category, title, format, from, to } = req.body
  if (!category || !title) {
    return res.status(400).json({ error: 'Category and title are required.' })
  }
  if (from && to && new Date(from) > new Date(to)) {
    return res.status(400).json({ error: 'The start date must be before the end date.' })
  }
  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    const data = await buildReportData(category, scope, { from: from || null, to: to || null })
    const { rows } = await query(
      `INSERT INTO reports (business_id, branch_id, category, title, data, format, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [scope.businessId, scope.branchId || null, category, String(title).trim(), JSON.stringify(data), ['pdf', 'csv', 'excel'].includes(format) ? format : 'pdf', actorName(req)]
    )
    await audit(req, `Generated report: ${title} (${category})`, 'Reports')
    res.status(201).json({ id: rows[0].id, rowCount: data.rows.length })
  } catch (error) {
    sendError(res, error)
  }
})

// GET /api/accountant/reports/:id
router.get('/reports/:id', ...accountantOnly, async (req, res) => {
  try {
    await ensureAccountingSchema()
    const { businessId, branchId } = await getBranchContext(req)
    const { rows } = await query(
      `SELECT id, category, title, data, format, generated_by, created_at
       FROM reports
       WHERE id = $1 AND business_id = $2 AND ($3::uuid IS NULL OR branch_id = $3::uuid)`,
      [req.params.id, businessId, branchId || null]
    )
    if (!rows.length) {
      return res.status(404).json({ error: 'Report not found' })
    }
    const r = rows[0]
    res.json({
      id: r.id,
      category: r.category,
      title: r.title,
      data: r.data,
      format: r.format,
      generatedBy: r.generated_by,
      createdAt: new Date(r.created_at).toLocaleString(),
    })
  } catch (error) {
    if (/invalid input syntax for type uuid/i.test(error.message)) return res.status(404).json({ error: 'Report not found' })
    sendError(res, error)
  }
})

const STATEMENT_TYPES = ['Deposit', 'Payment', 'Expense', 'Refund']
const OUTGOING_TYPES = ['Payment', 'Expense', 'Refund', 'Withdrawal', 'Debit']

function parseAmount(value) {
  const text = String(value ?? '').replace(/[\s,]/g, '').replace(/rwf/i, '')
  const negative = /^\(.*\)$/.test(text)
  const amount = Number(text.replace(/[()]/g, ''))
  return Number.isFinite(amount) ? (negative ? -Math.abs(amount) : amount) : NaN
}

// POST /api/accountant/bank-statements/upload  { filename, bankAccount, transactions: [...] }
router.post('/bank-statements/upload', ...accountantOnly, async (req, res) => {
  const { filename, transactions, bankAccount } = req.body
  if (!filename || !Array.isArray(transactions) || !transactions.length) {
    return res.status(400).json({ error: 'Choose a statement file with at least one transaction.' })
  }
  if (transactions.length > 5000) {
    return res.status(400).json({ error: 'A statement can contain at most 5000 lines.' })
  }
  const account = ACCOUNTS.includes(bankAccount) ? bankAccount : 'Bank / Card'

  const lines = []
  const invalid = []
  transactions.forEach((t, index) => {
    const date = new Date(t.date)
    let amount = parseAmount(t.amount)
    const rawType = String(t.type || '').trim()
    const outgoing = OUTGOING_TYPES.some((o) => o.toLowerCase() === rawType.toLowerCase())
    if (Number.isNaN(date.getTime()) || Number.isNaN(amount) || amount === 0) {
      invalid.push(index + 2) // +2: header row and 1-based numbering
      return
    }
    if (outgoing && amount > 0) amount = -amount
    const type = STATEMENT_TYPES.find((s) => s.toLowerCase() === rawType.toLowerCase()) || (amount >= 0 ? 'Deposit' : 'Payment')
    lines.push({ date: date.toISOString().slice(0, 10), description: String(t.description || '').slice(0, 500), reference: t.reference ? String(t.reference).slice(0, 200) : null, type, amount })
  })
  if (!lines.length) {
    return res.status(400).json({ error: 'No valid lines found. Each line needs a date and a non-zero amount.' })
  }

  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    const { rows } = await query(
      `INSERT INTO bank_statements (filename, uploaded_by, business_id, branch_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [String(filename).slice(0, 255), actorName(req), scope.businessId, scope.branchId || null]
    )
    const statementId = rows[0].id
    for (const line of lines) {
      await query(
        `INSERT INTO bank_statement_transactions
           (statement_id, business_id, branch_id, bank_account, date, description, reference, type, statement_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [statementId, scope.businessId, scope.branchId || null, account, line.date, line.description, line.reference, line.type, line.amount]
      )
    }
    await markDocumentProcessed(scope, await documentBelongsTo(scope, req.body.documentId), 'statement', lines.length)
    await audit(req, `Uploaded bank statement: ${filename} with ${lines.length} transactions`, 'Reconciliation')
    res.status(201).json({ id: statementId, count: lines.length, skippedRows: invalid })
  } catch (error) {
    sendError(res, error)
  }
})

// POST /api/accountant/adjustments  { description, amount, type, date, bankAccount }
router.post('/adjustments', ...accountantOnly, async (req, res) => {
  const { description, amount, type, date, bankAccount } = req.body
  const value = Number(amount)
  if (!String(description || '').trim() || !Number.isFinite(value) || value === 0 || !STATEMENT_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Description, a non-zero amount and a valid type are required.' })
  }
  if (date && Number.isNaN(new Date(date).getTime())) {
    return res.status(400).json({ error: 'The date is not valid.' })
  }
  try {
    await ensureAccountingSchema()
    const scope = await getBranchContext(req)
    const { rows } = await query(
      `INSERT INTO adjustments (business_id, branch_id, description, amount, type, date, bank_account, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        scope.businessId,
        scope.branchId || null,
        String(description).trim(),
        Math.abs(value),
        type,
        date || new Date().toISOString().split('T')[0],
        ACCOUNTS.includes(bankAccount) ? bankAccount : 'Bank / Card',
        actorName(req),
      ]
    )
    await audit(req, `Created adjustment: ${description} ${Math.abs(value)} ${type}`, 'Reconciliation')
    res.status(201).json({ id: rows[0].id })
  } catch (error) {
    sendError(res, error)
  }
})

export default router
