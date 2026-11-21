// Accountant workspace: periods, cash flow, balances, transaction feed,
// bank reconciliation and report data. Everything is scoped to one business
// (and branch when the accountant belongs to one).
import { query } from '../config/database.js'
import { ensureAccountingSchema } from './accountingSchema.js'
import {
  getFinancialSummary,
  PAID_ORDER_SQL,
  SALARY_PAID_SQL,
  TRANSFER_SENT_SQL,
  REFUND_APPROVED_SQL,
} from './financialSummaryService.js'

// ---------------------------------------------------------------- periods

export const PERIODS = ['this_month', 'last_month', 'this_quarter', 'this_year', 'all']

/** Resolves a period name to [start, end) plus the previous period of equal type. */
export function resolvePeriod(name = 'this_month', now = new Date()) {
  const period = PERIODS.includes(name) ? name : 'this_month'
  const y = now.getFullYear()
  const m = now.getMonth()
  const at = (year, month) => new Date(year, month, 1)
  switch (period) {
    case 'last_month':
      return { period, start: at(y, m - 1), end: at(y, m), prevStart: at(y, m - 2), prevEnd: at(y, m - 1), bucket: 'day' }
    case 'this_quarter': {
      const q = Math.floor(m / 3) * 3
      return { period, start: at(y, q), end: at(y, q + 3), prevStart: at(y, q - 3), prevEnd: at(y, q), bucket: 'week' }
    }
    case 'this_year':
      return { period, start: at(y, 0), end: at(y + 1, 0), prevStart: at(y - 1, 0), prevEnd: at(y, 0), bucket: 'month' }
    case 'all':
      // Totals cover everything; the chart shows the last 12 months.
      return { period, start: null, end: null, prevStart: null, prevEnd: null, chartStart: at(y, m - 11), chartEnd: at(y, m + 1), bucket: 'month' }
    default:
      return { period, start: at(y, m), end: at(y, m + 1), prevStart: at(y, m - 1), prevEnd: at(y, m), bucket: 'day' }
  }
}

const iso = (d) => (d ? d.toISOString() : null)
const num = (v) => Number(v || 0)

// $1 business, $2 branch (null = all), $3 from, $4 to.
const scoped = (alias, dateExpr) =>
  `${alias}.business_id = $1 AND ($2::uuid IS NULL OR ${alias}.branch_id = $2::uuid)
   AND ($3::timestamptz IS NULL OR ${dateExpr} >= $3::timestamptz)
   AND ($4::timestamptz IS NULL OR ${dateExpr} < $4::timestamptz)`

export const ORDER_METHOD_SQL = `LOWER(COALESCE(
    NULLIF(BTRIM(o.payment_method), ''),
    (SELECT pay.method::text FROM payments pay WHERE pay.order_id = o.id ORDER BY pay.paid_at DESC NULLS LAST LIMIT 1),
    'cash'))`

const TABLE_TEXT_SQL = `CASE WHEN o.table_number IS NOT NULL THEN 'Table ' || o.table_number
    ELSE COALESCE(NULLIF(BTRIM(o.table_name), ''), 'Walk-in') END`

export const METHOD_LABELS = {
  cash: 'Cash',
  mtn_momo: 'MTN MoMo',
  airtel_money: 'Airtel Money',
  momo: 'Mobile Money',
  pos: 'Card / POS',
  card: 'Card / POS',
  bank: 'Bank transfer',
}
export const methodLabel = (method) => METHOD_LABELS[String(method || '').toLowerCase()] || (method ? String(method) : '—')

export const ACCOUNTS = ['Cash Till', 'Mobile Money', 'Bank / Card']
export function accountForMethod(method) {
  const m = String(method || '').toLowerCase()
  if (m === 'cash') return 'Cash Till'
  if (['mtn_momo', 'airtel_money', 'momo'].includes(m)) return 'Mobile Money'
  return 'Bank / Card'
}

// ---------------------------------------------------------------- dashboard

function percentChange(current, previous) {
  if (!previous) return current ? null : 0
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
}

