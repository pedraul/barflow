import React, { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOwner } from '../../context/OwnerContext'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getTwoFactorSettings, updateTwoFactorSettings } from '../../api/endpoints'
import QRCode from '../../components/QRCode'
import {
  User, Database, CreditCard, ShieldCheck, Lock, RefreshCw,
  Settings, HelpCircle, LogOut, FileText,
  Menu, Bell, ChevronDown, Save, Wallet, Printer, Mail,
} from 'lucide-react'
import AuditLogViewer from './AuditLogViewer'

const TABS = [
  { id: 'account', label: 'Account', icon: <User size={18} /> },
  { id: 'notifications', label: 'Notifications', icon: <Mail size={18} /> },
  { id: 'backup', label: 'Backup', icon: <Database size={18} /> },
  { id: 'subscription', label: 'Subscription', icon: <CreditCard size={18} /> },
  { id: 'audit', label: 'Audit', icon: <FileText size={18} /> },
  { id: 'payments', label: 'Payments', icon: <Wallet size={18} /> },
  { id: 'permissions', label: 'Permissions', icon: <ShieldCheck size={18} /> },
  { id: 'security', label: 'Security', icon: <Lock size={18} /> },
  { id: 'recovery', label: 'Recovery', icon: <RefreshCw size={18} /> },
]

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
  const { fetchPermissions } = useAuth()
  const {
    fetchSystemSettings, updateSystemSettings, triggerBackup, fetchBackups,
    restoreBackup, updatePermissions, loading,
    fetchPaymentSettings, updatePaymentSettings, generateMerchantQRPayment,
  } = useOwner()

  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [activeSubTab, setActiveSubTab] = useState('account')

  // derive active subtab from path (e.g. /settings/security)
  React.useEffect(() => {
    const parts = pathname.split('/').filter(Boolean)
    const last = parts[parts.length - 1] || 'account'
    if (TABS.find(t => t.id === last)) setActiveSubTab(last)
  }, [pathname])
  const [message, setMessage] = useState('')
  const [data, setData] = useState({
    business: { name: '', address: '', phone: '', email: '', currency: 'RWF', taxRate: 18 },
    settings: {}, permissions: [], backups: [],
  })
  const [backupName, setBackupName] = useState('')
  const [backupType, setBackupType] = useState('full')
  const [backups, setBackups] = useState([])
  const [restoreId, setRestoreId] = useState('')
  const [restoreMsg, setRestoreMsg] = useState('')
  const [permDraft, setPermDraft] = useState([])
  const [paymentSettings, setPaymentSettings] = useState({
    qrPaymentEnabled: false,
    mtnMomoNumber: '',
    airtelMoneyNumber: '',
    merchantCode: '',
    bankAccount: '',
    merchantName: 'BarFlow Business',
  })
  const [twoFactor, setTwoFactor] = useState({ isEnabled: false, method: 'email', scope: 'business', businessId: null })
  const [merchantQR, setMerchantQR] = useState(null)

  const loadBackups = useCallback(async () => {
    try {
      const res = await fetchBackups()
      setBackups(Array.isArray(res) ? res : (res.backups || []))
    } catch (e) { /* ignore */ }
  }, [fetchBackups])

  const load = useCallback(async () => {
    try {
      const d = await fetchSystemSettings()
      const settingsData = d && typeof d === 'object' ? d : {}
      setData({
        business: settingsData.business || { name: '', address: '', phone: '', email: '', currency: 'RWF', taxRate: 18 },
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
    const refresh = window.setInterval(load, 30000)
    window.addEventListener('focus', load)
    return () => {
      window.clearInterval(refresh)
      window.removeEventListener('focus', load)
    }
  }, [load])

  const flash = (m) => { setMessage(m); setTimeout(() => setMessage(''), 4000) }

  const handleSaveAccount = async () => {
    try {
      await updateSystemSettings(data.business)
      flash('✅ Account settings saved successfully.')
    } catch (e) { flash('❌ ' + e.message) }
  }
  const handleBusinessChange = (field, value) =>
    setData({ ...data, business: { ...data.business, [field]: value } })

  const handleTriggerBackup = async () => {
    try {
      const res = await triggerBackup({ backupName: backupName || undefined, backupType })
      flash(`✅ Backup "${res.backup?.name || backupName}" completed.`)
      setBackupName('')
      await loadBackups()
    } catch (e) { flash('❌ ' + e.message) }
  }

  const handleRestore = async () => {
    setRestoreMsg('')
    if (!restoreId) return setRestoreMsg('❌ Select a backup to restore.')
    try {
      const res = await restoreBackup(restoreId)
      setRestoreMsg('✅ ' + res.message)
      setRestoreId('')
    } catch (e) { setRestoreMsg('❌ ' + e.message) }
  }

  const handleSaveSubscriptionSettings = async () => {
    try {
      const keys = ['subscription_monthly_price', 'subscription_quarterly_price', 'subscription_annually_price', 'subscription_quarterly_discount', 'subscription_annually_discount', 'auto_renewal', 'alert_before_expiry_days']
      const settings = {}
      keys.forEach((k) => { if (data.settings[k] !== undefined) settings[k] = data.settings[k] })
      await updateSystemSettings({ settings })
      flash('✅ Subscription settings saved.')
    } catch (e) { flash('❌ ' + e.message) }
  }
  const setSetting = (key, value) =>
    setData({ ...data, settings: { ...data.settings, [key]: value } })

  const handleSavePermissions = async () => {
    try {
      for (const p of permDraft) {
        await updatePermissions(p.role, p)
      }
      flash('✅ Permissions updated for all roles.')
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
      flash('✅ Security settings saved.')
    } catch (e) { flash('❌ ' + e.message) }
  }

  const loadPaymentSettings = useCallback(async () => {
    try {
      const s = await fetchPaymentSettings()
      if (s && typeof s === 'object') {
        setPaymentSettings({
          qrPaymentEnabled: !!s.qrPaymentEnabled,
          mtnMomoNumber: s.mtnMomoNumber || '',
          airtelMoneyNumber: s.airtelMoneyNumber || '',
          merchantCode: s.merchantCode || '',
          bankAccount: s.bankAccount || '',
          merchantName: s.merchantName || 'BarFlow Business',
        })
      }
    } catch (e) { console.error('Failed to load payment settings:', e) }
  }, [fetchPaymentSettings])

  const loadTwoFactorSettings = useCallback(async () => {
    try {
      const s = await getTwoFactorSettings()
      setTwoFactor({
        isEnabled: !!s.isEnabled,
        method: s.method || 'email',
        scope: s.scope || 'platform',
        businessId: s.businessId || null,
      })
    } catch (e) { console.error('Failed to load 2FA settings:', e) }
  }, [])

  const handleSaveTwoFactor = async () => {
    try {
      await updateTwoFactorSettings({
        isEnabled: twoFactor.isEnabled,
        method: twoFactor.method,
        scope: twoFactor.scope,
        businessId: twoFactor.scope === 'business' ? twoFactor.businessId : null,
      })
      flash('✅ Two-factor authentication settings saved.')
    } catch (e) { flash('❌ ' + e.message) }
  }

  const loadMerchantQR = useCallback(async () => {
    try {
      const data = await generateMerchantQRPayment()
      if (data && data.qrPayload) {
        setMerchantQR(data)
      }
    } catch (e) {
      console.error('Failed to load merchant QR:', e)
    }
  }, [generateMerchantQRPayment])

  const handleSavePaymentSettings = async () => {
    try {
      await updatePaymentSettings({
        qrPaymentEnabled: paymentSettings.qrPaymentEnabled,
        mtnMomoNumber: paymentSettings.mtnMomoNumber,
        airtelMoneyNumber: paymentSettings.airtelMoneyNumber,
        merchantCode: paymentSettings.merchantCode,
        bankAccount: paymentSettings.bankAccount,
        merchantName: paymentSettings.merchantName,
      })
      await loadPaymentSettings()
      if (paymentSettings.qrPaymentEnabled) {
        await loadMerchantQR()
      }
      flash('✅ Payment settings saved.')
    } catch (e) { flash('❌ ' + e.message) }
  }

  React.useEffect(() => {
    if (activeSubTab === 'payments') {
      loadPaymentSettings()
    }
  }, [activeSubTab, loadPaymentSettings])

  React.useEffect(() => {
    if (activeSubTab === 'security') {
      loadTwoFactorSettings()
    }
  }, [activeSubTab, loadTwoFactorSettings])

  React.useEffect(() => {
    if (activeSubTab === 'payments' && paymentSettings.qrPaymentEnabled) {
      loadMerchantQR()
    }
  }, [activeSubTab, paymentSettings.qrPaymentEnabled, loadMerchantQR])

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased">
      <div className="flex-1 flex flex-col h-screen overflow-hidden">

        {/* 2. TOP BANNER HEADER */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-xs">
          <div className="flex items-center gap-4">
            <button className="text-slate-600 hover:text-slate-900 transition">
              <Menu size={20} />
            </button>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 tracking-wider">
                <span className="text-[#0066FF]">OWNER WORKSPACE</span>
                <span className="text-slate-300 font-normal">&gt;</span>
                <span className="text-slate-800">SYSTEM SETTINGS</span>
              </div>
               <p className="text-xs text-slate-500 mt-0.5">
                 Configure account, backup, subscription, payments, permissions, security &amp; recovery.
               </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative cursor-pointer p-1.5 hover:bg-slate-100 rounded-full transition">
              <Bell size={20} className="text-slate-600" />
              <span className="absolute top-1.5 right-1.5 bg-red-500 w-2 h-2 rounded-full"></span>
            </div>
            <div className="flex items-center gap-2.5 border-l pl-4 border-slate-200 cursor-pointer group">
              <div className="w-8 h-8 rounded-full bg-[#0066FF] text-white flex items-center justify-center font-bold text-xs shadow-sm">OL</div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-bold text-slate-900 leading-tight">Owner</p>
                <p className="text-[10px] text-slate-400 font-medium">Super Admin</p>
              </div>
              <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600 transition" />
            </div>
          </div>
        </header>

        {/* 3. WORKING WORKSPACE SCROLL CONTENT */}
        <main className="owner-settings-workspace flex-1 overflow-y-auto p-8 flex gap-6 items-start">

          {/* LEFT COLUMN: Sub-Tab Controls */}
            <div className="owner-settings-tabs w-[240px] bg-white border border-slate-200 rounded-xl p-3 shadow-xs space-y-0.5 shrink-0">
            {TABS.map((t) => (
              <SubTabButton key={t.id} id={t.id} label={t.label} icon={t.icon} active={activeSubTab === t.id} onClick={(id) => { navigate(`/settings/${id}`); }} showBar={t.id === 'account'} />
            ))}
          </div>

          {/* RIGHT COLUMN: Settings Viewport Canvas */}
          <div className="owner-settings-panel flex-1 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            {message && (
              <div className={`m-6 p-3 rounded-lg text-sm font-medium border ${message.startsWith('❌') ? 'bg-red-50 border-red-300 text-red-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>{message}</div>
            )}

            {activeSubTab === 'notifications' ? (
              <div className="p-8 space-y-6">
                <SectionTitle title="EMAIL NOTIFICATION PREFERENCES" subtitle="Choose which email notifications you want to receive from the platform." />
                <div className="border-t border-slate-100"></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                  {EMAIL_NOTIFICATION_OPTIONS.map(([key, label]) => {
                    const on = String(data.settings[key]) === 'true'
                    return (
                      <div key={key} className="flex items-center justify-between py-2">
                        <label className="text-sm font-semibold text-slate-700">{label}</label>
                        <button type="button" onClick={() => setSetting(key, on ? 'false' : 'true')}
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
                      flash('✅ Email notification preferences saved.')
                    } catch (e) { flash('❌ ' + e.message) }
                  }} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                    <Save size={16} /> Save Preferences
                  </button>
                </div>
              </div>
            ) : activeSubTab === 'account' ? (
              <form onSubmit={(e) => { e.preventDefault(); handleSaveAccount() }} className="p-8 space-y-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-[#0F172A] tracking-tight">BUSINESS ACCOUNT SETTINGS</h2>
                  <p className="text-xs text-slate-500">Manage your core company profile and tax variables</p>
                </div>
                <div className="border-t border-slate-100"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  <Field label="Business Name" name="name" value={data.business.name} onChange={(v) => handleBusinessChange('name', v)} />
                  <Field label="Email" name="email" value={data.business.email} onChange={(v) => handleBusinessChange('email', v)} />
                  <Field label="Address" name="address" value={data.business.address} onChange={(v) => handleBusinessChange('address', v)} />
                  <Field label="Phone" name="phone" value={data.business.phone} onChange={(v) => handleBusinessChange('phone', v)} />
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 tracking-wide">Currency</label>
                    <div className="relative">
                      <select value={data.business.currency} onChange={(e) => handleBusinessChange('currency', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm text-slate-900 appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium">
                        <option value="RWF">RWF (Rwandan F.)</option>
                        <option value="USD">USD (US Dollar)</option>
                        <option value="EUR">EUR (Euro)</option>
                      </select>
                      <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <Field label="Tax Rate (%)" name="taxRate" value={data.business.taxRate} onChange={(v) => handleBusinessChange('taxRate', parseFloat(v) || 0)} />
                </div>
                <div className="border-t border-slate-100 pt-4"></div>
                <div className="flex justify-end pt-2">
                  <button type="submit" className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                    <Save size={16} /> Save Changes
                  </button>
                </div>
              </form>
            ) : activeSubTab === 'backup' ? (
              <div className="p-8 space-y-6">
                <SectionTitle title="BACKUP & RESTORE" subtitle="Create and restore system backups." />
                <div className="border-t border-slate-100"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  <Field label="Backup Name" value={backupName} onChange={setBackupName} placeholder="my_backup_01" />
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 tracking-wide">Type</label>
                    <div className="relative">
                      <select value={backupType} onChange={(e) => setBackupType(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm text-slate-900 appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium">
                        <option value="full">Full Backup</option>
                        <option value="partial">File / Partial Backup</option>
                      </select>
                      <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={handleTriggerBackup} disabled={loading} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm disabled:opacity-50">
                    <Database size={16} /> Create Backup
                  </button>
                </div>

                <SectionTitle title="RESTORE BACKUP" subtitle="Restore the system to a previously saved state." />
                <div className="border-t border-slate-100"></div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative">
                    <select value={restoreId} onChange={(e) => setRestoreId(e.target.value)} className="bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm text-slate-900 appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium max-w-[360px]">
                      <option value="">— Select backup to restore —</option>
                      {backups.map((b) => (
                        <option key={b.id} value={b.id}>{b.backupName} · {b.backupType} · {new Date(b.createdAt).toLocaleString()}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  <button onClick={handleRestore} disabled={loading} className="text-amber-800 border border-amber-300 px-4 py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-50 transition disabled:opacity-50">Restore Selected</button>
                </div>
                {restoreMsg && (
                  <div className={`p-3 rounded-lg text-sm font-medium border ${restoreMsg.startsWith('❌') ? 'bg-red-50 border-red-300 text-red-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>{restoreMsg}</div>
                )}

                <SectionTitle title="BACKUP HISTORY" subtitle="Previously saved backups." />
                <div className="border-t border-slate-100"></div>
                {backups.length === 0 ? (
                  <p className="text-slate-400">No backups recorded yet.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr>
                          <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Name</th>
                          <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Type</th>
                          <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Status</th>
                          <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-right">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {backups.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50">
                            <td className="p-3 text-slate-700">{b.backupName}</td>
                            <td className="p-3 text-slate-700">{b.backupType}</td>
                            <td className="p-3"><span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold border bg-emerald-100 text-emerald-800 border-emerald-300">{b.status}</span></td>
                            <td className="p-3 text-right text-slate-400">{new Date(b.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : activeSubTab === 'subscription' ? (
              <div className="p-8 space-y-6">
                <SectionTitle title="SUBSCRIPTION SETTINGS" subtitle="Plans and prices are managed by the platform administrator and update here automatically." />
                <div className="border-t border-slate-100"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  <Field label="Monthly Price" value={data.settings.subscription_monthly_price ?? 50000} readOnly />
                  <Field label="Quarterly Price" value={data.settings.subscription_quarterly_price ?? 130000} readOnly />
                  <Field label="Annually Price" value={data.settings.subscription_annually_price ?? 480000} readOnly />
                  <Field label="Monthly Discount (%)" value={0} onChange={() => {}} readOnly />
                  <Field label="Quarterly Discount (%)" value={data.settings.subscription_quarterly_discount ?? 8} readOnly />
                  <Field label="Annually Discount (%)" value={data.settings.subscription_annually_discount ?? 14} readOnly />
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 tracking-wide">Auto Renewal</label>
                    <div className="relative">
                      <select value={data.settings.auto_renewal ?? 'true'} disabled className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm text-slate-900 appearance-none font-medium">
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                      <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <Field label="Alert Before Expiry (days)" value={data.settings.alert_before_expiry_days ?? 7} readOnly />
                </div>
              </div>
            ) : activeSubTab === 'permissions' ? (
              <div className="p-8 space-y-6">
                <SectionTitle title="ROLE PERMISSIONS" subtitle="Toggle what each role can do across the system." />
                <div className="border-t border-slate-100"></div>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Role</th>
                        {PERMISSION_LABELS.map(([k, lbl]) => <th key={k} className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-center">{lbl}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {permDraft.map((p) => (
                        <tr key={p.role}>
                          <td className="p-3"><span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold border bg-slate-100 text-slate-500 border-slate-200">{p.role}</span></td>
                          {PERMISSION_LABELS.map(([k]) => (
                            <td key={k} className="p-3 text-center">
                              <input type="checkbox" checked={!!p[k]} onChange={() => togglePerm(p.role, k)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                      {!permDraft.length && (
                        <tr><td colSpan={PERMISSION_LABELS.length + 1} className="p-3 text-center text-slate-400">No roles configured.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <button onClick={handleSavePermissions} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                    <Save size={16} /> Save Permissions
                  </button>
                </div>
              </div>
            ) : activeSubTab === 'security' ? (
              <div className="p-8 space-y-6">
                <SectionTitle title="SECURITY SETTINGS" subtitle="Password policy, login attempts and session timeout." />
                <div className="border-t border-slate-100"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 max-w-[480px]">
                  <Field label="Max Login Attempts" value={data.settings.max_login_attempts ?? 5} onChange={(v) => setSetting('max_login_attempts', v)} />
                  <Field label="Session Timeout (min)" value={data.settings.session_timeout ?? 30} onChange={(v) => setSetting('session_timeout', v)} />
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <SectionTitle title="TWO-FACTOR AUTHENTICATION" subtitle="Add an extra layer of security to login." />
                  <div className="border-t border-slate-100"></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 max-w-[480px]">
                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={twoFactor.isEnabled} onChange={(e) => setTwoFactor({ ...twoFactor, isEnabled: e.target.checked })} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                      <span className="text-sm font-semibold text-slate-700">Enable 2FA</span>
                    </div>
                   {twoFactor.isEnabled && (
                     <>
                       <div className="space-y-1.5">
                         <label className="text-xs font-bold text-slate-800 tracking-wide">Method</label>
                         <div className="relative">
                           <select value={twoFactor.method} onChange={(e) => setTwoFactor({ ...twoFactor, method: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm text-slate-900 appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium">
                             <option value="email">Email</option>
                             <option value="sms">SMS</option>
                             <option value="authenticator">Authenticator App</option>
                           </select>
                           <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                         </div>
                       </div>
                       <div className="space-y-1.5">
                         <label className="text-xs font-bold text-slate-800 tracking-wide">Scope</label>
                         <div className="relative">
                           <select value={twoFactor.scope} onChange={(e) => setTwoFactor({ ...twoFactor, scope: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2.5 text-sm text-slate-900 appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium">
                             <option value="platform">Platform (all businesses)</option>
                             <option value="business">This Business Only</option>
                           </select>
                           <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                         </div>
                       </div>
                     </>
                   )}
                   <div className="flex justify-end pt-2">
                     <button onClick={handleSaveTwoFactor} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                       <Save size={16} /> Save 2FA Settings
                     </button>
                   </div>
                  </div>
                  {twoFactor.isEnabled && (
                    <div className="flex justify-end pt-2">
                      <button onClick={handleSaveTwoFactor} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                        <Save size={16} /> Save 2FA Settings
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button onClick={handleSaveSecurity} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm">
                    <Save size={16} /> Save Security Settings
                  </button>
                </div>
              </div>
            ) : activeSubTab === 'payments' ? (
              <div className="p-8 space-y-6">
                <SectionTitle title="PAYMENT SETTINGS & QR CODES" subtitle="Configure QR payment methods and merchant details for customer scan-to-pay." />
                <div className="border-t border-slate-100"></div>
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={paymentSettings.qrPaymentEnabled} onChange={(e) => setPaymentSettings({ ...paymentSettings, qrPaymentEnabled: e.target.checked })} className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                  <span className="text-sm font-semibold text-slate-700">Enable QR Payments</span>
                </div>
                {paymentSettings.qrPaymentEnabled && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                      <div className="md:col-span-2">
                        <label className="text-xs font-bold text-slate-800 tracking-wide">Merchant Name</label>
                        <input type="text" value={paymentSettings.merchantName} onChange={(e) => setPaymentSettings({ ...paymentSettings, merchantName: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-800 tracking-wide">MTN Mobile Money Number</label>
                        <input type="text" value={paymentSettings.mtnMomoNumber} onChange={(e) => setPaymentSettings({ ...paymentSettings, mtnMomoNumber: e.target.value })} placeholder="e.g. 0788123456" className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-800 tracking-wide">Airtel Money Number</label>
                        <input type="text" value={paymentSettings.airtelMoneyNumber} onChange={(e) => setPaymentSettings({ ...paymentSettings, airtelMoneyNumber: e.target.value })} placeholder="e.g. 0733123456" className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-800 tracking-wide">Merchant Code</label>
                        <input type="text" value={paymentSettings.merchantCode} onChange={(e) => setPaymentSettings({ ...paymentSettings, merchantCode: e.target.value })} placeholder="e.g. 123456" className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-800 tracking-wide">Bank Account</label>
                        <input type="text" value={paymentSettings.bankAccount} onChange={(e) => setPaymentSettings({ ...paymentSettings, bankAccount: e.target.value })} placeholder="e.g. 40001-0001234567-00" className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition font-medium" />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button onClick={handleSavePaymentSettings} disabled={loading} className="flex items-center gap-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-sm disabled:opacity-50">
                        <Save size={16} /> Save Payment Settings
                      </button>
                    </div>

                    <div className="border-t border-slate-100 pt-6">
                      <h3 className="text-sm font-bold text-slate-800 tracking-wide mb-4">BUSINESS QR CODE</h3>
                      <p className="text-xs text-slate-500 mb-4">Print this QR code and place it at the bar counter or on receipts. Customers can scan it to see your payment details.</p>
                      {merchantQR ? (
                        <div className="flex flex-col items-center gap-4 p-6 border border-slate-200 rounded-xl bg-white">
                          <div className="p-4 bg-white border border-slate-100 rounded-lg shadow-sm">
                            <QRCode value={merchantQR.qrPayload || ''} size={220} level="M" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-900">{merchantQR.merchant?.name || paymentSettings.merchantName}</p>
                            <p className="text-xs text-slate-500 mt-1">QR Payment Enabled</p>
                          </div>
                          <button onClick={() => window.print()} className="flex items-center gap-2 border border-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-slate-50 transition">
                            <Printer size={16} /> Print QR Code
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">Save payment settings to generate your business QR code.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : activeSubTab === 'audit' ? (
              <div className="p-6">
                <SectionTitle title="AUDIT LOGS" subtitle="View system audit logs and export records." />
                <div className="p-6">
                  <AuditLogViewer />
                </div>
              </div>
            ) : (
              <div className="p-8 space-y-6">
                <SectionTitle title="RECOVERY" subtitle="Use the Backup tab to create and restore backups." />
                <div className="border-t border-slate-100"></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button className="text-left bg-white border border-slate-300 px-4 py-4 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 transition" onClick={() => setActiveSubTab('backup')}>
                    <strong className="block">📦 Restore from Backup</strong><span className="font-normal text-slate-500">Recover data from a saved backup file</span>
                  </button>
                  <button className="text-left bg-white border border-slate-300 px-4 py-4 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50" onClick={handleTriggerBackup} disabled={loading}>
                    <strong className="block">➕ Create Recovery Point</strong><span className="font-normal text-slate-500">Snapshot current state for safekeeping</span>
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
    <div className="space-y-1">
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
  return (
    <button
      onClick={() => onClick(id)}
      className={`w-full relative flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium transition ${
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
