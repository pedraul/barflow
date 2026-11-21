import React, { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOwner } from '../context/OwnerContext'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, CreditCard, Smartphone, ArrowLeftRight, Users,
  TrendingUp, QrCode, UserCheck, FileText, Settings, LogOut, ArrowLeft, Clock, ShieldCheck, Package
} from 'lucide-react'
import { SidebarLink } from '../components/ui/SharedComponents'
import BranchBadge from '../components/BranchBadge'
import BackButton from '../components/BackButton'
import { usePreferences } from '../context/PreferencesContext'

const OWNER_LINKS = [
  { section: 'Overview', items: [
    { path: '/owner/', label: 'Dashboard', icon: <LayoutDashboard size={18} />, perm: null },
  ]},
  { section: 'Orders', items: [
    { path: '/owner/qr-orders', label: 'QR Orders', icon: <QrCode size={18} />, perm: null },
    { path: '/owner/table-qr', label: 'Tables & QR Codes', icon: <QrCode size={18} />, perm: null },
    { path: '/owner/waiter-orders', label: 'Waiter Orders', icon: <UserCheck size={18} />, perm: null },
  ]},
  { section: 'Finance', items: [
    { path: '/owner/withdraw', label: 'Withdraw', icon: <Smartphone size={18} />, perm: 'canWithdraw' },
    { path: '/owner/transfer', label: 'Transfer', icon: <ArrowLeftRight size={18} />, perm: 'canTransfer' },
    { path: '/owner/revenue', label: 'Revenue', icon: <TrendingUp size={18} />, perm: 'canViewRevenue' },
    { path: '/owner/stock', label: 'Stock & Value', icon: <Package size={18} />, perm: null },
  ]},
  { section: 'Users & Access', items: [
    { path: '/owner/users', label: 'Users', icon: <Users size={18} />, perm: 'canManageUsers' },
    { path: '/owner/shifts', label: 'Shifts & performance', icon: <Clock size={18} />, perm: null },
    { path: '/owner/access', label: 'Staff access', icon: <ShieldCheck size={18} />, perm: null },
  ]},
  { section: 'Reports & Logs', items: [
    // Audit logs moved into System Settings
  ]},
  { section: 'Settings', items: [
    { path: '/owner/subscription', label: 'Subscription', icon: <CreditCard size={18} />, perm: null },
    { path: '/settings', label: 'System Settings', icon: <Settings size={18} />, perm: 'canManageSettings', newWindow: true },
  ]},
]

const ALLOWED_WITHOUT_SUBSCRIPTION = ['/owner/subscription', '/owner/renew', '/subscription-expired']