/** Cash and bank/mobile balances as of a moment (null = now). */
export async function getBalances(businessId, branchId, asOf = null) {
  const params = [businessId, branchId || null, null, iso(asOf)]
  const [sales, refunds, salaries, transfers, withdrawals, adjustments, expenses] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(o.total_amount) FILTER (WHERE ${ORDER_METHOD_SQL} = 'cash'), 0) AS cash,
              COALESCE(SUM(o.total_amount) FILTER (WHERE ${ORDER_METHOD_SQL} <> 'cash'), 0) AS other
       FROM orders o WHERE ${scoped('o', 'o.created_at')} AND ${PAID_ORDER_SQL}`,
      params
    ),
    query(`SELECT COALESCE(SUM(r.amount), 0) AS total FROM refunds r WHERE ${scoped('r', 'r.created_at')} AND ${REFUND_APPROVED_SQL}`, params),
    query(
      `SELECT COALESCE(SUM(COALESCE(NULLIF(s.net_amount, 0), s.amount)), 0) AS total
       FROM salary_payments s WHERE ${scoped('s', 'COALESCE(s.paid_at, s.created_at)')} AND ${SALARY_PAID_SQL}`,
      params
    ),
    query(`SELECT COALESCE(SUM(t.amount), 0) AS total FROM transfers t WHERE ${scoped('t', 'COALESCE(t.approved_at, t.created_at)')} AND ${TRANSFER_SENT_SQL}`, params),
    query(
      `SELECT COALESCE(SUM(w.amount), 0) AS total FROM withdrawals w
       WHERE ${scoped('w', 'COALESCE(w.approved_at, w.created_at)')} AND LOWER(COALESCE(w.status, '')) = 'completed'`,
      params
    ),
    query(
      `SELECT COALESCE(SUM(CASE WHEN a.type = 'Deposit' THEN ABS(a.amount) ELSE -ABS(a.amount) END)
                FILTER (WHERE COALESCE(a.bank_account, 'Bank / Card') = 'Cash Till'), 0) AS cash,
              COALESCE(SUM(CASE WHEN a.type = 'Deposit' THEN ABS(a.amount) ELSE -ABS(a.amount) END)
                FILTER (WHERE COALESCE(a.bank_account, 'Bank / Card') <> 'Cash Till'), 0) AS other
       FROM adjustments a WHERE ${scoped('a', 'a.date::timestamptz')}`,
      params
    ),
    query(
      `SELECT COALESCE(SUM(e.amount) FILTER (WHERE e.account = 'Cash Till'), 0) AS cash,
              COALESCE(SUM(e.amount) FILTER (WHERE e.account <> 'Cash Till'), 0) AS other
       FROM expenses e WHERE ${scoped('e', 'e.expense_date::timestamptz')}`,
      params
    ),
  ])
  const cashInHand = num(sales.rows[0].cash) - num(refunds.rows[0].total) + num(adjustments.rows[0].cash) - num(expenses.rows[0].cash)
  const bankBalance = num(sales.rows[0].other)
    - num(salaries.rows[0].total)
    - num(transfers.rows[0].total)
    - num(withdrawals.rows[0].total)
    + num(adjustments.rows[0].other)
    - num(expenses.rows[0].other)
  return { cashInHand, bankBalance }
}

/** Revenue / expenses / net profit per day, week or month for the chart. */
export async function getCashFlowSeries(businessId, branchId, period) {
  const start = period.chartStart || period.start
  const end = period.chartEnd || period.end
  const unit = period.bucket
  const params = [businessId, branchId || null, iso(start), iso(end)]
  const key = (expr) => `TO_CHAR(DATE_TRUNC('${unit}', ${expr}), 'YYYY-MM-DD')`

  const [buckets, revenue, refunds, cogs, salaries, transfers, adjustments, recorded] = await Promise.all([
    query(
      `SELECT TO_CHAR(g, 'YYYY-MM-DD') AS k
       FROM generate_series(DATE_TRUNC('${unit}', $1::timestamptz), $2::timestamptz - INTERVAL '1 second', INTERVAL '1 ${unit}') g`,
      [iso(start), iso(end)]
    ),
    query(`SELECT ${key('o.created_at')} AS k, SUM(o.total_amount) AS v FROM orders o WHERE ${scoped('o', 'o.created_at')} AND ${PAID_ORDER_SQL} GROUP BY 1`, params),
    query(`SELECT ${key('r.created_at')} AS k, SUM(r.amount) AS v FROM refunds r WHERE ${scoped('r', 'r.created_at')} AND ${REFUND_APPROVED_SQL} GROUP BY 1`, params),
    query(
      `SELECT ${key('o.created_at')} AS k, SUM(oi.quantity * COALESCE(p.cost_price, 0)) AS v
       FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
       WHERE ${scoped('o', 'o.created_at')} AND ${PAID_ORDER_SQL} GROUP BY 1`,
      params
    ),
    query(`SELECT ${key('COALESCE(s.paid_at, s.created_at)')} AS k, SUM(s.amount) AS v FROM salary_payments s WHERE ${scoped('s', 'COALESCE(s.paid_at, s.created_at)')} AND ${SALARY_PAID_SQL} GROUP BY 1`, params),
    query(`SELECT ${key('COALESCE(t.approved_at, t.created_at)')} AS k, SUM(t.amount) AS v FROM transfers t WHERE ${scoped('t', 'COALESCE(t.approved_at, t.created_at)')} AND ${TRANSFER_SENT_SQL} GROUP BY 1`, params),
    query(`SELECT ${key('a.date::timestamptz')} AS k, SUM(ABS(a.amount)) AS v FROM adjustments a WHERE ${scoped('a', 'a.date::timestamptz')} AND a.type = 'Expense' GROUP BY 1`, params),
    query(`SELECT ${key('e.expense_date::timestamptz')} AS k, SUM(e.amount) AS v FROM expenses e WHERE ${scoped('e', 'e.expense_date::timestamptz')} GROUP BY 1`, params),
  ])

  const toMap = (result) => new Map(result.rows.map((r) => [r.k, num(r.v)]))
  const rev = toMap(revenue)
  const ref = toMap(refunds)
  const outs = [toMap(cogs), toMap(salaries), toMap(transfers), toMap(adjustments), toMap(recorded)]
  return buckets.rows.map(({ k }) => {
    const revenueValue = (rev.get(k) || 0) - (ref.get(k) || 0)
    const expenseValue = outs.reduce((sum, map) => sum + (map.get(k) || 0), 0)
    return { date: k, revenue: revenueValue, expenses: expenseValue, netProfit: revenueValue - expenseValue }
  })
}

/** Latest money movements of every kind (in and out). */
export async function getRecentTransactions(businessId, branchId, limit = 8) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT p.id::text AS id, 'payment' AS kind, COALESCE(p.paid_at, o.created_at) AS date,
              ${TABLE_TEXT_SQL} || COALESCE(' · ' || o.order_number, '') AS description,
              p.method::text AS method, p.amount AS amount, 'Received' AS status
       FROM payments p LEFT JOIN orders o ON o.id = p.order_id
       WHERE p.business_id = $1 AND ($2::uuid IS NULL OR p.branch_id = $2::uuid)
       UNION ALL
       SELECT r.id::text, 'refund', r.created_at, COALESCE(NULLIF(r.reason, ''), 'Customer refund'),
              NULL, -r.amount, r.status::text
       FROM refunds r WHERE r.business_id = $1 AND ($2::uuid IS NULL OR r.branch_id = $2::uuid)
       UNION ALL
       SELECT s.id::text, 'salary', COALESCE(s.paid_at, s.created_at), 'Salary · ' || COALESCE(s.name, ''),
              s.method::text, -COALESCE(NULLIF(s.net_amount, 0), s.amount), s.status::text
       FROM salary_payments s WHERE s.business_id = $1 AND ($2::uuid IS NULL OR s.branch_id = $2::uuid)
       UNION ALL
       SELECT t.id::text, 'transfer', t.created_at, 'Transfer · ' || COALESCE(t.description, t.to_phone, ''),
              NULL, -t.amount, t.status::text
       FROM transfers t WHERE t.business_id = $1 AND ($2::uuid IS NULL OR t.branch_id = $2::uuid)
       UNION ALL
       SELECT w.id::text, 'withdrawal', w.created_at, 'Withdrawal · ' || COALESCE(w.purpose, ''),
              NULL, -w.amount, w.status::text
       FROM withdrawals w WHERE w.business_id = $1 AND ($2::uuid IS NULL OR w.branch_id = $2::uuid)
       UNION ALL
       SELECT e.id::text, 'expense', e.expense_date::timestamptz + (e.created_at - DATE_TRUNC('day', e.created_at)),
              e.category || ' · ' || e.description, e.payment_method, -e.amount, 'Recorded'
       FROM expenses e WHERE e.business_id = $1 AND ($2::uuid IS NULL OR e.branch_id = $2::uuid)
     ) x
     ORDER BY date DESC NULLS LAST
     LIMIT $3`,
    [businessId, branchId || null, limit]
  )
  return rows.map((r) => ({
    id: `${r.kind}:${r.id}`,
    kind: r.kind,
    date: r.date,
    description: r.description,
    method: r.method ? methodLabel(r.method) : null,
    amount: num(r.amount),
    status: r.status,
  }))
}

