// Helpers for documents the accountant uploads: reading files, and turning
// spreadsheets (CSV / Excel) into expense rows or bank statement lines.
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024
export const ACCEPTED_DOCUMENTS = '.pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls,.doc,.docx,.txt'

export const isSpreadsheet = (file) => /\.(csv|xlsx|xls)$/i.test(file?.name || '')

export const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Reads a file as base64 (without the data: prefix). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;base64,/, ''))
    reader.onerror = () => reject(new Error('The file could not be read.'))
    reader.readAsDataURL(file)
  })
}

const normalizeKey = (key) => String(key || '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Reads the first sheet of a CSV or Excel file into objects with lower-case column names. */
export async function readSpreadsheet(file) {
  if (/\.csv$/i.test(file.name)) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeKey,
        complete: (result) => resolve(result.data),
        error: () => reject(new Error('This CSV file could not be read.')),
      })
    })
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []
  // raw values: real numbers for amounts and Date objects for dates (not display text).
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })
  const cell = (v) => {
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
    }
    return v == null ? '' : String(v)
  }
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [normalizeKey(k), cell(v)])))
}

const pick = (row, names) => {
  for (const name of names) {
    const value = row[name]
    if (value !== undefined && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

/** Maps spreadsheet rows to expenses (Date, Category, Description, Amount, Method, Vendor, Reference). */
export function toExpenseRows(rows) {
  return rows.map((row) => ({
    date: pick(row, ['date', 'expense date', 'transaction date', 'paid on', 'day']),
    category: pick(row, ['category', 'expense category', 'type', 'account']),
    description: pick(row, ['description', 'details', 'item', 'items', 'narration', 'particulars', 'purpose', 'memo', 'name']),
    amount: pick(row, ['amount', 'total', 'cost', 'amount (rwf)', 'debit', 'money out', 'paid', 'price']),
    method: pick(row, ['method', 'payment method', 'paid via', 'payment', 'mode']),
    vendor: pick(row, ['vendor', 'supplier', 'payee', 'paid to', 'shop']),
    reference: pick(row, ['reference', 'ref', 'receipt', 'receipt no', 'invoice', 'invoice no', 'transaction id']),
  })).filter((row) => row.amount || row.description)
}

/** Maps spreadsheet rows to bank / mobile money statement lines. */
export function toStatementRows(rows) {
  return rows.map((row) => {
    const credit = pick(row, ['credit', 'deposit', 'money in', 'paid in'])
    const debit = pick(row, ['debit', 'withdrawal', 'money out', 'paid out'])
    let amount = pick(row, ['amount', 'amount (rwf)', 'value'])
    if (!amount && (credit || debit)) amount = credit || `-${debit.replace(/^-/, '')}`
    return {
      date: pick(row, ['date', 'transaction date', 'value date', 'posting date']),
      description: pick(row, ['description', 'details', 'narration', 'particulars', 'transaction']),
      reference: pick(row, ['reference', 'ref', 'transaction id', 'txn id', 'id']),
      type: pick(row, ['type']),
      amount,
    }
  }).filter((row) => row.date || row.amount)
}

export function downloadTextFile(content, name, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const EXPENSE_TEMPLATE = 'Date,Category,Description,Amount,Method,Vendor,Reference\n2026-11-01,Rent,November rent,250000,bank,Landlord,INV-11\n2026-11-03,Utilities,Electricity tokens,30000,mtn_momo,REG,\n'
