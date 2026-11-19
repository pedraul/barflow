import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import apiRouter from './routes/index.js'
import { migrate } from './migrations/run.js'
import { seed } from './seeders/seed.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT) || 5000

// Global middleware
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
      ],
    })

    if (process.env.RUN_DB_BOOTSTRAP === 'true') {
      console.log('Running database seeders...')
      await seed()
    }

    console.log('Database preparation complete.')
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