/** Revenue / expenses / profit for each of the last `months` months. */
export async function getMonthlySummary(businessId, branchId, months = 6, now = new Date()) {
  const result = []
  for (let i = 0; i < months; i += 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const s = await getFinancialSummary(businessId, branchId, { from: iso(start), to: iso(end) })
    result.push({
      month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      revenue: s.totalSales,
      expenses: s.expenses,
      netProfit: s.netProfit,
      margin: s.totalSales ? Math.round((s.netProfit / s.totalSales) * 1000) / 10 : null,
    })
  }
  return result
}

/** Everything the accountant dashboard shows. */
export async function getAccountantDashboard(businessId, branchId, { period = 'this_month', cashFlowPeriod, expensePeriod } = {}) {
  await ensureAccountingSchema().catch(() => {})
  const main = resolvePeriod(period)
  const flow = resolvePeriod(cashFlowPeriod || period)
  const exp = resolvePeriod(expensePeriod || period)

  const [current, previous, expenseTotals, balances, previousBalances, cashFlow, recent, reconciliation, monthly] = await Promise.all([
    getFinancialSummary(businessId, branchId, { from: iso(main.start), to: iso(main.end) }),
    main.prevStart
      ? getFinancialSummary(businessId, branchId, { from: iso(main.prevStart), to: iso(main.prevEnd) })
      : Promise.resolve(null),
    getFinancialSummary(businessId, branchId, { from: iso(exp.start), to: iso(exp.end) }),
    getBalances(businessId, branchId),
    main.start ? getBalances(businessId, branchId, main.start) : Promise.resolve(null),
    getCashFlowSeries(businessId, branchId, flow),
    getRecentTransactions(businessId, branchId, 6),
    listReconciliation(businessId, branchId),
    getMonthlySummary(businessId, branchId, 6),
  ])

  const change = (key) => (previous ? percentChange(current[key], previous[key]) : null)
  const expenseCategories = [
    { key: 'stock', label: 'Stock sold (cost of goods)', amount: expenseTotals.costOfGoods },
    { key: 'salaries', label: 'Salaries', amount: expenseTotals.salaries },
    { key: 'transfers', label: 'Transfers & suppliers', amount: expenseTotals.transfers },
    ...(expenseTotals.expenseCategories || []).map((c) => ({ key: `expense:${c.category}`, label: c.category, amount: c.amount })),
    { key: 'other', label: 'Adjustments', amount: expenseTotals.otherExpenses },
  ].filter((c, i, list) => c.amount > 0 || list.every((x) => !x.amount) && i < 3).map((c) => ({ ...c, share: expenseTotals.expenses ? Math.round((c.amount / expenseTotals.expenses) * 1000) / 10 : 0 }))

  return {
    period: main.period,
    revenue: current.totalSales,
    grossSales: current.grossSales,
    refunds: current.refunds,
    paidOrders: current.paidOrders,
    expenses: current.expenses,
    costOfGoods: current.costOfGoods,
    salaries: current.salaries,
    transfers: current.transfers,
    otherExpenses: current.otherExpenses,
    recordedExpenses: current.recordedExpenses,
    expenseCategories: current.expenseCategories,
    profit: current.netProfit,
    vatTotal: current.vatTotal,
    cashInHand: balances.cashInHand,
    bankBalance: balances.bankBalance,
    changes: {
      revenue: change('totalSales'),
      grossSales: change('grossSales'),
      vatTotal: change('vatTotal'),
      expenses: change('expenses'),
      profit: change('netProfit'),
      cashInHand: previousBalances ? percentChange(balances.cashInHand, previousBalances.cashInHand) : null,
      bankBalance: previousBalances ? percentChange(balances.bankBalance, previousBalances.bankBalance) : null,
    },
    cashFlow: { period: flow.period, bucket: flow.bucket, points: cashFlow },
    expenseBreakdown: { period: exp.period, total: expenseTotals.expenses, categories: expenseCategories },
    recentTransactions: recent,
    unreconciled: {
      unmatched: reconciliation.summary.unmatched,
      inSystemOnly: reconciliation.summary.inSystemOnly,
      inStatementOnly: reconciliation.summary.inStatementOnly,
      total: reconciliation.summary.unmatched + reconciliation.summary.inSystemOnly + reconciliation.summary.inStatementOnly,
      matched: reconciliation.summary.matched,
      statementLines: reconciliation.summary.statementLines,
    },
    monthlySummary: monthly,
    taxSummary: {
      vatCollected: current.vatTotal,
      // Input VAT on purchases is not recorded, so the full output VAT is payable.
      vatPaid: null,
      vatPayable: current.vatTotal,
      vatInputTracked: false,
      totalSales: current.grossSales,
    },
  }
}

