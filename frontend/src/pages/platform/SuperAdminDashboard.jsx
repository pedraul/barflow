import React, { useEffect, useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { LayoutDashboard, Briefcase, PlusCircle, RefreshCw, CreditCard, Users, BarChart3, Settings, LogOut, Menu, HardDriveDownload, X, ScrollText } from 'lucide-react'
import { fetchPlatformStats, fetchBusinesses, fetchPlatformReports, createAdmin, fetchPlatformMe, fetchPlatformHealth } from '../../api/endpoints'
import { adminCan, PAGE_MODULES, PLATFORM_MODULES } from './adminAccess'
import ActivityLog from './ActivityLog'
import { useToast } from '../../context/ToastContext'
import { usePreferences, stripIcons } from '../../context/PreferencesContext'

const CURRENCY = 'RWF'
const formatCurr = (v) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0 }).format(v || 0)
const PERMISSION_LABELS = {
  businesses: 'Businesses',
  subscriptions: 'Subscriptions',
  payments: 'Payments',
  users: 'Users',
  reports: 'Reports',
  settings: 'Settings',
  backup: 'Backup',
}
import BusinessList from './BusinessList'
import SubscriptionPlans from './SubscriptionPlans'
import RegisterBusiness from './RegisterBusiness'
import Payments from './Payments'
import UsersPage from './Users'
import Reports from './Reports'
import PlatformSettings from './Settings'
import BackupRestore from './BackupRestore'

