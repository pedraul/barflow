// Subscription Scheduler - handles auto-expiry checks, alerts, and auto-renewal
import { query } from '../config/database.js'
import {
  sendExpiryReminder,
  sendSubscriptionExpired,
  sendRenewalConfirmation,
} from './emailNotificationService.js'

/**
 * Check all subscriptions for expiry and update their status
 * Returns a summary of what was checked
 */
export async function checkSubscriptionExpiry() {
  try {
    // Find subscriptions that have expired but are still marked active
    const { rows: expired } = await query(
      `UPDATE subscriptions 
       SET is_active = FALSE, status = 'expired', payment_status = 'pending'
       WHERE is_active = TRUE 
         AND payment_status = 'verified'
         AND (expiration_date < NOW() OR current_period_end < NOW())
         AND cancelled_at IS NULL
       RETURNING id, business_id, plan, expiration_date`
    )

    // Send expiry notifications for each expired subscription
    for (const sub of expired) {
      console.log(`Subscription ${sub.id} (${sub.plan}) expired at ${sub.expiration_date}`)
      
      // Fetch business and owner details for email
      try {
        const { rows: bizData } = await query(
          `SELECT b.name AS business_name, b.contact_email,
                  u.full_name AS owner_name, u.email AS owner_email
           FROM businesses b
           LEFT JOIN users u ON u.business_id = b.id AND u.role = 'owner'
           WHERE b.id = $1
           LIMIT 1`,
          [sub.business_id]
        )
        if (bizData.length) {
          const b = bizData[0]
          sendSubscriptionExpired({
            businessName: b.business_name,
            ownerName: b.owner_name || 'Business Owner',
            ownerEmail: b.owner_email || b.contact_email,
            planName: sub.plan || 'N/A',
            expiryDate: sub.expiration_date,
            businessId: sub.business_id,
          }).catch(err => console.error('Failed to send expiry notification email:', err.message))
        }
      } catch (emailErr) {
        console.error('Failed to prepare expiry notification email:', emailErr.message)
      }
    }

    // Find subscriptions that are about to expire (within alert_before_expiry_days)
    const { rows: settings } = await query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'alert_before_expiry_days' LIMIT 1`
    )
    const alertDays = parseInt(settings[0]?.setting_value) || 7

    const { rows: aboutToExpire } = await query(
      `SELECT s.id, s.business_id, s.plan, s.expiration_date, s.next_renewal_date,
              b.name AS business_name
       FROM subscriptions s
       LEFT JOIN businesses b ON b.id = s.business_id
       WHERE s.is_active = TRUE 
         AND s.payment_status = 'verified'
         AND s.expiration_date BETWEEN NOW() AND NOW() + INTERVAL '1 day' * $1
       ORDER BY s.expiration_date ASC`,
      [alertDays]
    )

    // Send expiry reminder emails for subscriptions about to expire
    for (const sub of aboutToExpire) {
      try {
        const { rows: bizData } = await query(
          `SELECT b.name AS business_name, b.contact_email,
                  u.full_name AS owner_name, u.email AS owner_email
           FROM businesses b
           LEFT JOIN users u ON u.business_id = b.id AND u.role = 'owner'
           WHERE b.id = $1
           LIMIT 1`,
          [sub.business_id]
        )
        if (bizData.length) {
          const b = bizData[0]
          const daysRemaining = Math.max(1, Math.ceil((new Date(sub.expiration_date) - new Date()) / (1000 * 60 * 60 * 24)))
          
          sendExpiryReminder({
            businessName: sub.business_name || b.business_name,
            ownerName: b.owner_name || 'Business Owner',
            ownerEmail: b.owner_email || b.contact_email,
            planName: sub.plan || 'N/A',
            expiryDate: sub.expiration_date,
            daysRemaining,
            businessId: sub.business_id,
          }).catch(err => console.error('Failed to send expiry reminder email:', err.message))
        }
      } catch (emailErr) {
        console.error('Failed to prepare expiry reminder email:', emailErr.message)
      }
    }

    return {
      expired: expired.length,
      aboutToExpire: aboutToExpire.length,
      expiringSoon: aboutToExpire,
    }
  } catch (error) {
    console.error('Subscription expiry check failed:', error.message)
    return { expired: 0, aboutToExpire: 0, expiringSoon: [] }
  }
}

/**
 * Auto-renew subscriptions that have auto-renewal enabled
 */
export async function processAutoRenewals() {
  try {
    const { rows: settings } = await query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'auto_renewal' LIMIT 1`
    )
    const autoRenewal = settings[0]?.setting_value === 'true'

    if (!autoRenewal) {
      return { renewed: 0, message: 'Auto-renewal is disabled' }
    }

    // Find subscriptions expiring within the next day with auto-renewal enabled
    const { rows: toRenew } = await query(
      `SELECT s.*, b.name AS business_name
       FROM subscriptions s
       LEFT JOIN businesses b ON b.id = s.business_id
       WHERE s.is_active = TRUE
         AND s.payment_status = 'verified'
         AND s.expiration_date BETWEEN NOW() AND NOW() + INTERVAL '1 day'
       ORDER BY s.expiration_date ASC`
    )

    let renewed = 0
    for (const sub of toRenew) {
      const now = new Date()
      const newExpiry = new Date(now)
      
      // Calculate new period based on plan
      let monthsToAdd = 1
      if (sub.plan === 'quarterly') monthsToAdd = 3
      if (sub.plan === 'annually') monthsToAdd = 12
      newExpiry.setMonth(newExpiry.getMonth() + monthsToAdd)

      await query(
        `UPDATE subscriptions 
         SET start_date = NOW(), 
             current_period_end = $1, 
             expiration_date = $1, 
             next_renewal_date = $1,
             remaining_days = $2
         WHERE id = $3`,
        [newExpiry, monthsToAdd * 30, sub.id]
      )
      renewed++
    }

    return { renewed, message: `Auto-renewed ${renewed} subscriptions` }
  } catch (error) {
    console.error('Auto-renewal processing failed:', error.message)
    return { renewed: 0, message: error.message }
  }
}

