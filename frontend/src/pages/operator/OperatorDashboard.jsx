import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { fetchOperatorDashboard, routeOrder, updateOperatorOrderStatus, fetchQRCodes, fetchKitchenOrders, fetchBarOrders } from '../../api/endpoints'
import QRCode from '../../components/QRCode'
import {
  LayoutDashboard, ShoppingBag, ChefHat, CheckCircle2, BarChart3,
  Clock, FileText, Printer, Utensils, GlassWater, Users,
  FileSpreadsheet, User, LogOut, Menu, Share2, MessageSquare
} from 'lucide-react'
import { SidebarLink, StatCard, OrderListItem, StepIcon, StepLine, QuickActionButton } from '../../components/ui/SharedComponents'

const MONEY = (v) => `${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function generatePaymentCode(order) {
  const seed = String(order.orderNumber || order.id)
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash).toString().padStart(6, '0').slice(0, 6)
}

export default function OperatorDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState({ stats: { newOrders: 0, preparing: 0, ready: 0 }, todaySales: 0, orders: [], businessName: 'BarFlow', currencyCode: 'RWF', businessAddress: '', businessCity: '', businessCountry: 'Rwanda', businessPhone: '', businessEmail: '', businessRegistrationCode: '', businessTaxId: '', totalOrders: 0, paidOrdersCount: 0, paidOrdersTotal: 0, qrSales: 0, waiterSales: 0, sourceBreakdown: { qr: 0, waiter: 0, other: 0 }, statusBreakdown: { Open: 0, Preparing: 0, Ready: 0, Served: 0, Paid: 0, Cancelled: 0 } })
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrCodes, setQrCodes] = useState([])
  const [kitchenOrders, setKitchenOrders] = useState([])
  const [barOrders, setBarOrders] = useState([])
  const [routingNotice, setRoutingNotice] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const loadStations = async () => {
    try {
      const [k, b] = await Promise.all([fetchKitchenOrders(), fetchBarOrders()])
      setKitchenOrders(k || [])
      setBarOrders(b || [])
    } catch (e) {
      console.error(e)
    }
  }

  const load = async () => {
    try {
      const data = await fetchOperatorDashboard()
      setDashboard((prev) => ({ ...prev, ...data }))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(); loadStations() }, [])
  useEffect(() => {
    const id = setInterval(() => { load(); loadStations() }, 8000)
    return () => clearInterval(id)
  }, [])

  const handleRoute = async (orderId, destination) => {
    setActionLoading(true)
    try {
      const routedOrder = await routeOrder(orderId, destination)
      await load()
      await loadStations()
      const destinationName = destination === 'kitchen' ? 'Kitchen' : 'Bar'
      setRoutingNotice({
        orderId,
        orderNumber: selectedOrder?.orderNumber || routedOrder?.orderNumber || orderId,
        destination: destinationName,
      })
      alert(`Order routed to ${destination}`)
    } catch (e) {
      alert(e.message || 'Failed to route order')
    } finally {
      setActionLoading(false)
    }
  }

  const handleStatus = async (orderId, status) => {
    setActionLoading(true)
    try {
      await updateOperatorOrderStatus(orderId, status)
      await load()
    } catch (e) {
      alert(e.message || 'Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  const buildReceiptHTML = (order) => {
    const paymentCode = generatePaymentCode(order)
    const qrValue = `${window.location.origin}/payment?order=${order.id}&code=${paymentCode}`
    const rows = (order.items || []).map((item) => {
      const total = MONEY(item.lineTotal || item.price * item.quantity)
      return `<tr><td className="py-1.5 font-medium text-slate-800">${item.name}</td><td className="text-center">${item.quantity}</td><td className="text-right">${total}</td></tr>`
    }).join('')

    return `<div className="font-sans max-w-[320px] mx-auto p-5 text-slate-800">
      <div className="text-center mb-4">
        <h1 className="m-0 text-lg font-bold text-slate-900">${dashboard.businessName}</h1>
        <p className="m-0 text-xs text-slate-500 font-medium">Receipt</p>
      </div>
      <div className="border-t border-b border-dashed border-slate-300 py-2 mb-3 grid grid-cols-2 gap-y-1 text-[11px] text-slate-600">
        <div>Order No : <span className="font-semibold text-slate-900">${order.orderNumber}</span></div>
        <div className="text-right">Date : <span className="font-semibold text-slate-900">${new Date().toLocaleDateString()}</span></div>
        <div>Table : <span className="font-semibold text-slate-900">${order.tableNumber}</span></div>
        <div className="text-right">Time : <span className="font-semibold text-slate-900">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
      </div>
      <table className="w-full text-left text-[11px] text-slate-600">
        <thead><tr className="border-b border-slate-200 font-bold text-slate-800"><th className="pb-1">Item</th><th className="pb-1 text-center">Qty</th><th className="pb-1 text-right">Price</th></tr></thead>
        <tbody className="divide-y divide-slate-100">${rows}</tbody>
      </table>
      <div className="border-t-2 border-slate-900 pt-2 flex justify-between text-xs font-bold text-slate-900">
        <span>TOTAL</span><span>${MONEY(order.total)}</span>
      </div>
      <div className="border-t border-dashed border-slate-300 pt-4 text-center space-y-2">
        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Scan QR to Pay</p>
        <div className="flex items-center justify-center gap-3">
          <div id="receipt-qr-${order.id}" className="w-16 h-16 bg-white border border-slate-200 rounded p-1"></div>
          <span className="text-xs text-slate-400 font-medium">or</span>
          <div className="text-left">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Payment Code</p>
            <p className="text-base font-black text-slate-950 tracking-wide">${paymentCode}</p>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 font-semibold pt-1">Thank you!</p>
      </div>
    </div>`
  }

  const handlePrintDraft = (order) => {
    const printContent = document.createElement('div')
    printContent.innerHTML = buildReceiptHTML(order)
    document.body.appendChild(printContent)

    const qrContainer = printContent.querySelector('#receipt-qr-' + order.id)
    if (qrContainer && window.QRCode) {
      const qr = new window.QRCode(qrContainer, {
        text: `${window.location.origin}/payment?order=${order.id}&code=${generatePaymentCode(order)}`,
        width: 64,
        height: 64,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M,
      })
      setTimeout(() => {
        const canvas = qrContainer.querySelector('canvas')
        const img = qrContainer.querySelector('img')
        if (img && !canvas) {
          const c = document.createElement('canvas')
          c.width = 64
          c.height = 64
          const ctx = c.getContext('2d')
          ctx.drawImage(img, 0, 0, 64, 64)
          qrContainer.innerHTML = ''
          qrContainer.appendChild(c)
        }
      }, 100)
    }

    setTimeout(() => {
      window.print()
      if (document.body.contains(printContent)) {
        document.body.removeChild(printContent)
      }
    }, 500)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const getCategoryBadge = (items) => {
    const hasFood = items.some((i) => !/drink|beer|wine|cocktail|beverage|soft|liquor|spirit/i.test(i.category || ''))
    const hasDrink = items.some((i) => /drink|beer|wine|cocktail|beverage|soft|liquor|spirit/i.test(i.category || ''))
    if (hasFood && hasDrink) return { label: 'Mixed', color: '#6f42c1' }
    if (hasFood) return { label: 'Food (Kitchen)', color: '#fd7e14' }
    return { label: 'Drinks (Bar)', color: '#17a2b8' }
  }

  const currentStats = useMemo(() => {
    const stats = { newOrders: 0, preparing: 0, ready: 0 }
    for (const order of dashboard.orders || []) {
      const status = String(order.status || '').trim().toLowerCase()
      if (status === 'open') stats.newOrders += 1
      if (status === 'preparing') stats.preparing += 1
      if (status === 'ready') stats.ready += 1
    }
    // The API totals are authoritative for all historical orders. The local
    // values ensure the cards stay correct for the current order list too.
    return {
      newOrders: Math.max(Number(dashboard.stats?.newOrders || 0), stats.newOrders),
      preparing: Math.max(Number(dashboard.stats?.preparing || 0), stats.preparing),
      ready: Math.max(Number(dashboard.stats?.ready || 0), stats.ready),
    }
  }, [dashboard.orders, dashboard.stats])

  const newOrders = dashboard.orders.filter((o) => String(o.status || '').trim().toLowerCase() === 'open')
  const preparingOrders = dashboard.orders.filter((o) => o.status === 'Preparing')
  const readyOrders = dashboard.orders.filter((o) => o.status === 'Ready')

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
              <GlassWater size={20} className="transform rotate-180" />
            </div>
            <span>BarFlow</span>
          </div>

          <nav className="p-4 space-y-6 text-sm">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Order Management</p>
              <div className="space-y-1">
                <SidebarLink icon={<FileText size={18} />} label="New Orders" badge={currentStats.newOrders} badgeColor="bg-red-500 text-white" onClick={() => navigate('/operator/orders?tab=new')} />
                <SidebarLink icon={<ChefHat size={18} />} label="Preparing" badge={currentStats.preparing} badgeColor="bg-amber-500 text-white" onClick={() => navigate('/operator/orders?tab=preparing')} />
                <SidebarLink icon={<CheckCircle2 size={18} />} label="Ready" badge={currentStats.ready} badgeColor="bg-emerald-500 text-white" onClick={() => navigate('/operator/orders?tab=ready')} />
                <SidebarLink icon={<FileText size={18} />} label="All Orders" onClick={() => navigate('/operator/orders')} />
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
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-950/30 rounded-lg font-medium transition w-full">
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
                <SidebarLink icon={<FileText size={18} />} label="New Orders" badge={currentStats.newOrders} badgeColor="bg-red-500 text-white" onClick={() => navigate('/operator/orders?tab=new')} />
                <SidebarLink icon={<ChefHat size={18} />} label="Preparing" badge={currentStats.preparing} badgeColor="bg-amber-500 text-white" onClick={() => navigate('/operator/orders?tab=preparing')} />
                <SidebarLink icon={<CheckCircle2 size={18} />} label="Ready" badge={currentStats.ready} badgeColor="bg-emerald-500 text-white" onClick={() => navigate('/operator/orders?tab=ready')} />
                <SidebarLink icon={<FileText size={18} />} label="All Orders" onClick={() => navigate('/operator/orders')} />
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
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-950/30 rounded-lg font-medium transition w-full">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* TOP NAVBAR */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-slate-900">Operator Dashboard</h1>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 border-l pl-6 border-slate-200">
              <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
                {user?.name?.split(' ').map(n => n[0]).join('') || 'OP'}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-900 leading-tight">Operator</p>
                <p className="text-xs text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span> Online</p>
              </div>
            </div>
          </div>
        </header>

        {/* DASHBOARD BODY */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {routingNotice && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 shadow-sm" role="status">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 size={18} className="shrink-0" />
                Order {routingNotice.orderNumber} was sent to the {routingNotice.destination}.
              </div>
              <button type="button" onClick={() => setRoutingNotice(null)} className="text-xs font-bold text-emerald-700 hover:text-emerald-900" aria-label="Dismiss routing confirmation">Dismiss</button>
            </div>
          )}
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={<ShoppingBag size={24} className="text-blue-600" />} iconBg="bg-blue-50" label="Active Orders" value={String(currentStats.newOrders + currentStats.preparing + currentStats.ready)} linkText="View all" onClick={() => navigate('/operator/orders?tab=all')} />
            <StatCard icon={<ChefHat size={24} className="text-amber-600" />} iconBg="bg-amber-50" label="Preparing" value={String(currentStats.preparing)} linkText="View all" onClick={() => navigate('/operator/orders?tab=preparing')} />
            <StatCard icon={<CheckCircle2 size={24} className="text-emerald-600" />} iconBg="bg-emerald-50" label="Ready" value={String(currentStats.ready)} linkText="View all" onClick={() => navigate('/operator/orders?tab=ready')} />
            <StatCard icon={<BarChart3 size={24} className="text-purple-600" />} iconBg="bg-purple-50" label="Today's Sales" value={MONEY(dashboard.todaySales)} linkText="View report" onClick={() => navigate('/operator/reports')} />
          </div>

          {/* Revenue Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Revenue (Paid)</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{MONEY(dashboard.paidOrdersTotal)}</p>
              <p className="text-xs text-slate-500 mt-1">{dashboard.paidOrdersCount || 0} paid orders</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">QR Revenue</p>
              <p className="text-2xl font-black text-blue-600 mt-1">{MONEY(dashboard.qrSales)}</p>
              <p className="text-xs text-slate-500 mt-1">From QR code orders</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Waiter Revenue</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{MONEY(dashboard.waiterSales)}</p>
              <p className="text-xs text-slate-500 mt-1">From waiter orders</p>
            </div>
          </div>

          {/* Business Registration Info */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900 text-sm">Business Registration</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Active</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="border border-slate-100 rounded-lg p-3">
                <p className="text-slate-500 font-medium">Business Name</p>
                <p className="font-bold text-slate-900 mt-1">{dashboard.businessName || '—'}</p>
              </div>
              <div className="border border-slate-100 rounded-lg p-3">
                <p className="text-slate-500 font-medium">Address</p>
                <p className="font-bold text-slate-900 mt-1">{dashboard.businessAddress || '—'}</p>
              </div>
              <div className="border border-slate-100 rounded-lg p-3">
                <p className="text-slate-500 font-medium">City / Country</p>
                <p className="font-bold text-slate-900 mt-1">{dashboard.businessCity || '—'} / {dashboard.businessCountry || '—'}</p>
              </div>
              <div className="border border-slate-100 rounded-lg p-3">
                <p className="text-slate-500 font-medium">Phone / Email</p>
                <p className="font-bold text-slate-900 mt-1">{dashboard.businessPhone || '—'}</p>
                <p className="font-medium text-slate-600 mt-0.5 truncate">{dashboard.businessEmail || '—'}</p>
              </div>
              <div className="border border-slate-100 rounded-lg p-3">
                <p className="text-slate-500 font-medium">Registration Code</p>
                <p className="font-bold text-slate-900 mt-1">{dashboard.businessRegistrationCode || '—'}</p>
              </div>
              <div className="border border-slate-100 rounded-lg p-3">
                <p className="text-slate-500 font-medium">Tax ID / TIN</p>
                <p className="font-bold text-slate-900 mt-1">{dashboard.businessTaxId || '—'}</p>
              </div>
              <div className="border border-slate-100 rounded-lg p-3">
                <p className="text-slate-500 font-medium">Currency</p>
                <p className="font-bold text-slate-900 mt-1">{dashboard.currencyCode || 'RWF'}</p>
              </div>
              <div className="border border-slate-100 rounded-lg p-3">
                <p className="text-slate-500 font-medium">Today's Revenue</p>
                <p className="font-bold text-slate-900 mt-1">{MONEY(dashboard.todaySales)}</p>
              </div>
            </div>
          </section>

          {/* Order Tracking by Source & Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Orders by Source</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-600">QR Orders</span>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{dashboard.sourceBreakdown?.qr || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-600">Waiter Orders</span>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">{dashboard.sourceBreakdown?.waiter || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-600">Other Orders</span>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">{dashboard.sourceBreakdown?.other || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-600">Total Orders</span>
                  <span className="text-xs font-bold text-slate-900">{dashboard.totalOrders || 0}</span>
                </div>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Revenue by Source</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-600">QR Revenue</span>
                  <span className="text-xs font-bold text-blue-600">{MONEY(dashboard.qrSales)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-600">Waiter Revenue</span>
                  <span className="text-xs font-bold text-emerald-600">{MONEY(dashboard.waiterSales)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-600">Total Paid</span>
                  <span className="text-xs font-bold text-slate-900">{MONEY(dashboard.paidOrdersTotal)}</span>
                </div>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="font-bold text-slate-900 text-sm mb-3">Order Status Breakdown</h3>
              <div className="space-y-2">
                {Object.entries(dashboard.statusBreakdown || {}).map(([status, count]) => (
                  <div key={status} className="flex justify-between items-center">
                    <span className="text-xs text-slate-600">{status}</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${status === 'Paid' ? 'bg-blue-100 text-blue-700' : status === 'Ready' ? 'bg-emerald-100 text-emerald-700' : status === 'Preparing' ? 'bg-amber-100 text-amber-700' : status === 'Served' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Live Kitchen & Bar integration panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                  <ChefHat size={18} /> Kitchen (live)
                </div>
                <button onClick={() => navigate('/kitchen')} className="text-xs font-semibold text-emerald-600 hover:underline">Open screen</button>
              </div>
              {kitchenOrders.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-4">No active kitchen orders</div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {kitchenOrders.map((o) => (
                    <div key={o.id} className="flex justify-between items-center border border-slate-100 rounded-lg px-3 py-2 text-sm">
                      <span className="font-semibold text-slate-800">{o.orderNumber}</span>
                      <span className="text-slate-500">Table {o.tableNumber}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.status === 'Ready' ? 'bg-emerald-100 text-emerald-700' : o.status === 'Preparing' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{o.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-purple-700 font-semibold">
                  <GlassWater size={18} /> Bar (live)
                </div>
                <button onClick={() => navigate('/bar')} className="text-xs font-semibold text-purple-600 hover:underline">Open screen</button>
              </div>
              {barOrders.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-4">No active bar orders</div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {barOrders.map((o) => (
                    <div key={o.id} className="flex justify-between items-center border border-slate-100 rounded-lg px-3 py-2 text-sm">
                      <span className="font-semibold text-slate-800">{o.orderNumber}</span>
                      <span className="text-slate-500">Table {o.tableNumber}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.status === 'Ready' ? 'bg-emerald-100 text-emerald-700' : o.status === 'Preparing' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{o.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Column A: New Orders List */}
            <section className="col-span-1 lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900">New Orders</h2>
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{currentStats.newOrders}</span>
              </div>

              <div className="space-y-4">
                {newOrders.length === 0 && <div className="text-sm text-slate-400 text-center py-4">No new orders</div>}
                {newOrders.map((order) => {
                  const badge = getCategoryBadge(order.items || [])
                  const typeColor = order.source === 'qr' ? 'bg-blue-100 text-blue-600 font-bold' : 'bg-emerald-100 text-emerald-700 font-semibold'
                  return (
                    <OrderListItem
                      key={order.id}
                      id={String(order.orderNumber)}
                      type={order.source === 'qr' ? 'QR' : 'WAITER'}
                      typeColor={typeColor}
                      station={order.station || null}
                      table={'Table ' + order.tableNumber}
                      time={order.createdAt}
                      items={(order.items || []).map((item) => ({ name: item.name, qty: item.quantity, price: MONEY(item.price) }))}
                      total={MONEY(order.total)}
                      onView={() => setSelectedOrder(order)}
                      onProcess={() => {}}
                    />
                  )
                })}
              </div>
              <button onClick={() => navigate('/operator/orders')} className="block text-center text-sm font-semibold text-blue-600 hover:text-blue-700 pt-2">View all new orders</button>
            </section>

            {/* Column B: Process Order Details */}
            <section className="col-span-1 lg:col-span-5 space-y-4">
              {selectedOrder ? (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-slate-900 text-lg">Process Order <span className="text-blue-600">{selectedOrder.orderNumber}</span></h2>
                      <span className="bg-blue-100 text-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded">{selectedOrder.source === 'qr' ? 'QR' : 'WAITER'}</span>
                    </div>

                    {(() => {
                      const badge = getCategoryBadge(selectedOrder.items || [])
                      const hasFood = selectedOrder.items.some((i) => !/drink|beer|wine|cocktail|beverage|soft|liquor|spirit/i.test(i.category || ''))
                      const hasDrink = selectedOrder.items.some((i) => /drink|beer|wine|cocktail|beverage|soft|liquor|spirit/i.test(i.category || ''))
                      if (hasFood && hasDrink) {
                        return (
                          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3 flex items-center gap-2 font-medium">
                            <span className="text-amber-500 font-bold text-base leading-none">⚠️</span> This order contains items from multiple categories.
                          </div>
                        )
                      }
                      return null
                    })()}

                    {/* Kitchen sub-order */}
                    {(() => {
                      const foodItems = (selectedOrder.items || []).filter((i) => !/drink|beer|wine|cocktail|beverage|soft|liquor|spirit/i.test(i.category || ''))
                      if (foodItems.length === 0) return null
                      const foodTotal = foodItems.reduce((sum, i) => sum + (i.lineTotal || i.price * i.quantity), 0)
                      return (
                        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                            <div className="p-1 bg-emerald-50 rounded-lg text-emerald-600"><ChefHat size={16} /></div>
                            Food (Kitchen)
                          </div>
                          {foodItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm text-slate-700">
                              <span>{item.name}</span>
                              <span className="text-slate-400">x{item.quantity}</span>
                              <span className="font-medium">{MONEY(item.lineTotal || item.price * item.quantity)}</span>
                            </div>
                          ))}
                          <div className="border-t border-dashed border-slate-200 pt-2 flex justify-between text-sm font-semibold text-slate-900">
                            <span>Total</span><span>{MONEY(foodTotal)}</span>
                          </div>
                           {(selectedOrder.status === 'Open' || selectedOrder.status === 'Paid') && (
                              <button onClick={() => { handleRoute(selectedOrder.id, 'kitchen'); setSelectedOrder(null) }} disabled={selectedOrder.station === 'kitchen' || selectedOrder.station === 'both'} title={selectedOrder.station === 'kitchen' || selectedOrder.station === 'both' ? 'Already sent to Kitchen' : undefined} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm py-2 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed">🚀 Send to Kitchen</button>
                            )}
                        </div>
                      )
                    })()}

                    {/* Bar sub-order */}
                    {(() => {
                      const drinkItems = (selectedOrder.items || []).filter((i) => /drink|beer|wine|cocktail|beverage|soft|liquor|spirit/i.test(i.category || ''))
                      if (drinkItems.length === 0) return null
                      const drinkTotal = drinkItems.reduce((sum, i) => sum + (i.lineTotal || i.price * i.quantity), 0)
                      return (
                        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                          <div className="flex items-center gap-2 text-purple-700 font-semibold text-sm">
                            <div className="p-1 bg-purple-50 rounded-lg text-purple-600"><GlassWater size={16} /></div>
                            Drinks (Bar)
                          </div>
                          {drinkItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm text-slate-700">
                              <span>{item.name}</span>
                              <span className="text-slate-400">x{item.quantity}</span>
                              <span className="font-medium">{MONEY(item.lineTotal || item.price * item.quantity)}</span>
                            </div>
                          ))}
                          <div className="border-t border-dashed border-slate-200 pt-2 flex justify-between text-sm font-semibold text-slate-900">
                            <span>Total</span><span>{MONEY(drinkTotal)}</span>
                          </div>
                           {(selectedOrder.status === 'Open' || selectedOrder.status === 'Paid') && (
                              <button onClick={() => { handleRoute(selectedOrder.id, 'bar'); setSelectedOrder(null) }} disabled={selectedOrder.station === 'bar' || selectedOrder.station === 'both'} title={selectedOrder.station === 'bar' || selectedOrder.station === 'both' ? 'Already sent to Bar' : undefined} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm py-2 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed">🚀 Send to Bar</button>
                            )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Order Summary */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                    <h3 className="font-bold text-slate-900 text-sm">Order Summary</h3>
                    <div className="divide-y divide-slate-100 text-sm">
                      <div className="py-2.5 flex justify-between"><span className="text-slate-500">Order Number</span><span className="font-semibold text-slate-800">{selectedOrder.orderNumber}</span></div>
                      <div className="py-2.5 flex justify-between"><span className="text-slate-500">Source</span><span className="font-semibold text-slate-800">{selectedOrder.source === 'qr' ? 'QR Code' : 'Waiter'}</span></div>
                      <div className="py-2.5 flex justify-between"><span className="text-slate-500">Table</span><span className="font-semibold text-slate-800">Table {selectedOrder.tableNumber}</span></div>
                      <div className="py-2.5 flex justify-between"><span className="text-slate-500">Time</span><span className="font-semibold text-slate-800">{selectedOrder.createdAt}</span></div>
                    </div>
                    <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                      <span className="font-bold text-slate-900">Grand Total</span>
                      <span className="font-bold text-slate-900 text-lg">{MONEY(selectedOrder.total)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-center text-slate-400 text-sm">
                  Select an order to view details
                </div>
              )}
            </section>

            {/* Column C: Receipt & Utilities */}
            <section className="col-span-1 lg:col-span-3 space-y-4">
              {selectedOrder && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 relative overflow-x-auto">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-slate-900">Receipt Preview</span>
                    <span className="text-blue-600">{selectedOrder.orderNumber}</span>
                  </div>

                  <div className="text-center pt-2">
                    <h2 className="font-black text-slate-900 tracking-wide text-base">{dashboard.businessName}</h2>
                    <p className="text-xs text-slate-500 font-medium">Kigali Bar & Lounge</p>
                  </div>

                  <div className="border-t border-b border-dashed border-slate-300 py-2 grid grid-cols-1 sm:grid-cols-2 gap-y-1 text-[11px] text-slate-600">
                    <div>Order No : <span className="font-semibold text-slate-900">{selectedOrder.orderNumber}</span></div>
                    <div className="text-right">Date : <span className="font-semibold text-slate-900">{new Date().toLocaleDateString()}</span></div>
                    <div>Table : <span className="font-semibold text-slate-900">{selectedOrder.tableNumber}</span></div>
                    <div className="text-right">Time : <span className="font-semibold text-slate-900">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
                  </div>

                  <table className="w-full text-left text-[11px] text-slate-600">
                    <thead>
                      <tr className="border-b border-slate-200 font-bold text-slate-800">
                        <th className="pb-1">Item</th>
                        <th className="pb-1 text-center">Qty</th>
                        <th className="pb-1 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedOrder.items || []).map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 font-medium text-slate-800">{item.name}</td>
                          <td className="text-center">{item.quantity}</td>
                          <td className="text-right">{MONEY(item.lineTotal || item.price * item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="border-t-2 border-slate-900 pt-2 flex justify-between text-xs font-bold text-slate-900">
                    <span>TOTAL</span>
                    <span>{MONEY(selectedOrder.total)} RWF</span>
                  </div>

                  <div className="border-t border-dashed border-slate-300 pt-4 text-center space-y-2">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Scan QR to Pay</p>
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-16 h-16 bg-slate-900 rounded p-1 flex items-center justify-center">
                        <div className="w-full h-full bg-white flex flex-wrap p-0.5">
                          <div className="w-1/2 h-1/2 border-2 border-slate-900"></div>
                          <div className="w-1/2 h-1/2 bg-slate-900 border-2 border-white"></div>
                          <div className="w-1/2 h-1/2 bg-slate-900 border border-white"></div>
                          <div className="w-1/2 h-1/2 border-2 border-slate-900"></div>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 font-medium">or</span>
                      <div className="text-left">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Payment Code</p>
                        <p className="text-base font-black text-slate-950 tracking-wide">{generatePaymentCode(selectedOrder)}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold pt-1">Thank you!</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button onClick={() => handlePrintDraft(selectedOrder)} className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 py-2 rounded-lg shadow-sm hover:bg-slate-50"><Printer size={14} /> Reprint</button>
                    <button className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 py-2 rounded-lg shadow-sm hover:bg-slate-50"><Share2 size={14} /> Share</button>
                  </div>
                </div>
              )}

              {/* Order Stepper */}
              {selectedOrder && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                  <h3 className="font-bold text-slate-900 text-sm">Order Status</h3>
                  <div className="flex items-center justify-between px-2 relative">
                    <StepIcon active={true} icon={<CheckCircle2 size={16} />} title="Received" subtitle={selectedOrder.createdAt?.split(' ')[1] || ''} done={true} />
                    <StepLine active={selectedOrder.status === 'Preparing' || selectedOrder.status === 'Ready'} />
                    <StepIcon active={selectedOrder.status === 'Preparing' || selectedOrder.status === 'Ready'} icon={<ChefHat size={16} />} title="Kitchen" subtitle={selectedOrder.status === 'Preparing' ? 'Preparing' : 'Pending'} done={selectedOrder.status === 'Ready'} />
                    <StepLine active={selectedOrder.status === 'Ready'} />
                    <StepIcon active={selectedOrder.status === 'Ready'} icon={<GlassWater size={16} />} title="Bar" subtitle={selectedOrder.status === 'Ready' ? 'Ready' : 'Pending'} done={false} />
                    <StepLine active={false} />
                    <StepIcon active={false} icon={<Clock size={16} />} title="Ready" subtitle="Pending" done={false} />
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <h3 className="font-bold text-slate-900 text-sm">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  <QuickActionButton icon={<ChefHat size={16} className="text-emerald-600" />} label="View Kitchen Screen" onClick={() => navigate('/kitchen')} />
                  <QuickActionButton icon={<GlassWater size={16} className="text-purple-600" />} label="View Bar Screen" onClick={() => navigate('/bar')} />
                  <QuickActionButton icon={<Users size={16} className="text-blue-600" />} label="Call Waiter" onClick={() => navigate('/notifications')} />
                  <QuickActionButton icon={<LayoutDashboard size={16} className="text-slate-600" />} label="All Tables" onClick={async () => { const d = await fetchQRCodes(); setQrCodes(d); setQrOpen(true) }} />
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* QR Modal */}
      {qrOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => setQrOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Table QR Codes</h2>
              <button onClick={() => setQrOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {qrCodes.map((qr) => (
                  <div key={`${qr.branchName}-${qr.tableNumber}`} className="border border-slate-200 rounded-lg p-4 flex flex-col items-center gap-3">
                    <QRCode value={qr.url} size={160} level="M" />
                    <div className="text-center">
                      <strong className="block text-sm">Table {qr.tableNumber}</strong>
                      <span className="text-xs text-slate-500">{qr.branchName}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
                  <Printer size={16} /> Print All QR Codes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
