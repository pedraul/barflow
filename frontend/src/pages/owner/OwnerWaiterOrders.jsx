import React, { useEffect, useState, useMemo } from 'react'
import { useOwner } from '../../context/OwnerContext'
import { UserCheck, Users } from 'lucide-react'
import OrderRestockModal from '../../components/OrderRestockModal'
import * as api from '../../api/endpoints'

const money = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

export default function OwnerWaiterOrders() {
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
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Owner workspace</p>
          <h1 className="text-2xl font-extrabold text-slate-900">Waiter Orders</h1>
          <p className="text-sm text-slate-500">Select a waiter to view all orders they have handled.</p>
        </div>
        <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
          <UserCheck size={24} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {selectedWaiter && (
          <>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{summary.count}</strong>
              <span className="text-slate-500 text-sm font-medium">Orders</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{money(summary.total)}</strong>
              <span className="text-slate-500 text-sm font-medium">Total Value</span>
            </div>
          </>
        )}
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 pb-3 border-b border-slate-200">Waiters</h2>

        {waitersLoading ? (
          <p className="text-center text-slate-400 mt-8">Loading waiters...</p>
        ) : waiters.length === 0 ? (
          <p className="text-center text-slate-400 mt-8">No waiters found.</p>
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
              {waiters.find((w) => w.id === selectedWaiter)?.name || 'Waiter'} — Orders
            </h3>

            {loading ? (
              <p className="text-center text-slate-400 mt-8">Loading orders...</p>
            ) : orders.length === 0 ? (
              <p className="text-center text-slate-400 mt-8">No orders found for this waiter.</p>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Order</th>
                      <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Table</th>
                      <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Status</th>
                      <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Source</th>
                      <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">Total</th>
                      <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => {
                      const canRestock = ['Open', 'Preparing'].includes(o.status)
                    return (
                    <tr key={o.id} className="hover:bg-indigo-50">
                      <td className="p-2 font-semibold text-slate-900">{o.orderNumber || o.id.slice(0, 8)}</td>
                      <td className="p-2 text-slate-700">{o.tableNumber || '—'}</td>
                      <td className="p-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${o.status === 'Paid' || o.status === 'Served' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : o.status === 'Cancelled' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="p-2 text-slate-700 capitalize">{o.source || 'waiter'}</td>
                      <td className="p-2 text-right font-semibold text-slate-900">{money(o.total)}</td>
                      <td className="p-2 text-right text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td className="p-2 text-right">
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
                            Return Items
                          </button>
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
