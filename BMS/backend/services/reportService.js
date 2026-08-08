import { query } from '../config/database.js'

export async function buildSalesReport() {
  const { rows } = await query(
    `SELECT status, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
     FROM orders GROUP BY status`
  )
  return rows
}

export async function buildSummary() {
  const [[users], [orders], [revenue]] = await Promise.all([
    query('SELECT COUNT(*) AS count FROM users'),
    query('SELECT COUNT(*) AS count FROM orders'),
    query('SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE status = $1', ['Paid']),
  ])
  return {
    users: Number(users.rows[0].count),
    orders: Number(orders.rows[0].count),
    revenue: Number(revenue.rows[0].total),
  }
}
