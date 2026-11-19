/**
 * Copy the LOCAL database (DATABASE_URL) into the HOSTED database
 * (TARGET_DATABASE_URL), replacing everything in the hosted one.
 *
 * Usage (from the backend folder):
 *   1. Put TARGET_DATABASE_URL=<hosted connection string> in backend/.env
 *   2. node scripts/copyLocalToHosted.mjs --yes
 *
 * Needs PostgreSQL client tools (pg_dump / pg_restore). Set PGDUMP_PATH /
 * PGRESTORE_PATH if they are not on PATH.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const source = process.env.DATABASE_URL
const target = process.env.TARGET_DATABASE_URL
const confirmed = process.argv.includes('--yes')

const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1) }
const hostOf = (url) => { try { return new URL(url).hostname } catch { return '' } }

if (!source) fail('DATABASE_URL (local database) is not set in backend/.env')
if (!target) fail('TARGET_DATABASE_URL (hosted database) is not set in backend/.env')
if (source === target) fail('TARGET_DATABASE_URL is the same as DATABASE_URL')
if (['localhost', '127.0.0.1', '::1', ''].includes(hostOf(target))) {
  fail('TARGET_DATABASE_URL points at this computer — it must be the hosted database')
}
if (!confirmed) {
  fail(`This REPLACES all data in the hosted database (${hostOf(target)}) with your local data.\n  Re-run with --yes to continue.`)
}

const pgBin = (name, envKey) => {
  if (process.env[envKey]) return process.env[envKey]
  const winDir = 'C:/Program Files/PostgreSQL'
  if (fs.existsSync(winDir)) {
    const versions = fs.readdirSync(winDir).filter((v) => /^\d+$/.test(v)).sort((a, b) => b - a)
    for (const v of versions) {
      const exe = path.join(winDir, v, 'bin', `${name}.exe`)
      if (fs.existsSync(exe)) return exe
    }
  }
  return name
}
const pgDump = pgBin('pg_dump', 'PGDUMP_PATH')
const pgRestore = pgBin('pg_restore', 'PGRESTORE_PATH')

const KEY_TABLES = ['businesses', 'branches', 'users', 'products', 'orders', 'order_items', 'payments', 'subscriptions']

async function counts(url) {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    const out = {}
    for (const t of KEY_TABLES) {
      const { rows } = await client.query(`SELECT to_regclass('public.${t}') AS t`)
      out[t] = rows[0].t ? Number((await client.query(`SELECT COUNT(*) AS n FROM public.${t}`)).rows[0].n) : '—'
    }
    return out
  } finally {
    await client.end()
  }
}

const dumpFile = path.join(os.tmpdir(), `barflow-local-${Date.now()}.dump`)

try {
  console.log(`1/4 Dumping local database with ${pgDump} ...`)
  execFileSync(pgDump, ['--format=custom', '--no-owner', '--no-privileges', '--file', dumpFile, '--dbname', source], { stdio: ['ignore', 'ignore', 'inherit'] })
  console.log(`    ${(fs.statSync(dumpFile).size / 1024).toFixed(0)} KB written`)

  console.log(`2/4 Clearing hosted database (${hostOf(target)}) ...`)
  const client = new pg.Client({ connectionString: target })
  await client.connect()
  await client.query('DROP SCHEMA IF EXISTS public CASCADE')
  await client.query('CREATE SCHEMA public')
  await client.end()

  console.log('3/4 Restoring into hosted database ...')
  try {
    execFileSync(pgRestore, ['--no-owner', '--no-privileges', '--dbname', target, dumpFile], { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (error) {
    // pg_restore exits non-zero for harmless version warnings (e.g. a newer
    // local PostgreSQL emitting settings an older server does not know).
    const lines = String(error.stderr || '').split('\n').filter((l) => /error/i.test(l))
    const serious = lines.filter((l) => !/transaction_timeout|unrecognized configuration parameter/i.test(l))
    if (serious.length) {
      console.error(serious.join('\n'))
      fail('Restore reported errors (see above). The hosted database may be incomplete.')
    }
  }

  console.log('4/4 Verifying row counts ...')
  const [local, hosted] = await Promise.all([counts(source), counts(target)])
  let mismatch = false
  for (const t of KEY_TABLES) {
    const ok = local[t] === hosted[t]
    if (!ok) mismatch = true
    console.log(`    ${ok ? '✔' : '✖'} ${t.padEnd(14)} local ${String(local[t]).padStart(5)}   hosted ${String(hosted[t]).padStart(5)}`)
  }
  if (mismatch) fail('Row counts differ — check the output above.')
  console.log('\n✔ Done. The hosted database now matches your local data.\n')
} finally {
  fs.rmSync(dumpFile, { force: true })
}