export default function OwnerLayout({ children }) {
  const { user, logout, permissions, updateUser } = useAuth()
  const { fetchSubscription, fetchBranches, setActiveBranchId } = useOwner()
  const { t } = usePreferences()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Navigating anywhere collapses the menu so only the chosen page is shown.
  useEffect(() => { setMobileMenuOpen(false) }, [pathname])
  const [branchError, setBranchError] = useState('')

  useEffect(() => {
    if (String(user?.role || '').toLowerCase() !== 'owner') return undefined
    let active = true
    fetchBranches()
      .then((loadedBranches) => {
        if (!active) return
        const selectedBranchId = localStorage.getItem('barflow.activeBranchId')
        if (
          selectedBranchId &&
          selectedBranchId !== 'all' &&
          !loadedBranches.some((branch) => String(branch.id) === selectedBranchId && branch.isActive !== false)
        ) {
          setActiveBranchId('all')
        }
        setBranchError('')
      })
      .catch((error) => {
        if (!active) return
        console.error('Failed to load owner branches:', error)
        setBranchError('Unable to load branch options. Refresh the page or try again later.')
      })
    return () => { active = false }
  }, [user?.role, fetchBranches, setActiveBranchId])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const [hasActiveSubscription, setHasActiveSubscription] = useState(true)
  const [blocked, setBlocked] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    const check = async () => {
      try {
        const sub = await fetchSubscription({ forceRefresh: true })
        if (!active) return
        const activeSub = !!(sub && sub.isActive)
        const unpaidAccessGranted = sub?.unpaidAccessGranted === true
        const businessVerified = sub?.businessVerified === true
        const hasBusinessAccess = activeSub || unpaidAccessGranted || businessVerified
        const subscriptionExpired = !hasBusinessAccess
        if (user?.unpaidAccessGranted !== unpaidAccessGranted || user?.businessVerified !== businessVerified || user?.subscriptionExpired !== subscriptionExpired) {
          updateUser({ unpaidAccessGranted, businessVerified, subscriptionExpired })
        }
        setHasActiveSubscription(hasBusinessAccess)
        const allowed = ALLOWED_WITHOUT_SUBSCRIPTION.some((p) => pathname.startsWith(p))
        const isBlocked = !hasBusinessAccess && !allowed
        setBlocked(isBlocked)
        if (isBlocked) navigate('/owner/subscription', { replace: true })
      } catch (e) {
        if (active) { setHasActiveSubscription(true); setBlocked(false) }
      } finally {
        if (active) setChecking(false)
      }
    }
    check()
    const interval = window.setInterval(check, 15_000)
    window.addEventListener('focus', check)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', check)
    }
  }, [pathname, fetchSubscription, navigate, updateUser, user?.unpaidAccessGranted, user?.businessVerified, user?.subscriptionExpired])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const activeItem = OWNER_LINKS.flatMap(s => s.items).find((item) => {
    if (item.path === '/owner/') return pathname === '/owner' || pathname === '/owner/'
    return pathname.startsWith(item.path)
  })

  const navLinks = (
    <nav className="p-4 space-y-6 text-sm" aria-label={t('Owner navigation')}>
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
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t(section.section)}</p>
            <div className="space-y-1">
              {visibleItems.map((item) => {
                const allowed = ALLOWED_WITHOUT_SUBSCRIPTION.includes(item.path) || hasActiveSubscription
                const isActive = activeItem?.path === item.path
                return (
                  <SidebarLink
                    key={item.path || item.label}
                    icon={item.icon}
                    label={t(item.label)}
                    active={isActive}
                    onClick={() => {
                      if (item.onClick) {
                        item.onClick()
                      } else if (item.newWindow) {
                        window.open(window.location.origin + item.path, '_blank', 'noopener,noreferrer')
                      } else {
                        navigate(item.path)
                      }
                      setMobileMenuOpen(false)
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
        <main className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-4)' }}>{t('Checking subscription status…')}</main>
      </div>
    )
  }

  const isOwnerPath = pathname.startsWith('/owner') || pathname.startsWith('/dashboard/owner') || pathname.startsWith('/settings')
  const standalonePaths = ['/settings', '/owner/subscription']
  const isStandalone = standalonePaths.some((p) => pathname.startsWith(p))
  const showSidebar = isOwnerPath && !isStandalone

  return (
    <div className="flex flex-col min-h-screen">
      {showSidebar && (
        <>
          {/* Mobile overlay */}
          {mobileMenuOpen && (
            <div
              className="sidebar-overlay"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          {/* Top bar (phone and computer): menu toggle + back button */}
          <header className="mobile-topbar app-topbar">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={t('Toggle navigation')}
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
            <BackButton fallback="/owner" />
            <div className="mobile-brand">{t('BarFlow')}</div>
            <BranchBadge />
            <button type="button" className="mobile-logout-btn" onClick={handleLogout} title={t('Logout')} style={{ marginLeft: 'auto' }}>{t('Logout')}</button>
          </header>
        </>
      )}

      <div className="flex flex-1">
        {/* Collapsible navigation drawer (all screen sizes) */}
        {showSidebar && (
          <aside
            className={`owner-sidebar-mobile ${mobileMenuOpen ? 'owner-sidebar-open' : ''}`}
            onClick={(event) => {
              if (event.target.closest('button, a')) setMobileMenuOpen(false)
            }}
          >
            <div className="flex-1">
              <div className="p-4 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">{t('BarFlow')}</span>
                <BranchBadge />
              </div>
              {navLinks}
            </div>
            <div className="p-4 border-t border-slate-800">
              <button type="button" className="sidebar-link sidebar-logout w-full" onClick={handleLogout}>
                <LogOut size={18} /> {t('Logout')}
              </button>
            </div>
          </aside>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {branchError && (
            <div className="px-4 py-2 text-sm text-red-800 bg-red-50 border-b border-red-200" role="alert">
              {branchError}
            </div>
          )}
          {!hasActiveSubscription && user?.unpaidAccessGranted !== true && (
            <div className="subscription-notice" style={{ borderRadius: 0, color: 'var(--warning-text)', background: 'var(--warning-bg)', borderColor: '#fde68a' }}>
              {t('⚠ Your subscription is inactive. System features are locked. Please renew your plan to continue.')}
            </div>
          )}

          <main className="flex-1">
            {blocked ? (
              <div className="subscription-lock">
                <h1>{t('🔒 Feature locked')}</h1>
                <p>{t('This section requires an active subscription. Renew your plan to unlock it.')}</p>
                <Link to="/login">{t('Back to Login')}</Link>
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
