import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import apiRouter from './routes/index.js'
import { enforceHttps, securityHeaders } from './middleware/securityHeaders.js'
import { isTransactionEncryptionConfigured } from './utils/transactionCrypto.js'
import { migrate, ensureBaseSchema } from './migrations/run.js'
import { seed } from './seeders/seed.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT) || 5000

// Global middleware
// Behind Vercel/hosting proxies: trust X-Forwarded-Proto to detect HTTPS.
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(enforceHttps)
app.use(securityHeaders)
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))

// Routes
app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'BarSolution backend is running' })
})
app.use('/api', apiRouter)

// Prepare the database, then start the server
async function start() {
  try {
    await ensureBaseSchema()

    console.log('Ensuring branch data schema is up to date...')
    await migrate({
      only: [
        '20261005_add_branch_owned_products.sql',
        '20261024_add_subscription_payment_provider_fields.sql',
        '20261026_create_dining_tables.sql',
        '20261026_backfill_order_table_numbers.sql',
        '20261026_add_salary_payout_provider_fields.sql',
        '20261029_repair_branch_owned_stock.sql',
        '20261029_fix_order_station_assignments.sql',
        '20261119_create_staff_shifts.sql',
        '20261120_create_user_permissions.sql',
        '20261121_add_payment_methods.sql',
        '20261121_create_transaction_ledger.sql',
      ],
    })

    if (process.env.RUN_DB_BOOTSTRAP === 'true') {
      console.log('Running database seeders...')
      await seed()
    }

    console.log('Database preparation complete.')
    if (!isTransactionEncryptionConfigured()) {
      console.error('[security] TRANSACTION_ENCRYPTION_KEY is missing or invalid: financial transactions will not be sealed.')
    }
  } catch (error) {
    console.error('Database preparation failed; server startup cancelled:', error.message)
    process.exit(1)
  }

  const server = app.listen(port, () => {
   console.log(`Server listening on port ${port}`)
  })

  server.on('error', (error) => {
    console.error('Failed to start server:', error.message)
    process.exit(1)
  })
}

start()
