import React from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  LayoutDashboard, ShoppingBag, Plus, ClipboardList, User, LogOut, MessageSquare, History, DollarSign
} from 'lucide-react'
import { SidebarLink } from '../components/ui/SharedComponents'
import { useAuth } from '../context/AuthContext'

const WAITER_LINKS = [
  { section: 'Waiter', items: [
    { path: '/waiter/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { path: '/notifications', label: 'Chats', icon: <MessageSquare size={18} /> },
  ]},
  { section: 'Orders', items: [
    { path: '/waiter/new-order', label: 'Bar menu', icon: <Plus size={18} /> },
    { path: '/waiter/cart', label: 'My cart', icon: <ShoppingBag size={18} /> },
    { path: '/waiter/unpaid-orders', label: 'Unpaid orders', icon: <DollarSign size={18} /> },
    { path: '/waiter/orders', label: 'Ready orders pickup', icon: <ClipboardList size={18} /> },
    { path: '/waiter/order-history', label: 'Order history', icon: <History size={18} /> },
  ]},
  { section: 'Other', items: [
    { path: '/account', label: 'My account', icon: <User size={18} /> },
  ]},
]

export default function WaiterLayout({ children }) {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      <nav className="flex-1 p-4 space-y-6 text-sm">
        {WAITER_LINKS.map((section) => (
          <div key={section.section}>
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{section.section}</p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <SidebarLink key={item.path} icon={item.icon} label={item.label} onClick={() => navigate(item.path)} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-4">
        <button type="button" className="sidebar-link sidebar-logout" onClick={handleLogout}>
          <LogOut size={18} /> Logout
        </button>
      </div>
    </div>
  )

  return <Layout sidebar={sidebar}>{children}</Layout>
}
