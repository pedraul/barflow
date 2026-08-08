import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOwner } from '../context/OwnerContext'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, CreditCard, Smartphone, ArrowLeftRight, Users,
  TrendingUp, QrCode, UserCheck, FileText, Settings, LogOut, MessageSquare
} from 'lucide-react'
import { SidebarLink } from '../components/ui/SharedComponents'

const OWNER_LINKS = [
  { section: 'Overview', items: [
    { path: '/dashboard/owner', label: 'Dashboard', icon: <LayoutDashboard size={18} />, perm: null },
  ]},
  { section: 'Orders', items: [
    { path: '/owner/qr-orders', label: 'QR Orders', icon: <QrCode size={18} />, perm: null },
    { path: '/owner/waiter-orders', label: 'Waiter Orders', icon: <UserCheck size={18} />, perm: null },
  ]},
  { section: 'Finance', items: [
    { path: '/owner/withdraw', label: 'Withdraw', icon: <Smartphone size={18} />, perm: 'canWithdraw' },
    { path: '/owner/transfer', label: 'Transfer', icon: <ArrowLeftRight size={18} />, perm: 'canTransfer' },
    { path: '/owner/revenue', label: 'Revenue', icon: <TrendingUp size={18} />, perm: 'canViewRevenue' },
  ]},
  { section: 'Users & Access', items: [
    { path: '/owner/users', label: 'Users', icon: <Users size={18} />, perm: 'canManageUsers' },
  ]},
  { section: 'Reports & Logs', items: [
    // Audit logs moved into System Settings
  ]},
  { section: 'Settings', items: [
    { path: '/owner/subscription', label: 'Subscription', icon: <CreditCard size={18} />, perm: null },
    { path: '/settings', label: 'System Settings', icon: <Settings size={18} />, perm: 'canManageSettings', newWindow: true },
  ]},
  { section: 'Other', items: [
    { path: '/notifications', label: 'Chats', icon: <MessageSquare size={18} />, perm: null },
  ]},
]

const ALLOWED_WITHOUT_SUBSCRIPTION = ['/owner/subscription', '/owner/renew', '/subscription-expired']

export default function OwnerLayout({ children }) {
  const { user, logout, permissions } = useAuth()
  const { fetchSubscription } = useOwner()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const [hasActiveSubscription, setHasActiveSubscription] = useState(true)
  const [blocked, setBlocked] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    const check = async () => {
      try {
        const sub = await fetchSubscription()
        if (!active) return
        const activeSub = !!(sub && sub.isActive)
        setHasActiveSubscription(activeSub)
        const allowed = ALLOWED_WITHOUT_SUBSCRIPTION.some((p) => pathname.startsWith(p))
        const isBlocked = !activeSub && !allowed
        setBlocked(isBlocked)
        if (isBlocked) navigate('/owner/subscription', { replace: true })
      } catch (e) {
        if (active) { setHasActiveSubscription(true); setBlocked(false) }
      } finally {
        if (active) setChecking(false)
      }
    }
    check()
    return () => { active = false }
  }, [pathname, fetchSubscription, navigate])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const activeItem = OWNER_LINKS.flatMap(s => s.items).find((item) => {
    if (item.path === '/dashboard/owner') return pathname === '/dashboard/owner'
    return pathname.startsWith(item.path)
  })

  const navLinks = (
    <nav className="p-4 space-y-6 text-sm" aria-label="Owner navigation">
      {OWNER_LINKS.map((section) => {
        const visibleItems = section.items.filter((item) => {
          if (user?.role === 'owner') return true
          return !item.perm || permissions[item.perm]
        })
        if (section.section === 'Other') {
          visibleItems.push({ label: 'Logout', icon: <LogOut size={18} />, onClick: handleLogout })
        }
        if (!visibleItems.length) return null
        return (
          <div key={section.section}>
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{section.section}</p>
            <div className="space-y-1">
              {visibleItems.map((item) => {
                const allowed = ALLOWED_WITHOUT_SUBSCRIPTION.includes(item.path) || hasActiveSubscription
                const isActive = activeItem?.path === item.path
                return (
                  <SidebarLink
                    key={item.path || item.label}
                    icon={item.icon}
                    label={item.label}
                    active={isActive}
                    onClick={() => {
                      if (item.onClick) {
                        item.onClick()
                      } else if (item.newWindow) {
                        window.open(window.location.origin + item.path, '_blank', 'noopener,noreferrer')
                      } else {
                        navigate(item.path)
                      }
                    }}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
  )

  if (checking) {
    return (
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-4)' }}>Checking subscription status…</main>
      </div>
    )
  }

  const dashboardPaths = new Set(['/dashboard/owner', '/dashboard'])
  const showSidebar = dashboardPaths.has(pathname)

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex flex-1">
        {showSidebar && (
          <aside className="w-64 bg-[#0B132B] text-slate-400 flex flex-col shrink-0 sticky top-0 h-screen">
            <div className="flex-1">
              <div className="p-4 flex items-center justify-between">
                <span className="text-sm font-bold text-white">BarFlow</span>
              </div>
              {navLinks}
            </div>
          </aside>
        )}

        <div className="flex-1 flex flex-col">
          {!hasActiveSubscription && (
            <div className="subscription-notice" style={{ borderRadius: 0, color: 'var(--warning-text)', background: 'var(--warning-bg)', borderColor: '#fde68a' }}>
              ⚠ Your subscription is inactive. System features are locked. Please renew your plan to continue.
            </div>
          )}

          <main className="flex-1">
            {blocked ? (
              <div className="subscription-lock">
                <h1>🔒 Feature locked</h1>
                <p>This section requires an active subscription. Renew your plan to unlock it.</p>
                <Link to="/login">Back to Login</Link>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
