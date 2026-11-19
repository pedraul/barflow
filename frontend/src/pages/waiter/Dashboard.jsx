import { usePreferences } from '../../context/PreferencesContext'
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import * as api from '../../api/endpoints'
import { ClipboardList, Clock, CheckCircle, DollarSign, MoreHorizontal } from 'lucide-react'
import { StatCard } from '../../components/ui/SharedComponents'
import { getOrderLocation } from '../../utils/orderDisplay'

export default function WaiterDashboard() {
  const { t } = usePreferences()
  const { user } = useAuth()
  const [waiterOrders, setWaiterOrders] = useState([])
  const [readyOrders, setReadyOrders] = useState([])
  const [readyLoading, setReadyLoading] = useState(true)
  const [readyError, setReadyError] = useState('')
  const [deliveringId, setDeliveringId] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    api.fetchWaiterOrderHistory()
      .then((data) => { if (active) setWaiterOrders(data.orders || []) })
      .catch((error) => console.error('Unable to load waiter orders:', error))
    return () => { active = false }
  }, [user?.id])

  const loadReadyOrders = async () => {
    try {
      const [kitchenOrders, barOrders] = await Promise.all([
        api.fetchKitchenOrders(user?.branchId),
        api.fetchBarOrders(user?.branchId),
      ])
      const uniqueReadyOrders = new Map()
      for (const order of [...kitchenOrders, ...barOrders]) {
        if (String(order.status || '').trim().toLowerCase() === 'ready') {
          uniqueReadyOrders.set(order.id, order)
        }
      }
      setReadyOrders(Array.from(uniqueReadyOrders.values()).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)))
      setReadyError('')
    } catch (error) {
      setReadyError(error.response?.data?.error || error.message || 'Unable to load ready orders.')
    } finally {
      setReadyLoading(false)
    }
  }

  useEffect(() => {
    loadReadyOrders()
    const refreshTimer = window.setInterval(loadReadyOrders, 5000)
    return () => window.clearInterval(refreshTimer)
  }, [user?.branchId])

  const handleDeliver = async (order) => {
    setDeliveringId(order.id)
    try {
      await api.updateOperatorOrderStatus(order.id, 'Served')
      setReadyOrders((current) => current.filter((item) => item.id !== order.id))
      loadReadyOrders()
    } catch (error) {
      setReadyError(error.response?.data?.error || error.message || 'Unable to mark this order delivered.')
    } finally {
      setDeliveringId(null)
    }
  }

  const waiterName = user?.name || t('Waiter')
  const openOrders = waiterOrders.filter((o) => o.status === 'Open')
  const servedOrders = waiterOrders.filter((o) => o.status === 'Served')
  const paidOrders = waiterOrders.filter((o) => o.status === 'Paid')
  const revenue = paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
  const money = (value) => `${Number(value).toLocaleString()} RWF`

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("Waiter workspace")}</p>
        <h1 className="text-2xl font-black text-slate-900">{t("Welcome,")}{' '}{waiterName}</h1>
        <p className="text-sm text-slate-500">{t("Here is a summary of the orders you have handled.")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={<ClipboardList size={24} className="text-blue-600" />} iconBg="bg-blue-50" label={t("Orders handled")} value={String(waiterOrders.length)} linkText={t("View orders")} onClick={() => navigate('/waiter/orders', { state: { orderFilter: 'my' } })} />
        <StatCard icon={<Clock size={24} className="text-amber-600" />} iconBg="bg-amber-50" label={t("Open / pending")} value={String(openOrders.length)} linkText={t("View pending")} onClick={() => navigate('/waiter/orders', { state: { orderFilter: 'open' } })} />
        <StatCard icon={<CheckCircle size={24} className="text-emerald-600" />} iconBg="bg-emerald-50" label={t("Served")} value={String(servedOrders.length)} linkText={t("View served")} onClick={() => navigate('/waiter/orders', { state: { orderFilter: 'served' } })} />
        <StatCard icon={<DollarSign size={24} className="text-purple-600" />} iconBg="bg-purple-50" label={t("Revenue collected")} value={money(revenue)} linkText={t("View details")} onClick={() => navigate('/waiter/order-history')} />
        <StatCard icon={<CheckCircle size={24} className="text-teal-600" />} iconBg="bg-teal-50" label={t("Ready order pickup")} value={String(readyOrders.length)} linkText={t("Open pickup queue")} onClick={() => navigate('/waiter/orders', { state: { orderFilter: 'ready' } })} />
      </div>

      <section className="bg-white border border-emerald-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">{t("Ready order pickup")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("Orders marked ready by the kitchen or bar are shared with all waiters.")}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">{readyLoading ? '…' : readyOrders.length}{' '}{t("ready")}</span>
        </div>
        {readyError && <p role="alert" className="px-5 pt-4 text-sm text-red-600">{t(readyError)}</p>}
        {readyLoading && readyOrders.length === 0 ? (
          <p className="p-5 text-center text-sm text-slate-400">{t("Checking kitchen and bar for ready orders…")}</p>
        ) : readyOrders.length === 0 ? (
          <p className="p-5 text-center text-sm text-slate-400">{t("No orders are ready for delivery right now.")}</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 p-4">
            {readyOrders.map((order) => (
              <article key={order.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">{t("Order")}{' '}{order.orderNumber || order.id}</h3>
                    <p className="mt-1 text-sm text-slate-500">{getOrderLocation(order)} · {order.source === 'qr' ? t("QR order") : t("Waiter order")}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{t("Ready")}</span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {(order.items || []).map((item) => `${item.name} ×${item.quantity}`).join(', ') || t("Order items")}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <strong className="text-sm text-slate-900">{money(order.total)}</strong>
                  <button
                    type="button"
                    onClick={() => handleDeliver(order)}
                    disabled={deliveringId === order.id}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    {deliveringId === order.id ? t("Confirming…") : t("Pick up & deliver")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-900">{t("Recent Orders")}</h3>
          <button type="button" aria-label={t('More options')} className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={18} /></button>
        </div>
        {waiterOrders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left p-2 font-semibold text-slate-500 text-xs uppercase tracking-wider">{t("Order")}</th>
                  <th className="text-left p-2 font-semibold text-slate-500 text-xs uppercase tracking-wider">{t("Table")}</th>
                  <th className="text-left p-2 font-semibold text-slate-500 text-xs uppercase tracking-wider">{t("Items")}</th>
                  <th className="text-left p-2 font-semibold text-slate-500 text-xs uppercase tracking-wider">{t("Total")}</th>
                  <th className="text-left p-2 font-semibold text-slate-500 text-xs uppercase tracking-wider">{t("Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {waiterOrders.slice().reverse().map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition">
                    <td className="p-2 font-medium text-slate-900">{order.orderNumber || order.order_number || '—'}</td>
                    <td className="p-2 text-slate-600">{getOrderLocation(order)}</td>
                    <td className="p-2 text-slate-600">{(order.items || []).map((i) => `${i.name} ×${i.quantity}`).join(', ') || '—'}</td>
                    <td className="p-2 font-medium text-slate-900">{money(order.total)}</td>
                    <td className="p-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${order.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : order.status === 'Served' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-slate-400 text-center">{t("You have not handled any orders yet. Use \"New order\" to get started.")}</p>
        )}
      </div>

    </div>
  )
}
