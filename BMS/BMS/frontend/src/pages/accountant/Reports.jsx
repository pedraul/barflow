import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchAccountantReports, generateReport, fetchReportById } from '../../api/endpoints'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

const money = (value) => `${Number(value || 0).toLocaleString()} RWF`

const REPORT_CATEGORIES = [
  { id: 'sales', label: 'Sales & Revenue', icon: '📈' },
  { id: 'expenses', label: 'Expenses', icon: '💸' },
  { id: 'payroll', label: 'Payroll', icon: '👥' },
  { id: 'transfers', label: 'Transfers', icon: '🔄' },
  { id: 'taxes', label: 'Taxes & VAT', icon: '🧾' },
  { id: 'reconciliation', label: 'Reconciliation', icon: '⚖️' },
  { id: 'payments', label: 'Payments', icon: '💳' },
  { id: 'refunds', label: 'Refunds', icon: '↩️' },
  { id: 'purchases', label: 'Purchases', icon: '🛒' },
]

export default function Reports() {
  const [searchParams] = useSearchParams()
  const [summary, setSummary] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [category, setCategory] = useState('sales')
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState('pdf')

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchAccountantReports()
      setSummary(data)
      setRecords(data.records || [])
    } catch {
      setSummary(null)
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const categoryParam = searchParams.get('category')
    if (categoryParam && REPORT_CATEGORIES.some((c) => c.id === categoryParam)) {
      setCategory(categoryParam)
    }
    load()
  }, [searchParams])

  const handleGenerate = async (e) => {
    e.preventDefault()
    setGenerating(true)
    try {
      const reportTitle = title.trim() || `${category.charAt(0).toUpperCase() + category.slice(1)} Report`
      await generateReport({
        category,
        title: reportTitle,
        format,
        data: { generatedAt: new Date().toISOString() },
      })
      setTitle('')
      await load()
    } catch (err) {
      alert(err.message || 'Failed to generate report.')
    } finally {
      setGenerating(false)
    }
  }

  const exportPDF = async (report) => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(report.title, 14, 16)
    doc.setFontSize(10)
    doc.text(`Category: ${report.category}`, 14, 24)
    doc.text(`Generated: ${report.createdAt}`, 14, 30)
    doc.text(`By: ${report.generatedBy}`, 14, 36)

    const tableData = [
      ['Metric', 'Value'],
      ['Total Orders', summary?.orders ?? 0],
      ['Revenue', money(summary?.revenue || 0)],
      ['Payments', money(summary?.totalPayments || 0)],
      ['Refunds', money(summary?.totalRefunds || 0)],
      ['Salaries Paid', money(summary?.totalSalaries || 0)],
    ]

    autoTable(doc, {
      startY: 44,
      head: [tableData[0]],
      body: tableData.slice(1),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
    })

    doc.save(`${report.title.replace(/\s+/g, '_')}.pdf`)
  }

  const exportCSV = (report) => {
    const rows = [
      ['Metric', 'Value'],
      ['Total Orders', summary?.orders ?? 0],
      ['Revenue', money(summary?.revenue || 0)],
      ['Payments', money(summary?.totalPayments || 0)],
      ['Refunds', money(summary?.totalRefunds || 0)],
      ['Salaries Paid', money(summary?.totalSalaries || 0)],
    ]
    const csv = Papa.unparse(rows)
    downloadBlob(csv, `${report.title.replace(/\s+/g, '_')}.csv`, 'text/csv')
  }

  const exportExcel = (report) => {
    const ws = XLSX.utils.json_to_sheet([
      { Metric: 'Total Orders', Value: summary?.orders ?? 0 },
      { Metric: 'Revenue', Value: money(summary?.revenue || 0) },
      { Metric: 'Payments', Value: money(summary?.totalPayments || 0) },
      { Metric: 'Refunds', Value: money(summary?.totalRefunds || 0) },
      { Metric: 'Salaries Paid', Value: money(summary?.totalSalaries || 0) },
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `${report.title.replace(/\s+/g, '_')}.xlsx`)
  }

  const downloadBlob = (content, fileName, mimeType) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page accountant-reports">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Accountant workspace</p>
          <h1>Reports</h1>
          <p>Generate and export financial reports.</p>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>Loading reports…</p>
      ) : !summary ? (
        <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>No reports available.</p>
      ) : (
        <>
          <div className="user-info-grid">
            <div className="summary-card">
              <strong>{summary.orders}</strong>
              <span>Total Orders</span>
            </div>
            <div className="summary-card">
              <strong>{money(summary.revenue)}</strong>
              <span>Revenue</span>
            </div>
            <div className="summary-card">
              <strong>{money(summary.totalPayments)}</strong>
              <span>Payments</span>
            </div>
            <div className="summary-card">
              <strong>{money(summary.totalRefunds)}</strong>
              <span>Refunds</span>
            </div>
            <div className="summary-card">
              <strong>{money(summary.totalSalaries)}</strong>
              <span>Salaries Paid</span>
            </div>
          </div>

          <section className="user-section">
            <h2>Generate Report</h2>
            <form onSubmit={handleGenerate} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 24 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, minWidth: 180 }}>
                  {REPORT_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                Report Title
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. May 2026 Sales Report" style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, minWidth: 220 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
                Format
                <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, minWidth: 120 }}>
                  <option value="pdf">PDF</option>
                  <option value="csv">CSV</option>
                  <option value="excel">Excel</option>
                </select>
              </label>
              <button type="submit" className="pay-action" disabled={generating} style={{ padding: '10px 18px' }}>
                {generating ? 'Generating…' : 'Generate Report'}
              </button>
            </form>
          </section>

          <section className="user-section">
            <h2>Generated Reports</h2>
            {records.length === 0 ? (
              <p style={{ color: 'var(--text-4)' }}>No reports generated yet.</p>
            ) : (
              <div className="user-table-wrap">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Format</th>
                      <th>Generated By</th>
                      <th style={{ textAlign: 'right' }}>Date</th>
                      <th style={{ textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id}>
                        <td className="obw-strong">{r.title}</td>
                        <td style={{ textTransform: 'capitalize' }}>{r.category}</td>
                        <td style={{ textTransform: 'uppercase' }}>{r.format}</td>
                        <td>{r.generatedBy}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-4)' }}>{r.createdAt}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button type="button" className="secondary-action" onClick={() => exportPDF(r)} style={{ padding: '0.35rem 0.7rem', margin: 0, fontSize: 12 }}>
                              PDF
                            </button>
                            <button type="button" className="secondary-action" onClick={() => exportCSV(r)} style={{ padding: '0.35rem 0.7rem', margin: 0, fontSize: 12 }}>
                              CSV
                            </button>
                            <button type="button" className="secondary-action" onClick={() => exportExcel(r)} style={{ padding: '0.35rem 0.7rem', margin: 0, fontSize: 12 }}>
                              Excel
                            </button>
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
    </div>
  )
}
