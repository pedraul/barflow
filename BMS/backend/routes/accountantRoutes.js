import { Router } from 'express'
import { query } from '../config/database.js'
import authMiddleware from '../middleware/authMiddleware.js'
import roleMiddleware from '../middleware/roleMiddleware.js'
import { logAudit, getClientIp } from '../utils/audit.js'

const router = Router()

const accountantOnly = [authMiddleware, roleMiddleware('accountant')]

// GET /api/accountant/summary
router.get('/summary', ...accountantOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId

    async function safeQuery(sql, params) {
      try {
        const result = await query(sql, params)
        return result
      } catch (e) {
        return { rows: [] }
      }
    }

    const revenueRows = (await safeQuery(
      `SELECT COALESCE(SUM(total_amount), 0) AS revenue
       FROM orders
       WHERE status IN ('Paid', 'Served') AND business_id = $1`,
      [businessId]
    )).rows
    const expenseRows = (await safeQuery(
      `SELECT COALESCE(SUM(amount), 0) AS expenses
       FROM salary_payments WHERE business_id = $1`,
      [businessId]
    )).rows
    const paymentRows = (await safeQuery(
      `SELECT COALESCE(SUM(amount), 0) AS payments
       FROM payments WHERE business_id = $1`,
      [businessId]
    )).rows
    const refundRows = (await safeQuery(
      `SELECT COALESCE(SUM(amount), 0) AS refunds
       FROM refunds WHERE status != 'rejected' AND business_id = $1`,
      [businessId]
    )).rows
    const orderCount = (await safeQuery(`SELECT COUNT(*) AS count FROM orders WHERE business_id = $1`, [businessId])).rows
    const matchedCount = (await safeQuery(
      `SELECT COUNT(*) AS count FROM orders WHERE status IN ('Paid', 'Served') AND business_id = $1`,
      [businessId]
    )).rows
    const bankBalanceRows = (await safeQuery(
      `SELECT COALESCE(SUM(amount), 0) AS balance
       FROM payments
       WHERE method IN ('cash', 'mtn_momo', 'airtel_money') AND business_id = $1`,
      [businessId]
    )).rows

    const revenue = Number(revenueRows[0]?.revenue || 0)
    const expenses = Number(expenseRows[0]?.expenses || 0)
    const payments = Number(paymentRows[0]?.payments || 0)
    const refunds = Number(refundRows[0]?.refunds || 0)
    const profit = revenue - expenses
    const cashInHand = revenue - payments - refunds
    const bankBalance = Number(bankBalanceRows[0]?.balance || 0)

    const recentTransactions = (await safeQuery(
      `SELECT o.order_number, o.table_name, o.total_amount, o.status, o.source, o.created_at
       FROM orders o
       WHERE o.business_id = $1
       ORDER BY o.created_at DESC
       LIMIT 5`,
      [businessId]
    )).rows

    const unmatchedBank = (await safeQuery(
      `SELECT COUNT(*) AS count FROM orders WHERE status NOT IN ('Paid', 'Served', 'Cancelled') AND business_id = $1`,
      [businessId]
    )).rows
    const inSystemOnly = (await safeQuery(
      `SELECT COUNT(*) AS count FROM orders WHERE status = 'Open' AND business_id = $1`,
      [businessId]
    )).rows
    const inStatementOnly = (await safeQuery(
      `SELECT COUNT(*) AS count FROM payments p
       WHERE NOT EXISTS (
         SELECT 1 FROM orders o WHERE o.id = p.order_id AND o.status IN ('Paid', 'Served') AND o.business_id = $1
       )`,
      [businessId]
    )).rows

    const monthlySummary = (await safeQuery(
      `SELECT TO_CHAR(created_at, 'YYYY-MM') AS month,
              COALESCE(SUM(total_amount), 0) AS revenue,
              COALESCE(SUM(CASE WHEN status IN ('Paid', 'Served') THEN total_amount ELSE 0 END), 0) AS recognized_revenue
       FROM orders
       WHERE business_id = $1
       GROUP BY TO_CHAR(created_at, 'YYYY-MM')
       ORDER BY month DESC
       LIMIT 2`,
      [businessId]
    )).rows

    const taxRows = (await safeQuery(
      `SELECT COALESCE(SUM(total_amount), 0) AS total_sales,
              COALESCE(SUM(tax_amount), 0) AS vat_collected
       FROM orders WHERE business_id = $1`,
      [businessId]
    )).rows
    const totalSales = Number(taxRows[0]?.total_sales || 0)
    const vatCollected = Number(taxRows[0]?.vat_collected || 0)
    const vatPaid = expenses * 0.18
    const vatPayable = Math.max(0, vatCollected - vatPaid)

    res.json({
      revenue,
      expenses,
      profit,
      cashInHand,
      bankBalance,
      totalOrders: Number(orderCount[0]?.count || 0),
      reconciledOrders: Number(matchedCount[0]?.count || 0),
      recentTransactions: recentTransactions.map((r) => ({
        orderNumber: r.order_number,
        table: r.table_name,
        total: Number(r.total_amount),
        status: r.status,
        source: r.source,
        date: new Date(r.created_at).toLocaleString(),
      })),
      unreconciled: {
        unmatchedBank: Number(unmatchedBank[0]?.count || 0),
        inSystemOnly: Number(inSystemOnly[0]?.count || 0),
        inStatementOnly: Number(inStatementOnly[0]?.count || 0),
        total: Number(unmatchedBank[0]?.count || 0) + Number(inSystemOnly[0]?.count || 0) + Number(inStatementOnly[0]?.count || 0),
      },
      monthlySummary: monthlySummary.map((r) => ({
        month: r.month,
        revenue: Number(r.revenue),
        expenses: expenses,
        netProfit: Number(r.recognized_revenue) - expenses,
        margin: expenses > 0 ? ((Number(r.recognized_revenue) - expenses) / Number(r.recognized_revenue) * 100).toFixed(2) : 0,
      })),
      taxSummary: {
        vatCollected,
        vatPaid,
        vatPayable,
        totalSales,
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/accountant/transfers
router.get('/transfers', ...accountantOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      `SELECT id, to_phone AS phone, amount, description AS purpose, status, created_at
       FROM transfers
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [businessId]
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.phone,
        phone: r.phone,
        amount: Number(r.amount),
        purpose: r.purpose,
        status: r.status,
        date: new Date(r.created_at).toLocaleString(),
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/accountant/transfers
router.post('/transfers', ...accountantOnly, async (req, res) => {
  const { name, phone, amount, purpose } = req.body
  if (!name || !phone || !amount || !purpose) {
    return res.status(400).json({ error: 'All fields are required.' })
  }
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      `INSERT INTO transfers (business_id, from_user, to_phone, amount, description, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      [businessId, req.user?.id, phone, amount, `${name}: ${purpose}`]
    )
await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'Accountant',
       action: `Created transfer of ${amount} to ${name} (${phone})`,
       targetModule: 'Transfers',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })
    res.status(201).json({ id: rows[0].id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/accountant/refunds
router.get('/refunds', ...accountantOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      `SELECT id, amount, reason, status, approved_by, created_at
       FROM refunds
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [businessId]
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        reason: r.reason,
        status: r.status,
        approvedBy: r.approved_by,
        date: new Date(r.created_at).toLocaleString(),
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/accountant/reconciliations
router.get('/reconciliations', ...accountantOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      `SELECT id, recorded, banked, difference, actor, created_at
       FROM reconciliations
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [businessId]
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        recorded: Number(r.recorded),
        banked: Number(r.banked),
        difference: Number(r.difference),
        actor: r.actor,
        date: new Date(r.created_at).toLocaleString(),
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/accountant/reconciliations
router.post('/reconciliations', ...accountantOnly, async (req, res) => {
  const { recorded, banked, actor } = req.body
  if (recorded == null || banked == null) {
    return res.status(400).json({ error: 'Recorded and banked amounts are required.' })
  }
  try {
    const difference = Number(recorded) - Number(banked)
    const { rows } = await query(
      `INSERT INTO reconciliations (recorded, banked, difference, actor)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [recorded, banked, difference, actor || 'Accountant']
    )
await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'Accountant',
       action: `Created reconciliation: recorded=${recorded}, banked=${banked}, difference=${difference}`,
       targetModule: 'Reconciliation',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })
    res.status(201).json({ id: rows[0].id, difference })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/accountant/expenses
router.get('/expenses', ...accountantOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      `SELECT s.id, s.name, s.amount, s.method, s.actor, s.paid_at
       FROM salary_payments s
       WHERE s.business_id = $1
       ORDER BY s.paid_at DESC`,
      [businessId]
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        description: `Salary - ${r.name}`,
        category: 'Payroll',
        amount: Number(r.amount),
        method: r.method,
        actor: r.actor,
        date: new Date(r.paid_at).toLocaleString(),
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/accountant/payments
router.get('/payments', ...accountantOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      `SELECT p.id, p.order_id, p.method, p.amount, p.reference, p.paid_at
       FROM payments p
       WHERE p.business_id = $1
       ORDER BY p.paid_at DESC`,
      [businessId]
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        orderId: r.order_id,
        method: r.method,
        amount: Number(r.amount),
        reference: r.reference,
        date: new Date(r.paid_at).toLocaleString(),
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/accountant/sales
router.get('/sales', ...accountantOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { from, to } = req.query
    let where = "WHERE status IN ('Paid', 'Served') AND business_id = $1"
    const params = [businessId]
    if (from) {
      params.push(new Date(from).toISOString())
      where += ` AND created_at >= $${params.length}`
    }
    if (to) {
      params.push(new Date(to + 'T23:59:59').toISOString())
      where += ` AND created_at <= $${params.length}`
    }
    const { rows } = await query(
      `SELECT id, order_number, table_name, total_amount, status, source, created_at
       FROM orders
       ${where}
       ORDER BY created_at DESC`,
      params
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        orderNumber: r.order_number,
        table: r.table_name,
        total: Number(r.total_amount),
        status: r.status,
        source: r.source,
        date: new Date(r.created_at).toLocaleString(),
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/accountant/purchases
router.get('/purchases', ...accountantOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { rows } = await query(
      `SELECT p.id, p.name, p.category_id, c.name AS category_name, p.price, p.stock_quantity
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.business_id = $1
       ORDER BY p.created_at DESC`,
      [businessId]
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category_name || '—',
        cost: Number(r.price) || 0,
        stock: Number(r.stock_quantity) || 0,
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/accountant/taxes
router.get('/taxes', ...accountantOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { rows: vatRows } = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total_sales,
              COALESCE(SUM(tax_amount), 0) AS vat_output,
              COUNT(*) FILTER (WHERE status IN ('Paid', 'Served')) AS reconciled_count
       FROM orders WHERE business_id = $1`,
      [businessId]
    )
    const { rows: expenseRows } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_expenses
       FROM salary_payments WHERE business_id = $1`,
      [businessId]
    )
    const { rows: vatOrderRows } = await query(
      `SELECT id, order_number, table_name, total_amount, tax_amount, status, created_at
       FROM orders
       WHERE tax_amount > 0 AND business_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [businessId]
    )

    const totalSales = Number(vatRows[0]?.total_sales || 0)
    const vatOutput = Number(vatRows[0]?.vat_output || 0)
    const totalExpenses = Number(expenseRows[0]?.total_expenses || 0)
    const vatInput = totalExpenses * 0.18
    const vatPayable = vatOutput - vatInput

    res.json({
      vatCollected: vatOutput,
      vatPaid: vatInput,
      vatPayable: vatPayable > 0 ? vatPayable : 0,
      totalSales,
      totalExpenses,
      reconciledOrders: Number(vatRows[0]?.reconciled_count || 0),
      transactions: vatOrderRows.map((r) => ({
        id: r.id,
        orderNumber: r.order_number,
        table: r.table_name,
        total: Number(r.total_amount),
        vat: Number(r.tax_amount),
        status: r.status,
        date: new Date(r.created_at).toLocaleString(),
      })),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
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
    res.status(500).json({ error: error.message })
  }
})

// GET /api/accountant/reports
router.get('/reports', ...accountantOnly, async (req, res) => {
  try {
    const businessId = req.user?.businessId
    const { rows: orderRows } = await query(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS revenue
       FROM orders WHERE status IN ('Paid', 'Served') AND business_id = $1`,
      [businessId]
    )
    const { rows: paymentRows } = await query(
      `SELECT COUNT(*) AS payments, COALESCE(SUM(amount), 0) AS total_payments
       FROM payments WHERE business_id = $1`,
      [businessId]
    )
    const { rows: refundRows } = await query(
      `SELECT COUNT(*) AS refunds, COALESCE(SUM(amount), 0) AS total_refunds
       FROM refunds WHERE status != 'rejected' AND business_id = $1`,
      [businessId]
    )
    const { rows: salaryRows } = await query(
      `SELECT COUNT(*) AS salaries, COALESCE(SUM(amount), 0) AS total_salaries
       FROM salary_payments WHERE business_id = $1`,
      [businessId]
    )
    const { rows: reportRows } = await query(
      `SELECT id, category, title, format, generated_by, created_at
       FROM reports
       ORDER BY created_at DESC
       LIMIT 50`
    )

    res.json({
      orders: Number(orderRows[0]?.orders || 0),
      revenue: Number(orderRows[0]?.revenue || 0),
      payments: Number(paymentRows[0]?.payments || 0),
      totalPayments: Number(paymentRows[0]?.total_payments || 0),
      refunds: Number(refundRows[0]?.refunds || 0),
      totalRefunds: Number(refundRows[0]?.total_refunds || 0),
      salaries: Number(salaryRows[0]?.salaries || 0),
      totalSalaries: Number(salaryRows[0]?.total_salaries || 0),
      records: reportRows.map((r) => ({
        id: r.id,
        category: r.category,
        title: r.title,
        format: r.format,
        generatedBy: r.generated_by,
        createdAt: new Date(r.created_at).toLocaleString(),
      })),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/accountant/reports
router.post('/reports', ...accountantOnly, async (req, res) => {
  const { category, title, data, format } = req.body
  if (!category || !title) {
    return res.status(400).json({ error: 'Category and title are required.' })
  }
  try {
    const { rows } = await query(
      `INSERT INTO reports (category, title, data, format, generated_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        category,
        title,
        JSON.stringify(data || {}),
        format || 'pdf',
        req.user?.full_name || req.user?.email || 'Accountant',
      ]
    )
await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'Accountant',
       action: `Generated report: ${title} (${category})`,
       targetModule: 'Reports',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })
    res.status(201).json({ id: rows[0].id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/accountant/reconciliation-transactions
router.get('/reconciliation-transactions', ...accountantOnly, async (req, res) => {
  try {
    const { status, type, bankAccount, search } = req.query
    const where = []
    const params = []

    if (status) { where.push(`r.status = $${params.length + 1}`); params.push(status) }
    if (type) { where.push(`r.type = $${params.length + 1}`); params.push(type) }
    if (bankAccount && bankAccount !== 'All Accounts') { where.push(`r.bank_account = $${params.length + 1}`); params.push(bankAccount) }
    if (search) { where.push(`(r.description ILIKE $${params.length + 1} OR r.reference ILIKE $${params.length + 1})`); params.push(`%${search}%`) }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const { rows } = await query(
      `SELECT id, date, description, reference, type, statement_amount, system_amount, difference, status, bank_account
       FROM reconciliation_transactions_view r
       ${whereClause}
       ORDER BY date DESC`,
      params
    )

    res.json(
      rows.map((r) => ({
        id: r.id,
        date: new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        description: r.description,
        ref: r.reference,
        type: r.type,
        statementAmount: Number(r.statement_amount),
        systemAmount: r.system_amount != null ? Number(r.system_amount) : null,
        difference: Number(r.difference),
        status: r.status,
        bankAccount: r.bank_account,
      }))
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/accountant/reports/:id
router.get('/reports/:id', ...accountantOnly, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, category, title, data, format, generated_by, created_at
       FROM reports WHERE id = $1`,
      [req.params.id]
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
    res.status(500).json({ error: error.message })
  }
})

// POST /api/accountant/bank-statements/upload
router.post('/bank-statements/upload', ...accountantOnly, async (req, res) => {
  const { filename, transactions } = req.body
  if (!filename || !Array.isArray(transactions)) {
    return res.status(400).json({ error: 'Filename and transactions array are required.' })
  }
  try {
    const { rows } = await query(
      `INSERT INTO bank_statements (filename, uploaded_by) VALUES ($1, $2) RETURNING id`,
      [filename, req.user?.full_name || req.user?.email || 'Accountant']
    )
    const statementId = rows[0].id
    for (const t of transactions) {
      await query(
        `INSERT INTO bank_statement_transactions (statement_id, date, description, reference, type, statement_amount)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [statementId, t.date, t.description, t.reference || null, t.type || 'Deposit', Number(t.amount || 0)]
      )
    }
await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'Accountant',
       action: `Uploaded bank statement: ${filename} with ${transactions.length} transactions`,
       targetModule: 'Reconciliation',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })
    res.status(201).json({ id: statementId, count: transactions.length })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/accountant/adjustments
router.post('/adjustments', ...accountantOnly, async (req, res) => {
  const { description, amount, type, date } = req.body
  if (!description || amount == null || !type) {
    return res.status(400).json({ error: 'Description, amount, and type are required.' })
  }
  try {
    const { rows } = await query(
      `INSERT INTO adjustments (description, amount, type, date) VALUES ($1, $2, $3, $4) RETURNING id`,
      [description, Number(amount), type, date || new Date().toISOString().split('T')[0]]
    )
await logAudit({
       userId: req.user?.id,
       actorName: req.user?.full_name || req.user?.email || 'Accountant',
       action: `Created adjustment: ${description} ${Number(amount)} ${type}`,
       targetModule: 'Reconciliation',
       ipAddress: getClientIp(req),
       businessId: req.user?.businessId,
     })
    res.status(201).json({ id: rows[0].id })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