// ---------------------------------------------------------------- reconciliation

/** All system money movements that should appear on a statement. */
async function getSystemEntries(businessId, branchId) {
  const params = [businessId, branchId || null]
  const scope = (a) => `${a}.business_id = $1 AND ($2::uuid IS NULL OR ${a}.branch_id = $2::uuid)`
  const [payments, refunds, transfers, salaries, withdrawals, adjustments, expenses] = await Promise.all([
    query(
      `SELECT p.id, COALESCE(p.paid_at, o.created_at) AS date, p.method::text AS method, p.amount, p.reference,
              o.order_number, ${TABLE_TEXT_SQL} AS table_text
       FROM payments p LEFT JOIN orders o ON o.id = p.order_id
       WHERE ${scope('p')}`,
      params
    ),
    query(
      `SELECT r.id, r.created_at AS date, r.amount, r.reason, o.order_number
       FROM refunds r LEFT JOIN orders o ON o.id = r.order_id
       WHERE ${scope('r')} AND ${REFUND_APPROVED_SQL}`,
      params
    ),
    query(
      `SELECT t.id, COALESCE(t.approved_at, t.created_at) AS date, t.amount, t.description, t.to_phone
       FROM transfers t WHERE ${scope('t')} AND ${TRANSFER_SENT_SQL}`,
      params
    ),
    query(
      `SELECT s.id, COALESCE(s.paid_at, s.created_at) AS date, COALESCE(NULLIF(s.net_amount, 0), s.amount) AS amount,
              s.name, s.method::text AS method, s.payout_reference
       FROM salary_payments s WHERE ${scope('s')} AND ${SALARY_PAID_SQL}`,
      params
    ),
    query(
      `SELECT w.id, COALESCE(w.approved_at, w.created_at) AS date, w.amount, w.purpose
       FROM withdrawals w WHERE ${scope('w')} AND LOWER(COALESCE(w.status, '')) = 'completed'`,
      params
    ),
    query(
      `SELECT a.id, a.date, a.amount, a.type, a.description, a.bank_account
       FROM adjustments a WHERE ${scope('a')}`,
      params
    ),
    query(
      `SELECT e.id, e.expense_date AS date, e.amount, e.category, e.description, e.account, e.reference, e.vendor
       FROM expenses e WHERE ${scope('e')}`,
      params
    ),
  ])

  return [
    ...payments.rows.map((r) => ({
      kind: 'payment', id: r.id, date: r.date, type: 'Deposit', amount: num(r.amount),
      description: `${methodLabel(r.method)} · ${r.table_text || 'Order'}`,
      reference: r.reference || r.order_number || '', bankAccount: accountForMethod(r.method),
    })),
    ...refunds.rows.map((r) => ({
      kind: 'refund', id: r.id, date: r.date, type: 'Refund', amount: -num(r.amount),
      description: `Refund${r.reason ? ` · ${r.reason}` : ''}`,
      reference: r.order_number || '', bankAccount: 'Cash Till',
    })),
    ...transfers.rows.map((r) => ({
      kind: 'transfer', id: r.id, date: r.date, type: 'Payment', amount: -num(r.amount),
      description: `Transfer · ${r.description || r.to_phone || ''}`,
      reference: r.to_phone || '', bankAccount: 'Mobile Money',
    })),
    ...salaries.rows.map((r) => ({
      kind: 'salary', id: r.id, date: r.date, type: 'Expense', amount: -num(r.amount),
      description: `Salary · ${r.name || ''}`,
      reference: r.payout_reference || '', bankAccount: accountForMethod(r.method),
    })),
    ...withdrawals.rows.map((r) => ({
      kind: 'withdrawal', id: r.id, date: r.date, type: 'Payment', amount: -num(r.amount),
      description: `Owner withdrawal${r.purpose ? ` · ${r.purpose}` : ''}`,
      reference: '', bankAccount: 'Mobile Money',
    })),
    ...adjustments.rows.map((r) => ({
      kind: 'adjustment', id: r.id, date: r.date, type: r.type,
      amount: r.type === 'Deposit' ? Math.abs(num(r.amount)) : -Math.abs(num(r.amount)),
      description: `Adjustment · ${r.description}`,
      reference: '', bankAccount: r.bank_account || 'Bank / Card',
    })),
    ...expenses.rows.map((r) => ({
      kind: 'expense', id: r.id, date: r.date, type: 'Expense', amount: -num(r.amount),
      description: `${r.category} · ${r.description}${r.vendor ? ` (${r.vendor})` : ''}`,
      reference: r.reference || '', bankAccount: r.account || 'Cash Till',
    })),
  ]
}

