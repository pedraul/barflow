import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOwner } from '../../context/OwnerContext'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getTwoFactorSettings, updateTwoFactorSettings } from '../../api/endpoints'
import QRCode from '../../components/QRCode'
import { User, Database, CreditCard, ShieldCheck, Lock, RefreshCw, Settings, FileText, Menu, Wallet, Mail } from 'lucide-react'
import AuditLogViewer from './AuditLogViewer'
import PaymentQRSettings from '../../components/PaymentQRSettings'
import BusinessAccountZone from '../../components/BusinessAccountZone'
import OwnerPlanSummary from '../../components/OwnerPlanSummary'
import { usePreferences, stripIcons } from '../../context/PreferencesContext'

const SETTINGS_GROUPS = [
  {
    id: 'general_info',
    label: 'General Info',
    items: [
      { id: 'account', label: 'Account', icon: <User size={18} /> },
    ]
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [
      { id: 'notifications', label: 'Notifications', icon: <Mail size={18} /> },
    ]
  },
  {
    id: 'financial',
    label: 'Financial',
    items: [
      { id: 'subscription', label: 'Subscription', icon: <CreditCard size={18} /> },
      { id: 'payments', label: 'Payments', icon: <Wallet size={18} /> },
    ]
  },
  {
    id: 'security',
    label: 'Security',
    items: [
      { id: 'permissions', label: 'Permissions', icon: <ShieldCheck size={18} /> },
      { id: 'security', label: 'Security', icon: <Lock size={18} /> },
      { id: 'recovery', label: 'Recovery', icon: <RefreshCw size={18} /> },
    ]
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'backup', label: 'Backup', icon: <Database size={18} /> },
      { id: 'audit', label: 'Audit', icon: <FileText size={18} /> },
    ]
  },
]

const ALL_TABS = SETTINGS_GROUPS.flatMap(g => g.items)

const EMAIL_NOTIFICATION_OPTIONS = [
  ['notify_registration', 'Business Registration Confirmation'],
  ['notify_subscription_activation', 'Subscription Activation'],
  ['notify_expiry_reminder', 'Subscription Expiry Reminder'],
  ['notify_subscription_expired', 'Subscription Expired'],
  ['notify_renewal_confirmation', 'Subscription Renewal Confirmation'],
  ['notify_account_suspended', 'Account Suspension'],
  ['notify_account_reactivated', 'Account Reactivation'],
]

const PERMISSION_LABELS = [
  ['canWithdraw', 'Can Withdraw'],
  ['canTransfer', 'Can Transfer'],
  ['canManageUsers', 'Can Manage Users'],
  ['canViewRevenue', 'Can View Revenue'],
  ['canManageSettings', 'Can Manage Settings'],
  ['canViewWithdrawLogs', 'Can View Withdraw Logs'],
  ['canViewTransferLogs', 'Can View Transfer Logs'],
  ['canApproveTransfers', 'Can Approve Transfers'],
]

