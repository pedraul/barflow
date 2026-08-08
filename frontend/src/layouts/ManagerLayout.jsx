import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import {
  LayoutDashboard, ShoppingBag, ChefHat, CheckCircle2, BarChart3,
  FileText, Printer, Utensils, GlassWater,
  FileSpreadsheet, Bell, User, ArrowLeftRight, TrendingUp, Settings, LogOut, Wallet
} from 'lucide-react'
import { SidebarLink } from '../components/ui/SharedComponents'

const MANAGER_LINKS = [
  { section: 'Manager', items: [
    { path: '/manager/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  ]},
  { section: 'Order Management', items: [
    { path: '/manager/orders', label: 'Orders', icon: <ShoppingBag size={18} /> },
    { path: '/manager/bar-menu', label: 'Bar menu', icon: <GlassWater size={18} /> },
    { path: '/manager/kitchen-menu', label: 'Kitchen menu', icon: <ChefHat size={18} /> },
  ]},
  { section: 'Finance', items: [
    { path: '/manager/transfer/transfers', label: 'Approve Transfers', icon: <CheckCircle2 size={18} /> },
    { path: '/manager/withdrawals', label: 'Approve Withdrawals', icon: <Wallet size={18} /> },
    { path: '/manager/transfer/refunds', label: 'Refunds', icon: <FileText size={18} /> },
    { path: '/manager/transfer/payrolls', label: 'Payrolls', icon: <FileText size={18} /> },
  ]},
  { section: 'Reports', items: [
    { path: '/manager/reports', label: 'Reports', icon: <FileSpreadsheet size={18} /> },
    { path: '/manager/revenue', label: 'Revenue', icon: <TrendingUp size={18} /> },
  ]},
  { section: 'Other', items: [
    { path: '/manager/settings', label: 'System settings', icon: <Settings size={18} />, perm: 'canManageSettings' },
    { path: '/notifications', label: 'Chats', icon: <Bell size={18} /> },
    { path: '/account', label: 'My account', icon: <User size={18} /> },
  ]},
]

export default function ManagerLayout({ children }) {
  const navigate = useNavigate()
  const { logout, permissions } = useAuth()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      <nav className="flex-1 p-4 space-y-6 text-sm">
        {MANAGER_LINKS.map((section) => (
          <div key={section.section}>
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{section.section}</p>
            <div className="space-y-1">
              {section.items.filter((item) => !item.perm || permissions[item.perm]).map((item) => (
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