export default function SuperAdminDashboard() {
  const { user, logout, updateUser } = useAuth()
  const { t } = usePreferences()
  const { showSuccess } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [stats, setStats] = useState(null)
  const [businesses, setBusinesses] = useState([])
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const can = (...modules) => adminCan(user, ...modules)
  const isSuper = user?.role === 'super_admin'
  const [viewing, setViewing] = useState(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminForm, setAdminForm] = useState({ name: '', email: '', phone: '', password: '', role: 'admin', permissions: ['businesses', 'subscriptions', 'payments', 'reports'] })
  const [adminSaving, setAdminSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [adminMsg, setAdminMsg] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!user?.isPlatformAdmin) {
      navigate('/login')
      return
    }
    load()
  }, [])

  const loadHealth = () => fetchPlatformHealth().then(setHealth).catch(() => setHealth({ failed: true }))

  const load = async () => {
    setLoading(true)
    setLoadError('')
    try {
      // Role and permissions can change while signed in: always use the server's current view.
      let me = user
      try {
        me = await fetchPlatformMe()
        updateUser({ role: me.role, permissions: me.permissions, name: me.name, email: me.email, phone: me.phone })
      } catch (e) {
        if (e.response?.status === 401 || e.response?.status === 403) throw e
      }
      const [s, b] = await Promise.all([
        fetchPlatformStats(),
        adminCan(me, 'businesses', 'subscriptions', 'payments') ? fetchBusinesses() : Promise.resolve([]),
      ])
      setStats(s)
      setBusinesses(b)
      loadHealth()
    } catch (e) {
      console.error('Failed to load admin data:', e)
      setLoadError(e.response?.data?.error || e.message || t('Failed to load dashboard data.'))
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch (e) {
      console.error('Logout failed:', e)
    }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    localStorage.removeItem('auth_permissions')
    navigate('/login')
  }

  const handleBack = () => {
    if (location.pathname === '/admin/settings' || location.pathname.startsWith('/admin/settings/')) {
      navigate('/admin/dashboard')
      return
    }
    navigate(-1)
  }

  const handleCreateAdmin = async () => {
    if (!adminForm.name.trim() || !adminForm.email.trim() || !adminForm.password.trim()) {
      setAdminMsg(`❌ ${t('Name, email and password are required.')}`)
      return
    }
    setAdminSaving(true)
    setAdminMsg('')
    try {
      await createAdmin({ name: adminForm.name, email: adminForm.email, phone: adminForm.phone, password: adminForm.password, role: adminForm.role, permissions: adminForm.role === 'super_admin' ? PLATFORM_MODULES : adminForm.permissions.filter((p) => can(p)) })
      showSuccess(t('Changes saved successfully.'))
      setAdminForm({ name: '', email: '', phone: '', password: '', role: 'admin', permissions: ['businesses', 'subscriptions', 'payments', 'reports'] })
      setAdminOpen(false)
    } catch (e) {
      setAdminMsg('❌ ' + (e.response?.data?.error || e.message || t('Failed to create admin.')))
    } finally {
      setAdminSaving(false)
    }
  }

  const handleExportReports = async () => {
    setExporting(true)
    try {
      const [r, s] = await Promise.all([can('reports') ? fetchPlatformReports() : Promise.resolve({}), fetchPlatformStats()])
      const rows = [
        [t('Metric'), t('Value')],
        [t('Total Businesses'), s?.totalBusinesses ?? 0],
        [t('Verified Businesses'), s?.verifiedBusinesses ?? 0],
        [t('Suspended Businesses'), s?.suspendedBusinesses ?? 0],
        [t('Active Subscriptions'), s?.activeSubscriptions ?? 0],
        [t('Expired Subscriptions'), s?.expiredSubscriptions ?? 0],
        [t('New Registrations (period)'), (r?.growth || []).reduce((sum, g) => sum + g.registrations, 0)],
        [t('Income This Month'), r?.income?.thisMonth ?? 0],
        [t('Income This Year'), r?.income?.thisYear ?? 0],
        [t('Income All Time'), r?.income?.allTime ?? 0],
      ]
      const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
      const csv = rows.map((r2) => r2.map(cell).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `platform_reports_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed:', e)
      alert(e.response?.data?.error || t('Export failed.'))
    } finally {
      setExporting(false)
    }
  }

  const total = Number(stats?.totalBusinesses || 0)
  const verified = Number(stats?.verifiedBusinesses || 0)
  const suspended = Number(stats?.suspendedBusinesses || 0)
  const activeSubs = Number(stats?.activeSubscriptions || 0)
  const expiredSubs = Number(stats?.expiredSubscriptions || 0)
  const pendingVerification = Number(stats?.pendingVerification ?? Math.max(0, total - verified - suspended))
  const expiringSoon = Number(stats?.expiringSoon || 0)

  const metrics = [
    { title: t('Total Businesses'), value: String(total), trend: `${verified} ${t('verified')}`, trendType: 'up', bg: 'bg-indigo-50', to: '/admin/businesses' },
    { title: t('Active Subscriptions'), value: String(activeSubs), trend: t('Currently active'), trendType: 'up', bg: 'bg-emerald-50', to: '/admin/businesses?status=active' },
    { title: t('Expired Subscriptions'), value: String(expiredSubs), trend: t('Needs attention'), trendType: 'down', bg: 'bg-rose-50', to: '/admin/businesses?status=subscription%20inactive' },
    { title: t('Awaiting Verification'), value: String(pendingVerification), trend: t('Needs your review'), trendType: 'neutral', bg: 'bg-amber-50', to: '/admin/businesses?status=pending' },
    { title: t('Suspended Businesses'), value: String(suspended), trend: t('Currently suspended'), trendType: 'neutral', bg: 'bg-red-50', to: '/admin/businesses?status=suspended' },
    { title: t('Expiring in 7 Days'), value: String(expiringSoon), trend: t('Action required'), trendType: 'neutral', bg: 'bg-blue-50', to: '/admin/plans' },
    { title: t('Revenue This Month'), value: formatCurr(stats?.monthlyRevenue), trend: t('Paid and settled'), trendType: 'up', bg: 'bg-emerald-50', to: can('payments') ? '/admin/payments' : '/admin/reports' },
    { title: t('Business Staff Accounts'), value: String(stats?.totalUsers ?? 0), trend: `${stats?.totalAdmins ?? 0} ${t('active platform admins')}`, trendType: 'neutral', bg: 'bg-slate-50', to: '/admin/businesses' },
  ].filter((m) => {
    const needed = PAGE_MODULES[m.to.split('?')[0]]
    return !needed || can(...needed)
  })

  const getStatus = (b) => {
    if (b.isSuspended || b.isDeactivated) return 'Suspended'
    if (!b.isVerified) return 'Pending'
    // Business was verified before but its renewed subscription is still pending admin verification
    if (b.subPaymentStatus === 'pending') return 'Pending'
    return 'Active'
  }
  const getStatusColor = (status) =>
    status === 'Active' ? 'bg-emerald-500' : status === 'Expired' || status === 'Suspended' ? 'bg-rose-500' : 'bg-amber-500'
  const getPlanBg = (plan) => {
    if (plan === 'Annual') return 'bg-blue-50 text-blue-600 border border-blue-200'
    if (plan === 'Quarterly') return 'bg-amber-50 text-amber-600 border border-amber-200'
    return 'bg-purple-50 text-purple-600 border border-purple-200'
  }
  const getAction = (status) => (status === 'Active' || !can('businesses') ? 'View' : status === 'Expired' ? 'Renew' : 'Review')

  const chartData = stats?.chartData || []
  const pageModules = PAGE_MODULES[location.pathname.replace(/\/+$/, '')]
  const roleLabel = { super_admin: 'Super Admin', admin: 'Admin', billing: 'Billing' }[user?.role] || 'Admin'
  const initials = String(user?.name || roleLabel).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'A'

  const recentBusinesses = businesses.slice(0, 5).map((b) => {
    const status = getStatus(b)
    return {
      raw: b,
      name: b.name,
      owner: b.contactEmail || t('N/A'),
      plan: b.plan || 'Monthly',
      planBg: getPlanBg(b.plan || 'Monthly'),
      status,
      statusColor: getStatusColor(status),
      date: b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : t('N/A'),
      action: getAction(status),
    }
  })

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#F8FAFC] items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased selection:bg-indigo-500 selection:text-white">

      {mobileMenuOpen && (
        <div className="admin-sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* 1. LEFT FIXED MANAGEMENT SIDEBAR */}
      <aside
        className={`admin-sidebar w-64 bg-[#0A1128] text-slate-400 flex flex-col justify-between shrink-0 border-r border-slate-900 ${mobileMenuOpen ? 'admin-sidebar-open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      >
        <div>
          {/* Platform Branding Context */}
          <div className="h-20 flex flex-col justify-center px-6 border-b border-slate-900">
            <div className="flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transform rotate-180">
                <path d="M8 22h8" /><path d="M12 11v11" /><path d="m19 3-7 8-7-8Z" />
              </svg>
              <span className="text-xl font-black text-white tracking-tight">BarFlow</span>
            </div>
            <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mt-0.5 pl-8">{t('Platform Admin')}</span>
          </div>

          {/* Nav List */}
          <nav className="p-4 space-y-6 text-xs font-semibold">
            <div>
              <Link to="/admin/dashboard" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg shadow-sm font-bold transition ${
                location.pathname === '/admin/dashboard' || location.pathname === '/admin' ? 'bg-[#4F46E5] text-white' : 'text-slate-400 hover:bg-slate-800/30 hover:text-slate-200'
              }`}>
                <LayoutDashboard size={16} /> {t('Dashboard')}
              </Link>
            </div>

            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">{t('Management')}</p>
              {can('businesses') && <SidebarLink to="/admin/businesses" icon={<Briefcase size={16} />} label="Businesses" active={location.pathname === '/admin/businesses'} />}
              {can('businesses') && <SidebarLink to="/register" icon={<PlusCircle size={16} />} label="Business Registration" active={location.pathname === '/register'} />}
              {can('subscriptions') && <SidebarLink to="/admin/plans" icon={<RefreshCw size={16} />} label="Subscriptions" active={location.pathname === '/admin/plans'} />}
              {can('payments') && <SidebarLink to="/admin/payments" icon={<CreditCard size={16} />} label="Payments" active={location.pathname === '/admin/payments'} />}
              {can('users') && <SidebarLink to="/admin/users" icon={<Users size={16} />} label="Users" active={location.pathname === '/admin/users'} />}
            </div>

            {can('reports', 'users', 'settings') && (
              <div className="space-y-1">
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">{t('System')}</p>
                {can('reports') && <SidebarLink to="/admin/reports" icon={<BarChart3 size={16} />} label="Reports" active={location.pathname === '/admin/reports'} />}
                {can('reports', 'users') && <SidebarLink to="/admin/activity" icon={<ScrollText size={16} />} label="Activity Log" active={location.pathname === '/admin/activity'} />}
                {can('settings') && <SidebarLink to="/admin/settings" icon={<Settings size={16} />} label="Settings" active={location.pathname === '/admin/settings'} />}
              </div>
            )}

            {can('backup') && (
              <div className="space-y-1">
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">{t('Maintenance')}</p>
                <SidebarLink to="/admin/backup" icon={<HardDriveDownload size={16} />} label="Backup & Restore" active={location.pathname === '/admin/backup'} />
              </div>
            )}
          </nav>
        </div>

        {/* Profile / Logout Footer Row */}
        <div className="p-4 border-t border-slate-950 bg-slate-950/40 space-y-3">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/5 transition">
            <LogOut size={16} /> {t('Logout')}
          </button>
        </div>
      </aside>

        {/* RIGHT DISPLAY VIEWPORT CANVAS */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden">

          {/* TOP SYSTEM HEAD NAVBAR */}
          <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
            <div className="flex items-center gap-4">
              {(location.pathname === '/admin/settings' || location.pathname.startsWith('/admin/settings/')) && (
                <button
                  type="button"
                  className="text-slate-500 hover:text-slate-800 transition flex items-center gap-1"
                  onClick={handleBack}
                  aria-label={t('Back')}
                >
                  {t('Back')}
                </button>
              )}
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800 transition"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-label={t('Toggle navigation')}
              ><Menu size={20} /></button>
              <div className="flex flex-col">
                <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  {t('Welcome back')}, {user?.name || t(roleLabel)}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">{t('Manage and grow the BarFlow platform')}</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 border-l pl-6 border-slate-200 cursor-pointer group">
                <div className="w-8 h-8 rounded-full bg-[#4F46E5] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                  {initials}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-bold text-slate-900 leading-tight">{t(roleLabel)}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{user?.email || ''}</p>
                </div>
              </div>
            </div>
          </header>

          {/* WORKSPACE APP BODY OVERFLOW SCROLL */}
          <main className="flex-1 overflow-y-auto p-8 space-y-6">
            {loadError && (
              <div className="p-3 rounded-lg text-sm font-medium border bg-red-50 border-red-300 text-red-800 flex items-center justify-between gap-3">
                <span>{loadError}</span>
                <button onClick={load} className="px-3 py-1 text-xs font-bold bg-white border border-red-300 rounded-lg hover:bg-red-100">{t('Retry')}</button>
              </div>
            )}
            {pageModules && !can(...pageModules) ? (
              <NoAccess />
            ) : location.pathname === '/admin/businesses' ? (
              <BusinessList />
            ) : location.pathname === '/admin/plans' ? (
              <SubscriptionPlans />
            ) : location.pathname === '/admin/payments' ? (
              <Payments />
            ) : location.pathname === '/admin/users' ? (
              <UsersPage />
            ) : location.pathname === '/admin/reports' ? (
              <Reports />
            ) : location.pathname === '/admin/activity' ? (
              <ActivityLog />
            ) : location.pathname === '/admin/settings' ? (
              <PlatformSettings />
            ) : location.pathname === '/admin/backup' ? (
              <BackupRestore />
            ) : (
              <Overview metrics={metrics} recentBusinesses={recentBusinesses} chartData={chartData} pendingVerification={pendingVerification} expiringSoon={expiringSoon} onViewBusiness={setViewing} onNavigate={navigate} onAddAdmin={() => setAdminOpen(true)} onExportReports={handleExportReports} exporting={exporting} health={health} onRefreshHealth={loadHealth} can={can} showBusinesses={can('businesses', 'subscriptions', 'payments')} />
            )}
          </main>
        </div>

      {/* Add Super Admin Modal */}
      {adminOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAdminOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">{t('Add Admin')}</h2>
              <button onClick={() => setAdminOpen(false)} aria-label={t('Close')} title={t('Close')} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {adminMsg && <div className={`p-3 rounded-lg text-sm font-medium border ${adminMsg.startsWith('❌') ? 'bg-red-50 border-red-300 text-red-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>{stripIcons(adminMsg)}</div>}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">{t('Full Name')}</label>
                <input value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">{t('Email')}</label>
                <input type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">{t('Phone')}</label>
                <input value={adminForm.phone} onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">{t('Password')}</label>
                <input type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">{t('Role')}</label>
                <select value={adminForm.role} onChange={(e) => setAdminForm({ ...adminForm, role: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white capitalize focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="admin">{t('Admin')}</option>
                  <option value="billing">{t('Billing')}</option>
                  {isSuper && <option value="super_admin">{t('Super Admin')}</option>}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1.5">{t('Permissions')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {['businesses', 'subscriptions', 'payments', 'users', 'reports', 'settings', 'backup'].map((p) => (
                    <label key={p} className="flex items-center gap-2 text-sm text-slate-600 capitalize">
                      <input type="checkbox" checked={adminForm.role === 'super_admin' || adminForm.permissions.includes(p)} disabled={adminForm.role === 'super_admin' || !can(p)} onChange={() => setAdminForm((f) => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] }))} />
                      {t(PERMISSION_LABELS[p])}
                    </label>
                  ))}
                </div>
                {adminForm.role === 'super_admin' && <p className="text-xs text-slate-400">{t('Super admins always have full access.')}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setAdminOpen(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">{t('Cancel')}</button>
              <button onClick={handleCreateAdmin} disabled={adminSaving} className="px-5 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">{adminSaving ? t('Saving...') : t('Create Admin')}</button>
            </div>
          </div>
        </div>
      )}

      {/* View Business Details Modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                {t('Business Details')}
              </h2>
              <button onClick={() => setViewing(null)} aria-label={t('Close')} title={t('Close')} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <BusinessDetail label={t('Name')} value={viewing.name} />
              <BusinessDetail label={t('Registration Code')} value={viewing.registrationCode || '—'} />
              <BusinessDetail label={t('Business Type')} value={viewing.businessType || '—'} />
              <BusinessDetail label={t('Contact Email')} value={viewing.contactEmail || '—'} />
              <BusinessDetail label={t('Contact Phone')} value={viewing.contactPhone || '—'} />
              <BusinessDetail label={t('City')} value={viewing.city || '—'} />
              <BusinessDetail label={t('Country')} value={viewing.country || '—'} />
              <BusinessDetail label={t('Address')} value={viewing.address || '—'} />
              <BusinessDetail label={t('Owner')} value={viewing.ownerName || viewing.contactEmail || '—'} />
              <BusinessDetail label={t('Plan')} value={viewing.plan || '—'} />
              <BusinessDetail label={t('Status')} value={t(viewing.isSuspended ? 'Suspended' : viewing.isVerified ? 'Active' : 'Pending')} />
              <BusinessDetail label={t('Registered')} value={viewing.createdAt ? new Date(viewing.createdAt).toLocaleString() : '—'} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Overview({ metrics, recentBusinesses, chartData, pendingVerification, expiringSoon, onViewBusiness, onNavigate, onAddAdmin, onExportReports, exporting, health, onRefreshHealth, can, showBusinesses }) {
  const { t } = usePreferences()
  // Bars are scaled to the busiest month; axis labels are real amounts.
  const monthTotal = (d) => (Number(d.monthly) || 0) + (Number(d.quarterly) || 0) + (Number(d.annual) || 0)
  const chartMax = Math.max(0, ...chartData.map(monthTotal))
  const pct = (v) => (chartMax > 0 ? ((Number(v) || 0) / chartMax) * 100 : 0)
  const compact = (v) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v || 0)
  const axis = chartMax > 0 ? [1, 0.75, 0.5, 0.25].map((f) => `${CURRENCY} ${compact(chartMax * f)}`) : []
  const db = health?.database
  const healthRows = health?.failed
    ? [{ label: t('Server Status'), ok: false, status: t('Unreachable') }]
    : health
      ? [
          { label: t('Server Status'), ok: true, status: `${t('Online')} · ${formatUptime(health.server?.uptimeSeconds)}` },
          { label: t('Database'), ok: db?.ok, status: db?.ok ? `${t('Connected')} · ${db.latencyMs} ms` : (db?.error || t('Unavailable')) },
          { label: t('Email (SMTP)'), ok: health.email?.configured, warn: !health.email?.configured, status: health.email?.configured ? t('Configured') : t('Not configured') },
          { label: t('Last Backup'), ok: Boolean(health.lastBackup) && health.lastBackup.status !== 'failed', warn: !health.lastBackup, status: health.lastBackup ? `${new Date(health.lastBackup.at).toLocaleDateString()} · ${t(health.lastBackup.status || 'completed')}` : t('Never') },
        ]
      : null

  return (
    <div className="space-y-6">

      {/* SECTION 1: 8x GRID METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <button type="button" key={i} onClick={() => onNavigate(m.to)} className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between shadow-xs transition hover:border-indigo-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase block">{m.title}</span>
              <p className="text-2xl font-black text-slate-900 tracking-tight">{m.value}</p>
              <span className={`text-[11px] font-bold ${
                m.trendType === 'up' ? 'text-emerald-600' : m.trendType === 'down' ? 'text-rose-600' : 'text-slate-400'
              }`}>
                {String(m.trend || '').replace(/[+%–—−]/g, '').trim()}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* SECTION 2: DATATABLE & CHART MIXIN GRID ROW */}
      <div className="grid grid-cols-12 gap-6">

        {/* Table Area (7/12 width) */}
        {showBusinesses && <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col justify-between">
          <div>
            <div className="p-5 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <span>{t('Latest Registered Businesses')}</span>
              </div>
              <Link to="/admin/businesses" className="text-xs font-bold text-[#4F46E5] hover:underline flex items-center gap-1">
                {t('View All')}
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="p-2 pl-6">{t('Business Name')}</th>
                    <th className="p-2">{t('Owner')}</th>
                    <th className="p-2">{t('Plan')}</th>
                    <th className="p-2">{t('Status')}</th>
                    <th className="p-2">{t('Created Date')}</th>
                    <th className="p-2 pr-6 text-right">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {recentBusinesses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        {t('No businesses registered yet.')}
                      </td>
                    </tr>
                  )}
                  {recentBusinesses.map((b, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="p-2 pl-6 font-bold text-slate-900 flex items-center gap-2">
                        {b.name}
                      </td>
                      <td className="p-2 text-slate-500">{b.owner}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${b.planBg}`}>
                          {b.plan}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${b.statusColor}`}></span>
                          {t(b.status)}
                        </span>
                      </td>
                      <td className="p-2 text-slate-400">{b.date}</td>
                      <td className="p-2 pr-6 text-right">
                        <button
                          onClick={() => {
                            if (b.action === 'View') onViewBusiness && onViewBusiness(b.raw)
                            else onNavigate(`/admin/businesses?status=${b.status === 'Suspended' ? 'suspended' : 'pending'}`)
                          }}
                          className={`px-3 py-1 rounded font-bold text-[10px] transition border shadow-xs cursor-pointer ${
                            b.action === 'Renew' || b.action === 'Review' ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700' :
                            'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}>
                          {t(b.action)}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>}

        {/* Chart Area (5/12 width) */}
        <div className={`col-span-12 ${showBusinesses ? 'lg:col-span-4' : ''} bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between`}>
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
              <span>{t('Subscription Revenue')}</span>
            </div>
            <span className="text-xs font-bold text-slate-500">{t('Last 6 Months')}</span>
          </div>

          {/* Chart Core Bar Graph Grid Frame */}
          <div className="relative h-48 w-full flex items-end justify-between px-2 pt-6 border-b border-l border-slate-100 mt-4">

            {/* Y-Axis Guideline Labels */}
            <div className="absolute left-0 -top-2 text-[9px] font-bold text-slate-400 space-y-7 pointer-events-none w-full pl-1">
              {axis.map((label) => <div key={label} className="border-b border-slate-50 pb-0.5 w-full">{label}</div>)}
            </div>
            {chartMax === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">{t('No subscription payments in the last 6 months.')}</p>
            )}

            {chartData.map((d, index) => (
              <div key={index} className="flex flex-col items-center gap-2 flex-1 z-10 group cursor-pointer" title={`${d.month}: ${formatCurr(monthTotal(d))}`}>
                <div className="w-4 flex flex-col justify-end rounded-t overflow-hidden h-32">
                  <div className="bg-amber-500 transition-all group-hover:opacity-90" style={{ height: `${pct(d.annual)}%` }}></div>
                  <div className="bg-purple-500 transition-all group-hover:opacity-90" style={{ height: `${pct(d.quarterly)}%` }}></div>
                  <div className="bg-blue-500 transition-all group-hover:opacity-90" style={{ height: `${pct(d.monthly)}%` }}></div>
                </div>
                <span className="text-[10px] font-bold text-slate-400">{d.month}</span>
              </div>
            ))}
          </div>

          {/* Custom Legend Rows */}
          <div className="flex items-center justify-center gap-5 text-[10px] font-bold text-slate-500 pt-4">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span> {t('Monthly')}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500"></span> {t('Quarterly')}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> {t('Annual')}</span>
          </div>
        </div>

      </div>

      {/* SECTION 3: QUICK ACTIONS & HEALTH FLAGS STATUS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Quick Actions Action Block Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-3 mb-4">
            <span className="font-bold text-sm text-slate-900 flex items-center gap-2">
            {t('Quick Actions')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1 content-start">
            {can('businesses') && <Link to="/register" className="col-span-2 bg-[#4F46E5] hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition">
              {t('Register Business')}
            </Link>}
            {can('subscriptions') && <Link to="/admin/plans" className="border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition bg-white">
              {t('Create Plan')}
            </Link>}
            {can('users') && <button onClick={onAddAdmin} className="border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition bg-white">
              {t('Add Admin')}
            </button>}
            <button onClick={onExportReports} disabled={exporting} className="col-span-2 border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition bg-white mt-1 disabled:opacity-50">
              {exporting ? t('Exporting...') : t('Export Reports')}
            </button>
          </div>
        </div>

        {/* System Performance Diagnostics Status Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-3 mb-4">
            <span className="font-bold text-sm text-slate-900 flex items-center justify-between gap-2">
              {t('System Status')}
              <button onClick={onRefreshHealth} className="text-[11px] font-bold text-[#4F46E5] hover:underline">{t('Refresh')}</button>
            </span>
          </div>

          <div className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3.5">
              {!healthRows && <p className="text-xs text-slate-400">{t('Checking...')}</p>}
              {(healthRows || []).map((r) => (
                <StatusRow key={r.label} label={r.label} status={r.status}
                  color={r.ok ? 'text-emerald-600' : r.warn ? 'text-amber-600' : 'text-rose-600'}
                  dot={r.ok ? 'bg-emerald-500' : r.warn ? 'bg-amber-500' : 'bg-rose-500'} />
              ))}
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>{t('Awaiting Verification')}</span>
                <span className="text-slate-900 font-black text-sm">{pendingVerification}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>{t('Expiring (7d)')}</span>
                <span className="text-slate-900 font-black text-sm">{expiringSoon}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

/* --- REUSABLE HELPER BUILDING SUB-COMPONENTS --- */

function formatUptime(seconds) {
  const s = Number(seconds) || 0
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

function NoAccess() {
  const { t } = usePreferences()
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 text-center shadow-xs">
      <h2 className="text-lg font-bold text-slate-900">{t('No access')}</h2>
      <p className="text-sm text-slate-500 mt-2">{t('Your admin account does not have permission for this section. Ask a super admin to grant it.')}</p>
      <Link to="/admin/dashboard" className="inline-block mt-5 px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700">{t('Back to dashboard')}</Link>
    </div>
  )
}

function SidebarLink({ icon, label, to, active = false }) {
  const { t } = usePreferences()
  return (
    <Link to={to || '#'} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition group ${
      active ? 'bg-[#4F46E5]/20 text-[#818CF8] font-bold' : 'text-slate-400 hover:bg-slate-800/30 hover:text-slate-200'
    }`}>
      <span className={active ? 'text-[#818CF8]' : 'text-slate-500 group-hover:text-slate-400 transition'}>{icon}</span>
      <span>{t(label)}</span>
    </Link>
  )
}

function BusinessDetail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-slate-800 font-medium mt-0.5">{value}</p>
    </div>
  )
}

function StatusRow({ label, status, color, dot }) {
  return (
    <div className="flex items-center justify-between text-xs font-bold">
      <div className="flex items-center gap-2 text-slate-600">
        <span className={`w-2 h-2 rounded-full ${dot}`}></span>
        <span>{label}</span>
      </div>
      <span className={color}>{status}</span>
    </div>
  )
}
