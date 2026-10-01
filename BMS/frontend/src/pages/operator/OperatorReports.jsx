import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { fetchOperatorRoutedReport } from '../../api/endpoints'
import { FileSpreadsheet, Printer, MessageSquare } from 'lucide-react'

const MONEY = (v) => `${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default function OperatorReports() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const data = await fetchOperatorRoutedReport()
        setEvents(data.events || [])
        setTotalAmount(data.totalAmount || 0)
        setCount(data.count || 0)
      } catch (e) {
        setError(e.message || 'Failed to load report')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Mobile topbar */}
      <header className="mobile-topbar">
        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label="Toggle navigation"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
        <div className="mobile-brand">BarFlow</div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-[#0B132B] text-slate-400 flex flex-col justify-between shrink-0">
        <div>
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800 text-white font-bold text-xl">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white">
              <FileSpreadsheet size={20} />
            </div>
            <span>BarFlow</span>
          </div>
          <nav className="p-4 space-y-6 text-sm">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Order Management</p>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/operator/orders') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">📋</span><span className="font-medium">All Orders</span></a>
            </div>
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Receipts</p>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/operator/receipts/printed') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">🖨</span><span className="font-medium">Printed Receipts</span></a>
            </div>
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Other</p>
              <a href="#" onClick={(e) => { e.preventDefault(); }} className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 transition"><span>📊</span><span className="font-medium">Reports</span></a>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/notifications') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">💬</span><span className="font-medium">Chats</span></a>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/account') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">👤</span><span className="font-medium">My Account</span></a>
            </div>
          </nav>
        </div>
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => { logout(); navigate('/login') }} className="flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-950/30 rounded-lg font-medium transition w-full">⎋ Logout</button>
        </div>
      </aside>

      {/* Mobile sidebar drawer */}
      <aside
        className={`operator-sidebar-mobile ${mobileMenuOpen ? 'operator-sidebar-open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      >
        <div>
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800 text-white font-bold text-xl">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white">
              <FileSpreadsheet size={20} />
            </div>
            <span>BarFlow</span>
          </div>
          <nav className="p-4 space-y-6 text-sm">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Order Management</p>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/operator/orders') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">📋</span><span className="font-medium">All Orders</span></a>
            </div>
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Receipts</p>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/operator/receipts/printed') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">🖨</span><span className="font-medium">Printed Receipts</span></a>
            </div>
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Other</p>
              <a href="#" onClick={(e) => { e.preventDefault(); }} className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 transition"><span>📊</span><span className="font-medium">Reports</span></a>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/notifications') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">💬</span><span className="font-medium">Chats</span></a>
              <a href="#" onClick={(e) => { e.preventDefault(); navigate('/account') }} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-300"><span className="text-slate-500">👤</span><span className="font-medium">My Account</span></a>
            </div>
          </nav>
        </div>
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => { logout(); navigate('/login') }} className="flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-950/30 rounded-lg font-medium transition w-full">⎋ Logout</button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <h1 className="text-lg font-semibold text-slate-900">Routed Orders Report</h1>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm"><Printer size={16} /> Print</button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="text-sm text-red-600 font-medium">{error}</div>}

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Routed Items</p>
              <p className="text-2xl font-black text-slate-900">{loading ? '—' : count}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Routed Value</p>
              <p className="text-2xl font-black text-slate-900">{MONEY(totalAmount)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Destination</p>
              <p className="text-2xl font-black text-slate-900">Kitchen &amp; Bar</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <th className="p-2 border-b border-slate-200 text-left">Item</th>
                  <th className="p-2 border-b border-slate-200 text-left">Order</th>
                  <th className="p-2 border-b border-slate-200 text-left">Sent To</th>
                  <th className="p-2 border-b border-slate-200 text-right">Item #</th>
                  <th className="p-2 border-b border-slate-200 text-right">Unit</th>
                  <th className="p-2 border-b border-slate-200 text-right">Amount</th>
                  <th className="p-2 border-b border-slate-200 text-left">Time Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="p-2 text-center text-slate-400">Loading report…</td></tr>
                ) : events.length === 0 ? (
                  <tr><td colSpan={7} className="p-2 text-center text-slate-400">No routed orders yet.</td></tr>
                ) : events.map((e, i) => (
                  <tr key={e.eventId + '-' + i} className="hover:bg-slate-50">
                    <td className="p-2 font-medium text-slate-800">{e.itemName}</td>
                    <td className="p-2">{e.orderNumber}</td>
                    <td className="p-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${e.destination === 'kitchen' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-purple-100 text-purple-800 border-purple-300'}`}>
                        {e.destination === 'kitchen' ? 'Kitchen' : 'Bar'}
                      </span>
                    </td>
                    <td className="p-2 text-right text-slate-600">x{e.itemNumber}</td>
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