export default function SystemSettings() {
  const { t } = usePreferences()
  const { fetchPermissions, user: authUser } = useAuth()
  const isOwnerUser = String(authUser?.role || '').toLowerCase() === 'owner'
  const {
    fetchSystemSettings, updateSystemSettings, triggerBackup, fetchBackups,
    restoreBackup, updatePermissions, fetchBranches, createBranch, updateBranch, setActiveBranchId, branches, loading,
    fetchPaymentSettings, updatePaymentSettings, generateMerchantQRPayment,
  } = useOwner()

  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [activeSubTab, setActiveSubTab] = useState('account')
  const [message, setMessage] = useState('')

  // derive active subtab from path (e.g. /settings/security)
  React.useEffect(() => {
    const parts = pathname.split('/').filter(Boolean)
    const last = parts[parts.length - 1] || 'account'
    if (ALL_TABS.find(t => t.id === last)) {
      setActiveSubTab(last)
    }
  }, [pathname])
  const [data, setData] = useState({
    business: {
      name: '', address: '', phone: '', email: '', city: '', country: '', province: '',
      district: '', sector: '', businessType: '', registrationCode: '', description: '',
      currency: 'RWF', taxRate: 18,
    },
    settings: {}, permissions: [], backups: [],
  })
  const [backupName, setBackupName] = useState('')
  const [backupType, setBackupType] = useState('full')
  const [backups, setBackups] = useState([])
  const [newBranch, setNewBranch] = useState({ name: '', address: '' })
  const [restoreId, setRestoreId] = useState('')
  const [restoreMsg, setRestoreMsg] = useState('')
  const [permDraft, setPermDraft] = useState([])
  const [twoFactor, setTwoFactor] = useState({ isEnabled: false, method: 'email', scope: 'business', businessId: null })


  const loadBackups = useCallback(async () => {
    try {
      const res = await fetchBackups()
      setBackups(Array.isArray(res) ? res : (res.backups || []))
    } catch (e) { /* ignore */ }
  }, [fetchBackups])

  const loadBranches = useCallback(async () => {
    try { await fetchBranches() } catch (e) { console.error('Failed to load branches:', e) }
  }, [fetchBranches])

  const load = useCallback(async () => {
    try {
      const d = await fetchSystemSettings()
      const settingsData = d && typeof d === 'object' ? d : {}
      setData({
        business: settingsData.business || {
          name: '', address: '', phone: '', email: '', city: '', country: '', province: '',
          district: '', sector: '', businessType: '', registrationCode: '', description: '',
          currency: 'RWF', taxRate: 18,
        },
        settings: settingsData.settings || {},
        permissions: Array.isArray(settingsData.permissions) ? settingsData.permissions : [],
        backups: Array.isArray(settingsData.backups) ? settingsData.backups : [],
      })
      setPermDraft(Array.isArray(settingsData.permissions) ? settingsData.permissions : [])
      await loadBackups()
    } catch (e) { console.error('Failed to load settings:', e) }
  }, [fetchSystemSettings, loadBackups])

  useEffect(() => {
    load()
    loadBranches()
    const refresh = window.setInterval(load, 30000)
    window.addEventListener('focus', load)
    return () => {
      window.clearInterval(refresh)
      window.removeEventListener('focus', load)
    }
  }, [load, loadBranches])

  const flash = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000) }

  const goBack = () => {
    navigate('/dashboard/owner')
  }

  const handleSaveAccount = async () => {
    try {
      await updateSystemSettings(data.business)
      flash(t('✅ Account settings saved successfully.'))
    } catch (e) { flash('❌ ' + e.message) }
  }
  const handleBusinessChange = (field, value) =>
    setData({ ...data, business: { ...data.business, [field]: value } })

  const handleCreateBranch = async (event) => {
    event.preventDefault()
    if (!newBranch.name.trim()) return
    try {
      await createBranch({ name: newBranch.name.trim(), address: newBranch.address.trim() })
      setNewBranch({ name: '', address: '' })
      await loadBranches()
      flash(t('✅ Branch created successfully.'))
    } catch (e) { flash('❌ ' + e.message) }
  }

  const handleToggleBranch = async (branch) => {
    try {
      await updateBranch(branch.id, { isActive: !branch.isActive })
      await loadBranches()
      flash(branch.isActive ? t('✅ Branch deactivated.') : t('✅ Branch activated.'))
    } catch (e) { flash('❌ ' + e.message) }
  }

  const handleOpenBranch = (branch) => {
    setActiveBranchId(branch.id)
    navigate('/dashboard/owner')
  }

  const handleTriggerBackup = async () => {
    try {
      const res = await triggerBackup({ backupName: backupName || undefined, backupType })
      flash(`${t('✅ Backup completed:')} ${res.backup?.name || backupName}`)
      setBackupName('')
      await loadBackups()
    } catch (e) { flash('❌ ' + e.message) }
  }

  const handleRestore = async () => {
    setRestoreMsg('')
    if (!restoreId) return setRestoreMsg('❌ ' + t('❌ Select a backup to restore.'))
    try {
      const res = await restoreBackup(restoreId)
      setRestoreMsg('✅ ' + res.message)
      setRestoreId('')
    } catch (e) { setRestoreMsg('❌ ' + e.message) }
  }

  const setSetting = (key, value) =>
    setData({ ...data, settings: { ...data.settings, [key]: value } })

  const handleSavePermissions = async () => {
    try {
      for (const p of permDraft) {
        await updatePermissions(p.role, p)
      }
      flash(t('✅ Permissions updated for all roles.'))
      await load()
      await fetchPermissions()
    } catch (e) { flash('❌ ' + e.message) }
  }
  const togglePerm = (role, key) =>
    setPermDraft((prev) => prev.map((p) => p.role === role ? { ...p, [key]: !p[key] } : p))

  const handleSaveSecurity = async () => {
    try {
      const keys = ['max_login_attempts', 'session_timeout']
      const settings = {}
      keys.forEach((k) => { if (data.settings[k] !== undefined) settings[k] = data.settings[k] })
      await updateSystemSettings({ settings })
      flash(t('✅ Security settings saved.'))
    } catch (e) { flash('❌ ' + e.message) }
  }

  const loadTwoFactorSettings = useCallback(async () => {
    try {
      const s = await getTwoFactorSettings()
      setTwoFactor({
        isEnabled: !!s.isEnabled,
        method: s.method || 'email',
        scope: 'business',
        platformRequired: s.scope === 'platform' && !!s.isEnabled,
        businessId: s.businessId || null,
      })
    } catch (e) { console.error('Failed to load 2FA settings:', e) }
  }, [])

  const handleSaveTwoFactor = async () => {
    try {
      await updateTwoFactorSettings({
        isEnabled: twoFactor.isEnabled,
        method: twoFactor.method,
      })
      flash(t('✅ Two-factor authentication settings saved.'))
    } catch (e) { flash('❌ ' + (e?.response?.data?.error || e.message)) }
  }


  React.useEffect(() => {
    if (activeSubTab === 'security') {
      loadTwoFactorSettings()
    }
  }, [activeSubTab, loadTwoFactorSettings])


  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased">
      <div className="flex-1 flex flex-col h-screen overflow-hidden">

        {/* 2. TOP BANNER HEADER */}
        <header className="owner-settings-header h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 shrink-0 shadow-xs">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button onClick={goBack} className="h-10 px-3 text-sm font-semibold flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition" title={t('Back to Dashboard')}>
              {t('Back')}
            </button>
            <button type="button" className="owner-settings-menu text-slate-600 hover:text-slate-900 transition">
              <Menu size={20} />
            </button>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-slate-400 tracking-wider truncate">
                <span className="text-[#0066FF]">{t('OWNER WORKSPACE')}</span>
                <span className="text-slate-300 font-normal">&gt;</span>
                <span className="text-slate-800">{t('SYSTEM SETTINGS')}</span>
              </div>
               <p className="hidden sm:block text-xs text-slate-500 mt-0.5 truncate">
                 {t('Configure account, backup, subscription, payments, permissions, security & recovery.')}
               </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <button onClick={goBack} className="hidden sm:flex h-10 px-3 text-sm font-semibold items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition" title={t('Back to Dashboard')}>
              {t('Back')}
            </button>
            <div className="flex items-center gap-2.5 border-l pl-4 border-slate-200 cursor-pointer group">
              <div className="w-8 h-8 rounded-full bg-[#0066FF] text-white flex items-center justify-center font-bold text-xs shadow-sm">{t('OL')}</div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-bold text-slate-900 leading-tight">{t('Owner')}</p>
                <p className="text-[10px] text-slate-400 font-medium">{t('Super Admin')}</p>
              </div>
            </div>
          </div>
        </header>

        {/* 3. WORKING WORKSPACE SCROLL CONTENT */}
        <main className="owner-settings-workspace flex-1 overflow-y-auto p-4 md:p-8 flex flex-col md:flex-row gap-4 md:gap-6 items-start">

          {/* LEFT COLUMN: Sub-Tab Controls - vertical on desktop, horizontal on mobile */}
          <div className="owner-settings-tabs w-full md:w-[240px] bg-white border border-slate-200 rounded-xl p-2 md:p-3 shadow-xs shrink-0">
            <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0">
              {SETTINGS_GROUPS.map((group) => {
                const isGroupActive = group.items.some(i => i.id === activeSubTab)
                return (
                  <div key={group.id} className="flex-shrink-0 md:flex-shrink mb-1">
                    <div className={`hidden md:block px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${isGroupActive ? 'text-indigo-700 bg-indigo-50' : 'text-slate-500'}`}>
                      {t(group.label)}
                    </div>
                    <div className="md:hidden text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">{t(group.label)}</div>
                    <div className="flex md:flex-col gap-0.5">
                      {group.items.map((item) => (
                        <SubTabButton key={item.id} id={item.id} label={t(item.label)} icon={item.icon} active={activeSubTab === item.id} onClick={(id) => { navigate(`/settings/${id}`); }} showBar={item.id === 'account'} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* RIGHT COLUMN: Settings Viewport Canvas */}
          <div className="owner-settings-panel flex-1 w-full bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden min-w-0">
            {message && (
              <div className={`m-6 p-3 rounded-lg text-sm font-medium border ${message.startsWith('❌') ? 'bg-red-50 border-red-300 text-red-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>{stripIcons(message)}</div>
            )}

            {activeSubTab === 'notifications' ? (
              <div className="p-8 space-y-6">
                <SectionTitle title={t('EMAIL NOTIFICATION PREFERENCES')} subtitle={t('Choose which email notifications you want to receive from the platform.')} />
                <div className="border-t border-slate-100"></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                  {EMAIL_NOTIFICATION_OPTIONS.map(([key, label]) => {
                    const on = String(data.settings[key]) === 'true'
                    return (
                      <div key={key} className="flex items-center justify-between py-2">
                        <label className="text-sm font-semibold text-slate-700">{t(label)}</label>
                        <button type="button" role="switch" aria-checked={on} aria-label={t(label)} title={on ? t('On') : t('Off')} onClick={() => setSetting(key, on ? 'false' : 'true')}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div className="border-t border-slate-100 pt-4"></div>
                <div className="flex justify-end">
                  <button onClick={async () => {
                    try {
                      const keys = EMAIL_NOTIFICATION_OPTIONS.map(([k]) => k)
                      const settings = {}
                      keys.forEach((k) => { if (data.settings[k] !== undefined) settings[k] = data.settings[k] })
                      await updateSystemSettings({ settings })
                      flash(t('✅ Email notification preferences saved.'))
                    } catch (e) { flash('❌ ' + e.message) }
                  }} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                    {t('Save Preferences')}
                  </button>
                </div>
              </div>
            ) : activeSubTab === 'account' ? (
              <>
              <form onSubmit={(e) => { e.preventDefault(); handleSaveAccount() }} className="p-8 space-y-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-[#0F172A] tracking-tight">{t('BUSINESS ACCOUNT SETTINGS')}</h2>
                  <p className="text-xs text-slate-500">{t('Manage your core company profile and tax variables')}</p>
                </div>
                <div className="border-t border-slate-100"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  <Field label={t('Business Name')} name="name" value={data.business.name} onChange={(v) => handleBusinessChange('name', v)} />
                  <Field label={t('Email')} name="email" value={data.business.email} onChange={(v) => handleBusinessChange('email', v)} />
                  <Field label={t('Address')} name="address" value={data.business.address} onChange={(v) => handleBusinessChange('address', v)} />
                  <Field label={t('Phone')} name="phone" value={data.business.phone} onChange={(v) => handleBusinessChange('phone', v)} />
                  <Field label={t('Business Type')} name="businessType" value={data.business.businessType} onChange={(v) => handleBusinessChange('businessType', v)} />
                  <Field label={t('Registration Code')} name="registrationCode" value={data.business.registrationCode} onChange={(v) => handleBusinessChange('registrationCode', v)} />
                  <Field label={t('City')} name="city" value={data.business.city} onChange={(v) => handleBusinessChange('city', v)} />
                  <Field label={t('Country')} name="country" value={data.business.country} onChange={(v) => handleBusinessChange('country', v)} />
                  <Field label={t('Province')} name="province" value={data.business.province} onChange={(v) => handleBusinessChange('province', v)} />
                  <Field label={t('District')} name="district" value={data.business.district} onChange={(v) => handleBusinessChange('district', v)} />
                  <Field label={t('Sector')} name="sector" value={data.business.sector} onChange={(v) => handleBusinessChange('sector', v)} />
                  <Field label={t('Description')} name="description" value={data.business.description} onChange={(v) => handleBusinessChange('description', v)} />
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 tracking-wide">{t('Currency')}</label>
                    <div className="relative">
                      <select value={data.business.currency} onChange={(e) => handleBusinessChange('currency', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm text-slate-900 appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium">
                        <option value="RWF">{t('RWF (Rwandan F.)')}</option>
                        <option value="USD">{t('USD (US Dollar)')}</option>
                        <option value="EUR">{t('EUR (Euro)')}</option>
                      </select>
                    </div>
                  </div>
                  <Field label={t('Tax Rate (%)')} name="taxRate" value={data.business.taxRate} onChange={(v) => handleBusinessChange('taxRate', parseFloat(v) || 0)} />
                </div>
                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{t('Business Branches')}</h3>
                    <p className="text-xs text-slate-500 mt-1">{t('Create branches first, then assign managers and staff to them.')}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                    <Field label={t('Branch Name')} value={newBranch.name} onChange={(value) => setNewBranch({ ...newBranch, name: value })} placeholder={t('Downtown Branch')} />
                    <Field label={t('Address')} value={newBranch.address} onChange={(value) => setNewBranch({ ...newBranch, address: value })} placeholder={t('Branch location')} />
                    <button type="button" onClick={handleCreateBranch} className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-bold px-4 py-2.5 rounded-lg text-sm transition">
                      {t('Add Branch')}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {branches.map((branch) => (
                      <div key={branch.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{branch.name}</p>
                          <p className="text-xs text-slate-500 truncate">{branch.address || t('No address')} · {branch.userCount || 0} {t('users')}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" onClick={() => handleOpenBranch(branch)} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100">
                            {t('Open dashboard')}
                          </button>
                          <button type="button" onClick={() => handleToggleBranch(branch)} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${branch.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {branch.isActive ? t('Active') : t('Inactive')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-4"></div>
                <div className="flex justify-end pt-2">
                  <button type="submit" className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                    {t('Save Changes')}
                  </button>
                </div>
              </form>
              {isOwnerUser && <BusinessAccountZone />}
              </>
            ) : activeSubTab === 'backup' ? (
              <div className="p-8 space-y-6">
                <SectionTitle title={t('BACKUP & RESTORE')} subtitle={t('Create and restore system backups.')} />
                <div className="border-t border-slate-100"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  <Field label={t('Backup Name')} value={backupName} onChange={setBackupName} placeholder={t('my_backup_01')} />
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 tracking-wide">{t('Type')}</label>
                    <div className="relative">
                      <select value={backupType} onChange={(e) => setBackupType(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm text-slate-900 appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium">
                        <option value="full">{t('Full Backup')}</option>
                        <option value="partial">{t('File / Partial Backup')}</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={handleTriggerBackup} disabled={loading} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm disabled:opacity-50">
                    {t('Create Backup')}
                  </button>
                </div>

                <SectionTitle title={t('RESTORE BACKUP')} subtitle={t('Restore the system to a previously saved state.')} />
                <div className="border-t border-slate-100"></div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative">
                    <select value={restoreId} onChange={(e) => setRestoreId(e.target.value)} className="bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm text-slate-900 appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium max-w-[360px]">
                      <option value="">{t('— Select backup to restore —')}</option>
                      {backups.map((b) => (
                        <option key={b.id} value={b.id}>{b.backupName} · {b.backupType} · {new Date(b.createdAt).toLocaleString()}</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={handleRestore} disabled={loading} className="text-amber-800 border border-amber-300 px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-50 transition disabled:opacity-50">{t('Restore Selected')}</button>
                </div>
                {restoreMsg && (
                  <div className={`p-3 rounded-lg text-sm font-medium border ${restoreMsg.startsWith('❌') ? 'bg-red-50 border-red-300 text-red-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>{stripIcons(restoreMsg)}</div>
                )}

                <SectionTitle title={t('BACKUP HISTORY')} subtitle={t('Previously saved backups.')} />
                <div className="border-t border-slate-100"></div>
                {backups.length === 0 ? (
                  <p className="text-slate-400">{t('No backups recorded yet.')}</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Name')}</th>
                          <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Type')}</th>
                          <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Status')}</th>
                          <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-right">{t('Created')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {backups.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50">
                            <td className="p-2 text-slate-700">{b.backupName}</td>
                            <td className="p-2 text-slate-700">{b.backupType}</td>
                            <td className="p-2"><span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-100 text-emerald-800 border-emerald-300">{b.status}</span></td>
                            <td className="p-2 text-right text-slate-400">{new Date(b.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : activeSubTab === 'subscription' ? (
              <OwnerPlanSummary />
            ) : activeSubTab === 'permissions' ? (
              <div className="p-8 space-y-6">
                <SectionTitle title={t('ROLE PERMISSIONS')} subtitle={t('Toggle what each role can do across the system.')} />
                <div className="border-t border-slate-100"></div>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">{t('Role')}</th>
                        {PERMISSION_LABELS.map(([k, lbl]) => <th key={k} className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-center">{t(lbl)}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {permDraft.map((p) => (
                        <tr key={p.role}>
                          <td className="p-2"><span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-500 border-slate-200">{p.role}</span></td>
                          {PERMISSION_LABELS.map(([k]) => (
                            <td key={k} className="p-2 text-center">
                              <input type="checkbox" checked={!!p[k]} onChange={() => togglePerm(p.role, k)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                      {!permDraft.length && (
                        <tr><td colSpan={PERMISSION_LABELS.length + 1} className="p-2 text-center text-slate-400">{t('No roles configured.')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <button onClick={handleSavePermissions} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                    {t('Save Permissions')}
                  </button>
                </div>
              </div>
            ) : activeSubTab === 'security' ? (
              <div className="p-8 space-y-6">
                <SectionTitle title={t('SECURITY SETTINGS')} subtitle={t('Password policy, login attempts and session timeout.')} />
                <div className="border-t border-slate-100"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 max-w-[480px]">
                  <Field label={t('Max Login Attempts')} value={data.settings.max_login_attempts ?? 5} onChange={(v) => setSetting('max_login_attempts', v)} />
                  <Field label={t('Session Timeout (min)')} value={data.settings.session_timeout ?? 30} onChange={(v) => setSetting('session_timeout', v)} />
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <SectionTitle title={t('TWO-FACTOR AUTHENTICATION')} subtitle={t('Add an extra layer of security to login.')} />
                  <div className="border-t border-slate-100"></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 max-w-[480px]">
                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={twoFactor.isEnabled} onChange={(e) => setTwoFactor({ ...twoFactor, isEnabled: e.target.checked })} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                      <span className="text-sm font-semibold text-slate-700">{t('Enable 2FA')}</span>
                    </div>
                   {twoFactor.isEnabled && (
                     <>
                       <div className="space-y-1.5">
                         <label className="text-xs font-bold text-slate-800 tracking-wide">{t('Method')}</label>
                         <div className="relative">
                           <select value={twoFactor.method} onChange={(e) => setTwoFactor({ ...twoFactor, method: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm text-slate-900 appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium">
                             <option value="email">{t('Email')}</option>
                             <option value="sms">{t('SMS')}</option>
                             <option value="authenticator">{t('Authenticator App')}</option>
                           </select>
                         </div>
                       </div>
                     </>
                   )}
                   <div className="flex justify-end pt-2">
                     <button onClick={handleSaveTwoFactor} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                       {t('Save 2FA Settings')}
                     </button>
                   </div>
                  </div>
                  {twoFactor.isEnabled && (
                    <div className="flex justify-end pt-2">
                      <button onClick={handleSaveTwoFactor} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                        {t('Save 2FA Settings')}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button onClick={handleSaveSecurity} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                    {t('Save Security Settings')}
                  </button>
                </div>
              </div>
            ) : activeSubTab === 'payments' ? (
              <PaymentQRSettings />
            ) : activeSubTab === 'audit' ? (
              <div className="p-6">
                <SectionTitle title={t('AUDIT LOGS')} subtitle={t('View system audit logs and export records.')} />
                <div className="p-6">
                  <AuditLogViewer />
                </div>
              </div>
            ) : (
              <div className="p-8 space-y-6">
                <SectionTitle title={t('RECOVERY')} subtitle={t('Use the Backup tab to create and restore backups.')} />
                <div className="border-t border-slate-100"></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button className="text-left bg-white border border-slate-300 px-4 py-4 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 transition" onClick={() => setActiveSubTab('backup')}>
                    <strong className="block">{t('📦 Restore from Backup')}</strong><span className="font-normal text-slate-500">{t('Recover data from a saved backup file')}</span>
                  </button>
                  <button className="text-left bg-white border border-slate-300 px-4 py-4 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50" onClick={handleTriggerBackup} disabled={loading}>
                    <strong className="block">{t('➕ Create Recovery Point')}</strong><span className="font-normal text-slate-500">{t('Snapshot current state for safekeeping')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

/* --- Field + Micro components --- */

function Field({ label, name, value, onChange, placeholder, readOnly = false }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-800 tracking-wide">{label}</label>
      <input
        type="text"
        name={name}
        value={value ?? ''}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none transition ${readOnly ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10'}`}
      />
    </div>
  )
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="settings-section-title space-y-1">
      <h2 className="text-lg font-bold text-[#0F172A] tracking-tight">{title}</h2>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </div>
  )
}

function SidebarIcon({ icon, active = false }) {
  return (
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center cursor-pointer transition ${
      'text-slate-400 hover:bg-slate-800/50 hover:text-white'
    }`}>
      {icon}
    </div>
  )
}

function SubTabButton({ id, label, icon, active, onClick, showBar = false }) {
  const ref = useRef(null)
  // On phones the tabs are one swipeable row; keep the active one in view.
  useEffect(() => {
    if (active && ref.current && window.matchMedia?.('(max-width: 768px)').matches) {
      ref.current.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    }
  }, [active])
  return (
    <button
      ref={ref}
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={() => onClick(id)}
      className={`settings-tab w-full relative flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium transition ${active ? 'is-active ' : ''}${
        active
          ? 'text-slate-900 font-bold'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {showBar && active && (
        <span className="absolute left-0 top-1/4 bottom-1/4 w-[3px] bg-slate-900 rounded-r-md"></span>
      )}
      <span className={active ? 'text-slate-900' : 'text-slate-400'}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}