async function getStatementLines(businessId, branchId) {
  const { rows } = await query(
    `SELECT l.id, l.date, l.description, l.reference, l.type, l.statement_amount, l.bank_account, s.filename
     FROM bank_statement_transactions l
     LEFT JOIN bank_statements s ON s.id = l.statement_id
     WHERE l.business_id = $1 AND ($2::uuid IS NULL OR l.branch_id = $2::uuid)`,
    [businessId, branchId || null]
  )
  return rows.map((r) => ({
    kind: 'statement', id: r.id, date: r.date, type: r.type || (num(r.statement_amount) >= 0 ? 'Deposit' : 'Payment'),
    amount: num(r.statement_amount), description: r.description || 'Statement line',
    reference: r.reference || '', bankAccount: r.bank_account || 'Bank / Card', filename: r.filename,
  }))
}

async function getMatches(businessId, branchId) {
  const { rows } = await query(
    `SELECT entry_type, entry_id, statement_line_id, matched_by, created_at
     FROM reconciliation_matches
     WHERE business_id = $1 AND ($2::uuid IS NULL OR branch_id = $2::uuid)`,
    [businessId, branchId || null]
  )
  return rows
}

const EPSILON = 0.5

/**
 * Reconciliation rows:
 *  - system entry matched to a statement line (amounts equal)  -> Matched
 *  - system entry matched but the amounts differ               -> Unmatched
 *  - system entry confirmed by the accountant without a line   -> Matched
 *  - system entry with no match                                -> In System Only
 *  - statement line with no match                              -> In Statement Only
 */
export async function listReconciliation(businessId, branchId, filters = {}) {
  await ensureAccountingSchema()
  const [system, lines, matches] = await Promise.all([
    getSystemEntries(businessId, branchId),
    getStatementLines(businessId, branchId),
    getMatches(businessId, branchId),
  ])
  const lineById = new Map(lines.map((l) => [String(l.id), l]))
  const matchByEntry = new Map(matches.map((m) => [`${m.entry_type}:${m.entry_id}`, m]))
  const usedLines = new Set(matches.filter((m) => m.statement_line_id).map((m) => String(m.statement_line_id)))

  const items = []
  for (const e of system) {
    const match = matchByEntry.get(`${e.kind}:${e.id}`)
    const line = match?.statement_line_id ? lineById.get(String(match.statement_line_id)) : null
    let statementAmount = null
    let status = 'In System Only'
    if (match && line) {
      statementAmount = line.amount
      status = Math.abs(line.amount - e.amount) < EPSILON ? 'Matched' : 'Unmatched'
    } else if (match) {
      statementAmount = e.amount
      status = 'Matched'
    }
    items.push({
      id: `${e.kind}:${e.id}`, kind: e.kind, date: e.date, description: e.description,
      ref: e.reference, type: e.type, bankAccount: e.bankAccount,
      statementAmount, systemAmount: e.amount,
      difference: statementAmount == null ? -e.amount : statementAmount - e.amount,
      status,
      matchedBy: match?.matched_by || null,
      matchedAt: match?.created_at || null,
      statementLine: line ? { id: `statement:${line.id}`, description: line.description, ref: line.reference, date: line.date, filename: line.filename } : null,
      manual: Boolean(match && !line),
    })
  }
  for (const l of lines) {
    if (usedLines.has(String(l.id))) continue
    items.push({
      id: `statement:${l.id}`, kind: 'statement', date: l.date, description: l.description,
      ref: l.reference, type: l.type, bankAccount: l.bankAccount,
      statementAmount: l.amount, systemAmount: null, difference: l.amount,
      status: 'In Statement Only', matchedBy: null, matchedAt: null, statementLine: null, manual: false,
      filename: l.filename,
    })
  }

  items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))

  const summary = {
    total: items.length,
    matched: items.filter((i) => i.status === 'Matched').length,
    unmatched: items.filter((i) => i.status === 'Unmatched').length,
    inSystemOnly: items.filter((i) => i.status === 'In System Only').length,
    inStatementOnly: items.filter((i) => i.status === 'In Statement Only').length,
    statementLines: lines.length,
  }

  const search = String(filters.search || '').trim().toLowerCase()
  const from = filters.from ? new Date(filters.from) : null
  const to = filters.to ? new Date(`${filters.to}T23:59:59`) : null
  const statusOk = (i) => {
    if (!filters.status) return true
    if (filters.status === 'unreconciled') return i.status !== 'Matched'
    return i.status === filters.status
  }
  const filtered = items.filter((i) =>
    statusOk(i) &&
    (!filters.type || i.type === filters.type) &&
    (!filters.bankAccount || i.bankAccount === filters.bankAccount) &&
    (!search || `${i.description} ${i.ref}`.toLowerCase().includes(search)) &&
    (!from || new Date(i.date) >= from) &&
    (!to || new Date(i.date) <= to)
  )

  return { items: filtered, summary }
}

