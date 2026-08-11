import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useOrders } from '../../context/OrdersContext'
import { ClipboardList, Clock, CheckCircle, DollarSign, MoreHorizontal } from 'lucide-react'
import { StatCard } from '../../components/ui/SharedComponents'

export default function WaiterDashboard() {
  const { user } = useAuth()
  const { orders } = useOrders()
  const navigate = useNavigate()

  const waiterName = user?.name || 'Waiter'
  const waiterOrders = orders.filter((o) => o.waiterId === user?.id)
  const openOrders = waiterOrders.filter((o) => o.status === 'Open')
  const servedOrders = waiterOrders.filter((o) => o.status === 'Served')
  const paidOrders = waiterOrders.filter((o) => o.status === 'Paid')
  const revenue = paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
  const money = (value) => `${Number(value).toLocaleString()} RWF`

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Waiter workspace</p>
        <h1 className="text-2xl font-black text-slate-900">Welcome, {waiterName}</h1>
        <p className="text-sm text-slate-500">Here is a summary of the orders you have handled.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<ClipboardList size={24} className="text-blue-600" />} iconBg="bg-blue-50" label="Orders handled" value={String(orders.length)} linkText="View orders" onClick={() => navigate('/waiter/orders')} />
        <StatCard icon={<Clock size={24} className="text-amber-600" />} iconBg="bg-amber-50" label="Open / pending" value={String(openOrders.length)} linkText="View pending" />
        <StatCard icon={<CheckCircle size={24} className="text-emerald-600" />} iconBg="bg-emerald-50" label="Served" value={String(servedOrders.length)} linkText="View served" />
        <StatCard icon={<DollarSign size={24} className="text-purple-600" />} iconBg="bg-purple-50" label="Revenue collected" value={money(revenue)} linkText="View details" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-900">Recent Orders</h3>
          <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={18} /></button>
        </div>
        {waiterOrders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left p-2 font-semibold text-slate-500 text-xs uppercase tracking-wider">Order</th>
                  <th className="text-left p-2 font-semibold text-slate-500 text-xs uppercase tracking-wider">Items</th>
                  <th className="text-left p-2 font-semibold text-slate-500 text-xs uppercase tracking-wider">Total</th>
                  <th className="text-left p-2 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {waiterOrders.slice().reverse().map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition">
                    <td className="p-2 font-medium text-slate-900">{order.orderNumber || order.order_number || '—'}</td>
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
          <p className="p-4 text-slate-400 text-center">You have not handled any orders yet. Use "New order" to get started.</p>
        )}
      </div>

    </div>
  )
}
