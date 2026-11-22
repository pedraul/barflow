// Whether a business may use the platform right now.
//   - it has a paid, active subscription whose period (plus the admin's grace days) has not ended, or
//   - the platform admin granted access without a subscription ("Grant unpaid access").
// Otherwise staff are blocked and the owner can only open the subscription page to renew.
import { query } from '../config/database.js'
import { settingNumber } from './platformSettings.js'

const cache = new Map()
const TTL_MS = 20_000

export function forgetSubscriptionAccess(businessId) {
  if (businessId) cache.delete(String(businessId))
  else cache.clear()
}

/** { active, endsAt, graceDays } for the business's current paid subscription. */
export async function subscriptionState(businessId) {
  if (!businessId) return { active: false, endsAt: null, graceDays: 0 }
  const hit = cache.get(String(businessId))
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const graceDays = await settingNumber('subscription_grace_days', 0, { min: 0, max: 60 })
  const { rows } = await query(
    `SELECT MAX(COALESCE(current_period_end, expiration_date)) AS ends_at
     FROM subscriptions
     WHERE business_id = $1 AND is_active = TRUE AND payment_status = 'verified'`,
    [businessId]
  )
  const endsAt = rows[0]?.ends_at ? new Date(rows[0].ends_at) : null
  const active = Boolean(endsAt) && endsAt.getTime() + graceDays * 86_400_000 > Date.now()
  const value = { active, endsAt, graceDays }
  cache.set(String(businessId), { at: Date.now(), value })
  return value
}

/** { allowed, viaSubscription, viaAdminAccess } */
export async function businessAccess(businessId, unpaidAccessGranted) {
  if (unpaidAccessGranted === true) return { allowed: true, viaSubscription: (await subscriptionState(businessId)).active, viaAdminAccess: true }
  const { active } = await subscriptionState(businessId)
  return { allowed: active, viaSubscription: active, viaAdminAccess: false }
}

export const SUBSCRIPTION_BLOCKED_MESSAGE = 'Your business subscription has ended or is not paid yet. The owner can renew it from the subscription page.'
