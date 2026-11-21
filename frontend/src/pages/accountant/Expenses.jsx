import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchExpenses, createExpense, importExpenses, deleteExpense, uploadDocument, downloadDocument,
} from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'
import {
  ACCEPTED_DOCUMENTS, EXPENSE_TEMPLATE, MAX_UPLOAD_BYTES, downloadTextFile, fileToBase64,
  formatBytes, isSpreadsheet, readSpreadsheet, saveBlob, toExpenseRows,
} from '../../utils/accountingFiles'

const money = (value) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} RWF`
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const DEFAULT_CATEGORIES = ['Rent', 'Utilities', 'Supplies', 'Transport', 'Maintenance & repairs', 'Marketing', 'Taxes & fees', 'Bank charges', 'Internet & phone', 'Cleaning', 'Security', 'Other']
const METHODS = [
  ['cash', 'Cash', 'Cash Till'],
  ['mtn_momo', 'MTN MoMo', 'Mobile Money'],
  ['airtel_money', 'Airtel Money', 'Mobile Money'],
  ['bank', 'Bank transfer', 'Bank / Card'],
  ['card', 'Card', 'Bank / Card'],
]
const apiError = (err, fallback) => err?.response?.data?.error || err?.message || fallback
const emptyForm = () => ({ category: 'Rent', description: '', amount: '', date: today(), method: 'cash', vendor: '', reference: '' })

export default function Expenses() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ from: '', to: '', category: '' })
  const [form, setForm] = useState(emptyForm())
  const [receipt, setReceipt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [importFile, setImportFile] = useState(null)
  const [importRows, setImportRows] = useState([])
  const [importing, setImporting] = useState(false)
  const [reading, setReading] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const receiptInput = useRef(null)
  const importInput = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      const data = await fetchExpenses(params)
      setExpenses(data.expenses || [])
      if (data.categories?.length) setCategories(data.categories)
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('Unable to load expenses.')) })
    } finally {
      setLoading(false)
    }
  }, [filters, t])

  useEffect(() => { load() }, [load])

  const totals = useMemo(() => {
    const byCategory = {}
    expenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount })
    return {
      total: expenses.reduce((sum, e) => sum + e.amount, 0),
      byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
    }
  }, [expenses])

  const chooseReceipt = (file) => {
    if (!file) return setReceipt(null)
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage({ tone: 'error', text: t('Files can be at most 3 MB.') })
      return setReceipt(null)
    }
    setReceipt(file)
  }

  const submit = async (e) => {
    e.preventDefault()
    setMessage(null)
    const amount = Number(form.amount)
    if (!form.description.trim() || !(amount > 0)) {
      setMessage({ tone: 'error', text: t('Enter a description and an amount greater than zero.') })
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        amount,
        account: METHODS.find(([m]) => m === form.method)?.[2],
      }
      if (receipt) payload.document = { filename: receipt.name, data: await fileToBase64(receipt) }
      await createExpense(payload)
      setMessage({ tone: 'success', text: `${t('Expense saved:')} ${money(amount)} (${t(form.category)}). ${t('The dashboard, profit and reports now include it.')}` })
      setForm({ ...emptyForm(), category: form.category, method: form.method })
      setReceipt(null)
      if (receiptInput.current) receiptInput.current.value = ''
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('Failed to save the expense.')) })
    } finally {
      setSaving(false)
    }
  }

  const chooseImport = async (file) => {
    setImportResult(null)
    setImportRows([])
    setImportFile(file || null)
    if (!file) return
    if (!isSpreadsheet(file)) {
      setMessage({ tone: 'error', text: t('Choose a CSV or Excel file.') })
      return
    }
    setReading(true)
    try {
      setImportRows(toExpenseRows(await readSpreadsheet(file)))
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('This file could not be read.')) })
    } finally {
      setReading(false)
    }
  }

  const runImport = async () => {
    if (!importRows.length) return
    setImporting(true)
    setMessage(null)
    try {
      // Keep the original file with the expenses it created.
      let documentId = null
      if (importFile && importFile.size <= MAX_UPLOAD_BYTES) {
        const doc = await uploadDocument({ filename: importFile.name, data: await fileToBase64(importFile), category: 'Expense list', description: t('Imported expenses') })
        documentId = doc.id
      }
      const result = await importExpenses(importRows, documentId)
      setImportResult(result)
      setMessage({ tone: 'success', text: `${t('Imported')} ${result.imported} ${t('expense(s) totalling')} ${money(result.total)}.${result.skippedCount ? ` ${result.skippedCount} ${t('row(s) skipped.')}` : ''}` })
      setImportRows([])
      setImportFile(null)
      if (importInput.current) importInput.current.value = ''
      await load()
    } catch (err) {
      const skipped = err?.response?.data?.skipped
      setImportResult(skipped ? { skipped } : null)
      setMessage({ tone: 'error', text: apiError(err, t('Import failed.')) })
    } finally {
      setImporting(false)
    }
  }

  const remove = async (expense) => {
    if (!window.confirm(`${t('Delete this expense?')}\n${expense.category}: ${expense.description} — ${money(expense.amount)}`)) return
    try {
      await deleteExpense(expense.id)
      setExpenses((list) => list.filter((e) => e.id !== expense.id))
      setMessage({ tone: 'success', text: t('Expense deleted.') })
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('Failed to delete the expense.')) })
    }
  }

  const openReceipt = async (expense) => {
    try {
      saveBlob(await downloadDocument(expense.documentId), expense.documentName || 'receipt')
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('Unable to download the file.')) })
    }
  }

  const field = { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, width: '100%', background: 'var(--surface, #fff)', color: 'inherit' }
  const label = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }

  return (
    <div className="page accountant-expenses">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Expenses')}</h1>
          <p>{t('Record rent, utilities, supplies and other costs, or import them from a spreadsheet. They are counted in the dashboard, profit, reconciliation and reports.')}</p>
        </div>
        <button type="button" className="secondary-action" onClick={() => navigate('/accountant/documents')}>{t('Documents')}</button>
      </div>

      {message && (
        <div role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'error-box' : 'success-box'} style={{ marginBottom: 16, color: message.tone === 'error' ? '#b91c1c' : '#166534' }}>
          {message.text}
        </div>
      )}

      <div className="user-info-grid">
        <div className="summary-card"><strong>{money(totals.total)}</strong><span>{t('Total expenses shown')}</span></div>
        <div className="summary-card"><strong>{expenses.length}</strong><span>{t('Expenses')}</span></div>
        {totals.byCategory.slice(0, 4).map(([category, amount]) => (
          <button type="button" key={category} className="summary-card" onClick={() => setFilters((f) => ({ ...f, category: f.category === category ? '' : category }))} style={{ textAlign: 'left' }}>
            <strong>{money(amount)}</strong><span>{t(category)}</span>
          </button>
        ))}
      </div>

      <section className="user-section">
        <h2>{t('Add an expense')}</h2>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, alignItems: 'end' }}>
          <label style={label}>
            {t('Category')}
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={field}>
              {categories.map((c) => <option key={c} value={c}>{t(c)}</option>)}
            </select>
          </label>
          <label style={{ ...label, gridColumn: 'span 2' }}>
            {t('Description')}
            <input type="text" value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('e.g. Electricity tokens for November')} style={field} required />
          </label>
          <label style={label}>
            {t('Amount (RWF)')}
            <input type="number" min="1" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" style={field} required />
          </label>
          <label style={label}>
            {t('Date')}
            <input type="date" value={form.date} max={today()} onChange={(e) => setForm({ ...form, date: e.target.value })} style={field} required />
          </label>
          <label style={label}>
            {t('Paid with')}
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} style={field}>
              {METHODS.map(([value, name]) => <option key={value} value={value}>{t(name)}</option>)}
            </select>
          </label>
          <label style={label}>
            {t('Vendor / supplier')}
            <input type="text" value={form.vendor} maxLength={200} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder={t('Optional')} style={field} />
          </label>
          <label style={label}>
            {t('Reference / receipt no.')}
            <input type="text" value={form.reference} maxLength={200} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder={t('Optional')} style={field} />
          </label>
          <label style={label}>
            {t('Receipt or invoice (optional)')}
            <input ref={receiptInput} type="file" accept={ACCEPTED_DOCUMENTS} onChange={(e) => chooseReceipt(e.target.files?.[0])} style={{ ...field, padding: 7 }} />
          </label>
          <button type="submit" className="pay-action" disabled={saving} style={{ padding: '10px 18px' }}>
            {saving ? t('Saving…') : t('Save expense')}
          </button>
        </form>
        <p style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 8 }}>
          {t('Cash expenses reduce Cash in Hand; mobile money, bank and card expenses reduce the Bank & Mobile Money balance.')}
          {receipt ? ` ${t('Attached:')} ${receipt.name} (${formatBytes(receipt.size)})` : ''}
        </p>
      </section>

      <section className="user-section">
        <h2>{t('Import expenses from a spreadsheet')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
          {t('Upload a CSV or Excel file with columns such as Date, Category, Description, Amount, Method, Vendor and Reference. The system reads every row and records it as an expense; the file is kept in Documents.')}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={importInput} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => chooseImport(e.target.files?.[0])} style={{ ...field, width: 'auto', padding: 7 }} />
          <button type="button" className="secondary-action" onClick={() => downloadTextFile(EXPENSE_TEMPLATE, 'expenses-template.csv')}>{t('Download template')}</button>
          <button
            type="button"
            className="pay-action"
            disabled={importing || reading}
            onClick={() => (importRows.length ? runImport() : importInput.current?.click())}
            style={{ padding: '10px 18px' }}
          >
            {importing ? t('Importing…') : reading ? t('Reading file…') : importRows.length ? `${t('Import')} ${importRows.length} ${t('expense(s)')}` : t('Choose file to import')}
          </button>
        </div>
        {importFile && !reading && !importRows.length && (
          <p role="alert" style={{ fontSize: 13, color: '#b45309', marginTop: 8 }}>
            {t('No expenses were found in')} {importFile.name}. {t('Make sure the first row has column names such as Description and Amount, or use the template.')}
          </p>
        )}
        {importRows.length > 0 && (
          <div className="user-table-wrap" style={{ marginTop: 12, maxHeight: 260, overflow: 'auto' }}>
            <table className="user-table">
              <thead>
                <tr><th>{t('Date')}</th><th>{t('Category')}</th><th>{t('Description')}</th><th>{t('Method')}</th><th style={{ textAlign: 'right' }}>{t('Amount')}</th></tr>
              </thead>
              <tbody>
                {importRows.slice(0, 15).map((row, i) => (
                  <tr key={i}>
                    <td>{row.date || t('Today')}</td>
                    <td>{row.category || t('Other')}</td>
                    <td>{row.description || <span style={{ color: '#dc2626' }}>{t('missing')}</span>}</td>
                    <td>{row.method || t('Cash')}</td>
                    <td style={{ textAlign: 'right' }}>{row.amount || <span style={{ color: '#dc2626' }}>{t('missing')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {importRows.length > 15 && <p style={{ fontSize: 12, color: 'var(--text-4)', padding: 8 }}>{t('Showing the first 15 of')} {importRows.length} {t('rows')}.</p>}
          </div>
        )}
        {importResult?.skipped?.length > 0 && (
          <p style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>
            {t('Skipped rows:')} {importResult.skipped.map((s) => `${s.row} (${s.problems.join(', ')})`).join('; ')}
          </p>
        )}
      </section>

      <section className="user-section">
        <h2>{t('Recorded expenses')}</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={label}>{t('From')}<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} style={{ ...field, width: 'auto' }} /></label>
          <label style={label}>{t('To')}<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} style={{ ...field, width: 'auto' }} /></label>
          <label style={label}>
            {t('Category')}
            <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} style={{ ...field, width: 'auto' }}>
              <option value="">{t('All categories')}</option>
              {[...new Set([...categories, ...expenses.map((e) => e.category)])].map((c) => <option key={c} value={c}>{t(c)}</option>)}
            </select>
          </label>
          {(filters.from || filters.to || filters.category) && (
            <button type="button" className="secondary-action" onClick={() => setFilters({ from: '', to: '', category: '' })}>{t('Clear filters')}</button>
          )}
        </div>
        {loading ? (
          <p style={{ color: 'var(--text-4)' }}>{t('Loading expenses…')}</p>
        ) : expenses.length === 0 ? (
          <p style={{ color: 'var(--text-4)' }}>{t('No expenses recorded for this selection.')}</p>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{t('Category')}</th>
                  <th>{t('Description')}</th>
                  <th>{t('Paid with')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Amount')}</th>
                  <th>{t('Receipt')}</th>
                  <th>{t('Recorded by')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{e.date}</td>
                    <td>{t(e.category)}</td>
                    <td>
                      <div className="obw-strong">{e.description}</div>
                      {(e.vendor || e.reference) && <div style={{ fontSize: 12, color: 'var(--text-4)' }}>{[e.vendor, e.reference].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td>{t(e.methodLabel || e.method)}<div style={{ fontSize: 12, color: 'var(--text-4)' }}>{t(e.account)}</div></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(e.amount)}</td>
                    <td>{e.documentId ? <button type="button" className="secondary-action" style={{ padding: '0.3rem 0.6rem', margin: 0, fontSize: 12 }} onClick={() => openReceipt(e)}>{t('Download')}</button> : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-4)' }}>{e.createdBy}</td>
                    <td><button type="button" className="secondary-action" style={{ padding: '0.3rem 0.6rem', margin: 0, fontSize: 12, color: '#dc2626' }} onClick={() => remove(e)}>{t('Delete')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
