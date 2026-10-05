import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import {
  GlassWater, User, MessageSquare, LogOut
} from 'lucide-react'
import { SidebarLink } from '../components/ui/SharedComponents'

const BAR_LINKS = [
  { section: 'Bar', items: [
    { path: '/bar', label: 'Bar display', icon: <GlassWater size={18} /> },
  ]},
  { section: 'Other', items: [
    { path: '/account', label: 'My account', icon: <User size={18} /> },
    { path: '/notifications', label: 'Chats', icon: <MessageSquare size={18} /> },
  ]},
]

export default function BarLayout({ children }) {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      <nav className="flex-1 overflow-y-auto p-4 space-y-6 text-sm">
        {BAR_LINKS.map((section) => (
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
      <div className="p-4 mt-auto">
        <button type="button" className="sidebar-link sidebar-logout" onClick={handleLogout}>
          <LogOut size={18} /> Logout
        </button>
      </div>
    </div>
  )

  return <Layout sidebar={sidebar}>{children}</Layout>
}
