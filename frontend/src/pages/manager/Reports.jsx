import React, { useEffect, useState } from 'react'
import * as api from '../../api/endpoints'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} RWF`

const TABS = [
  { key: 'stock', label: 'Stock / Products' },
  { key: 'transfers', label: 'Transfers Approved' },
  { key: 'payrolls', label: 'Payrolls Approved' },
  { key: 'refunds', label: 'Refunds Approved' },
  { key: 'revenue', label: 'Revenue' },
]

export default function ManagerReports() {
  const { t } = usePreferences()
  const [activeTab, setActiveTab] = useState('stock')
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState([])
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [payrollMonth, setPayrollMonth] = useState('')
  const [payrollMonths, setPayrollMonths] = useState([])
  const [summaryFilter, setSummaryFilter] = useState('')

  const load = async () => {
    console.log('[Reports] load tab:', activeTab, 'month:', payrollMonth)
    setLoading(true)
    setError(null)
    try {
      let result
      switch (activeTab) {
        case 'stock':
          console.log('[Reports] fetching stock report...')
          result = await api.fetchManagerStockReport()
          console.log('[Reports] stock result:', result)
          setData(result || [])
          setSummary({ totalProducts: (result || []).length, lowStock: (result || []).filter(p => Number(p.quantity) <= Number(p.minStockLevel || 0)).length })
          break
        case 'transfers':
          console.log('[Reports] fetching transfers report...')
          result = await api.fetchManagerTransferReport()
          console.log('[Reports] transfers result:', result)
          setData(result || [])
          setSummary({ total: (result || []).length, approved: (result || []).filter(t => t.status === 'approved').length, rejected: (result || []).filter(t => t.status === 'rejected').length, totalAmount: (result || []).reduce((s, t) => s + t.amount, 0) })
          break
        case 'payrolls':
          console.log('[Reports] fetching payrolls report with month:', payrollMonth)
          result = await api.fetchManagerPayrollReport({ month: payrollMonth })
          console.log('[Reports] payrolls result:', result)
          setPayrollMonths(result?.months || [])
          setPayrollMonth(result?.month || payrollMonth || '')
          const employees = result?.employees || []
          setData(employees)
          const paidCount = employees.filter(e => e.status === 'Paid').length
          const notPaidCount = employees.filter(e => e.status === 'Not Paid').length
          const totalPaidAmount = employees.filter(e => e.status === 'Paid').reduce((s, e) => s + (e.amount || 0), 0)
          setSummary({ total: employees.length, paid: paidCount, notPaid: notPaidCount, totalAmount: totalPaidAmount })
          break
        case 'refunds':
          console.log('[Reports] fetching refunds report...')
          result = await api.fetchManagerRefundReport()
          console.log('[Reports] refunds result:', result)
          setData(result || [])
          setSummary({ total: (result || []).length, approved: (result || []).filter(r => r.status === 'approved').length, rejected: (result || []).filter(r => r.status === 'rejected').length, totalAmount: (result || []).reduce((s, r) => s + r.amount, 0) })
          break
        case 'revenue':
          console.log('[Reports] fetching revenue report...')
          result = await api.fetchManagerRevenueReport({ from, to })
          console.log('[Reports] revenue result:', result)
          setData(result.orders || [])
          setSummary({ totalRevenue: result.totalRevenue, totalOrders: result.totalOrders, bySource: result.bySource })
          break
        default:
          break
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || t('Unknown error')
      console.error('[Reports] load error:', msg, e)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [activeTab])
  useEffect(() => { if (activeTab === 'payrolls') load() }, [payrollMonth])

  const filteredData = data.filter((item) => {
    if (!summaryFilter) return true
    if (summaryFilter === 'lowStock') return activeTab === 'stock' && Number(item.quantity) <= Number(item.minStockLevel || 0)
    if (summaryFilter === 'approved') return ['transfers', 'refunds'].includes(activeTab) && String(item.status || '').toLowerCase() === 'approved'
    if (summaryFilter === 'rejected') return ['transfers', 'refunds'].includes(activeTab) && String(item.status || '').toLowerCase() === 'rejected'
    if (summaryFilter === 'paid') return activeTab === 'payrolls' && item.status === 'Paid'
    if (summaryFilter === 'notPaid') return activeTab === 'payrolls' && item.status === 'Not Paid'
    if (summaryFilter.startsWith('source:')) return activeTab === 'revenue' && String(item.source || 'other').toLowerCase() === summaryFilter.slice(7).toLowerCase()
    return true
  })

  const selectSummary = (filter) => {
    setSummaryFilter((current) => current === filter ? '' : filter)
    window.requestAnimationFrame(() => document.getElementById('manager-report-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(`Manager Report - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`, 14, 16)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 24)
    if (summary) {
      doc.text(summary, 14, 32)
    }
    const headers = getHeaders(activeTab)
    const rows = data.map((item, idx) => getRow(item, idx))
    autoTable(doc, { startY: 40, head: [headers], body: rows })
    doc.save(`manager-report-${activeTab}.pdf`)
  }

  const exportCSV = () => {
    const headers = getHeaders(activeTab)
    const rows = data.map((item, idx) => getRow(item, idx))
    const csv = Papa.unparse([headers, ...rows])
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `manager-report-${activeTab}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    const headers = getHeaders(activeTab)
    const rows = data.map((item, idx) => getRow(item, idx))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `manager-report-${activeTab}.xlsx`)
  }

  const formatMonthLabel = (m) => {
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return m || '—'
    const [y, mo] = m.split('-')
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return `${names[Number(mo) - 1] || mo} ${y}`
  }

  const getHeaders = (tab) => {
    switch (tab) {
      case 'stock': return ['ID', 'Name', 'Category', 'Price', 'Quantity in Stock', 'Unit']
      case 'transfers': return ['ID', 'From', 'To', 'Amount', 'Description', 'Status', 'Approval', 'Created']
      case 'payrolls': return ['Employee', 'Role', 'Salary', 'Status', 'Paid In', 'Not Paid In']
      case 'refunds': return ['ID', 'Order', 'Amount', 'Reason', 'Status', 'Created']
      case 'revenue': return ['Order #', 'Table', 'Status', 'Source', 'Total', 'Date']
      default: return []
    }
  }

  const getRow = (item, index) => {
    switch (activeTab) {
      case 'stock': return [index + 1, item.name, item.category, item.price, item.quantity, item.unit || 'unit']
      case 'transfers': return [index + 1, item.from, item.to, item.amount, item.description, item.status, item.managerApproval, item.createdAt]
      case 'payrolls': return [
        item.employee,
        item.role || '—',
        item.salary,
        item.status,
        (item.paidMonths || []).map(formatMonthLabel).join(', ') || '—',
        (item.unpaidMonths || []).map(formatMonthLabel).join(', ') || '—',
      ]
      case 'refunds': return [index + 1, item.order, item.amount, item.reason, item.status, item.createdAt]
      case 'revenue': return [item.orderNumber, item.tableNumber, item.status, item.source, item.total, item.createdAt]
      default: return []
    }
  }

  return (
    <div className="page manager-reports">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Manager workspace')}</p>
          <h1>{t('Reports')}</h1>
          <p>{t('Stock, transfers, payrolls, refunds, and revenue reports.')}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
          onClick={() => { setActiveTab(tab.key); setSummaryFilter(''); setData([]); setSummary(null) }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            style={{ fontSize: '12px', padding: '6px 10px' }}
          >
            {t(tab.label)}
          </button>
        ))}

        <div style={{ width: '100%', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px' }}>
          {activeTab === 'payrolls' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '12px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{t('Month')}</label>
              <select
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(e.target.value)}
                style={{ padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '12px', height: '32px' }}
              >
                <option value="">{t('All months')}</option>
                {Array.from({ length: 12 }, (_, i) => {
                  const m = String(i + 1).padStart(2, '0')
                  const year = new Date().getFullYear()
                  return <option key={`${year}-${m}`} value={`${year}-${m}`}>{formatMonthLabel(`${year}-${m}`)}</option>
                })}
              </select>
            </div>
          )}
          {activeTab === 'revenue' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '12px', height: '32px' }} />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '12px', height: '32px' }} />
              <button onClick={load} style={{ padding: '6px 12px', fontSize: '12px', height: '32px' }} className="bg-slate-900 text-white rounded-md text-xs font-semibold">{t('Apply')}</button>
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <button onClick={exportPDF} style={{ padding: '6px 10px', fontSize: '11px', height: '32px' }} className="bg-red-600 text-white rounded-md text-xs font-semibold">{t('PDF')}</button>
            <button onClick={exportCSV} style={{ padding: '6px 10px', fontSize: '11px', height: '32px' }} className="bg-emerald-600 text-white rounded-md text-xs font-semibold">{t('CSV')}</button>
            <button onClick={exportExcel} style={{ padding: '6px 10px', fontSize: '11px', height: '32px' }} className="bg-blue-600 text-white rounded-md text-xs font-semibold">{t('Excel')}</button>
          </div>
        </div>
      </div>

      {error && <div className="subscription-lock" style={{ padding: '12px' }}>{t('Error:')} {error}</div>}

      {loading && <p style={{ padding: '20px', textAlign: 'center' }}>{t('Loading…')}</p>}

      {!loading && summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {Object.entries(summary).map(([key, value]) => {
            if (key === 'bySource' && typeof value === 'object' && value !== null) {
              return (
                <div key={key} role="button" tabIndex={0} aria-pressed={summaryFilter === key} onClick={() => selectSummary(key)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSummary(key) } }} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: summaryFilter === key ? '0 0 0 2px #2563eb, 0 4px 12px rgba(0,0,0,0.12)' : '0 2px 8px rgba(0,0,0,0.08)', cursor: 'pointer' }}>
                  <div style={{ fontSize: '14px', color: '#6c757d', marginBottom: '4px', textTransform: 'capitalize' }}>{t('Revenue by Source')}</div>
                  {Object.entries(value).map(([src, amt]) => (
                    <div key={src} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '4px 0' }}>
                      <span style={{ textTransform: 'capitalize' }}>{src}</span>
                      <span style={{ fontWeight: 700 }}>{money(amt)}</span>
                    </div>
                  ))}
                </div>
              )
            }
            return (
              <div key={key} role="button" tabIndex={0} aria-pressed={summaryFilter === key} onClick={() => selectSummary(key)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSummary(key) } }} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: summaryFilter === key ? '0 0 0 2px #2563eb, 0 4px 12px rgba(0,0,0,0.12)' : '0 2px 8px rgba(0,0,0,0.08)', cursor: 'pointer' }}>
                <div style={{ fontSize: '14px', color: '#6c757d', marginBottom: '4px', textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#1a1a2e' }}>{typeof value === 'number' && (key.toLowerCase().includes('amount') || key.toLowerCase().includes('revenue')) ? money(value) : value}</div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && data.length > 0 && summaryFilter && <p className="mb-3 text-sm text-slate-500">{t('Showing')} {filteredData.length} {t('matching records. Click the selected summary card again to clear the filter.')}</p>}
      {!loading && filteredData.length === 0 && <p style={{ padding: '40px', textAlign: 'center', color: '#6c757d' }}>{t('No data found.')}</p>}

      {/* Phone view: payroll shows as clear cards */}
      {!loading && activeTab === 'payrolls' && filteredData.length > 0 && (
        <div className="payroll-mobile-cards">
          {filteredData.map((item) => (
            <div className="payroll-card" key={item.id}>
              <div className="payroll-card-head">
                <div>
                  <div className="payroll-card-name">{item.employee}</div>
                  <div className="payroll-card-role">{item.role || '—'}</div>
                </div>
                <span className={`payroll-pill ${item.status === 'Paid' ? 'paid' : 'unpaid'}`}>{item.status}</span>
              </div>
              <div className="payroll-card-row">
                <span className="payroll-card-label">{t('Salary')}</span>
                <strong>{money(item.salary)}</strong>
              </div>
              <div className="payroll-card-row">
                <span className="payroll-card-label">{t('Paid In')}</span>
                <span className="payroll-card-value">{(item.paidMonths || []).map(formatMonthLabel).join(', ') || '—'}</span>
              </div>
              <div className="payroll-card-row">
                <span className="payroll-card-label">{t('Not Paid In')}</span>
                <span className="payroll-card-value">{(item.unpaidMonths || []).map(formatMonthLabel).join(', ') || '—'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredData.length > 0 && (
        <div className={activeTab === 'payrolls' ? 'payroll-desktop-table' : ''}>
          <div id="manager-report-details" className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  {getHeaders(activeTab).map((h, i) => (
                    <th key={i}>{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, idx) => (
                  <tr key={item.id || idx}>
              {getRow(item, idx).map((cell, i) => (
                <td key={i}>{activeTab === 'stock' && i === 3 ? money(cell) : activeTab === 'stock' && i === 4 ? Number(cell || 0).toLocaleString() : activeTab === 'revenue' && i === 4 ? money(cell) : activeTab === 'transfers' && i === 3 ? money(cell) : activeTab === 'payrolls' && i === 2 ? money(cell) : activeTab === 'refunds' && i === 2 ? money(cell) : String(cell ?? '—')}</td>
              ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