function parseItemId(id) {
  const [kind, ...rest] = String(id || '').split(':')
  const entryId = rest.join(':')
  const kinds = ['payment', 'refund', 'transfer', 'salary', 'withdrawal', 'adjustment', 'expense', 'statement']
  if (!kinds.includes(kind) || !/^[0-9a-f-]{36}$/i.test(entryId)) throw Object.assign(new Error('Unknown reconciliation item.'), { status: 400 })
  return { kind, entryId }
}

async function recordHistory(scope, { action, recorded, banked, matchedCount, actor }) {
  await query(
    `INSERT INTO reconciliations (business_id, branch_id, action, recorded, banked, difference, matched_count, actor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [scope.businessId, scope.branchId || null, action, recorded, banked, recorded - banked, matchedCount, actor]
  )
}

/** Manually matches the selected items. */
export async function matchItems(scope, ids, actor) {
  await ensureAccountingSchema()
  const parsed = [...new Set(ids || [])].map(parseItemId)
  if (!parsed.length) throw Object.assign(new Error('Select at least one item to match.'), { status: 400 })
  const { items } = await listReconciliation(scope.businessId, scope.branchId)
  const byId = new Map(items.map((i) => [i.id, i]))
  const selected = parsed.map((p) => byId.get(`${p.kind}:${p.entryId}`))
  if (selected.some((i) => !i)) throw Object.assign(new Error('Some selected items no longer exist. Refresh and try again.'), { status: 404 })

  const statementItems = selected.filter((i) => i.kind === 'statement')
  const systemItems = selected.filter((i) => i.kind !== 'statement')

  if (statementItems.length) {
    if (statementItems.length !== 1 || systemItems.length !== 1) {
      throw Object.assign(new Error('To match a statement line, select exactly one statement line and one system transaction.'), { status: 400 })
    }
    const sys = systemItems[0]
    const line = statementItems[0]
    if (sys.status !== 'In System Only') throw Object.assign(new Error('That system transaction is already matched. Unmatch it first.'), { status: 409 })
    const { entryId } = parseItemId(sys.id)
    const lineId = parseItemId(line.id).entryId
    await query(
      `INSERT INTO reconciliation_matches (business_id, branch_id, entry_type, entry_id, statement_line_id, matched_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [scope.businessId, scope.branchId || null, sys.kind, entryId, lineId, actor]
    )
    await recordHistory(scope, { action: 'Manual match', recorded: sys.systemAmount, banked: line.statementAmount, matchedCount: 1, actor })
    return { matched: 1, difference: line.statementAmount - sys.systemAmount }
  }

  // Only system entries: the accountant confirms them as checked (e.g. cash counted in the till).
  const toConfirm = systemItems.filter((i) => i.status === 'In System Only')
  for (const item of toConfirm) {
    const { entryId } = parseItemId(item.id)
    await query(
      `INSERT INTO reconciliation_matches (business_id, branch_id, entry_type, entry_id, matched_by)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (entry_type, entry_id) DO NOTHING`,
      [scope.businessId, scope.branchId || null, item.kind, entryId, actor]
    )
  }
  const total = toConfirm.reduce((s, i) => s + i.systemAmount, 0)
  if (toConfirm.length) await recordHistory(scope, { action: 'Confirmed', recorded: total, banked: total, matchedCount: toConfirm.length, actor })
  return { matched: toConfirm.length, skipped: systemItems.length - toConfirm.length }
}

/** Pairs unmatched statement lines with unmatched system entries of the same amount. */
export async function autoMatch(scope, actor) {
  await ensureAccountingSchema()
  const { items } = await listReconciliation(scope.businessId, scope.branchId)
  const lines = items.filter((i) => i.status === 'In Statement Only').sort((a, b) => new Date(a.date) - new Date(b.date))
  const open = items.filter((i) => i.status === 'In System Only')
  const taken = new Set()
  let matched = 0
  let recorded = 0
  let banked = 0
  const DAY = 24 * 60 * 60 * 1000

  for (const line of lines) {
    const candidates = open.filter((s) =>
      !taken.has(s.id) &&
      Math.abs(s.systemAmount - line.statementAmount) < EPSILON &&
      (!line.bankAccount || s.bankAccount === line.bankAccount)
    )
    if (!candidates.length) continue
    const ref = String(line.ref || '').trim().toLowerCase()
    const byRef = ref ? candidates.find((s) => String(s.ref || '').trim().toLowerCase() === ref) : null
    const byDate = candidates
      .map((s) => ({ s, gap: Math.abs(new Date(s.date) - new Date(line.date)) }))
      .filter((c) => c.gap <= 3 * DAY)
      .sort((a, b) => a.gap - b.gap)[0]?.s
    const pick = byRef || byDate
    if (!pick) continue
    taken.add(pick.id)
    const { entryId } = parseItemId(pick.id)
    const lineId = parseItemId(line.id).entryId
    const result = await query(
      `INSERT INTO reconciliation_matches (business_id, branch_id, entry_type, entry_id, statement_line_id, matched_by)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id`,
      [scope.businessId, scope.branchId || null, pick.kind, entryId, lineId, actor]
    )
    if (result.rows.length) {
      matched += 1
      recorded += pick.systemAmount
      banked += line.statementAmount
    }
  }

  await recordHistory(scope, { action: 'Auto match', recorded, banked, matchedCount: matched, actor })
  return { matched, statementLinesChecked: lines.length }
}