/**
 * Get subscription status for use in middleware/checks
 */
export async function getSubscriptionStatus(businessId) {
  try {
    const { rows } = await query(
      `SELECT s.*, b.name AS business_name
       FROM subscriptions s
       LEFT JOIN businesses b ON b.id = s.business_id
       WHERE s.business_id = $1 
          OR s.business_id IS NULL
       ORDER BY s.created_at DESC 
       LIMIT 1`,
      [businessId]
    )

    if (!rows.length) {
      return {
        hasActivePlan: false,
        plan: 'Free',
        status: 'no_subscription',
        isActive: false,
        daysRemaining: 0,
        aboutToExpire: false,
        nextRenewalDate: null,
      }
    }

    const sub = rows[0]
    const now = new Date()
    const expiry = new Date(sub.expiration_date || sub.current_period_end || now)
    const daysRemaining = Math.max(0, Math.floor((expiry - now) / (1000 * 60 * 60 * 24)))

    // Check if about to expire
    const { rows: alertSettings } = await query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'alert_before_expiry_days' LIMIT 1`
    )
    const alertDays = parseInt(alertSettings[0]?.setting_value) || 7
    const aboutToExpire = daysRemaining <= alertDays && daysRemaining > 0

    const isActive = sub.is_active && sub.payment_status === 'verified' && daysRemaining > 0

    return {
      hasActivePlan: isActive,
      plan: sub.plan,
      status: isActive ? 'active' : sub.status || 'expired',
      isActive,
      daysRemaining,
      aboutToExpire,
      startDate: sub.start_date,
      expirationDate: sub.expiration_date || sub.current_period_end,
      nextRenewalDate: sub.next_renewal_date,
      paymentStatus: sub.payment_status,
      amountPaid: Number(sub.amount_paid) || 0,
      receiptNumber: sub.receipt_number,
      businessName: sub.business_name || 'N/A',
    }
  } catch (error) {
    console.error('Error getting subscription status:', error.message)
    return {
      hasActivePlan: false,
      plan: 'Error',
      status: 'error',
      isActive: false,
      daysRemaining: 0,
      aboutToExpire: false,
      nextRenewalDate: null,
    }
  }
}