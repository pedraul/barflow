import React, { useEffect, useState, useMemo } from 'react'
import { useOwner } from '../../context/OwnerContext'
import OrderRestockModal from '../../components/OrderRestockModal'
import { usePreferences } from '../../context/PreferencesContext'
import OrderStatusBadge from '../../components/OrderStatusBadge'

const STATUS_OPTIONS = ['', 'Open', 'Preparing', 'Ready', 'Served', 'Paid', 'Cancelled']
const LIFECYCLE = ['Open', 'Preparing', 'Ready', 'Served', 'Paid']

const money = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

export default function OwnerQRWorkspace() {
  const { t } = usePreferences()
  const { fetchQROrders, fetchOrderHistory, activeBranchId, loading } = useOwner()
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [history, setHistory] = useState({})
  const [restockOrder, setRestockOrder] = useState(null)

  const load = async () => {
    const data = await fetchQROrders(status ? { status } : {})
    setOrders(data || [])
  }

  useEffect(() => { load() }, [status, activeBranchId])

  const summary = useMemo(() => {
    const total = orders.reduce((s, o) => s + (Number(o.total) || 0), 0)
    return { count: orders.length, total }
  }, [orders])

  const toggleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!history[id]) {
      try {
        const data = await fetchOrderHistory(id)
        setHistory((prev) => ({ ...prev, [id]: data || [] }))
      } catch {
        setHistory((prev) => ({ ...prev, [id]: [] }))
      }
    }
  }

  const statusClass = (s) =>
    s === 'Paid' || s === 'Served'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : s === 'Cancelled'
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : 'bg-amber-100 text-amber-800 border-amber-300'

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{t('Owner workspace')}</p>
          <h1 className="text-2xl font-extrabold text-slate-900">{t('QR Orders')}</h1>
          <p className="text-sm text-slate-500">{t('All client orders placed by QR code scan across every table. Track each order and its full lifecycle.')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
          <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{summary.count}</strong>
          <span className="text-slate-500 text-sm font-medium">{t('QR Orders')}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
          <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{money(summary.total)}</strong>
          <span className="text-slate-500 text-sm font-medium">{t('QR Revenue')}</span>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-900">{t('QR Orders')}</h2>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
            {STATUS_OPTIONS.map((s) => <option key={s || 'all'} value={s}>{s ? t(s) : t('All Statuses')}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 mt-8">{t('Loading...')}</p>
        ) : orders.length === 0 ? (
          <p className="text-center text-slate-400 mt-8">{t('No QR orders found.')}</p>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Order')}</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Table')}</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Type')}</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Status')}</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Total')}</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Date')}</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => {
                  const canRestock = ['Open', 'Preparing'].includes(o.status)
                  return (
                    <tr key={o.id} className="hover:bg-indigo-50">
                      <td className="p-2 font-semibold text-slate-900">{o.orderNumber}</td>
                      <td className="p-2 text-slate-700">{t('Table')} {o.tableNumber}</td>
                      <td className="p-2 text-slate-700 capitalize">{o.orderType}</td>
                      <td className="p-2">
                        <OrderStatusBadge status={o.status} />
                      </td>
                      <td className="p-2 text-right font-semibold text-slate-900">{money(o.total)}</td>
                      <td className="p-2 text-right text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td className="p-2 text-right">
                        <button type="button" className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-medium mr-3" onClick={() => toggleExpand(o.id)}>
                          {expandedId === o.id ? t('Hide') : t('View')}
                        </button>
                        {canRestock && (
                          <button
                            type="button"
                            style={{
                              padding: '4px 10px',
                              fontSize: 12,
                              borderRadius: 6,
                              border: '1px solid #cbd5e0',
                              background: 'white',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                            onClick={() => setRestockOrder(o)}
                          >
                            {t('Return Items')}
                          </button>
                        )}
                      </td>
                    </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}

        {expandedId && (
          <div className="mt-6">
            {orders.filter((o) => o.id === expandedId).map((o) => (
              <div key={o.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex justify-between flex-wrap gap-3 mb-3">
                  <h3 className="m-0 text-base font-bold text-slate-900">{t('Order')} {o.orderNumber} {t('— Table')} {o.tableNumber}</h3>
                  <OrderStatusBadge status={o.status} />
                </div>

                {o.items.length === 0 ? (
                  <p className="text-slate-400">{t('No items recorded.')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse mb-4">
                    <thead>
                      <tr>
                        <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Item')}</th>
                        <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Qty')}</th>
                        <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Price')}</th>
                        <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Line Total')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {o.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-2 text-slate-700">{item.name}</td>
                          <td className="p-2 text-right text-slate-700">{item.quantity}</td>
                          <td className="p-2 text-right text-slate-700">{money(item.price)}</td>
                          <td className="p-2 text-right font-semibold text-slate-900">{money(item.lineTotal)}</td>
                        </tr>
                      ))}
                     </tbody>
                   </table>
                   </div>
                 )}

                <div className="flex justify-between text-sm text-slate-400 mb-1">
                  <span>{t('Total (VAT included)')}</span><span>{money(o.subtotal ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-400 mb-2">
                  <span>{t('VAT portion')}</span><span>{money(o.tax ?? 0)}</span>
                </div>
                <div className="text-right font-bold text-base mb-4">
                  {t('Total:')} {money(o.total)}
                </div>

                <h4 className="m-0 mb-2 text-sm font-bold text-slate-900">{t('Lifecycle')}</h4>
                <ol className="m-0 pl-5 text-slate-400">
                  {(history[o.id] && history[o.id].length > 0)
                    ? history[o.id].map((h, idx) => (
                        <li key={idx} className="mb-1">
                          <strong className="text-slate-900">{h.status}</strong>
                          {' — '}
                          {h.changedBy || t('system')}
                          {h.note ? ` (${h.note})` : ''}
                          {' · '}
                          {new Date(h.changedAt).toLocaleString()}
                        </li>
                      ))
                    : LIFECYCLE.map((step) => (
                        <li key={step} className={step === o.status ? 'text-indigo-500' : 'text-slate-400'}>
                          {step}{step === o.status ? t(' (current)') : ''}
                        </li>
                      ))}
                  </ol>
                </div>
              ))}
          </div>
        )}
      </section>
      {restockOrder && (
        <OrderRestockModal
          order={restockOrder}
          onClose={() => setRestockOrder(null)}
          onSuccess={() => {
            setRestockOrder(null)
            load()
          }}
        />
      )}
    </div>
  )
}
