import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Globe, Info, CreditCard, Wallet, Mail, Bell, ShieldCheck, Database, ClipboardList, QrCode, Wrench } from 'lucide-react'
import { fetchPlatformSettings, updatePlatformSettings, sendPlatformTestEmail, runPlatformDailyJobs } from '../../api/endpoints'
import { useToast } from '../../context/ToastContext'
import { usePreferences } from '../../context/PreferencesContext'

const SETTINGS_GROUPS = [
  {
    id: 'general_info',
    label: 'General Info',
    items: [
      { id: 'general', label: 'General', icon: Globe },
      { id: 'maintenance', label: 'Maintenance', icon: Wrench },
      { id: 'platform_info', label: 'Platform Info', icon: Info },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [
      { id: 'email', label: 'Email', icon: Mail },
      { id: 'notification', label: 'Notifications', icon: Bell },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    items: [
      { id: 'security', label: 'Security', icon: ShieldCheck },
      { id: 'backup', label: 'Backup', icon: Database },
      { id: 'audit', label: 'Audit', icon: ClipboardList },
    ],
  },
  {
    id: 'financial',
    label: 'Financial',
    items: [
      { id: 'payment', label: 'Payment', icon: Wallet },
      { id: 'subscription', label: 'Subscription', icon: CreditCard },
      { id: 'qr', label: 'QR Code', icon: QrCode },
    ],
  },
]

const ALL_TABS = SETTINGS_GROUPS.flatMap((g) => g.items)
const apiError = (e, fallback) => e?.response?.data?.error || e?.message || fallback

function getTabFromHash() {
  if (typeof window === 'undefined') return 'general'
  const hash = window.location.hash.replace('#', '')
  return ALL_TABS.some((t) => t.id === hash) ? hash : 'general'
}

export default function Settings() {
  const { showSuccess } = useToast()
  const { t } = usePreferences()
  const [settings, setSettings] = useState({})
  const [saved, setSaved] = useState({})
  const [yourIp, setYourIp] = useState('')
  const [activeTab, setActiveTab] = useState(getTabFromHash)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [jobResult, setJobResult] = useState(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const onHashChange = () => setActiveTab(getTabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchPlatformSettings()
      setSettings(data.flat || {})
      setSaved(data.flat || {})
      setYourIp(data.yourIp || '')
    } catch (e) {
      setError(apiError(e, t('Could not load settings.')))
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (id) => {
    setActiveTab(id)
    window.location.hash = id
  }

  const set = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }))

  // Only what changed is sent, so old values elsewhere never block a save.
  const changes = useMemo(() => Object.fromEntries(
    Object.entries(settings).filter(([k, v]) => !k.endsWith('_set') && String(v ?? '') !== String(saved[k] ?? ''))
  ), [settings, saved])
  const dirty = Object.keys(changes).length > 0

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await updatePlatformSettings(changes)
      showSuccess(t('Changes saved. They apply across the platform within a few seconds.'))
      await load()
    } catch (e) {
      setError(apiError(e, t('Save failed.')))
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await sendPlatformTestEmail(testTo.trim())
      setTestResult({ ok: true, text: `${t('Test email sent.')} ${result.message || ''}` })
    } catch (e) {
      setTestResult({ ok: false, text: apiError(e, t('Could not send the test email.')) })
    } finally {
      setTesting(false)
    }
  }

  const runJobs = async () => {
    setJobResult(null)
    try {
      const result = await runPlatformDailyJobs()
      setJobResult({ ok: true, text: JSON.stringify(result) })
    } catch (e) {
      setJobResult({ ok: false, text: apiError(e, t('Could not run the daily jobs.')) })
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  const props = { settings, set }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('Settings')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Configure the BarFlow platform. Every setting here takes effect for all businesses.')}</p>
        </div>
        <button onClick={save} disabled={saving || !dirty} className="px-5 py-2.5 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition inline-flex items-center gap-2">
          {saving ? t('Saving...') : dirty ? `${t('Save Changes')} (${Object.keys(changes).length})` : t('Saved')}
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
      {String(saved.maintenance_mode) === 'true' && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {t('Maintenance mode is ON: business users and customers see the maintenance message. Platform admins are not affected.')}
        </p>
      )}

      <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">
        <div className="platform-settings-sidebar w-full md:w-64 shrink-0 bg-white border border-slate-200 rounded-xl p-2 md:sticky md:top-4">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0">
            {SETTINGS_GROUPS.map((group) => {
              const isGroupActive = group.items.some((i) => i.id === activeTab)
              return (
                <div key={group.id} className="mb-1 flex-shrink-0 md:flex-shrink">
                  <div className={`hidden md:block px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider ${isGroupActive ? 'text-indigo-700 bg-indigo-50' : 'text-slate-500'}`}>
                    {t(group.label)}
                  </div>
                  <div className="md:hidden text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">{t(group.label)}</div>
                  <div className="flex md:flex-col gap-1">
                    {group.items.map((tab) => {
                      const Icon = tab.icon
                      return (
                        <button key={tab.id} onClick={() => switchTab(tab.id)}
                          className={`whitespace-nowrap flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition ${activeTab === tab.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                          <Icon size={16} /> {t(tab.label)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4 md:p-6 shadow-sm min-w-0">
          {activeTab === 'general' && (
            <TabBody title="General Settings" desc="Platform name, default language, timezone and currency.">
              <Field label="Platform Name" v="platform_name" hint="Shown on the sign-in page and as the email sender name." {...props} />
              <Select label="Default language" v="platform_language" hint="Used for visitors who have not chosen a language." options={[['en', 'English'], ['fr', 'French'], ['rw', 'Kinyarwanda'], ['sw', 'Swahili']]} {...props} />
              <Field label="Timezone" v="platform_timezone" hint="IANA name, for example Africa/Kigali." {...props} />
              <Select label="Default currency" v="platform_currency" hint="Currency for newly registered businesses." options={[['RWF', 'RWF'], ['USD', 'USD'], ['EUR', 'EUR'], ['KES', 'KES'], ['UGX', 'UGX'], ['TZS', 'TZS']]} {...props} />
            </TabBody>
          )}
          {activeTab === 'maintenance' && (
            <TabBody title="Maintenance" desc="Temporarily close the platform for businesses and customers.">
              <Toggle label="Maintenance mode" v="maintenance_mode" hint="When on, everyone except platform admins sees the message below." {...props} />
              <TextArea label="Message shown to users" v="maintenance_message" span {...props} />
            </TabBody>
          )}
          {activeTab === 'platform_info' && (
            <TabBody title="Platform Information" desc="Details shown to businesses and used in emails.">
              <Field label="App address" v="platform_app_url" hint="Public address of the web app (e.g. https://app.barflow.rw). Used in password-reset links and payment QR codes." {...props} />
              <Field label="Logo (URL or emoji)" v="platform_logo" {...props} />
              <Field label="Website" v="platform_website" {...props} />
              <Field label="Contact Email" v="platform_contact_email" hint="Receives admin notifications (new businesses, payments)." {...props} />
              <Field label="Contact Phone" v="platform_contact_phone" {...props} />
              <TextArea label="Description" v="platform_description" span {...props} />
            </TabBody>
          )}
          {activeTab === 'subscription' && (
            <TabBody title="Subscription Settings" desc="Reminders and what happens when a subscription ends.">
              <div className="sm:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-900">
                {t('Plan prices and discounts are set per plan.')} <Link to="/admin/plans" className="font-semibold underline">{t('Edit subscription plans')}</Link>
              </div>
              <Field label="Renewal reminder (days before the end)" v="subscription_renewal_reminder_days" type="number" hint="The owner gets one reminder email per subscription period." {...props} />
              <Field label="Grace period after the end (days)" v="subscription_grace_days" type="number" hint="0 = blocked as soon as the subscription ends. To let a business continue without paying, use “Grant unpaid access” on the business." {...props} />
            </TabBody>
          )}
          {activeTab === 'payment' && (
            <TabBody title="Payment Settings" desc="How businesses can pay for their subscription.">
              <Toggle label="Enable MTN MoMo" v="payment_momo_enabled" {...props} />
              <Field label="MoMo pay code" v="payment_momo_code" hint="Shown to owners next to the MTN option." {...props} />
              <Toggle label="Enable Airtel Money" v="payment_airtel_enabled" {...props} />
              <Field label="Airtel pay code" v="payment_airtel_code" hint="Shown to owners next to the Airtel option." {...props} />
              <Toggle label="Enable bank transfer" v="payment_bank_enabled" hint="Owners get a reference; you confirm the transfer in Payments." {...props} />
              <Field label="Bank account" v="payment_bank_account" hint="Bank name, account number and holder. Required for bank transfer." {...props} />
            </TabBody>
          )}
          {activeTab === 'email' && (
            <TabBody title="Email Settings" desc="Account used to send password resets, receipts and notifications.">
              <Field label="SMTP Host" v="email_smtp_host" hint="Empty = smtp.gmail.com" {...props} />
              <Field label="SMTP Port" v="email_smtp_port" type="number" {...props} />
              <Field label="SMTP Username" v="email_smtp_user" {...props} />
              <Field label="SMTP Password" v="email_smtp_password" type="password"
                hint={settings.email_smtp_password_set ? 'A password is saved. Leave empty to keep it.' : 'For Gmail use an app password.'} {...props} />
              <Field label="From Address" v="email_from_address" hint="Gmail always sends from the signed-in address." {...props} />
              <Field label="From Name" v="email_from_name" {...props} />
              <div className="sm:col-span-2 rounded-lg border border-slate-200 p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-800">{t('Send a test email')}</p>
                <p className="text-xs text-slate-500">{t('Save your changes first. If the account in Settings is rejected, the server account from the environment is used.')}</p>
                <div className="flex flex-wrap gap-2">
                  <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  <button type="button" onClick={sendTest} disabled={testing || !testTo.trim() || dirty} className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-lg disabled:opacity-50">{testing ? t('Sending...') : t('Send test')}</button>
                </div>
                {testResult && <p className={`text-sm ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>{testResult.text}</p>}
              </div>
            </TabBody>
          )}
          {activeTab === 'notification' && (
            <TabBody title="Notification Settings" desc="Which emails the platform sends.">
              <Toggle label="Enable email notifications" v="email_notifications_enabled" hint="Master switch for all emails except password resets." {...props} />
              <Toggle label="New business registered (to admin)" v="notify_new_business" {...props} />
              <Toggle label="Payment received (to admin)" v="notify_payment_received" {...props} />
              <Toggle label="Subscription reminders and expiry (to owners)" v="notify_subscription_expiry" {...props} />
            </TabBody>
          )}
          {activeTab === 'security' && (
            <TabBody title="Security Settings" desc="Applies to every business and to platform admins.">
              <Field label="Minimum password length" v="security_min_password_length" type="number" hint="For new passwords and password changes (6–64)." {...props} />
              <Toggle label="Require two-factor authentication" v="security_require_2fa" hint="A code sent by email is needed at every sign-in." {...props} />
              <Field label="Session timeout (minutes)" v="security_session_timeout" type="number" hint="People sign in again after this long. A business owner may set a shorter time." {...props} />
              <Field label="Max login attempts" v="security_max_login_attempts" type="number" hint="Then the account is locked for 15 minutes." {...props} />
              <TextArea label="Admin IP allow-list (comma separated)" v="security_ip_whitelist" span
                hint={`Only these addresses can use the platform admin area. Empty = any address. Your address: ${yourIp || 'unknown'}`} {...props} />
            </TabBody>
          )}
          {activeTab === 'backup' && (
            <TabBody title="Backup Settings" desc="Automatic database backups (needs pg_dump on the server).">
              <Toggle label="Automatic backups" v="backup_auto_enabled" {...props} />
              <Select label="Frequency" v="backup_frequency" options={[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]} {...props} />
              <Field label="Keep backups for (days)" v="backup_retention_days" type="number" hint="Older backups and their files are removed automatically." {...props} />
              <div className="sm:col-span-2 rounded-lg border border-slate-200 p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-800">{t('Daily jobs')}</p>
                <p className="text-xs text-slate-500">{t('Expired subscriptions, renewal reminders, audit clean-up and automatic backups run once a day. You can run them now.')}</p>
                <button type="button" onClick={runJobs} className="px-4 py-2 text-sm font-semibold border border-slate-300 rounded-lg hover:bg-slate-50">{t('Run now')}</button>
                {jobResult && <p className={`text-xs break-all ${jobResult.ok ? 'text-slate-600' : 'text-red-700'}`}>{jobResult.text}</p>}
              </div>
            </TabBody>
          )}
          {activeTab === 'audit' && (
            <TabBody title="Audit Settings" desc="What is recorded in business audit logs.">
              <Toggle label="Enable audit logging" v="audit_log_enabled" hint="Platform admin actions are always recorded." {...props} />
              <Toggle label="Log sign-ins and sign-outs" v="audit_log_login_events" {...props} />
              <Field label="Keep logs for (days)" v="audit_log_retention_days" type="number" {...props} />
            </TabBody>
          )}
          {activeTab === 'qr' && (
            <TabBody title="QR Code Settings" desc="Defaults for the table and payment QR codes businesses print.">
              <Field label="Default size (px)" v="qr_default_size" type="number" {...props} />
              <Toggle label="Show the platform logo in the middle" v="qr_include_logo" hint="Use high error correction with a logo so codes stay readable." {...props} />
              <Select label="Error correction" v="qr_error_correction" options={[['L', 'Low (L)'], ['M', 'Medium (M)'], ['Q', 'Quartile (Q)'], ['H', 'High (H)']]} {...props} />
            </TabBody>
          )}
        </div>
      </div>
    </div>
  )
}

function TabBody({ title, desc, children }) {
  const { t } = usePreferences()
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">{t(title)}</h2>
      <p className="text-sm text-slate-500 mt-0.5 mb-5">{t(desc)}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">{children}</div>
    </div>
  )
}

function Hint({ text }) {
  const { t } = usePreferences()
  return text ? <p className="text-xs text-slate-500">{t(text)}</p> : null
}

function Field({ label, v, settings, set, type = 'text', hint }) {
  const { t } = usePreferences()
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700" htmlFor={`ps-${v}`}>{t(label)}</label>
      <input id={`ps-${v}`} type={type} value={settings[v] ?? ''} onChange={(e) => set(v, e.target.value)} autoComplete={type === 'password' ? 'new-password' : 'off'}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
      <Hint text={hint} />
    </div>
  )
}

function TextArea({ label, v, settings, set, span, hint }) {
  const { t } = usePreferences()
  return (
    <div className={`space-y-1.5 ${span ? 'sm:col-span-2' : ''}`}>
      <label className="block text-sm font-semibold text-slate-700" htmlFor={`ps-${v}`}>{t(label)}</label>
      <textarea id={`ps-${v}`} rows={3} value={settings[v] ?? ''} onChange={(e) => set(v, e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
      <Hint text={hint} />
    </div>
  )
}

function Select({ label, v, settings, set, options, hint }) {
  const { t } = usePreferences()
  const value = settings[v] ?? ''
  const known = options.some(([val]) => val === value)
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700" htmlFor={`ps-${v}`}>{t(label)}</label>
      <select id={`ps-${v}`} value={value} onChange={(e) => set(v, e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
        {!known && <option value={value}>{value ? `${value} (${t('not available any more')})` : t('Choose…')}</option>}
        {options.map(([val, text]) => <option key={val} value={val}>{t(text)}</option>)}
      </select>
      <Hint text={hint} />
    </div>
  )
}

function Toggle({ label, v, settings, set, hint }) {
  const { t } = usePreferences()
  const on = String(settings[v]) === 'true'
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-semibold text-slate-700">{t(label)}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={t(label)} onClick={() => set(v, on ? 'false' : 'true')}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-indigo-600' : 'bg-slate-300'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      <Hint text={hint} />
    </div>
  )
}
