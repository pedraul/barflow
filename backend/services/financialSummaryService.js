import { query } from '../config/database.js'

export async function getFinancialSummary(businessId, branchId = null) {
  if (!businessId) {
    return { totalSales: 0, revenue: 0, vatTotal: 0, netProfit: 0, refunds: 0, costOfGoods: 0, expenses: 0 }
  }

  const branchFilter = branchId ? ' AND branch_id = $2' : ''
  const branchParams = branchId ? [businessId, branchId] : [businessId]
  const [salesResult, refundsResult, costResult, expenseResult] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(total_amount), 0) AS gross_sales,
              COALESCE(SUM(COALESCE(tax_amount, total_amount * 0.18)), 0) AS gross_vat
       FROM orders
      WHERE business_id = $1 AND LOWER(BTRIM(status::text)) IN ('paid', 'served')${branchFilter}`,
          branchParams
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0) AS refunds
       FROM refunds
      WHERE business_id = $1 AND LOWER(BTRIM(status::text)) = 'approved'${branchFilter}`,
          branchParams
    ),
    query(
      `SELECT COALESCE(SUM(oi.quantity * p.cost_price), 0) AS cost_of_goods
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
      WHERE o.business_id = $1 AND LOWER(BTRIM(o.status::text)) IN ('paid', 'served')${branchId ? ' AND o.branch_id = $2' : ''}`,
          branchParams
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0) AS expenses
       FROM salary_payments
      WHERE business_id = $1${branchFilter}`,
          branchParams
    ),
  ])

  const grossSales = Number(salesResult.rows[0]?.gross_sales || 0)
  const refunds = Number(refundsResult.rows[0]?.refunds || 0)
  const totalSales = Math.max(0, grossSales - refunds)
  const grossVat = Number(salesResult.rows[0]?.gross_vat || 0)
  const vatTotal = Math.max(0, grossVat - refunds * 0.18)
  const costOfGoods = Number(costResult.rows[0]?.cost_of_goods || 0)
  const expenses = Number(expenseResult.rows[0]?.expenses || 0)

  return {
    totalSales,
    revenue: totalSales,
    vatTotal,
    netProfit: totalSales - costOfGoods - expenses,
    refunds,
    costOfGoods,
    expenses,
  }
}

export default { getFinancialSummary }