/** Removes a match so the item can be matched again. */
export async function unmatchItem(scope, id, actor) {
  await ensureAccountingSchema()
  const { kind, entryId } = parseItemId(id)
  const result = kind === 'statement'
    ? await query(
      `DELETE FROM reconciliation_matches WHERE statement_line_id = $1 AND business_id = $2 RETURNING id`,
      [entryId, scope.businessId]
    )
    : await query(
      `DELETE FROM reconciliation_matches WHERE entry_type = $1 AND entry_id = $2 AND business_id = $3 RETURNING id`,
      [kind, entryId, scope.businessId]
    )
  if (!result.rows.length) throw Object.assign(new Error('This item is not matched.'), { status: 404 })
  await recordHistory(scope, { action: 'Unmatched', recorded: 0, banked: 0, matchedCount: 0, actor })
  return { unmatched: true }
}

// ---------------------------------------------------------------- reports

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '')

/** Builds the rows of a report so it can be stored and exported later. */
export async function buildReportData(category, scope, { from = null, to = null } = {}) {
  await ensureAccountingSchema().catch(() => {})
  const fromIso = from ? new Date(from).toISOString() : null
  const toIso = to ? new Date(`${to}T23:59:59`).toISOString() : null
  const params = [scope.businessId, scope.branchId || null, fromIso, toIso]
  const summary = await getFinancialSummary(scope.businessId, scope.branchId, { from: fromIso, to: toIso })
  let columns = []
  let rows = []
  let totals = {}

  switch (category) {
    case 'sales':
    case 'taxes': {
      const { rows: data } = await query(
        `SELECT o.order_number, ${TABLE_TEXT_SQL} AS table_text, o.source, ${ORDER_METHOD_SQL} AS method,
                o.total_amount, COALESCE(o.tax_amount, o.total_amount * 0.18) AS vat, o.created_at
         FROM orders o WHERE ${scoped('o', 'o.created_at')} AND ${PAID_ORDER_SQL}
         ORDER BY o.created_at DESC`,
        params
      )
      columns = category === 'sales'
        ? ['Order', 'Table', 'Source', 'Method', 'Total', 'VAT', 'Date']
        : ['Order', 'Table', 'Total', 'VAT', 'Date']
      rows = data.map((r) => category === 'sales'
        ? [r.order_number || '', r.table_text, r.source || '', methodLabel(r.method), num(r.total_amount), num(r.vat), fmtDate(r.created_at)]
        : [r.order_number || '', r.table_text, num(r.total_amount), num(r.vat), fmtDate(r.created_at)])
      totals = category === 'sales'
        ? { 'Paid orders': summary.paidOrders, 'Gross sales': summary.grossSales, Refunds: summary.refunds, 'Net revenue': summary.totalSales }
        : { 'Net sales': summary.totalSales, 'VAT collected (output)': summary.vatTotal, 'VAT paid (input)': 'Not recorded', 'VAT payable': summary.vatTotal }
      break
    }
    case 'expenses': {
      const { rows: data } = await query(
        `SELECT * FROM (
           SELECT 'Salary' AS category, s.name AS description, s.amount, COALESCE(s.paid_at, s.created_at) AS date
           FROM salary_payments s WHERE ${scoped('s', 'COALESCE(s.paid_at, s.created_at)')} AND ${SALARY_PAID_SQL}
           UNION ALL
           SELECT 'Transfer', COALESCE(t.description, t.to_phone), t.amount, COALESCE(t.approved_at, t.created_at)
           FROM transfers t WHERE ${scoped('t', 'COALESCE(t.approved_at, t.created_at)')} AND ${TRANSFER_SENT_SQL}
           UNION ALL
           SELECT 'Adjustment', a.description, ABS(a.amount), a.date::timestamptz
           FROM adjustments a WHERE ${scoped('a', 'a.date::timestamptz')} AND a.type = 'Expense'
           UNION ALL
           SELECT e.category, e.description || COALESCE(' (' || NULLIF(e.vendor, '') || ')', ''), e.amount, e.expense_date::timestamptz
           FROM expenses e WHERE ${scoped('e', 'e.expense_date::timestamptz')}
         ) x ORDER BY date DESC`,
        params
      )
      columns = ['Category', 'Description', 'Amount', 'Date']
      rows = data.map((r) => [r.category, r.description || '', num(r.amount), fmtDate(r.date)])
      totals = {
        'Stock sold (cost of goods)': summary.costOfGoods,
        Salaries: summary.salaries,
        'Transfers & suppliers': summary.transfers,
        ...Object.fromEntries((summary.expenseCategories || []).map((c) => [c.category, c.amount])),
        Adjustments: summary.otherExpenses,
        'Total expenses': summary.expenses,
      }
      break
    }
    case 'payroll': {
      const { rows: data } = await query(
        `SELECT s.name, s.phone, s.gross_amount, s.amount, s.tax_amount, s.insurance_amount, s.net_amount, s.method::text AS method, s.status, COALESCE(s.paid_at, s.created_at) AS date
         FROM salary_payments s WHERE ${scoped('s', 'COALESCE(s.paid_at, s.created_at)')}
         ORDER BY date DESC`,
        params
      )
      columns = ['Name', 'Phone', 'Gross', 'Tax', 'Insurance', 'Net', 'Method', 'Status', 'Date']
      rows = data.map((r) => [r.name || '', r.phone || '', num(r.gross_amount || r.amount), num(r.tax_amount), num(r.insurance_amount), num(r.net_amount || r.amount), methodLabel(r.method), r.status || '', fmtDate(r.date)])
      totals = { 'Salaries paid': summary.salaries, Records: rows.length }
      break
    }
    case 'transfers': {
      const { rows: data } = await query(
        `SELECT t.description, t.to_phone, t.amount, t.status, t.created_at
         FROM transfers t WHERE ${scoped('t', 't.created_at')} ORDER BY t.created_at DESC`,
        params
      )
      columns = ['Recipient & purpose', 'Phone', 'Amount', 'Status', 'Date']
      rows = data.map((r) => [r.description || '', r.to_phone || '', num(r.amount), r.status || '', fmtDate(r.created_at)])
      totals = { 'Transfers sent': summary.transfers, Records: rows.length }
      break
    }
    case 'payments': {
      const { rows: data } = await query(
        `SELECT o.order_number, ${TABLE_TEXT_SQL} AS table_text, p.method::text AS method, p.amount, p.reference, p.paid_at
         FROM payments p LEFT JOIN orders o ON o.id = p.order_id
         WHERE ${scoped('p', 'COALESCE(p.paid_at, o.created_at)')}
         ORDER BY p.paid_at DESC NULLS LAST`,
        params
      )
      columns = ['Order', 'Table', 'Method', 'Amount', 'Reference', 'Date']
      rows = data.map((r) => [r.order_number || '', r.table_text || '', methodLabel(r.method), num(r.amount), r.reference || '', fmtDate(r.paid_at)])
      totals = { 'Payments recorded': rows.length, 'Total received': rows.reduce((s, r) => s + r[3], 0) }
      break
    }
    case 'refunds': {
      const { rows: data } = await query(
        `SELECT o.order_number, r.amount, r.reason, r.status, r.created_at
         FROM refunds r LEFT JOIN orders o ON o.id = r.order_id
         WHERE ${scoped('r', 'r.created_at')} ORDER BY r.created_at DESC`,
        params
      )
      columns = ['Order', 'Amount', 'Reason', 'Status', 'Date']
      rows = data.map((r) => [r.order_number || '', num(r.amount), r.reason || '', r.status || '', fmtDate(r.created_at)])
      totals = { 'Approved refunds': summary.refunds, Records: rows.length }
      break
    }
    case 'purchases': {
      const { rows: data } = await query(
        `SELECT p.name, COALESCE(c.name, p.category, '') AS category, COALESCE(bs.quantity, 0) AS quantity,
                COALESCE(p.cost_price, 0) AS cost_price, COALESCE(p.selling_price, 0) AS selling_price,
                COALESCE(bs.quantity, 0) * COALESCE(p.cost_price, 0) AS value
         FROM products p
         LEFT JOIN product_categories c ON c.id = p.category_id
         LEFT JOIN branch_stock bs ON bs.product_id = p.id AND ($2::uuid IS NULL OR bs.branch_id = $2::uuid)
         WHERE p.business_id = $1 AND p.is_active = TRUE
         ORDER BY value DESC, p.name`,
        [scope.businessId, scope.branchId || null]
      )
      columns = ['Product', 'Category', 'In stock', 'Cost price', 'Selling price', 'Stock value']
      rows = data.map((r) => [r.name, r.category, num(r.quantity), num(r.cost_price), num(r.selling_price), num(r.value)])
      totals = { 'Stock value (at cost)': rows.reduce((s, r) => s + r[5], 0), 'Cost of goods sold': summary.costOfGoods }
      break
    }
    case 'reconciliation': {
      const { items, summary: rec } = await listReconciliation(scope.businessId, scope.branchId, { from, to })
      columns = ['Date', 'Description', 'Reference', 'Account', 'Statement', 'System', 'Difference', 'Status']
      rows = items.map((i) => [fmtDate(i.date), i.description, i.ref || '', i.bankAccount, i.statementAmount ?? '', i.systemAmount ?? '', i.difference, i.status])
      totals = { Matched: rec.matched, Unmatched: rec.unmatched, 'In system only': rec.inSystemOnly, 'In statement only': rec.inStatementOnly }
      break
    }
    default:
      throw Object.assign(new Error('Unknown report category.'), { status: 400 })
  }

  return { category, from, to, generatedAt: new Date().toISOString(), columns, rows, totals }
}
