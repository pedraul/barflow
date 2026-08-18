import React, { useEffect, useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, Briefcase, PlusCircle, RefreshCw, CreditCard,
  Users, BarChart3, ClipboardList, Settings, LogOut,
  Menu, ChevronDown, Building2, CheckCircle2, XCircle,
  Clock, Ban, CalendarDays, Plus, FileText, Send, ShieldAlert,
  HardDriveDownload, ArrowLeft
} from 'lucide-react'
import { fetchPlatformStats, fetchBusinesses, fetchPlatformReports, fetchAdmins, createAdmin, sendNotification } from '../../api/endpoints'

const CURRENCY = 'RWF'
const formatCurr = (v) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0 }).format(v || 0)
import BusinessList from './BusinessList'
import SubscriptionPlans from './SubscriptionPlans'
import RegisterBusiness from './RegisterBusiness'
import Payments from './Payments'
import UsersPage from './Users'
import Reports from './Reports'
import PlatformSettings from './Settings'
import BackupRestore from './BackupRestore'

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [stats, setStats] = useState(null)
  const [businesses, setBusinesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(null)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [noticeText, setNoticeText] = useState('')
  const [noticeSending, setNoticeSending] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminForm, setAdminForm] = useState({ name: '', email: '', phone: '', password: '', role: 'admin', permissions: ['businesses', 'subscriptions', 'payments', 'reports'] })
  const [adminSaving, setAdminSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [noticeMsg, setNoticeMsg] = useState('')
  const [adminMsg, setAdminMsg] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!user?.isPlatformAdmin) {
      navigate('/login')
      return
    }
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const s = await fetchPlatformStats()
      const b = await fetchBusinesses()
      setStats(s)
      setBusinesses(b)
    } catch (e) {
      console.error('Failed to load admin data:', e)
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
      setAdminMsg('❌ Name, email and password are required.')
      return
    }
    setAdminSaving(true)
    setAdminMsg('')
    try {
      await createAdmin({ name: adminForm.name, email: adminForm.email, phone: adminForm.phone, password: adminForm.password, role: adminForm.role, permissions: adminForm.role === 'super_admin' ? ['businesses', 'subscriptions', 'payments', 'users', 'reports', 'settings', 'backup'] : adminForm.permissions })
      setAdminMsg('✅ Admin created successfully.')
      setAdminForm({ name: '', email: '', phone: '', password: '', role: 'admin', permissions: ['businesses', 'subscriptions', 'payments', 'reports'] })
      setTimeout(() => setAdminOpen(false), 1200)
    } catch (e) {
      setAdminMsg('❌ ' + (e.response?.data?.error || e.message || 'Failed to create admin.'))
    } finally {
      setAdminSaving(false)
    }
  }

  const handleSendNotice = async () => {
    if (!noticeText.trim()) {
      setNoticeMsg('❌ Please enter a notice message.')
      return
    }
    setNoticeSending(true)
    setNoticeMsg('')
    try {
      await sendNotification(noticeText.trim())
      setNoticeMsg('✅ Notice sent to all platform users.')
      setNoticeText('')
      setTimeout(() => setNoticeOpen(false), 1200)
    } catch (e) {
      setNoticeMsg('❌ ' + (e.response?.data?.error || e.message || 'Failed to send notice.'))
    } finally {
      setNoticeSending(false)
    }
  }

  const handleExportReports = async () => {
    setExporting(true)
    try {
      const [r, s] = await Promise.all([fetchPlatformReports(), fetchPlatformStats()])
      const rows = [
        ['Metric', 'Value'],
        ['Total Businesses', s?.totalBusinesses ?? 0],
        ['Verified Businesses', s?.verifiedBusinesses ?? 0],
        ['Suspended Businesses', s?.suspendedBusinesses ?? 0],
        ['Active Subscriptions', s?.activeSubscriptions ?? 0],
        ['Expired Subscriptions', s?.expiredSubscriptions ?? 0],
        ['New Registrations (period)', (r?.growth || []).reduce((sum, g) => sum + g.registrations, 0)],
        ['Income This Month', r?.income?.thisMonth ?? 0],
        ['Income This Year', r?.income?.thisYear ?? 0],
        ['Income All Time', r?.income?.allTime ?? 0],
      ]
      const csv = rows.map((r2) => r2.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `platform_reports_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed:', e)
      alert(e.response?.data?.error || 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  const total = Number(stats?.totalBusinesses || 0)
  const verified = Number(stats?.verifiedBusinesses || 0)
  const suspended = Number(stats?.suspendedBusinesses || 0)
  const activeSubs = Number(stats?.activeSubscriptions || 0)
  const expiredSubs = Number(stats?.expiredSubscriptions || 0)
  const pendingVerification = Number(stats?.pendingVerification || Math.max(0, total - verified - suspended))
  const expiringSoon = Number(stats?.expiringSoon || 0)

  const metrics = [
    { title: 'Total Businesses', value: String(total), trend: `${verified} verified`, trendType: 'up', icon: <Building2 className="text-indigo-600" />, bg: 'bg-indigo-50' },
    { title: 'Active Subscriptions', value: String(activeSubs), trend: 'Currently active', trendType: 'up', icon: <CheckCircle2 className="text-emerald-600" />, bg: 'bg-emerald-50' },
    { title: 'Expired Subscriptions', value: String(expiredSubs), trend: 'Needs attention', trendType: 'down', icon: <XCircle className="text-rose-600" />, bg: 'bg-rose-50' },
    { title: 'Awaiting Verification', value: String(pendingVerification), trend: 'Needs your review', trendType: 'neutral', icon: <Clock className="text-amber-500" />, bg: 'bg-amber-50' },
    { title: 'Suspended Businesses', value: String(suspended), trend: 'Currently suspended', trendType: 'neutral', icon: <Ban className="text-red-500" />, bg: 'bg-red-50' },
    { title: 'Expiring in 7 Days', value: String(expiringSoon), trend: 'Action required', trendType: 'neutral', icon: <CalendarDays className="text-blue-500" />, bg: 'bg-blue-50' },
  ]

  const getStatus = (b) => {
    if (b.isSuspended) return 'Suspended'
    if (!b.isVerified) return 'Pending'
    // Business was verified before but its renewed subscription is still pending admin verification
    if (b.subPaymentStatus === 'pending') return 'Pending'
    return 'Active'
  }
  const getStatusColor = (status) =>
    status === 'Active' ? 'bg-emerald-500' : status === 'Expired' ? 'bg-rose-500' : 'bg-amber-500'
  const getPlanBg = (plan) => {
    if (plan === 'Annual') return 'bg-blue-50 text-blue-600 border border-blue-200'
    if (plan === 'Quarterly') return 'bg-amber-50 text-amber-600 border border-amber-200'
    return 'bg-purple-50 text-purple-600 border border-purple-200'
  }
  const getAction = (status) => (status === 'Active' ? 'View' : status === 'Expired' ? 'Renew' : 'Review')

  const chartData = stats?.chartData || []

  const recentBusinesses = businesses.slice(0, 5).map((b) => {
    const status = getStatus(b)
    return {
      name: b.name,
      owner: b.contactEmail || 'N/A',
      plan: b.plan || 'Monthly',
      planBg: getPlanBg(b.plan || 'Monthly'),
      status,
      statusColor: getStatusColor(status),
      date: b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'N/A',
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
            <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mt-0.5 pl-8">Platform Admin</span>
          </div>

          {/* Nav List */}
          <nav className="p-4 space-y-6 text-xs font-semibold">
            <div>
              <Link to="/admin/dashboard" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg shadow-sm font-bold transition ${
                location.pathname === '/admin/dashboard' || location.pathname === '/admin' ? 'bg-[#4F46E5] text-white' : 'text-slate-400 hover:bg-slate-800/30 hover:text-slate-200'
              }`}>
                <LayoutDashboard size={16} /> Dashboard
              </Link>
            </div>

            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">Management</p>
              <SidebarLink to="/admin/businesses" icon={<Briefcase size={16} />} label="Businesses" active={location.pathname === '/admin/businesses'} />
              <SidebarLink to="/register" icon={<PlusCircle size={16} />} label="Business Registration" active={location.pathname === '/register'} />
              <SidebarLink to="/admin/plans" icon={<RefreshCw size={16} />} label="Subscriptions" active={location.pathname === '/admin/plans'} />
              <SidebarLink to="/admin/payments" icon={<CreditCard size={16} />} label="Payments" active={location.pathname === '/admin/payments'} />
              <SidebarLink to="/admin/users" icon={<Users size={16} />} label="Users" active={location.pathname === '/admin/users'} />
            </div>

            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">System</p>
              <SidebarLink to="/admin/reports" icon={<BarChart3 size={16} />} label="Reports" active={location.pathname === '/admin/reports'} />
              <SidebarLink to="/admin/settings" icon={<Settings size={16} />} label="Settings" active={location.pathname === '/admin/settings'} />
            </div>

            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">Maintenance</p>
              <SidebarLink to="/admin/backup" icon={<HardDriveDownload size={16} />} label="Backup & Restore" active={location.pathname === '/admin/backup'} />
            </div>
          </nav>
        </div>

        {/* Profile / Logout Footer Row */}
        <div className="p-4 border-t border-slate-950 bg-slate-950/40 space-y-3">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/5 transition">
            <LogOut size={16} /> Logout
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
                  aria-label="Back"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800 transition"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-label="Toggle navigation"
              ><Menu size={20} /></button>
              <div className="flex flex-col">
                <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  Welcome back, Super Admin
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">Manage and grow the BarFlow platform</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 border-l pl-6 border-slate-200 cursor-pointer group">
                <div className="w-8 h-8 rounded-full bg-[#4F46E5] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                  <Users size={14} />
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-bold text-slate-900 leading-tight">Super Admin</p>
                  <p className="text-[10px] text-slate-400 font-medium">{user?.email || 'superadmin@barflow.rw'}</p>
                </div>
                <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600 transition" />
              </div>
            </div>
          </header>

          {/* WORKSPACE APP BODY OVERFLOW SCROLL */}
          <main className="flex-1 overflow-y-auto p-8 space-y-6">
            {location.pathname === '/admin' || location.pathname === '/admin/dashboard' ? (
              <Overview metrics={metrics} recentBusinesses={recentBusinesses} chartData={chartData} pendingVerification={pendingVerification} expiringSoon={expiringSoon} businesses={businesses} onViewBusiness={setViewing} onAddAdmin={() => setAdminOpen(true)} onSendNotice={() => setNoticeOpen(true)} onExportReports={handleExportReports} exporting={exporting} />
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
            ) : location.pathname === '/admin/settings' ? (
              <PlatformSettings />
            ) : location.pathname === '/admin/backup' ? (
              <BackupRestore />
            ) : (
              <Overview metrics={metrics} recentBusinesses={recentBusinesses} chartData={chartData} pendingVerification={pendingVerification} expiringSoon={expiringSoon} businesses={businesses} onViewBusiness={setViewing} onAddAdmin={() => setAdminOpen(true)} onSendNotice={() => setNoticeOpen(true)} onExportReports={handleExportReports} exporting={exporting} />
            )}
          </main>
        </div>

      {/* Add Super Admin Modal */}
      {adminOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAdminOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-bold text-slate-900 flex items-center gap-2"><Users size={18} className="text-[#4F46E5]" /> Add Super Admin</h2>
              <button onClick={() => setAdminOpen(false)} className="text-slate-400 hover:text-slate-700"><XCircle size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {adminMsg && <div className={`p-3 rounded-lg text-sm font-medium border ${adminMsg.startsWith('❌') ? 'bg-red-50 border-red-300 text-red-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>{adminMsg}</div>}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Full Name</label>
                <input value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Email</label>
                <input type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Phone</label>
                <input value={adminForm.phone} onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Password</label>
                <input type="password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Role</label>
                <select value={adminForm.role} onChange={(e) => setAdminForm({ ...adminForm, role: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white capitalize focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="admin">Admin</option>
                  <option value="billing">Billing</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1.5"><ShieldAlert size={14} /> Permissions</label>
                <div className="grid grid-cols-2 gap-2">
                  {['businesses', 'subscriptions', 'payments', 'users', 'reports', 'settings', 'backup'].map((p) => (
                    <label key={p} className="flex items-center gap-2 text-sm text-slate-600 capitalize">
                      <input type="checkbox" checked={adminForm.permissions.includes(p)} disabled={adminForm.role === 'super_admin'} onChange={() => setAdminForm((f) => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] }))} />
                      {p}
                    </label>
                  ))}
                </div>
                {adminForm.role === 'super_admin' && <p className="text-xs text-slate-400">Super admins always have full access.</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setAdminOpen(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={handleCreateAdmin} disabled={adminSaving} className="px-5 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">{adminSaving ? 'Saving...' : 'Create Admin'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Send Notice Modal */}
      {noticeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setNoticeOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-bold text-slate-900 flex items-center gap-2"><Send size={18} className="text-[#4F46E5]" /> Send Notice</h2>
              <button onClick={() => setNoticeOpen(false)} className="text-slate-400 hover:text-slate-700"><XCircle size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {noticeMsg && <div className={`p-3 rounded-lg text-sm font-medium border ${noticeMsg.startsWith('❌') ? 'bg-red-50 border-red-300 text-red-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>{noticeMsg}</div>}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Notice Message</label>
                <textarea value={noticeText} onChange={(e) => setNoticeText(e.target.value)} rows={5} placeholder="Type your notice to all platform users..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
              </div>
              <p className="text-xs text-slate-400">This notice is broadcast to all platform users.</p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setNoticeOpen(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={handleSendNotice} disabled={noticeSending || !noticeText.trim()} className="px-5 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">{noticeSending ? 'Sending...' : 'Send Notice'}</button>
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
                <Building2 size={18} className="text-[#4F46E5]" /> Business Details
              </h2>
              <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-700"><XCircle size={20} /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <BusinessDetail label="Name" value={viewing.name} />
              <BusinessDetail label="Registration Code" value={viewing.registrationCode || '—'} />
              <BusinessDetail label="Business Type" value={viewing.businessType || '—'} />
              <BusinessDetail label="Contact Email" value={viewing.contactEmail || '—'} />
              <BusinessDetail label="Contact Phone" value={viewing.contactPhone || '—'} />
              <BusinessDetail label="City" value={viewing.city || '—'} />
              <BusinessDetail label="Country" value={viewing.country || '—'} />
              <BusinessDetail label="Address" value={viewing.address || '—'} />
              <BusinessDetail label="Owner" value={viewing.ownerName || viewing.contactEmail || '—'} />
              <BusinessDetail label="Plan" value={viewing.plan || '—'} />
              <BusinessDetail label="Status" value={viewing.isSuspended ? 'Suspended' : viewing.isVerified ? 'Active' : 'Pending'} />
              <BusinessDetail label="Registered" value={viewing.createdAt ? new Date(viewing.createdAt).toLocaleString() : '—'} />
            </div>
            <div className="flex justify-end px-6 pb-6">
              <button onClick={() => setViewing(null)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Overview({ metrics, recentBusinesses, chartData, pendingVerification, expiringSoon, businesses = [], onViewBusiness, onAddAdmin, onSendNotice, onExportReports, exporting }) {

  return (
    <div className="space-y-6">

      {/* SECTION 1: 8x GRID METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between shadow-xs">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase block">{m.title}</span>
              <p className="text-2xl font-black text-slate-900 tracking-tight">{m.value}</p>
              <span className={`text-[11px] font-bold ${
                m.trendType === 'up' ? 'text-emerald-600' : m.trendType === 'down' ? 'text-rose-600' : 'text-slate-400'
              }`}>
                {String(m.trend || '').replace(/[+%–—−]/g, '').trim()}
              </span>
            </div>
            <div className={`p-2 rounded-lg ${m.bg} shrink-0`}>
              {m.icon}
            </div>
          </div>
        ))}
      </div>

      {/* SECTION 2: DATATABLE & CHART MIXIN GRID ROW */}
      <div className="grid grid-cols-12 gap-6">

        {/* Table Area (7/12 width) */}
        <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col justify-between">
          <div>
            <div className="p-5 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <Building2 size={16} className="text-[#4F46E5]" />
                <span>Latest Registered Businesses</span>
              </div>
              <Link to="/admin/businesses" className="text-xs font-bold text-[#4F46E5] hover:underline flex items-center gap-1">
                View All
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="p-2 pl-6">Business Name</th>
                    <th className="p-2">Owner</th>
                    <th className="p-2">Plan</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Created Date</th>
                    <th className="p-2 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {recentBusinesses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        No businesses registered yet.
                      </td>
                    </tr>
                  )}
                  {recentBusinesses.map((b, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="p-2 pl-6 font-bold text-slate-900 flex items-center gap-2">
                        <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] ${
                          b.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : b.status === 'Expired' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                        }`}><Building2 size={10} /></span>
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
                          {b.status}
                        </span>
                      </td>
                      <td className="p-2 text-slate-400">{b.date}</td>
                      <td className="p-2 pr-6 text-right">
                        <button
                          onClick={() => {
                            const full = businesses.find((x) => x.name === b.name || x.contactEmail === b.owner)
                            onViewBusiness && onViewBusiness(full || { name: b.name, contactEmail: b.owner, plan: b.plan, createdAt: b.date, isVerified: b.status === 'Active', isSuspended: b.status === 'Suspended' })
                          }}
                          className={`px-3 py-1 rounded font-bold text-[10px] transition border shadow-xs cursor-pointer ${
                            b.action === 'Renew' || b.action === 'Review' ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700' :
                            'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}>
                          {b.action}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Chart Area (5/12 width) */}
        <div className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
              <Clock size={16} className="text-[#4F46E5]" />
              <span>Subscription Revenue</span>
            </div>
            <select className="bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 py-1 px-2.5 focus:outline-hidden">
              <option>Last 6 Months</option>
            </select>
          </div>

          {/* Chart Core Bar Graph Grid Frame */}
          <div className="relative h-48 w-full flex items-end justify-between px-2 pt-6 border-b border-l border-slate-100 mt-4">

            {/* Y-Axis Guideline Labels */}
            <div className="absolute left-0 -top-2 text-[9px] font-bold text-slate-400 space-y-7 pointer-events-none w-full pl-1">
              <div className="border-b border-slate-50 pb-0.5 w-full">RWF 20M</div>
              <div className="border-b border-slate-50 pb-0.5 w-full">RWF 15M</div>
              <div className="border-b border-slate-50 pb-0.5 w-full">RWF 10M</div>
              <div className="border-b border-slate-50 pb-0.5 w-full">RWF 5M</div>
            </div>

            {chartData.map((d, index) => (
              <div key={index} className="flex flex-col items-center gap-2 flex-1 z-10 group cursor-pointer">
                <div className="w-4 flex flex-col justify-end rounded-t overflow-hidden h-32">
                  <div className="bg-amber-500 transition-all group-hover:opacity-90" style={{ height: `${d.annual}%` }}></div>
                  <div className="bg-purple-500 transition-all group-hover:opacity-90" style={{ height: `${d.quarterly}%` }}></div>
                  <div className="bg-blue-500 transition-all group-hover:opacity-90" style={{ height: `${d.monthly}%` }}></div>
                </div>
                <span className="text-[10px] font-bold text-slate-400">{d.month}</span>
              </div>
            ))}
          </div>

          {/* Custom Legend Rows */}
          <div className="flex items-center justify-center gap-5 text-[10px] font-bold text-slate-500 pt-4">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Monthly</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Quarterly</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Annual</span>
          </div>
        </div>

      </div>

      {/* SECTION 3: QUICK ACTIONS & HEALTH FLAGS STATUS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Quick Actions Action Block Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-3 mb-4">
            <span className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <PlusCircle size={16} className="text-[#4F46E5]" /> Quick Actions
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1 content-start">
            <Link to="/admin/businesses" className="col-span-2 bg-[#4F46E5] hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition">
              <Plus size={16} /> Register Business
            </Link>
            <Link to="/admin/plans" className="border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition bg-white">
              <FileText size={14} className="text-indigo-600" /> Create Plan
            </Link>
            <button onClick={onAddAdmin} className="border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition bg-white">
              <Users size={14} className="text-indigo-600" /> Add Super Admin
            </button>
            <button onClick={onSendNotice} className="border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition bg-white">
              <Send size={14} className="text-indigo-600" /> Send Notice
            </button>
            <button onClick={onExportReports} disabled={exporting} className="col-span-2 border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition bg-white mt-1 disabled:opacity-50">
              <BarChart3 size={14} className="text-indigo-600" /> {exporting ? 'Exporting...' : 'Export Reports'}
            </button>
          </div>
        </div>

        {/* System Performance Diagnostics Status Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-3 mb-4">
            <span className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <ShieldAlert size={16} className="text-[#4F46E5]" /> System Status
            </span>
          </div>

          <div className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3.5">
              <StatusRow label="Server Status" status="Online" color="text-emerald-600" dot="bg-emerald-500" />
              <StatusRow label="Database" status="Connected" color="text-emerald-600" dot="bg-emerald-500" />
              <StatusRow label="API Services" status="Healthy" color="text-emerald-600" dot="bg-emerald-500" />
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Awaiting Verification</span>
                <span className="text-slate-900 font-black text-sm">{pendingVerification}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Expiring (7d)</span>
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

function SidebarLink({ icon, label, to, active = false }) {
  return (
    <Link to={to || '#'} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition group ${
      active ? 'bg-[#4F46E5]/20 text-[#818CF8] font-bold' : 'text-slate-400 hover:bg-slate-800/30 hover:text-slate-200'
    }`}>
      <span className={active ? 'text-[#818CF8]' : 'text-slate-500 group-hover:text-slate-400 transition'}>{icon}</span>
      <span>{label}</span>
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
