import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchDocuments, uploadDocument, downloadDocument, deleteDocument, importExpenses, uploadBankStatement,
} from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'
import {
  ACCEPTED_DOCUMENTS, MAX_UPLOAD_BYTES, fileToBase64, formatBytes, isSpreadsheet,
  readSpreadsheet, saveBlob, toExpenseRows, toStatementRows,
} from '../../utils/accountingFiles'

const CATEGORIES = ['Receipt', 'Invoice', 'Expense list', 'Bank statement', 'Mobile money statement', 'Tax document', 'Contract', 'Payroll', 'Other']
const ACCOUNTS = ['Cash Till', 'Mobile Money', 'Bank / Card']
const apiError = (err, fallback) => err?.response?.data?.error || err?.message || fallback

// What the system does with a spreadsheet of each category.
const readsAs = (category) => (category === 'Expense list' ? 'expenses'
  : ['Bank statement', 'Mobile money statement'].includes(category) ? 'statement' : null)

export default function Documents() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ category: '', search: '' })
  const [file, setFile] = useState(null)
  const [category, setCategory] = useState('Receipt')
  const [description, setDescription] = useState('')
  const [account, setAccount] = useState('Bank / Card')
  const [parsed, setParsed] = useState([])
  const [processFile, setProcessFile] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState(null)
  const fileInput = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filter.category) params.category = filter.category
      if (filter.search.trim()) params.search = filter.search.trim()
      const data = await fetchDocuments(params)
      setDocuments(data.documents || [])
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('Unable to load documents.')) })
    } finally {
      setLoading(false)
    }
  }, [filter, t])

  useEffect(() => {
    const timer = window.setTimeout(load, 250)
    return () => window.clearTimeout(timer)
  }, [load])

  // Read spreadsheets so their content can be added to the books.
  useEffect(() => {
    let active = true
    setParsed([])
    const kind = readsAs(category)
    if (!file || !kind || !isSpreadsheet(file)) return undefined
    readSpreadsheet(file)
      .then((rows) => { if (active) setParsed(kind === 'expenses' ? toExpenseRows(rows) : toStatementRows(rows)) })
      .catch(() => { if (active) setParsed([]) })
    return () => { active = false }
  }, [file, category])

  const chooseFile = (chosen) => {
    setMessage(null)
    if (!chosen) return setFile(null)
    if (chosen.size > MAX_UPLOAD_BYTES) {
      setMessage({ tone: 'error', text: `${t('Files can be at most 3 MB.')} (${formatBytes(chosen.size)})` })
      if (fileInput.current) fileInput.current.value = ''
      return setFile(null)
    }
    setFile(chosen)
    if (isSpreadsheet(chosen) && !readsAs(category)) setCategory('Expense list')
  }

  const reset = () => {
    setFile(null)
    setDescription('')
    setParsed([])
    if (fileInput.current) fileInput.current.value = ''
  }

  const upload = async (e) => {
    e.preventDefault()
    if (!file) {
      setMessage({ tone: 'error', text: t('Choose a file to upload.') })
      return
    }
    setUploading(true)
    setMessage(null)
    try {
      const doc = await uploadDocument({ filename: file.name, data: await fileToBase64(file), category, description })
      const kind = readsAs(category)
      let extra = ''
      if (processFile && kind && parsed.length) {
        if (kind === 'expenses') {
          const result = await importExpenses(parsed, doc.id)
          extra = ` ${t('The system read')} ${result.imported} ${t('expense(s)')} (${Number(result.total).toLocaleString()} RWF) ${t('and added them to the books.')}${result.skippedCount ? ` ${result.skippedCount} ${t('row(s) skipped.')}` : ''}`
        } else {
          const result = await uploadBankStatement({ filename: file.name, bankAccount: account, transactions: parsed, documentId: doc.id })
          extra = ` ${t('The system read')} ${result.count} ${t('statement line(s) and added them to Reconciliation.')}${result.skippedRows?.length ? ` ${t('Skipped rows:')} ${result.skippedRows.join(', ')}.` : ''}`
        }
      }
      setMessage({ tone: 'success', text: `${t('Uploaded')} ${file.name}.${extra}` })
      reset()
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('Upload failed.')) })
      await load()
    } finally {
      setUploading(false)
    }
  }

  const download = async (doc) => {
    try {
      saveBlob(await downloadDocument(doc.id), doc.filename)
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('Unable to download the file.')) })
    }
  }

  const remove = async (doc) => {
    const note = doc.expenseCount ? `\n${t('The')} ${doc.expenseCount} ${t('expense(s) created from it are kept.')}` : ''
    if (!window.confirm(`${t('Delete')} ${doc.filename}?${note}`)) return
    try {
      await deleteDocument(doc.id)
      setDocuments((list) => list.filter((d) => d.id !== doc.id))
    } catch (err) {
      setMessage({ tone: 'error', text: apiError(err, t('Failed to delete the document.')) })
    }
  }

  const processedText = (doc) => {
    if (doc.processedAs === 'expenses' || doc.processedAs === 'expense') return `${doc.processedCount} ${t('expense(s) recorded')}`
    if (doc.processedAs === 'statement') return `${doc.processedCount} ${t('statement line(s) added')}`
    return t('Stored')
  }

  const kind = readsAs(category)
  const field = { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, width: '100%', background: 'var(--surface, #fff)', color: 'inherit' }
  const label = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }

  return (
    <div className="page accountant-documents">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Documents')}</h1>
          <p>{t('Keep receipts, invoices, statements, tax documents and contracts in one place. Expense lists and statements in CSV or Excel are read automatically and update the books.')}</p>
        </div>
        <button type="button" className="secondary-action" onClick={() => navigate('/accountant/expenses')}>{t('Expenses')}</button>
      </div>

      {message && (
        <div role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'error-box' : 'success-box'} style={{ marginBottom: 16, color: message.tone === 'error' ? '#b91c1c' : '#166534' }}>
          {message.text}
        </div>
      )}

      <section className="user-section">
        <h2>{t('Upload a document')}</h2>
        <form onSubmit={upload} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'end' }}>
          <label style={label}>
            {t('File')} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-4)' }}>{t('PDF, image, CSV, Excel, Word — max 3 MB')}</span>
            <input ref={fileInput} type="file" accept={ACCEPTED_DOCUMENTS} onChange={(e) => chooseFile(e.target.files?.[0])} style={{ ...field, padding: 7 }} />
          </label>
          <label style={label}>
            {t('Type of document')}
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={field}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
            </select>
          </label>
          {kind === 'statement' && (
            <label style={label}>
              {t('Account')}
              <select value={account} onChange={(e) => setAccount(e.target.value)} style={field}>
                {ACCOUNTS.map((a) => <option key={a} value={a}>{t(a)}</option>)}
              </select>
            </label>
          )}
          <label style={label}>
            {t('Description')}
            <input type="text" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder={t('Optional')} style={field} />
          </label>
          <button type="submit" className="pay-action" disabled={uploading || !file} style={{ padding: '10px 18px' }}>
            {uploading ? t('Uploading…') : t('Upload')}
          </button>
        </form>

        {file && kind && isSpreadsheet(file) && (
          <div style={{ marginTop: 14 }}>
            {parsed.length ? (
              <>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                  <input type="checkbox" checked={processFile} onChange={(e) => setProcessFile(e.target.checked)} />
                  {kind === 'expenses'
                    ? `${t('Read this file and record')} ${parsed.length} ${t('expense(s)')}`
                    : `${t('Read this file and add')} ${parsed.length} ${t('line(s) to Reconciliation')}`}
                </label>
                <div className="user-table-wrap" style={{ marginTop: 8, maxHeight: 220, overflow: 'auto' }}>
                  <table className="user-table">
                    <thead>
                      <tr>
                        <th>{t('Date')}</th>
                        {kind === 'expenses' && <th>{t('Category')}</th>}
                        <th>{t('Description')}</th>
                        <th style={{ textAlign: 'right' }}>{t('Amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.slice(0, 10).map((row, i) => (
                        <tr key={i}>
                          <td>{row.date || '—'}</td>
                          {kind === 'expenses' && <td>{row.category || t('Other')}</td>}
                          <td>{row.description || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{row.amount || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13, color: '#b45309' }}>
                {kind === 'expenses'
                  ? t('No expense rows found. Use columns such as Date, Category, Description and Amount. The file will only be stored.')
                  : t('No statement lines found. Use columns such as Date, Description and Amount (or Debit/Credit). The file will only be stored.')}
              </p>
            )}
          </div>
        )}
        {file && !isSpreadsheet(file) && ['Receipt', 'Invoice'].includes(category) && (
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 10 }}>
            {t('Tip: to count a receipt as an expense, add it on the Expenses page and attach the file there.')}
          </p>
        )}
      </section>

      <section className="user-section">
        <h2>{t('All documents')}</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={label}>
            {t('Type')}
            <select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })} style={{ ...field, width: 'auto' }}>
              <option value="">{t('All types')}</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
            </select>
          </label>
          <label style={label}>
            {t('Search')}
            <input type="search" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} placeholder={t('File name or description')} style={{ ...field, width: 220 }} />
          </label>
        </div>
        {loading ? (
          <p style={{ color: 'var(--text-4)' }}>{t('Loading documents…')}</p>
        ) : documents.length === 0 ? (
          <p style={{ color: 'var(--text-4)' }}>{t('No documents yet.')}</p>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>{t('File')}</th>
                  <th>{t('Type')}</th>
                  <th>{t('Size')}</th>
                  <th>{t('Read by the system')}</th>
                  <th>{t('Uploaded')}</th>
                  <th style={{ textAlign: 'center' }}>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div className="obw-strong" style={{ wordBreak: 'break-all' }}>{doc.filename}</div>
                      {doc.description && <div style={{ fontSize: 12, color: 'var(--text-4)' }}>{doc.description}</div>}
                    </td>
                    <td>{t(doc.category)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatBytes(doc.size)}</td>
                    <td>{processedText(doc)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{new Date(doc.createdAt).toLocaleString()}<br />{doc.uploadedBy}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button type="button" className="secondary-action" style={{ padding: '0.3rem 0.6rem', margin: 0, fontSize: 12 }} onClick={() => download(doc)}>{t('Download')}</button>
                        <button type="button" className="secondary-action" style={{ padding: '0.3rem 0.6rem', margin: 0, fontSize: 12, color: '#dc2626' }} onClick={() => remove(doc)}>{t('Delete')}</button>
                      </div>
                    </td>
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
