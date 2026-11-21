import React, { useEffect, useState, useMemo } from 'react'
import { useOwner } from '../../context/OwnerContext'
import OrderRestockModal from '../../components/OrderRestockModal'
import * as api from '../../api/endpoints'
import { getOrderLocation } from '../../utils/orderDisplay'
import { usePreferences } from '../../context/PreferencesContext'
import OrderStatusBadge from '../../components/OrderStatusBadge'

const money = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

export default function OwnerWaiterOrders() {
  const { t } = usePreferences()
  const { fetchWaiters, fetchWaiterOrders, activeBranchId } = useOwner()
  const [waiters, setWaiters] = useState([])
  const [selectedWaiter, setSelectedWaiter] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [waitersLoading, setWaitersLoading] = useState(true)
  const [restockOrder, setRestockOrder] = useState(null)

  useEffect(() => {
    let active = true
    setWaiters([])
    setSelectedWaiter(null)
    setOrders([])
    setWaitersLoading(true)
    fetchWaiters()
      .then((data) => { if (active) setWaiters(data || []) })
      .catch(() => {})
      .finally(() => { if (active) setWaitersLoading(false) })
    return () => { active = false }
  }, [fetchWaiters, activeBranchId])

  const loadOrders = async (userId) => {
    setLoading(true)
    try {
      const data = await fetchWaiterOrders(userId)
      setOrders(data?.orders || [])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (waiter) => {
    setSelectedWaiter(waiter.id)
    loadOrders(waiter.id)
  }

  const summary = useMemo(() => {
    const total = orders.reduce((s, o) => s + (Number(o.total) || 0), 0)
    return { count: orders.length, total }
  }, [orders])

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{t('Owner workspace')}</p>
          <h1 className="text-2xl font-extrabold text-slate-900">{t('Waiter Orders')}</h1>
          <p className="text-sm text-slate-500">{t('Select a waiter to view all orders they have handled.')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {selectedWaiter && (
          <>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{summary.count}</strong>
              <span className="text-slate-500 text-sm font-medium">{t('Orders')}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{money(summary.total)}</strong>
              <span className="text-slate-500 text-sm font-medium">{t('Total Value')}</span>
            </div>
          </>
        )}
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 pb-3 border-b border-slate-200">{t('Waiters')}</h2>

        {waitersLoading ? (
          <p className="text-center text-slate-400 mt-8">{t('Loading waiters...')}</p>
        ) : waiters.length === 0 ? (
          <p className="text-center text-slate-400 mt-8">{t('No waiters found.')}</p>
        ) : (
          <div className="flex gap-2.5 flex-wrap mb-6">
            {waiters.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => handleSelect(w)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedWaiter === w.id ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'}`}
              >
                {w.name}
              </button>
            ))}
          </div>
        )}

        {selectedWaiter && (
          <>
            <h3 className="m-0 mb-4 text-base font-bold text-slate-900">
              {waiters.find((w) => w.id === selectedWaiter)?.name || t('Waiter')} {t('— Orders')}
            </h3>

            {loading ? (
              <p className="text-center text-slate-400 mt-8">{t('Loading orders...')}</p>
            ) : orders.length === 0 ? (
              <p className="text-center text-slate-400 mt-8">{t('No orders found for this waiter.')}</p>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th scope="col" className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left align-middle">{t('Order')}</th>
                      <th scope="col" className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left align-middle">{t('Table')}</th>
                      <th scope="col" className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left align-middle">{t('Status')}</th>
                      <th scope="col" className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left align-middle">{t('Source')}</th>
                      <th scope="col" className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right align-middle">{t('Total')}</th>
                      <th scope="col" className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right align-middle">{t('Date')}</th>
                      <th scope="col" className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right align-middle">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => {
                      const canRestock = ['Open', 'Preparing'].includes(o.status)
                    return (
                    <tr key={o.id} className="hover:bg-indigo-50 align-middle">
                      <td className="p-2 font-semibold text-slate-900">{o.orderNumber || o.id.slice(0, 8)}</td>
                      <td className="p-2 text-slate-700">{getOrderLocation({ ...o, source: o.source || 'waiter', waiterName: waiters.find((waiter) => waiter.id === selectedWaiter)?.name })}</td>
                      <td className="p-2">
                        <OrderStatusBadge status={o.status} />
                      </td>
                      <td className="p-2 text-slate-700 capitalize">{o.source || t('waiter')}</td>
                      <td className="p-2 text-right font-semibold text-slate-900">{money(o.total)}</td>
                      <td className="p-2 text-right text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td className="p-2 text-right">
                        {canRestock ? (
                          <button
                            type="button"
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => setRestockOrder(o)}
                          >
                            {t('Return Items')}
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      {restockOrder && (
        <OrderRestockModal
          order={restockOrder}
          onClose={() => setRestockOrder(null)}
          onSuccess={() => {
            setRestockOrder(null)
            if (selectedWaiter) loadOrders(selectedWaiter)
          }}
        />
      )}
    </div>
  )
}
