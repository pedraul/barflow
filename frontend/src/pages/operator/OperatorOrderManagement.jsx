import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { fetchOperatorOrders, fetchReadyOrders, routeOrder, updateOperatorOrderStatus, markOrderAsPaid } from '../../api/endpoints'
import {
  LayoutDashboard, ShoppingBag, ChefHat, CheckCircle2, BarChart3,
  Clock, FileText, Printer, GlassWater,
  FileSpreadsheet, User, LogOut, Menu, Share2, MessageSquare
} from 'lucide-react'

const MONEY = (v) => `${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function SidebarLink({ icon, label, badge, badgeColor, status, active, onClick }) {
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); onClick?.() }} className={`flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/60 hover:text-white transition group ${active ? 'font-medium' : ''} text-slate-400`}>
      <div className="flex items-center gap-3">
        <span className={active ? 'text-slate-400' : 'text-slate-500 group-hover:text-slate-300'}>{icon}</span>
        <span className="font-medium">{label}</span>
      </div>
      {badge !== undefined && (
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      )}
      {status && <span className={`w-2 h-2 rounded-full ${status}`}></span>}
    </a>
  )
}

export default function OperatorOrderManagement() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'new')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const load = async () => {
    try {
      const data = await fetchOperatorOrders()
      setOrders(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [])

  const handleRoute = async (orderId, destination) => {
    setActionLoading(true)
    try {
      console.log('[Operator] routing order:', orderId, 'to:', destination)
      await routeOrder(orderId, destination)
      console.log('[Operator] route success, reloading orders')
      await load()
      alert(`Order routed to ${destination}`)
    } catch (e) {
      console.error('[Operator] route failed:', e)
      alert(e.message || 'Failed to route order')
    } finally {
      setActionLoading(false)
    }
  }

  const handleStatus = async (orderId, status) => {
    setActionLoading(true)
    try {
      if (status === 'Paid') {
        await markOrderAsPaid(orderId)
      } else {
        await updateOperatorOrderStatus(orderId, status)
      }
      await load()
    } catch (e) {
      alert(e.message || 'Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  const handlePrintReadyReceipts = async () => {
    try {
      const readyOrders = await fetchReadyOrders()
      if (readyOrders && readyOrders.length) {
        readyOrders.forEach((order, idx) => {
          setTimeout(() => {
            window.open(`/operator/receipt/${order.id}`, '_blank')
          }, idx * 500)
        })
      }
    } catch (e) {
      alert(e.message || 'Failed to print receipts')
    }
  }

  const getCategoryBadge = (items) => {
    const hasFood = items.some((i) => !/drink|beer|wine|cocktail|beverage|soft|liquor|spirit/i.test(i.category || ''))
    const hasDrink = items.some((i) => /drink|beer|wine|cocktail|beverage|soft|liquor|spirit/i.test(i.category || ''))
    if (hasFood && hasDrink) return { label: 'Mixed', color: '#6f42c1' }
    if (hasFood) return { label: 'Food (Kitchen)', color: '#fd7e14' }
    return { label: 'Drinks (Bar)', color: '#17a2b8' }
  }

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (['new', 'preparing', 'ready', 'completed', 'all'].includes(tab)) setActiveTab(tab)
  }, [searchParams])

  const newOrders = orders.filter((o) => String(o.status || '').trim().toLowerCase() === 'open')
  const preparingOrders = orders.filter((o) => String(o.status || '').trim().toLowerCase() === 'preparing')
  const readyOrders = orders.filter((o) => String(o.status || '').trim().toLowerCase() === 'ready')
  const completedOrders = orders.filter((o) => ['served', 'paid', 'cancelled'].includes(String(o.status || '').trim().toLowerCase()))

  const displayOrders = activeTab === 'new' ? newOrders
    : activeTab === 'preparing' ? preparingOrders
    : activeTab === 'ready' ? readyOrders
    : activeTab === 'completed' ? completedOrders
    : orders

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
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
              <GlassWater size={20} className="transform rotate-180" />
            </div>
            <span>BarFlow</span>
          </div>

          <nav className="p-4 space-y-6 text-sm">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Order Management</p>
              <div className="space-y-1">
                <SidebarLink icon={<FileText size={18} />} label="New Orders" badge={newOrders.length} badgeColor="bg-red-500 text-white" active={activeTab === 'new'} onClick={() => setActiveTab('new')} />
                <SidebarLink icon={<ChefHat size={18} />} label="Preparing" badge={preparingOrders.length} badgeColor="bg-amber-500 text-white" active={activeTab === 'preparing'} onClick={() => setActiveTab('preparing')} />
                <SidebarLink icon={<CheckCircle2 size={18} />} label="Ready" badge={readyOrders?.length || 0} badgeColor="bg-emerald-500 text-white" active={activeTab === 'ready'} onClick={() => setActiveTab('ready')} />
                <SidebarLink icon={<CheckCircle2 size={18} />} label="Completed" badge={completedOrders.length} badgeColor="bg-slate-500 text-white" active={activeTab === 'completed'} onClick={() => setActiveTab('completed')} />
                <SidebarLink icon={<FileText size={18} />} label="All Orders" active={activeTab === 'all'} onClick={() => setActiveTab('all')} />
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Receipts</p>
              <div className="space-y-1">
                <SidebarLink icon={<Printer size={18} />} label="Printed Receipts" onClick={() => navigate('/operator/receipts/printed')} />
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Other</p>
              <div className="space-y-1">
                <SidebarLink icon={<FileSpreadsheet size={18} />} label="Reports" onClick={() => navigate('/operator/reports')} />
                <SidebarLink icon={<MessageSquare size={18} />} label="Chats" onClick={() => navigate('/notifications')} />
                <SidebarLink icon={<User size={18} />} label="My Account" onClick={() => navigate('/account')} />
              </div>
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button onClick={() => { navigate('/login') }} className="flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-950/30 rounded-lg font-medium transition w-full">
            <LogOut size={18} /> Logout
          </button>
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
              <GlassWater size={20} className="transform rotate-180" />
            </div>
            <span>BarFlow</span>
          </div>

          <nav className="p-4 space-y-6 text-sm">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Order Management</p>
              <div className="space-y-1">
                <SidebarLink icon={<FileText size={18} />} label="New Orders" badge={newOrders.length} badgeColor="bg-red-500 text-white" active={activeTab === 'new'} onClick={() => setActiveTab('new')} />
                <SidebarLink icon={<ChefHat size={18} />} label="Preparing" badge={preparingOrders.length} badgeColor="bg-amber-500 text-white" active={activeTab === 'preparing'} onClick={() => setActiveTab('preparing')} />
                <SidebarLink icon={<CheckCircle2 size={18} />} label="Ready" badge={readyOrders?.length || 0} badgeColor="bg-emerald-500 text-white" active={activeTab === 'ready'} onClick={() => setActiveTab('ready')} />
                <SidebarLink icon={<CheckCircle2 size={18} />} label="Completed" badge={completedOrders.length} badgeColor="bg-slate-500 text-white" active={activeTab === 'completed'} onClick={() => setActiveTab('completed')} />
                <SidebarLink icon={<FileText size={18} />} label="All Orders" active={activeTab === 'all'} onClick={() => setActiveTab('all')} />
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Receipts</p>
              <div className="space-y-1">
                <SidebarLink icon={<Printer size={18} />} label="Printed Receipts" onClick={() => navigate('/operator/receipts/printed')} />
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Other</p>
              <div className="space-y-1">
                <SidebarLink icon={<FileSpreadsheet size={18} />} label="Reports" onClick={() => navigate('/operator/reports')} />
                <SidebarLink icon={<MessageSquare size={18} />} label="Chats" onClick={() => navigate('/notifications')} />
                <SidebarLink icon={<User size={18} />} label="My Account" onClick={() => navigate('/account')} />
              </div>
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button onClick={() => { navigate('/login') }} className="flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-950/30 rounded-lg font-medium transition w-full">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-slate-900">Order Management</h1>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={handlePrintReadyReceipts} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
              <Printer size={16} /> Print Ready Receipts
            </button>
            <button className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
              <Printer size={16} /> Print
            </button>
            <div className="flex items-center gap-3 border-l pl-6 border-slate-200">
              <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
                OP
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-900 leading-tight">Operator</p>
                <p className="text-xs text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span> Online</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="flex border-b border-slate-200">
              <button onClick={() => setActiveTab('new')} className={`px-6 py-3 text-sm font-semibold transition ${activeTab === 'new' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}>
                New Orders ({newOrders.length})
              </button>
              <button onClick={() => setActiveTab('preparing')} className={`px-6 py-3 text-sm font-semibold transition ${activeTab === 'preparing' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}>
                Preparing ({preparingOrders.length})
              </button>
              <button onClick={() => setActiveTab('ready')} className={`px-6 py-3 text-sm font-semibold transition ${activeTab === 'ready' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}>
                Ready ({readyOrders.length})
              </button>
              <button onClick={() => setActiveTab('completed')} className={`px-6 py-3 text-sm font-semibold transition ${activeTab === 'completed' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}>
                Completed ({completedOrders.length})
              </button>
              <button onClick={() => setActiveTab('all')} className={`px-6 py-3 text-sm font-semibold transition ${activeTab === 'all' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}>
                All Orders ({orders.length})
              </button>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="text-center text-slate-400 py-8">Loading orders...</div>
              ) : displayOrders.length === 0 ? (
                <div className="text-center text-slate-400 py-8">No {activeTab} orders</div>
              ) : (
                <table className="w-full min-w-[1000px] text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-2 font-medium">Order</th><th className="px-3 py-2 font-medium">Table / Source</th><th className="px-3 py-2 font-medium">Items</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Total</th><th className="px-3 py-2 font-medium">Created</th><th className="px-3 py-2 font-medium text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {displayOrders.map((order) => {
                      const status = String(order.status || '').trim()
                      const statusKey = status.toLowerCase()
                      const isOpen = statusKey === 'open'
                      const stationBadge = order.station
                        ? order.station === 'both'
                          ? 'bg-purple-100 text-purple-700'
                          : order.station === 'bar'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                      const stationLabel = order.station
                        ? order.station === 'both' ? '✓ Sent to Kitchen + Bar' : '✓ Sent to ' + order.station.charAt(0).toUpperCase() + order.station.slice(1)
                        : 'Unrouted'
                      const isReady = statusKey === 'ready'
                      const statusStyle = statusKey === 'ready' ? 'bg-emerald-100 text-emerald-700' : statusKey === 'preparing' ? 'bg-amber-100 text-amber-700' : statusKey === 'open' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                      return <tr key={order.id} className="hover:bg-slate-50 align-top cursor-pointer" onClick={() => setSelectedOrder(order)}>
                        <td className="px-3 py-2 font-semibold text-slate-900">{order.orderNumber || '—'}</td>
                        <td className="px-3 py-2"><div>Table {order.tableNumber || '—'}</div><span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${order.source === 'qr' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>{String(order.source || 'other').toUpperCase()}</span></td>
                        <td className="px-3 py-2 max-w-xs"><div className="space-y-1">{(order.items || []).map((item, idx) => <div key={idx} className="truncate">{item.name} <span className="text-slate-400">×{item.quantity}</span></div>)}</div></td>
                        <td className="px-3 py-2"><span className={`inline-flex px-2 py-1 rounded-full text-[10px] ${statusStyle}`}>{status || 'Unknown'}</span>{order.station && <span className={`ml-1 inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-[10px] font-bold ${stationBadge}`}>{stationLabel}</span>}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{MONEY(order.total)}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{order.createdAt}</td>
                        <td className="px-3 py-2"><div className="flex justify-end flex-wrap gap-2" onClick={(e) => e.stopPropagation()}><button onClick={() => setSelectedOrder(order)} className="text-xs border border-slate-300 text-slate-700 px-2.5 py-1.5 rounded-md hover:bg-white">View</button>{isOpen && <><button onClick={() => handleRoute(order.id, 'kitchen')} disabled={actionLoading || order.station === 'kitchen' || order.station === 'both'} title={order.station === 'kitchen' || order.station === 'both' ? 'Already sent to Kitchen' : undefined} className="text-xs bg-emerald-600 text-white px-2.5 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Kitchen</button><button onClick={() => handleRoute(order.id, 'bar')} disabled={actionLoading || order.station === 'bar' || order.station === 'both'} title={order.station === 'bar' || order.station === 'both' ? 'Already sent to Bar' : undefined} className="text-xs bg-purple-600 text-white px-2.5 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Bar</button><button onClick={() => handleRoute(order.id, 'both')} disabled={actionLoading || order.station === 'both' || order.station === 'kitchen' || order.station === 'bar'} title={order.station ? 'Already sent to ' + (order.station === 'both' ? 'Kitchen + Bar' : order.station.charAt(0).toUpperCase() + order.station.slice(1)) : undefined} className="text-xs bg-amber-600 text-white px-2.5 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Both</button></>}{isReady && <><button onClick={() => handleStatus(order.id, 'Served')} disabled={actionLoading} className="text-xs bg-emerald-600 text-white px-2.5 py-1.5 rounded-md disabled:opacity-50">Serve</button><button onClick={() => handleStatus(order.id, 'Paid')} disabled={actionLoading} className="text-xs bg-blue-600 text-white px-2.5 py-1.5 rounded-md disabled:opacity-50">Serve & Pay</button></>}{['ready', 'served', 'paid'].includes(statusKey) && <button onClick={() => navigate(`/operator/receipt/${order.id}`)} className="text-xs border border-slate-300 text-slate-700 px-2.5 py-1.5 rounded-md">Receipt</button>}</div></td>
                      </tr>
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => setSelectedOrder(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Order Details — {selectedOrder.orderNumber || selectedOrder.id}</h2>
              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="border border-slate-100 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-medium">Order Number</p>
                  <p className="font-bold text-slate-900 mt-0.5">{selectedOrder.orderNumber || '—'}</p>
                </div>
                <div className="border border-slate-100 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-medium">Table</p>
                  <p className="font-bold text-slate-900 mt-0.5">Table {selectedOrder.tableNumber || '—'}</p>
                </div>
                <div className="border border-slate-100 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-medium">Source</p>
                  <p className="font-bold text-slate-900 mt-0.5">{String(selectedOrder.source || 'other').toUpperCase()}</p>
                </div>
                <div className="border border-slate-100 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-medium">Status</p>
                  <p className="font-bold text-slate-900 mt-0.5">{selectedOrder.status || '—'}</p>
                </div>
                <div className="border border-slate-100 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-medium">Sent to</p>
                  <p className="font-bold text-slate-900 mt-0.5">{selectedOrder.station ? (selectedOrder.station === 'both' ? 'Kitchen + Bar' : selectedOrder.station.charAt(0).toUpperCase() + selectedOrder.station.slice(1)) : 'Not sent'}</p>
                </div>
                <div className="border border-slate-100 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-medium">Created</p>
                  <p className="font-bold text-slate-900 mt-0.5">{selectedOrder.createdAt || '—'}</p>
                </div>
              </div>

              <div className="border border-slate-100 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900">Items</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {(selectedOrder.items || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center px-4 py-2.5 text-sm">
                      <span className="font-medium text-slate-800">{item.name}</span>
                      <span className="text-slate-400">×{item.quantity}</span>
                      <span className="font-semibold text-slate-900">{MONEY(item.lineTotal || item.price * item.quantity)}</span>
                    </div>
                  ))}
                  {(!selectedOrder.items || selectedOrder.items.length === 0) && (
                    <div className="px-4 py-6 text-center text-slate-400 text-sm">No items on this order.</div>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center border-t-2 border-slate-900 pt-3">
                <span className="font-bold text-slate-900">TOTAL</span>
                <span className="font-black text-slate-900 text-lg">{MONEY(selectedOrder.total)}</span>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setSelectedOrder(null)} className="text-xs font-semibold border border-slate-300 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-50">Close</button>
                {['ready', 'served', 'paid'].includes(String(selectedOrder.status || '').trim().toLowerCase()) && (
                  <button onClick={() => navigate(`/operator/receipt/${selectedOrder.id}`)} className="text-xs font-semibold bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">View Receipt</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
