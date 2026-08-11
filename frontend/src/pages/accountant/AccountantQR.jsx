import React, { useEffect, useState, useMemo } from 'react'
import { fetchOrders } from '../../api/endpoints'
import { QrCode, Eye } from 'lucide-react'

const STATUS_OPTIONS = ['', 'Open', 'Preparing', 'Ready', 'Served', 'Paid', 'Cancelled']
const money = (v) =>
  Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + ' RWF'

export default function AccountantQR() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { source: 'qr' }
      if (status) params.status = status
      const data = await fetchOrders(params)
      setOrders(data || [])
    } catch (err) {
      setError(err.message)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [status])

  const summary = useMemo(() => {
    const total = orders.reduce((s, o) => s + (Number(o.total) || 0), 0)
    return { count: orders.length, total }
  }, [orders])

  const statusClass = (s) => {
    if (s === 'Paid' || s === 'Served') return 'bg-emerald-100 text-emerald-800 border-emerald-300'
    if (s === 'Cancelled') return 'bg-amber-100 text-amber-800 border-amber-300'
    return 'bg-amber-100 text-amber-800 border-amber-300'
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Accountant workspace</p>
          <h1 className="text-2xl font-extrabold text-slate-900">QR Orders</h1>
          <p className="text-sm text-slate-500">All client orders placed by QR code scan across every table. Track each order and its full lifecycle.</p>
        </div>
        <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
          <QrCode size={24} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
          <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{summary.count}</strong>
          <span className="text-slate-500 text-sm font-medium">QR Orders</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
          <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{money(summary.total)}</strong>
          <span className="text-slate-500 text-sm font-medium">QR Revenue</span>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-900">QR Orders</h2>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s || 'all'} value={s}>
                {s || 'All Statuses'}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="text-red-600 text-sm mb-4">{error}</div>}

        {loading ? (
          <div className="text-center text-slate-400 py-12">Loading QR orders...</div>
        ) : orders.length === 0 ? (
          <div className="text-center text-slate-400 py-12">No QR orders found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-2">Order</th>
                  <th className="p-2">Table</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2">Date</th>
                  <th className="p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/80">
                    <td className="p-2 font-semibold text-slate-900">{String(order.orderNumber || order.id).padStart(3, '0')}</td>
                    <td className="p-2">Table {order.tableNumber}</td>
                    <td className="p-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium border ${statusClass(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="p-2 text-right font-semibold">{money(order.total)}</td>
                    <td className="p-2 text-slate-500">{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td className="p-2 text-center">
                      <button className="text-indigo-600 hover:text-indigo-800" title="View details">
                        <Eye size={16} />
                      </button>
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
