import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchAccountantReports, generateReport, fetchReportById } from '../../api/endpoints'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { X } from 'lucide-react'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} RWF`
const cell = (value) => (typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value ?? '')
const fileName = (title, ext) => `${String(title || 'report').replace(/[^\w-]+/g, '_')}.${ext}`

const REPORT_CATEGORIES = [
  { id: 'sales', label: 'Sales & Revenue' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'taxes', label: 'Taxes & VAT' },
  { id: 'reconciliation', label: 'Reconciliation' },
  { id: 'payments', label: 'Payments' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'purchases', label: 'Stock & Purchases' },
]
const categoryLabel = (id) => REPORT_CATEGORIES.find((c) => c.id === id)?.label || id

const monthStart = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const today = () => new Date().toISOString().slice(0, 10)

function downloadBlob(content, name, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const { t } = usePreferences()
  const [searchParams] = useSearchParams()
  const [summary, setSummary] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [category, setCategory] = useState('sales')
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState('pdf')
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [message, setMessage] = useState(null)
  const [exporting, setExporting] = useState('')
  const [preview, setPreview] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchAccountantReports()
      setSummary(data)
      setRecords(data.records || [])
      setLoadError('')
    } catch (err) {
      setLoadError(err.response?.data?.error || err.message || t('Unable to load reports.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const categoryParam = searchParams.get('category')
    if (categoryParam && REPORT_CATEGORIES.some((c) => c.id === categoryParam)) setCategory(categoryParam)
  }, [searchParams])

  useEffect(() => { load() }, [])

  const getReport = async (record) => {
    const report = await fetchReportById(record.id)
    const data = report.data || {}
    if (!Array.isArray(data.columns) || !Array.isArray(data.rows)) {
      throw new Error(t('This report was created before reports stored their data. Generate it again to export it.'))
    }
    return { ...report, data }
  }

  const periodText = (data) => (data.from || data.to ? `${data.from || '…'} → ${data.to || '…'}` : t('All time'))

  const exportReport = async (record, kind) => {
    setExporting(`${record.id}:${kind}`)
    setMessage(null)
    try {
      const report = await getReport(record)
      const { columns, rows, totals = {} } = report.data
      const totalRows = Object.entries(totals).map(([k, v]) => [t(k), typeof v === 'number' ? cell(v) : t(String(v))])
      if (kind === 'pdf') {
        const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' })
        doc.setFontSize(16)
        doc.text(report.title, 14, 16)
        doc.setFontSize(10)
        doc.text(`${t('Category')}: ${t(categoryLabel(report.category))}`, 14, 24)
        doc.text(`${t('Period')}: ${periodText(report.data)}`, 14, 30)
        doc.text(`${t('Generated')}: ${report.createdAt} · ${report.generatedBy}`, 14, 36)
        autoTable(doc, { startY: 42, head: [[t('Summary'), '']], body: totalRows, theme: 'grid', headStyles: { fillColor: [79, 70, 229] } })
        autoTable(doc, {
          startY: (doc.lastAutoTable?.finalY || 42) + 6,
          head: [columns.map((c) => t(c))],
          body: rows.length ? rows.map((r) => r.map(cell)) : [[t('No records in this period.')]],
          theme: 'striped',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [79, 70, 229] },
        })
        doc.save(fileName(report.title, 'pdf'))
      } else if (kind === 'csv') {
        const csv = Papa.unparse([
          [report.title], [`${t('Period')}: ${periodText(report.data)}`], [],
          ...totalRows, [],
          columns.map((c) => t(c)), ...rows,
        ])
        downloadBlob(csv, fileName(report.title, 'csv'), 'text/csv')
      } else {
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns.map((c) => t(c)), ...rows]), 'Data')
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[t('Report'), report.title], [t('Period'), periodText(report.data)], [], ...Object.entries(totals).map(([k, v]) => [t(k), v])]), 'Summary')
        XLSX.writeFile(wb, fileName(report.title, 'xlsx'))
      }
      return true
    } catch (err) {
      setMessage({ tone: 'error', text: err.response?.data?.error || err.message || t('Export failed.') })
      return false
    } finally {
      setExporting('')
    }
  }

  const openPreview = async (record) => {
    setMessage(null)
    try {
      setPreview(await getReport(record))
    } catch (err) {
      setMessage({ tone: 'error', text: err.response?.data?.error || err.message || t('Unable to open the report.') })
    }
  }

  const handleGenerate = async (e) => {
    e.preventDefault()
    if (from && to && from > to) {
      setMessage({ tone: 'error', text: t('The start date must be before the end date.') })
      return
    }
    setGenerating(true)
    setMessage(null)
    try {
      const reportTitle = title.trim() || `${t(categoryLabel(category))} ${t('Report')} ${from || ''}${to ? ` – ${to}` : ''}`.trim()
      const result = await generateReport({ category, title: reportTitle, format, from: from || null, to: to || null })
      setTitle('')
      await load()
      const exported = result?.id ? await exportReport({ id: result.id }, format) : false
      if (exported) setMessage({ tone: 'success', text: `${t('Report generated with')} ${result.rowCount} ${t('record(s).')}` })
    } catch (err) {
      setMessage({ tone: 'error', text: err.response?.data?.error || err.message || t('Failed to generate report.') })
    } finally {
      setGenerating(false)
    }
  }

  const field = { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }
  const label = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }
  const smallButton = { padding: '0.35rem 0.7rem', margin: 0, fontSize: 12 }

  return (
    <div className="page accountant-reports">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Reports')}</h1>
          <p>{t('Generate financial reports for a period and export them as PDF, CSV or Excel.')}</p>
        </div>
      </div>

      {loading && !summary ? (
        <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>{t('Loading reports…')}</p>
      ) : !summary ? (
        <p role="alert" style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>{loadError || t('No reports available.')}</p>
      ) : (
        <>
          <div className="user-info-grid">
            <div className="summary-card"><strong>{summary.orders}</strong><span>{t('Paid Orders')}</span></div>
            <div className="summary-card"><strong>{money(summary.revenue)}</strong><span>{t('Net Revenue')}</span></div>
            <div className="summary-card"><strong>{money(summary.totalExpenses)}</strong><span>{t('Total Expenses')}</span></div>
            <div className="summary-card"><strong>{money(summary.profit)}</strong><span>{t('Net Profit')}</span></div>
            <div className="summary-card"><strong>{money(summary.totalRefunds)}</strong><span>{t('Refunds')}</span></div>
            <div className="summary-card"><strong>{money(summary.totalSalaries)}</strong><span>{t('Salaries Paid')}</span></div>
          </div>

          <section className="user-section">
            <h2>{t('Generate Report')}</h2>
            <form onSubmit={handleGenerate} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
              <label style={label}>
                {t('Category')}
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...field, minWidth: 180 }}>
                  {REPORT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(c.label)}</option>)}
                </select>
              </label>
              <label style={label}>
                {t('From')}
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={field} />
              </label>
              <label style={label}>
                {t('To')}
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={field} />
              </label>
              <label style={label}>
                {t('Report Title')}
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Optional')} style={{ ...field, minWidth: 200 }} />
              </label>
              <label style={label}>
                {t('Format')}
                <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ ...field, minWidth: 110 }}>
                  <option value="pdf">PDF</option>
                  <option value="csv">CSV</option>
                  <option value="excel">Excel</option>
                </select>
              </label>
              <button type="submit" className="pay-action" disabled={generating} style={{ padding: '10px 18px' }}>
                {generating ? t('Generating…') : t('Generate & Download')}
              </button>
            </form>
            <p style={{ fontSize: 12, color: 'var(--text-4)' }}>{t('Leave the dates empty to include all records. The stock report always shows current stock.')}</p>
            {message && (
              <div role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'error-box' : 'success-box'} style={{ marginTop: 12, color: message.tone === 'error' ? '#b91c1c' : '#166534' }}>
                {message.text}
              </div>
            )}
          </section>

          <section className="user-section">
            <h2>{t('Generated Reports')}</h2>
            {records.length === 0 ? (
              <p style={{ color: 'var(--text-4)' }}>{t('No reports generated yet.')}</p>
            ) : (
              <div className="user-table-wrap">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>{t('Title')}</th>
                      <th>{t('Category')}</th>
                      <th>{t('Period')}</th>
                      <th style={{ textAlign: 'right' }}>{t('Records')}</th>
                      <th>{t('Generated By')}</th>
                      <th>{t('Date')}</th>
                      <th style={{ textAlign: 'center' }}>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id}>
                        <td className="obw-strong">{r.title}</td>
                        <td>{t(categoryLabel(r.category))}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.from || r.to ? `${r.from || '…'} → ${r.to || '…'}` : t('All time')}</td>
                        <td style={{ textAlign: 'right' }}>{r.rowCount}</td>
                        <td>{r.generatedBy}</td>
                        <td style={{ color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{r.createdAt}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button type="button" className="secondary-action" onClick={() => openPreview(r)} style={smallButton}>{t('View')}</button>
                            {['pdf', 'csv', 'excel'].map((kind) => (
                              <button key={kind} type="button" className="secondary-action" disabled={Boolean(exporting)} onClick={() => exportReport(r, kind)} style={smallButton}>
                                {exporting === `${r.id}:${kind}` ? '…' : kind === 'excel' ? 'Excel' : kind.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
          <div role="dialog" aria-modal="true" aria-label={preview.title} className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 border-b border-slate-100 gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{preview.title}</h3>
                <p className="text-xs text-slate-500">{t(categoryLabel(preview.category))} · {periodText(preview.data)} · {preview.createdAt}</p>
              </div>
              <button type="button" onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600" aria-label={t('Close')}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-auto space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(preview.data.totals || {}).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-slate-200 p-3">
                    <div className="text-[11px] text-slate-500">{t(k)}</div>
                    <div className="text-sm font-bold text-slate-900">{typeof v === 'number' ? cell(v) : t(String(v))}</div>
                  </div>
                ))}
              </div>
              <div className="user-table-wrap">
                <table className="user-table">
                  <thead><tr>{preview.data.columns.map((c) => <th key={c}>{t(c)}</th>)}</tr></thead>
                  <tbody>
                    {preview.data.rows.length ? preview.data.rows.slice(0, 200).map((row, i) => (
                      <tr key={i}>{row.map((v, j) => <td key={j} style={typeof v === 'number' ? { textAlign: 'right' } : undefined}>{cell(v)}</td>)}</tr>
                    )) : (
                      <tr><td colSpan={preview.data.columns.length} style={{ textAlign: 'center', color: 'var(--text-4)' }}>{t('No records in this period.')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {preview.data.rows.length > 200 && <p className="text-xs text-slate-500">{t('Showing the first 200 rows. Export the report to see all of them.')}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
