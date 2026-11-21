import { usePreferences } from '../../context/PreferencesContext'
import BackButton from '../../components/BackButton'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { fetchOperatorRoutedReport } from '../../api/endpoints'
const MONEY = (v) => `${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default function OperatorReports() {
  const { t } = usePreferences()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [summary, setSummary] = useState({ count: 0, totalAmount: 0, kitchenCount: 0, barCount: 0 })
  const [totalAmount, setTotalAmount] = useState(0)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [destination, setDestination] = useState('all')
  const [lastUpdated, setLastUpdated] = useState(null)
  const activityRef = useRef(null)
  const { pathname } = useLocation()

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchOperatorRoutedReport()
      setEvents(data.events || [])
      const currentSummary = data.summary || {
        count: data.count || 0,
        totalAmount: data.totalAmount || 0,
        kitchenCount: (data.events || []).filter((event) => String(event.destination).toLowerCase() === 'kitchen').length,
        barCount: (data.events || []).filter((event) => String(event.destination).toLowerCase() === 'bar').length,
      }
      setSummary(currentSummary)
      setTotalAmount(currentSummary.totalAmount || 0)
      setCount(currentSummary.count || 0)
      setLastUpdated(new Date())
    } catch (e) {
      setError(e.response?.data?.error || e.message || t("Failed to load report"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const refreshTimer = window.setInterval(() => load({ silent: true }), 15000)
    return () => window.clearInterval(refreshTimer)
  }, [])

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase()
    return events.filter((event) => {
      const matchesDestination = destination === 'all' || String(event.destination || '').toLowerCase() === destination
      const matchesSearch = !query || [event.itemName, event.itemCategory, event.orderNumber, event.destination]
        .some((value) => String(value || '').toLowerCase().includes(query))
      return matchesDestination && matchesSearch
    })
  }, [events, search, destination])

  const showDetails = (station = 'all') => {
    setDestination(station)
    setSearch('')
    activityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const exportReport = () => {
    const columns = ['Order', 'Item', 'Category', 'Destination', 'Quantity', 'Unit Price', 'Line Total', 'Routed At'].map((column) => t(column))
    const rows = filteredEvents.map((event) => [
      event.orderNumber, event.itemName, event.itemCategory, event.destination,
      event.itemNumber, event.unitPrice, event.lineTotal, event.routedAt || event.timeSent,
    ])
    const csv = [columns, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'operator-routed-orders.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="operator-shell flex flex-col md:flex-row min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Mobile topbar */}
      <header className="mobile-topbar app-topbar">
        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label={t("Toggle navigation")}
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
        <BackButton fallback="/operator/orders" />
        <div className="mobile-brand">BarFlow</div>
      </header>

      {/* Desktop sidebar */}
      <aside className="operator-desktop-sidebar hidden md:flex w-64 bg-[#0B132B] text-slate-400 flex flex-col justify-between shrink-0">
        <div>
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800 text-white font-bold text-xl">
            <span>BarFlow</span>
          </div>
          <nav className="p-4 space-y-6 text-sm">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Order Management")}</p>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/operator/orders') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">📋</span><span className="font-medium">{t("All Orders")}</span></a>
            </div>
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Receipts")}</p>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/operator/receipts/printed') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">🖨</span><span className="font-medium">{t("Printed Receipts")}</span></a>
            </div>
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Other")}</p>
              <a href="#" onClick={(e) => { e.preventDefault(); }} className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 transition"><span>📊</span><span className="font-medium">{t("Reports")}</span></a>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/account') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">👤</span><span className="font-medium">{t("My Account")}</span></a>
            </div>
          </nav>
        </div>
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => { logout(); navigate('/login') }} className="flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-950/30 rounded-lg font-medium transition w-full">{t("⎋ Logout")}</button>
        </div>
      </aside>

      {/* Mobile sidebar drawer */}
      <aside
        className={`operator-sidebar-mobile ${mobileMenuOpen ? 'operator-sidebar-open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      >
        <div>
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800 text-white font-bold text-xl">
            <span>BarFlow</span>
          </div>
          <nav className="p-4 space-y-6 text-sm">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Order Management")}</p>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/operator/orders') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">📋</span><span className="font-medium">{t("All Orders")}</span></a>
            </div>
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Receipts")}</p>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/operator/receipts/printed') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">🖨</span><span className="font-medium">{t("Printed Receipts")}</span></a>
            </div>
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Other")}</p>
              <a href="#" onClick={(e) => { e.preventDefault(); }} className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 transition"><span>📊</span><span className="font-medium">{t("Reports")}</span></a>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/account') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">👤</span><span className="font-medium">{t("My Account")}</span></a>
            </div>
          </nav>
        </div>
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => { logout(); navigate('/login') }} className="flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-950/30 rounded-lg font-medium transition w-full">{t("⎋ Logout")}</button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="operator-report-content flex-1 flex flex-col min-h-screen overflow-hidden">
        <header className="operator-report-topbar bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-600">{t("Operations")}</p><h1 className="text-lg font-bold text-slate-900">{t("Routed orders")}</h1></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} disabled={loading} aria-label={t("Refresh report")} className="operator-report-button operator-report-secondary">{' '}{t("Refresh")}</button>
            <button type="button" onClick={exportReport} disabled={!filteredEvents.length} aria-label={t("Export report as CSV")} className="operator-report-button operator-report-secondary">{' '}{t("Export CSV")}</button>
            <button type="button" onClick={() => window.print()} aria-label={t("Print report")} className="operator-report-button operator-report-primary">{' '}{t("Print")}</button>
          </div>
        </header>
        <main className="operator-report-main flex-1 overflow-y-auto">
          <div className="operator-report-heading">
            <div><h2>{t("Kitchen & bar routing")}</h2><p>{t("Review items forwarded to preparation stations and their recorded value.")}</p></div>
            {lastUpdated && <span className="operator-report-updated">{t("Updated")}{' '}{lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          {error && <div className="operator-report-error" role="alert">{t(error)}<button type="button" onClick={load}>{t("Try again")}</button></div>}
          <div className="operator-report-metrics">
            <button type="button" className="operator-report-metric" onClick={() => showDetails()} aria-label={t("Show all routed line items")}>
              <span>{t("Routed line items")}</span><strong>{loading ? '—' : summary.count}</strong><small>{t("View all routed activity →")}</small>
            </button>
            <button type="button" className="operator-report-metric" onClick={() => showDetails()} aria-label={t("Show routed value details")}>
              <span>{t("Routed value")}</span><strong>{loading ? '—' : `${MONEY(summary.totalAmount)} RWF`}</strong><small>{t("View all routed activity →")}</small>
            </button>
            <button type="button" className={`operator-report-metric ${destination === 'kitchen' ? 'active' : ''}`} onClick={() => showDetails('kitchen')} aria-pressed={destination === 'kitchen'} aria-label={t("Show kitchen routed items")}>
              <span>{t("Kitchen")}</span><strong>{loading ? '—' : summary.kitchenCount}</strong><small>{t("View kitchen items →")}</small>
            </button>
            <button type="button" className={`operator-report-metric ${destination === 'bar' ? 'active' : ''}`} onClick={() => showDetails('bar')} aria-pressed={destination === 'bar'} aria-label={t("Show bar routed items")}>
              <span>{t("Bar")}</span><strong>{loading ? '—' : summary.barCount}</strong><small>{t("View bar items →")}</small>
            </button>
          </div>
          <section className="operator-report-panel">
            <div ref={activityRef} />
            <div className="operator-report-panel-heading">
              <div><h3>{t("Routing activity")}</h3><p>{filteredEvents.length} {filteredEvents.length === 1 ? t("item") : t("items")}{' '}{t("shown")}</p></div>
              <label className="operator-report-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search item or order")} aria-label={t("Search routed items")} /></label>
              <select className="operator-report-filter" value={destination} onChange={(event) => setDestination(event.target.value)} aria-label={t("Filter by destination")}>
                <option value="all">{t("All stations")}</option><option value="kitchen">{t("Kitchen")}</option><option value="bar">{t("Bar")}</option>
              </select>
            </div>
            <div className="operator-report-table-wrap">
              <table className="operator-report-table">
                <thead><tr><th>{t("Item")}</th><th>{t("Order")}</th><th>{t("Destination")}</th><th className="numeric">{t("Qty")}</th><th className="numeric">{t("Unit price")}</th><th className="numeric">{t("Line total")}</th><th>{t("Routed at")}</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={7} className="operator-report-empty">{t("Loading routed activity…")}</td></tr>
                    : filteredEvents.length === 0 ? <tr><td colSpan={7} className="operator-report-empty">{events.length ? t("No items match these filters.") : t("No routed orders have been recorded yet.")}</td></tr>
                    : filteredEvents.map((event, index) => (
                      <tr key={`${event.eventId}-${index}`}>
                        <td><strong>{event.itemName}</strong>{event.itemCategory && <small>{event.itemCategory}</small>}</td>
                        <td><span className="operator-report-order">#{event.orderNumber}</span></td>
                        <td><span className={`operator-report-station ${String(event.destination).toLowerCase()}`}>{String(event.destination).toLowerCase() === 'kitchen' ? t("Kitchen") : t("Bar")}</span></td>
                        <td className="numeric">{event.itemNumber}</td><td className="numeric">{MONEY(event.unitPrice)}{' '}{t("RWF")}</td>
                        <td className="numeric amount">{MONEY(event.lineTotal)}{' '}{t("RWF")}</td>
                        <td className="operator-report-date">{event.routedAt ? new Date(event.routedAt).toLocaleString() : event.timeSent}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
      <div className="operator-report-legacy">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <h1 className="text-lg font-semibold text-slate-900">{t("Routed Orders Report")}</h1>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">{' '}{t("Print")}</button>
        </header>

        <main className="operator-main flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="text-sm text-red-600 font-medium">{t(error)}</div>}

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("Routed Items")}</p>
              <p className="text-2xl font-black text-slate-900">{loading ? '—' : count}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("Total Routed Value")}</p>
              <p className="text-2xl font-black text-slate-900">{MONEY(totalAmount)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("Destination")}</p>
              <p className="text-2xl font-black text-slate-900">{t("Kitchen & Bar")}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <th className="p-2 border-b border-slate-200 text-left">{t("Item")}</th>
                  <th className="p-2 border-b border-slate-200 text-left">{t("Order")}</th>
                  <th className="p-2 border-b border-slate-200 text-left">{t("Sent To")}</th>
                  <th className="p-2 border-b border-slate-200 text-right">{t("Item #")}</th>
                  <th className="p-2 border-b border-slate-200 text-right">{t("Unit")}</th>
                  <th className="p-2 border-b border-slate-200 text-right">{t("Amount")}</th>
                  <th className="p-2 border-b border-slate-200 text-left">{t("Time Sent")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="p-2 text-center text-slate-400">{t("Loading report…")}</td></tr>
                ) : events.length === 0 ? (
                  <tr><td colSpan={7} className="p-2 text-center text-slate-400">{t("No routed orders yet.")}</td></tr>
                ) : events.map((e, i) => (
                  <tr key={e.eventId + '-' + i} className="hover:bg-slate-50">
                    <td className="p-2 font-medium text-slate-800">{e.itemName}</td>
                    <td className="p-2">{e.orderNumber}</td>
                    <td className="p-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${e.destination === 'kitchen' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-purple-100 text-purple-800 border-purple-300'}`}>
                        {e.destination === 'kitchen' ? t("Kitchen") : t("Bar")}
                      </span>
                    </td>
                    <td className="p-2 text-right text-slate-600">{t("x")}{e.itemNumber}</td>
                    <td className="p-2 text-right text-slate-600">{MONEY(e.unitPrice)}</td>
                    <td className="p-2 text-right font-semibold text-slate-900">{MONEY(e.lineTotal)}</td>
                    <td className="p-2 text-slate-500">{e.timeSent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
