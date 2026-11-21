import { query } from '../config/database.js'
import { ensureAccountingSchema } from './accountingSchema.js'

// An order counts as revenue once it is paid (status Paid, or a completed
// payment exists) and it was not cancelled. Same rule as the owner's revenue page.
export const PAID_ORDER_SQL = `(LOWER(BTRIM(o.status::text)) = 'paid' OR EXISTS (
    SELECT 1 FROM payments pay WHERE pay.order_id = o.id AND pay.paid_at IS NOT NULL
  )) AND LOWER(BTRIM(o.status::text)) NOT IN ('cancelled', 'canceled')`

// Money that actually left the business.
export const SALARY_PAID_SQL = `LOWER(BTRIM(COALESCE(s.status, ''))) IN ('paid', 'approved', 'completed')`
export const TRANSFER_SENT_SQL = `LOWER(BTRIM(COALESCE(t.status, ''))) IN ('approved', 'completed')`
export const REFUND_APPROVED_SQL = `LOWER(BTRIM(COALESCE(r.status::text, ''))) = 'approved'`

// $1 business, $2 branch (or null = all branches), $3 from, $4 to (null = open).
const scoped = (alias, dateExpr) =>
  `${alias}.business_id = $1 AND ($2::uuid IS NULL OR ${alias}.branch_id = $2::uuid)
   AND ($3::timestamptz IS NULL OR ${dateExpr} >= $3::timestamptz)
   AND ($4::timestamptz IS NULL OR ${dateExpr} < $4::timestamptz)`

const EMPTY = {
  totalSales: 0, revenue: 0, grossSales: 0, vatTotal: 0, netProfit: 0, refunds: 0,
  costOfGoods: 0, salaries: 0, transfers: 0, otherExpenses: 0, recordedExpenses: 0, expenseCategories: [], operatingExpenses: 0, expenses: 0,
  paidOrders: 0,
}

/**
 * Financial totals for a business (optionally one branch and a date range).
 * expenses = cost of goods sold + paid salaries + sent transfers + expense adjustments.
 */
export async function getFinancialSummary(businessId, branchId = null, { from = null, to = null } = {}) {
  if (!businessId) return { ...EMPTY }
  await ensureAccountingSchema().catch(() => {})

  const params = [businessId, branchId || null, from || null, to || null]
  const safe = (promise) => promise.catch((error) => {
    console.error('[financialSummary]', error.message)
    return { rows: [{}] }
  })

  const [sales, refunds, cost, salaries, transfers, adjustments, recorded] = await Promise.all([
    safe(query(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(o.total_amount), 0) AS gross_sales,
              COALESCE(SUM(COALESCE(o.tax_amount, o.total_amount * 0.18)), 0) AS gross_vat
       FROM orders o
       WHERE ${scoped('o', 'o.created_at')} AND ${PAID_ORDER_SQL}`,
      params
    )),
    safe(query(
      `SELECT COALESCE(SUM(r.amount), 0) AS refunds
       FROM refunds r
       WHERE ${scoped('r', 'r.created_at')} AND ${REFUND_APPROVED_SQL}`,
      params
    )),
    safe(query(
      `SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0) AS cost_of_goods
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE ${scoped('o', 'o.created_at')} AND ${PAID_ORDER_SQL}`,
      params
    )),
    safe(query(
      `SELECT COALESCE(SUM(s.amount), 0) AS salaries
       FROM salary_payments s
       WHERE ${scoped('s', 'COALESCE(s.paid_at, s.created_at)')} AND ${SALARY_PAID_SQL}`,
      params
    )),
    safe(query(
      `SELECT COALESCE(SUM(t.amount), 0) AS transfers
       FROM transfers t
       WHERE ${scoped('t', 'COALESCE(t.approved_at, t.created_at)')} AND ${TRANSFER_SENT_SQL}`,
      params
    )),
    safe(query(
      `SELECT COALESCE(SUM(ABS(a.amount)), 0) AS other_expenses
       FROM adjustments a
       WHERE ${scoped('a', 'a.date::timestamptz')} AND a.type = 'Expense'`,
      params
    )),
    safe(query(
      `SELECT e.category, COALESCE(SUM(e.amount), 0) AS amount
       FROM expenses e
       WHERE ${scoped('e', 'e.expense_date::timestamptz')}
       GROUP BY e.category
       ORDER BY 2 DESC`,
      params
    )).then((r) => (r.rows.length === 1 && !r.rows[0].category ? { rows: [] } : r)),
  ])

  const grossSales = Number(sales.rows[0]?.gross_sales || 0)
  const refundTotal = Number(refunds.rows[0]?.refunds || 0)
  const totalSales = Math.max(0, grossSales - refundTotal)
  const grossVat = Number(sales.rows[0]?.gross_vat || 0)
  const vatTotal = Math.max(0, grossVat - refundTotal * 0.18)
  const costOfGoods = Number(cost.rows[0]?.cost_of_goods || 0)
  const salaryTotal = Number(salaries.rows[0]?.salaries || 0)
  const transferTotal = Number(transfers.rows[0]?.transfers || 0)
  const otherExpenses = Number(adjustments.rows[0]?.other_expenses || 0)
  const expenseCategories = recorded.rows.map((r) => ({ category: r.category, amount: Number(r.amount || 0) }))
  const recordedExpenses = expenseCategories.reduce((sum, c) => sum + c.amount, 0)
  const operatingExpenses = salaryTotal + transferTotal + otherExpenses + recordedExpenses
  const expenses = costOfGoods + operatingExpenses

  return {
    totalSales,
    revenue: totalSales,
    grossSales,
    vatTotal,
    netProfit: totalSales - expenses,
    refunds: refundTotal,
    costOfGoods,
    salaries: salaryTotal,
    transfers: transferTotal,
    otherExpenses,
    recordedExpenses,
    expenseCategories,
    operatingExpenses,
    expenses,
    paidOrders: Number(sales.rows[0]?.orders || 0),
  }
}

export default { getFinancialSummary }
