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
  if (process.env.RUN_DB_BOOTSTRAP === 'true') {
    try {
      console.log('Initializing database migrations...')
      await migrate()

      console.log('Running database seeders...')
      await seed()

      console.log('Database preparation complete!')
    } catch (error) {
      // Check if the error is simply because the tables/relations already exist in PostgreSQL
      if (error.message.includes('already exists') || error.code === '42P07') {
        console.log('Database already initialized (tables already exist). Skipping migrations and seeders.')
      } else {
        // Log any actual connection or critical configuration failures
        console.error('Database setup failed (is PostgreSQL running and DATABASE_URL set?):', error.message)
      }
    }
  } else {
    console.log('Skipping database bootstrap. Set RUN_DB_BOOTSTRAP=true only for an intentional database setup.')
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
