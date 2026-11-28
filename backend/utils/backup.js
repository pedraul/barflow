import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backupDir = path.resolve(__dirname, '../../database/backups')

function getDatabaseUri() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }
  const database = process.env.PGDATABASE || process.env.PGDATABASE
  if (database) {
    return database
  }
  throw new Error('Database connection information is not available for backup/restore.')
}

export async function createBackup(backupPath) {
  const outputPath = backupPath || path.join(backupDir, `backup-${Date.now()}.dump`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  return new Promise((resolve, reject) => {
    const pgDump = process.env.PGDUMP_PATH || 'pg_dump'
    const dbUri = getDatabaseUri()
    const args = ['--format=custom', '--file', outputPath, `--dbname=${dbUri}`]
    execFile(pgDump, args, { env: process.env }, (err, _stdout, stderr) => {
      if (err) {
        return reject(new Error(`Backup failed: ${stderr || err.message}`))
      }
      resolve(outputPath)
    })
  })
}

export async function restoreBackup(backupPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file does not exist.')
  }

  return new Promise((resolve, reject) => {
    const pgRestore = process.env.PGRESTORE_PATH || 'pg_restore'
    const dbUri = getDatabaseUri()
    const args = ['--clean', '--if-exists', '--verbose', `--dbname=${dbUri}`, backupPath]
    execFile(pgRestore, args, { env: process.env }, (err, _stdout, stderr) => {
      if (err) {
        return reject(new Error(`Restore failed: ${stderr || err.message}`))
      }
      resolve(backupPath)
    })
  })
}

export default { createBackup, restoreBackup }
