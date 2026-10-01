import React from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  LayoutDashboard, ShoppingBag, CheckCircle2, BarChart3,
  FileText, User, ArrowLeftRight, TrendingUp,
  Scale, Receipt, RotateCcw, DollarSign, Settings, LogOut, MessageSquare, QrCode
} from 'lucide-react'
import { SidebarLink } from '../components/ui/SharedComponents'
import { useAuth } from '../context/AuthContext'

const ACCOUNTANT_LINKS = [
  { section: 'Main', items: [
    { path: '/accountant/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { path: '/accountant/reconciliations', label: 'Reconciliation', icon: <Scale size={18} /> },
    { path: '/accountant/qr', label: 'QR Orders', icon: <QrCode size={18} /> },
  ]},
  { section: 'Operations', items: [
    { path: '/accountant/orders', label: 'Orders', icon: <ShoppingBag size={18} /> },
    { path: '/accountant/sales-revenue', label: 'Sales & Revenue', icon: <TrendingUp size={18} /> },
    { path: '/accountant/payments', label: 'Payments', icon: <Receipt size={18} /> },
    { path: '/accountant/refunds', label: 'Refunds', icon: <RotateCcw size={18} /> },
  ]},
  { section: 'Finance', items: [
    { path: '/accountant/salary', label: 'Payroll', icon: <DollarSign size={18} /> },
    { path: '/accountant/transfers', label: 'Transfers', icon: <ArrowLeftRight size={18} /> },
    { path: '/accountant/profit', label: 'Profit & Revenue', icon: <TrendingUp size={18} /> },
    { path: '/accountant/taxes', label: 'Taxes', icon: <FileText size={18} /> },
    { path: '/accountant/reports', label: 'Reports', icon: <BarChart3 size={18} /> },
  ]},
  { section: 'Other', items: [
    { path: '/accountant/settings', label: 'System settings', icon: <Settings size={18} />, perm: 'canManageSettings' },
    { path: '/account', label: 'My account', icon: <User size={18} /> },
  ]},
]

export default function AccountantLayout({ children }) {
  const navigate = useNavigate()
  const { logout, permissions } = useAuth()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const sidebar = (
    <div className="flex flex-col h-full accountant-sidebar">
      <nav className="p-4 space-y-6 text-sm flex-1">
        {ACCOUNTANT_LINKS.map((section) => (
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

  return <Layout sidebar={sidebar} logoutButton={
    <button type="button" className="mobile-logout-btn" onClick={handleLogout} title="Logout">
      <LogOut size={20} />
    </button>
  }>{children}</Layout>
}
