// The one place subscription prices are calculated. The admin's plan editor, the owner's
// subscription page, registration, renewal and the actual charge all use this, so what an
// owner sees is exactly what they pay.
//
// A plan has its own price for each billing cycle, set by the platform admin:
//   monthly   = price_monthly
//   quarterly = price_quarterly (when set) else price_monthly × 3  × (1 − discount_quarterly %)
//   annually  = price_annually  (when set) else price_monthly × 12 × (1 − discount_annually %)
// The fallback keeps plans created before per-cycle prices existed at their old price.
// The discount shown to owners is derived from the prices.
import { query } from '../config/database.js'

let columnsReady = null
/** Adds the per-cycle price columns on databases created before they existed. */
export function ensurePlanPriceColumns() {
  if (!columnsReady) {
    columnsReady = query(
      `ALTER TABLE subscription_plans
         ADD COLUMN IF NOT EXISTS price_quarterly NUMERIC(14,2),
         ADD COLUMN IF NOT EXISTS price_annually NUMERIC(14,2)`
    ).then(() => true).catch((error) => { columnsReady = null; throw error })
  }
  return columnsReady
}

export const BILLING_CYCLES = ['monthly', 'quarterly', 'annually']
export const CYCLE_MONTHS = { monthly: 1, quarterly: 3, annually: 12 }

export function normalizeCycle(value) {
  const cycle = String(value || '').toLowerCase()
  if (cycle === 'yearly' || cycle === 'annual' || cycle === 'year') return 'annually'
  return BILLING_CYCLES.includes(cycle) ? cycle : null
}

const clampPercent = (value) => Math.min(90, Math.max(0, Number(value) || 0))
const positive = (value) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) && n > 0 ? n : null
}
// Saving compared with paying monthly for the same months, 0–90 %, one decimal.
const savingPercent = (price, monthly, months) =>
  monthly > 0 ? Math.min(90, Math.max(0, Math.round((1 - price / (monthly * months)) * 1000) / 10)) : 0

/** Prices for every billing cycle of a plan row (snake_case DB row or camelCase object). */
export function planPrices(plan) {
  const monthly = Math.max(0, Math.round(Number(plan?.price_monthly ?? plan?.priceMonthly) || 0))
  const fixedQuarterly = positive(plan?.price_quarterly ?? plan?.priceQuarterly)
  const fixedAnnually = positive(plan?.price_annually ?? plan?.priceAnnually)
  const priceQuarterly = fixedQuarterly ?? Math.round(monthly * 3 * (1 - clampPercent(plan?.discount_quarterly ?? plan?.discountQuarterly) / 100))
  const priceAnnually = fixedAnnually ?? Math.round(monthly * 12 * (1 - clampPercent(plan?.discount_annually ?? plan?.discountAnnually) / 100))
  return {
    priceMonthly: monthly,
    priceQuarterly,
    priceAnnually,
    discountQuarterly: savingPercent(priceQuarterly, monthly, 3),
    discountAnnually: savingPercent(priceAnnually, monthly, 12),
  }
}

/** { amount, months, discountPercent } for one plan and billing cycle. */
export function priceFor(plan, cycle) {
  const normalized = normalizeCycle(cycle) || 'monthly'
  const p = planPrices(plan)
  const amount = normalized === 'quarterly' ? p.priceQuarterly : normalized === 'annually' ? p.priceAnnually : p.priceMonthly
  const discountPercent = normalized === 'quarterly' ? p.discountQuarterly : normalized === 'annually' ? p.discountAnnually : 0
  return { cycle: normalized, amount, months: CYCLE_MONTHS[normalized], discountPercent }
}

/** Plan row → what the API returns to the admin, the owner and the registration page. */
export function planForClient(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    features: Array.isArray(row.features) ? row.features : [],
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order) || 0,
    ...planPrices(row),
    // Kept for older screens: the annual price after discount.
    priceYearly: planPrices(row).priceAnnually,
  }
}

/** Validates an admin's plan input. Returns { errors, values }. */
export function parsePlanInput(body, { partial = false } = {}) {
  const errors = []
  const values = {}
  const has = (key) => body[key] !== undefined

  if (!partial || has('name')) {
    const name = String(body.name || '').trim()
    if (name.length < 2 || name.length > 60) errors.push('Plan name must be 2 to 60 characters.')
    else values.name = name
  }
  if (has('description')) values.description = String(body.description || '').trim().slice(0, 300)
  if (!partial || has('priceMonthly')) {
    const price = Number(body.priceMonthly)
    if (!Number.isFinite(price) || price <= 0) errors.push('Monthly price must be greater than zero.')
    else values.price_monthly = Math.round(price)
  }
  // Each billing cycle has its own price. Older clients may still send a discount (%) instead.
  for (const [priceKey, priceColumn, discountKey, discountColumn, label] of [
    ['priceQuarterly', 'price_quarterly', 'discountQuarterly', 'discount_quarterly', 'Quarterly'],
    ['priceAnnually', 'price_annually', 'discountAnnually', 'discount_annually', 'Annual'],
  ]) {
    if (has(priceKey) && body[priceKey] !== null && body[priceKey] !== '') {
      const price = Number(body[priceKey])
      if (!Number.isFinite(price) || price <= 0) errors.push(`${label} price must be greater than zero.`)
      else values[priceColumn] = Math.round(price)
    } else if (has(discountKey)) {
      const pct = Number(body[discountKey] ?? 0)
      if (!Number.isFinite(pct) || pct < 0 || pct > 90) errors.push('Discounts must be between 0 and 90 %.')
      else { values[discountColumn] = pct; values[priceColumn] = null }
    } else if (!partial) {
      errors.push(`${label} price is required.`)
    }
  }
  if (has('features')) {
    const list = Array.isArray(body.features) ? body.features : String(body.features || '').split('\n')
    values.features = JSON.stringify(list.map((f) => String(f).trim()).filter(Boolean).slice(0, 30))
  }
  if (has('isActive')) values.is_active = body.isActive === true || body.isActive === 'true'
  if (has('sortOrder')) values.sort_order = Math.round(Number(body.sortOrder) || 0)

  // price_yearly is stored for reports and older code: always the discounted annual price.
  if (['price_monthly', 'price_quarterly', 'price_annually', 'discount_quarterly', 'discount_annually'].some((k) => values[k] !== undefined)) {
    values.__recomputeYearly = true
  }
  if (has('notifyBusinesses')) values.__notifyBusinesses = body.notifyBusinesses === true
  return { errors: [...new Set(errors)], values }
}
