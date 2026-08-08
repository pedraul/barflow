import React, { useEffect, useState } from 'react'
import * as api from '../../api/endpoints'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

const money = (value) => `${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} RWF`

const TABS = [
  { key: 'stock', label: 'Stock / Products' },
  { key: 'transfers', label: 'Transfers Approved' },
  { key: 'payrolls', label: 'Payrolls Approved' },
  { key: 'refunds', label: 'Refunds Approved' },
  { key: 'revenue', label: 'Revenue' },
]

export default function ManagerReports() {
  const [activeTab, setActiveTab] = useState('stock')
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState([])
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      let result
      switch (activeTab) {
        case 'stock':
          result = await api.fetchManagerStockReport()
          setData(result || [])
          setSummary({ totalProducts: (result || []).length, lowStock: (result || []).filter(p => Number(p.quantity) < 5).length })
          break
        case 'transfers':
          result = await api.fetchManagerTransferReport()
          setData(result || [])
          setSummary({ total: (result || []).length, approved: (result || []).filter(t => t.status === 'approved').length, rejected: (result || []).filter(t => t.status === 'rejected').length, totalAmount: (result || []).reduce((s, t) => s + t.amount, 0) })
          break
        case 'payrolls':
          result = await api.fetchManagerPayrollReport()
          setData(result || [])
          setSummary({ total: (result || []).length, approved: (result || []).filter(s => s.status === 'approved').length, rejected: (result || []).filter(s => s.status === 'rejected').length, totalAmount: (result || []).reduce((s, p) => s + p.amount, 0) })
          break
        case 'refunds':
          result = await api.fetchManagerRefundReport()
          setData(result || [])
          setSummary({ total: (result || []).length, approved: (result || []).filter(r => r.status === 'approved').length, rejected: (result || []).filter(r => r.status === 'rejected').length, totalAmount: (result || []).reduce((s, r) => s + r.amount, 0) })
          break
        case 'revenue':
          result = await api.fetchManagerRevenueReport({ from, to })
          setData(result.orders || [])
          setSummary({ totalRevenue: result.totalRevenue, totalOrders: result.totalOrders, bySource: result.bySource })
          break
        default:
          break
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [activeTab])

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
    const blob = new Blob([csv], { type: 'text/csv;chars=utf-8;' })
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

  const getHeaders = (tab) => {
    switch (tab) {
      case 'stock': return ['ID', 'Name', 'Category', 'Price', 'Quantity']
      case 'transfers': return ['ID', 'From', 'To', 'Amount', 'Description', 'Status', 'Approval', 'Created']
      case 'payrolls': return ['ID', 'Employee', 'Amount', 'Period', 'Status', 'Created']
      case 'refunds': return ['ID', 'Order', 'Amount', 'Reason', 'Status', 'Created']
      case 'revenue': return ['Order #', 'Table', 'Status', 'Source', 'Total', 'Date']
      default: return []
    }
  }

  const getRow = (item, index) => {
    switch (activeTab) {
      case 'stock': return [index + 1, item.name, item.category, item.price, item.quantity]
      case 'transfers': return [index + 1, item.from, item.to, item.amount, item.description, item.status, item.managerApproval, item.createdAt]
      case 'payrolls': return [index + 1, item.employee, item.amount, item.period, item.status, item.createdAt]
      case 'refunds': return [index + 1, item.order, item.amount, item.reason, item.status, item.createdAt]
      case 'revenue': return [item.orderNumber, item.tableNumber, item.status, item.source, item.total, item.createdAt]
      default: return []
    }
  }

  return (
    <div className="page manager-reports">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Manager workspace</p>
          <h1>Reports</h1>
          <p>Stock, transfers, payrolls, refunds, and revenue reports.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setData([]); setSummary(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {tab.label}
          </button>
        ))}
        {activeTab === 'revenue' && (
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0' }} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0' }} />
            <button onClick={load} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold">Apply</button>
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button onClick={exportPDF} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold">Export PDF</button>
          <button onClick={exportCSV} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold">Export CSV</button>
          <button onClick={exportExcel} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">Export Excel</button>
        </div>
      </div>

      {error && <div className="subscription-lock" style={{ padding: '12px' }}>Error: {error}</div>}

      {loading && <p style={{ padding: '20px', textAlign: 'center' }}>Loading…</p>}

      {!loading && summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {Object.entries(summary).map(([key, value]) => {
            if (key === 'bySource' && typeof value === 'object' && value !== null) {
              return (
                <div key={key} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                  <div style={{ fontSize: '14px', color: '#6c757d', marginBottom: '4px', textTransform: 'capitalize' }}>Revenue by Source</div>
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
              <div key={key} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: '14px', color: '#6c757d', marginBottom: '4px', textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#1a1a2e' }}>{typeof value === 'number' && (key.toLowerCase().includes('amount') || key.toLowerCase().includes('revenue')) ? money(value) : value}</div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && data.length === 0 && <p style={{ padding: '40px', textAlign: 'center', color: '#6c757d' }}>No data found.</p>}

      {!loading && data.length > 0 && (
        <div className="user-table-wrap">
          <table className="user-table">
            <thead>
              <tr>
                {getHeaders(activeTab).map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((item, idx) => (
                <tr key={item.id || idx}>
              {getRow(item, idx).map((cell, i) => (
                <td key={i}>{activeTab === 'stock' && i === 3 ? money(cell) : activeTab === 'revenue' && i === 4 ? money(cell) : activeTab === 'transfers' && i === 3 ? money(cell) : activeTab === 'payrolls' && i === 2 ? money(cell) : activeTab === 'refunds' && i === 2 ? money(cell) : String(cell ?? '—')}</td>
              ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
