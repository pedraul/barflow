// The one place subscription prices are calculated. The admin's plan editor, the owner's
// subscription page, registration, renewal and the actual charge all use this, so what an
// owner sees is exactly what they pay.
//
// A plan is a tier with a monthly price and a discount (%) for quarterly and annual billing:
//   monthly   = price_monthly
//   quarterly = price_monthly × 3  × (1 − discount_quarterly %)
//   annually  = price_monthly × 12 × (1 − discount_annually %)

export const BILLING_CYCLES = ['monthly', 'quarterly', 'annually']
export const CYCLE_MONTHS = { monthly: 1, quarterly: 3, annually: 12 }

export function normalizeCycle(value) {
  const cycle = String(value || '').toLowerCase()
  if (cycle === 'yearly' || cycle === 'annual' || cycle === 'year') return 'annually'
  return BILLING_CYCLES.includes(cycle) ? cycle : null
}

const clampPercent = (value) => Math.min(90, Math.max(0, Number(value) || 0))

/** Prices for every billing cycle of a plan row (snake_case DB row or camelCase object). */
export function planPrices(plan) {
  const monthly = Math.max(0, Math.round(Number(plan?.price_monthly ?? plan?.priceMonthly) || 0))
  const discountQuarterly = clampPercent(plan?.discount_quarterly ?? plan?.discountQuarterly)
  const discountAnnually = clampPercent(plan?.discount_annually ?? plan?.discountAnnually)
  return {
    priceMonthly: monthly,
    priceQuarterly: Math.round(monthly * 3 * (1 - discountQuarterly / 100)),
    priceAnnually: Math.round(monthly * 12 * (1 - discountAnnually / 100)),
    discountQuarterly,
    discountAnnually,
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
  for (const [key, column] of [['discountQuarterly', 'discount_quarterly'], ['discountAnnually', 'discount_annually']]) {
    if (!partial || has(key)) {
      const pct = Number(body[key] ?? 0)
      if (!Number.isFinite(pct) || pct < 0 || pct > 90) errors.push('Discounts must be between 0 and 90 %.')
      else values[column] = pct
    }
  }
  if (has('features')) {
    const list = Array.isArray(body.features) ? body.features : String(body.features || '').split('\n')
    values.features = JSON.stringify(list.map((f) => String(f).trim()).filter(Boolean).slice(0, 30))
  }
  if (has('isActive')) values.is_active = body.isActive === true || body.isActive === 'true'
  if (has('sortOrder')) values.sort_order = Math.round(Number(body.sortOrder) || 0)

  // price_yearly is stored for reports and older code: always the discounted annual price.
  if (values.price_monthly !== undefined || values.discount_annually !== undefined) values.__recomputeYearly = true
  return { errors: [...new Set(errors)], values }
}
