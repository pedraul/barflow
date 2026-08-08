import { Router } from 'express'
import { query } from '../config/database.js'
import authMiddleware from '../middleware/authMiddleware.js'

const router = Router()

// Ensure the receipt_settings table exists (auto-create if missing)
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS receipt_settings (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(business_id)
    )
  `)
}

// GET /api/operator/receipt-settings
// Returns the receipt display settings for the current business.
// Defaults are used when no settings row exists yet.
const defaultSettings = {
  showBusinessName: true,
  businessNameText: '',
  showDescription: true,
  descriptionText: '',
  showAddress: true,
  addressText: '',
  showPhone: true,
  phoneText: '',
  showEmail: true,
  emailText: '',
  showTin: true,
  tinText: '',
  showReceiptNo: true,
  showDate: true,
  showTime: true,
  showWaiter: true,
  showTable: true,
  showOrderType: true,
  showClientName: true,
  showClientPhone: true,
  showItems: true,
  showSubtotal: true,
  showDiscount: true,
  showTotal: true,
  showPaymentMethod: true,
  showAmountPaid: true,
  showPaymentRef: true,
  showPaymentStatus: true,
  showCustomerNumber: true,
  showFooterNote: true,
  footerNoteText: '',
}

router.get('/receipt-settings', authMiddleware, async (req, res) => {
  try {
    await ensureTable()
    const businessId = req.user.businessId
    const { rows } = await query(
      'SELECT settings FROM receipt_settings WHERE business_id = $1',
      [businessId]
    )
    if (!rows.length) {
      return res.json(defaultSettings)
    }
    res.json({ ...defaultSettings, ...rows[0].settings })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/operator/receipt-settings
// Save the receipt display settings for the current business.
router.put('/receipt-settings', authMiddleware, async (req, res) => {
  try {
    await ensureTable()
    const businessId = req.user.businessId
    const { settings } = req.body

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'settings object is required' })
    }

    // Only allow known keys (booleans for toggles, strings for custom text)
    const allowedKeys = Object.keys(defaultSettings)
    const cleanSettings = {}
    for (const key of allowedKeys) {
      if (typeof settings[key] === 'boolean') {
        cleanSettings[key] = settings[key]
      } else if (typeof settings[key] === 'string') {
        cleanSettings[key] = settings[key]
      }
    }

    await query(
      `INSERT INTO receipt_settings (business_id, settings, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (business_id)
       DO UPDATE SET settings = $2, updated_at = NOW()`,
      [businessId, JSON.stringify(cleanSettings)]
    )

    res.json({ ...defaultSettings, ...cleanSettings })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router