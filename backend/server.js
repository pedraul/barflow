import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import apiRouter from './routes/index.js'
import { publicPlatformInfo } from './services/platformSettings.js'
import { startDailyJobTimer } from './services/dailyJobs.js'
import { verify as verifyToken } from './config/jwt.js'
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

// Database status, so a missing/unreachable database shows a clear error
// instead of crashing the whole function.
const database = { ready: false, error: null }
const databaseConfigured = Boolean(process.env.DATABASE_URL)

// Routes
app.get('/favicon.ico', (_req, res) => res.status(204).end())
app.get('/', (_req, res) => {
  res.json({
    status: database.ready ? 'ok' : 'degraded',
    message: 'BarSolution backend is running',
    database: database.ready ? 'connected' : (databaseConfigured ? 'unreachable' : 'DATABASE_URL is not set'),
  })
})
app.use('/api', (req, res, next) => {
  if (!databaseConfigured) {
    return res.status(503).json({ error: 'The server is not connected to a database (DATABASE_URL is not set).' })
  }
  next()
})
// Maintenance mode (Settings → General): business users and customers get the maintenance
// message; platform admins keep working so they can switch it off again.
app.use('/api', async (req, res, next) => {
  if (req.method === 'OPTIONS') return next()
  const path = req.path || ''
  if (path.startsWith('/platform') || path.startsWith('/public/') || path.startsWith('/internal/') || path === '/health') return next()
  try {
    const info = await publicPlatformInfo()
    if (!info.maintenance.enabled) return next()
    // A platform admin's own requests outside /platform (e.g. viewing a business) are allowed.
    const header = String(req.headers.authorization || '')
    const token = header.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null
    if (token?.isPlatformAdmin) return next()
    return res.status(503).json({ error: info.maintenance.message, code: 'MAINTENANCE' })
  } catch {
    return next()
  }
})
app.use('/api', apiRouter)

// Prepare the database, then start the server
async function start() {
  try {
    await ensureBaseSchema()

    console.log('Ensuring branch data schema is up to date...')
    // A failed migration is logged but must not take the API down: the
    // tables the newest features need are also created on first use.
    await migrate({
      only: [
        '20261005_add_branch_owned_products.sql',
        '20261024_add_subscription_payment_provider_fields.sql',
        '20261026_create_dining_tables.sql',
        '20261026_backfill_order_table_numbers.sql',
        '20261026_add_salary_payout_provider_fields.sql',
        '20261026_add_outbound_payout_provider_fields.sql',
        '20261029_repair_branch_owned_stock.sql',
        '20261029_fix_order_station_assignments.sql',
        '20261119_create_staff_shifts.sql',
        '20261120_create_user_permissions.sql',
        '20261121_add_payment_methods.sql',
        '20261121_create_transaction_ledger.sql',
        '20261121_scope_accounting_records.sql',
        '20261122_create_expenses_and_documents.sql',
      ],
    }).catch((error) => {
      console.error('[startup] A database migration failed (server continues):', error.message)
    })

    if (process.env.RUN_DB_BOOTSTRAP === 'true') {
      console.log('Running database seeders...')
      await seed()
    }

    console.log('Database preparation complete.')
    database.ready = true
  } catch (error) {
    // Keep serving: exiting here crashes every request on serverless hosts.
    database.error = error.message
    console.error(
      databaseConfigured
        ? `[startup] Database unreachable (${error.message}). Check DATABASE_URL for this environment.`
        : '[startup] DATABASE_URL is not set for this environment: add it in the hosting settings and redeploy.'
    )
  }
  if (!isTransactionEncryptionConfigured()) {
    console.error('[security] TRANSACTION_ENCRYPTION_KEY is missing or invalid: financial transactions will not be sealed.')
  }

  startDailyJobTimer()

  const server = app.listen(port, () => {
   console.log(`Server listening on port ${port}`)
  })

  server.on('error', (error) => {
    console.error('Failed to start server:', error.message)
    process.exit(1)
  })
}

start()
