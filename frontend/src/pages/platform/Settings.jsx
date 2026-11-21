import React, { useEffect, useState } from 'react'
import { Globe, Info, CreditCard, Wallet, Mail, MessageSquare, Bell, ShieldCheck, Database, ClipboardList, Plug, QrCode } from 'lucide-react'
import { fetchPlatformSettings, updatePlatformSettings } from '../../api/endpoints'
import { useToast } from '../../context/ToastContext'
import { usePreferences } from '../../context/PreferencesContext'

const SETTINGS_GROUPS = [
  {
    id: 'general_info',
    label: 'General Info',
    items: [
      { id: 'general', label: 'General', icon: Globe },
      { id: 'platform_info', label: 'Platform Info', icon: Info },
    ]
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [
      { id: 'email', label: 'Email', icon: Mail },
      { id: 'sms', label: 'SMS', icon: MessageSquare },
      { id: 'notification', label: 'Notifications', icon: Bell },
    ]
  },
  {
    id: 'security',
    label: 'Security',
    items: [
      { id: 'security', label: 'Security', icon: ShieldCheck },
      { id: 'backup', label: 'Backup', icon: Database },
      { id: 'audit', label: 'Audit', icon: ClipboardList },
      { id: 'api', label: 'API', icon: Plug },
    ]
  },
  {
    id: 'financial',
    label: 'Financial',
    items: [
      { id: 'payment', label: 'Payment', icon: Wallet },
      { id: 'qr', label: 'QR Code', icon: QrCode },
      { id: 'subscription', label: 'Subscription', icon: CreditCard },
    ]
  },
]

const ALL_TABS = SETTINGS_GROUPS.flatMap(g => g.items)

function getTabFromHash() {
  if (typeof window === 'undefined') return 'general'
  const hash = window.location.hash.replace('#', '')
  return ALL_TABS.some((t) => t.id === hash) ? hash : 'general'
}

export default function Settings() {
  const { showSuccess } = useToast()
  const { t } = usePreferences()
  const [settings, setSettings] = useState({})
  const [activeTab, setActiveTab] = useState(getTabFromHash)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const onHashChange = () => {
      const tab = getTabFromHash()
      setActiveTab(tab)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchPlatformSettings()
      setSettings(data.flat || {})
    } catch (e) {
      console.error('Failed to load settings:', e)
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (id) => {
    setActiveTab(id)
    window.location.hash = id
  }

  const set = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }))

  const save = async () => {
    setSaving(true)
    try {
      await updatePlatformSettings(settings)
      showSuccess(t('Changes saved successfully.'))
    } catch (e) {
      alert(e.response?.data?.error || t('Save failed.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  const activeGroup = SETTINGS_GROUPS.find(g => g.items.some(i => i.id === activeTab))
  const activeItem = ALL_TABS.find(t => t.id === activeTab)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('Settings')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Configure the BarFlow platform')}</p>
        </div>
        <button onClick={save} disabled={saving} className="px-5 py-2.5 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition inline-flex items-center gap-2">
          {saving ? t('Saving...') : t('Save Changes')}
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">
        {/* Tab nav - grouped - horizontal scroll on mobile */}
        <div className="platform-settings-sidebar w-full md:w-64 shrink-0 bg-white border border-slate-200 rounded-xl p-2 md:sticky md:top-4">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0">
            {SETTINGS_GROUPS.map((group) => {
              const isGroupActive = group.items.some(i => i.id === activeTab)
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

        {/* Tab content */}
        <div className={`flex-1 bg-white border border-slate-200 rounded-xl p-4 md:p-6 shadow-sm min-w-0`}>
          {activeTab === 'general' && (
            <TabBody title="General Settings" desc="Platform name, language, timezone and currency.">
              <Field label="Platform Name" v="platform_name" settings={settings} set={set} />
              <Select label="Language" v="platform_language" settings={settings} set={set} options={[['en', 'English'], ['fr', 'French'], ['rw', 'Kinyarwanda'], ['sw', 'Swahili']]} />
              <Field label="Timezone" v="platform_timezone" settings={settings} set={set} />
              <Field label="Default Currency" v="platform_currency" settings={settings} set={set} />
            </TabBody>
          )}
          {activeTab === 'platform_info' && (
            <TabBody title="Platform Information" desc="Logo, description, website and contact details.">
              <Field label="Logo URL" v="platform_logo" settings={settings} set={set} />
              <Field label="Website" v="platform_website" settings={settings} set={set} />
              <Field label="Contact Email" v="platform_contact_email" settings={settings} set={set} />
              <Field label="Contact Phone" v="platform_contact_phone" settings={settings} set={set} />
              <TextArea label="Description" v="platform_description" settings={settings} set={set} span />
            </TabBody>
          )}
          {activeTab === 'subscription' && (
            <TabBody title="Subscription Settings" desc="Plan prices, discounts and renewal reminders.">
              <Field label="Monthly Price (RWF)" v="subscription_monthly_price" settings={settings} set={set} type="number" />
              <Field label="Quarterly Price (RWF)" v="subscription_quarterly_price" settings={settings} set={set} type="number" />
              <Field label="Annually Price (RWF)" v="subscription_annually_price" settings={settings} set={set} type="number" />
              <Field label="Quarterly Discount (%)" v="subscription_quarterly_discount" settings={settings} set={set} type="number" />
              <Field label="Annually Discount (%)" v="subscription_annually_discount" settings={settings} set={set} type="number" />
              <Field label="Renewal Reminder (days before)" v="subscription_renewal_reminder_days" settings={settings} set={set} type="number" />
            </TabBody>
          )}
          {activeTab === 'payment' && (
            <TabBody title="Payment Settings" desc="MTN MoMo, Airtel Money and bank integration.">
              <Toggle label="Enable MTN MoMo" v="payment_momo_enabled" settings={settings} set={set} />
              <Field label="MoMo Pay Code" v="payment_momo_code" settings={settings} set={set} />
              <Toggle label="Enable Airtel Money" v="payment_airtel_enabled" settings={settings} set={set} />
              <Field label="Airtel Pay Code" v="payment_airtel_code" settings={settings} set={set} />
              <Toggle label="Enable Bank Transfer" v="payment_bank_enabled" settings={settings} set={set} />
              <Field label="Bank Account" v="payment_bank_account" settings={settings} set={set} />
            </TabBody>
          )}
          {activeTab === 'email' && (
            <TabBody title="Email Settings" desc="SMTP configuration and sender details.">
              <Field label="SMTP Host" v="email_smtp_host" settings={settings} set={set} />
              <Field label="SMTP Port" v="email_smtp_port" settings={settings} set={set} type="number" />
              <Field label="SMTP Username" v="email_smtp_user" settings={settings} set={set} />
              <Field label="SMTP Password" v="email_smtp_password" settings={settings} set={set} type="password" />
              <Field label="From Address" v="email_from_address" settings={settings} set={set} />
              <Field label="From Name" v="email_from_name" settings={settings} set={set} />
            </TabBody>
          )}
          {activeTab === 'sms' && (
            <TabBody title="SMS Settings" desc="SMS provider configuration.">
              <Select label="SMS Provider" v="sms_provider" settings={settings} set={set} options={[['none', 'None'], ['africastalking', "Africa's Talking"], ['twilio', 'Twilio'], ['pindo', 'Pindo']]} />
              <Field label="API Key" v="sms_api_key" settings={settings} set={set} type="password" />
              <Field label="Sender ID" v="sms_sender_id" settings={settings} set={set} />
            </TabBody>
          )}
          {activeTab === 'notification' && (
            <TabBody title="Notification Settings" desc="System alerts and email notifications.">
              <Toggle label="Enable Email Notifications" v="email_notifications_enabled" settings={settings} set={set} />
              <Toggle label="New Business Registered" v="notify_new_business" settings={settings} set={set} />
              <Toggle label="Payment Received" v="notify_payment_received" settings={settings} set={set} />
              <Toggle label="Subscription Expiry" v="notify_subscription_expiry" settings={settings} set={set} />
            </TabBody>
          )}
          {activeTab === 'security' && (
            <TabBody title="Security Settings" desc="Password policy, 2FA, session timeout and IP restrictions.">
              <Field label="Min Password Length" v="security_min_password_length" settings={settings} set={set} type="number" />
              <Toggle label="Require Two-Factor Auth (2FA)" v="security_require_2fa" settings={settings} set={set} />
              <Field label="Session Timeout (minutes)" v="security_session_timeout" settings={settings} set={set} type="number" />
              <Field label="Max Login Attempts" v="security_max_login_attempts" settings={settings} set={set} type="number" />
              <TextArea label="IP Whitelist (comma separated)" v="security_ip_whitelist" settings={settings} set={set} span />
            </TabBody>
          )}
          {activeTab === 'backup' && (
            <TabBody title="Backup Settings" desc="Automatic backup schedules and retention.">
              <Toggle label="Enable Automatic Backups" v="backup_auto_enabled" settings={settings} set={set} />
              <Select label="Frequency" v="backup_frequency" settings={settings} set={set} options={[['hourly', 'Hourly'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]} />
              <Field label="Retention (days)" v="backup_retention_days" settings={settings} set={set} type="number" />
            </TabBody>
          )}
          {activeTab === 'audit' && (
            <TabBody title="Audit Settings" desc="Logging and audit policies.">
              <Toggle label="Enable Audit Logging" v="audit_log_enabled" settings={settings} set={set} />
              <Toggle label="Log Login Events" v="audit_log_login_events" settings={settings} set={set} />
              <Field label="Log Retention (days)" v="audit_log_retention_days" settings={settings} set={set} type="number" />
            </TabBody>
          )}
          {activeTab === 'api' && (
            <TabBody title="API Settings" desc="API keys, tokens and webhooks.">
              <Field label="Public API Key" v="api_public_key" settings={settings} set={set} />
              <Field label="Webhook URL" v="api_webhook_url" settings={settings} set={set} />
              <Field label="Rate Limit (req/hour)" v="api_rate_limit" settings={settings} set={set} type="number" />
            </TabBody>
          )}
          {activeTab === 'qr' && (
            <TabBody title="QR Code Settings" desc="Default QR generation behavior for businesses.">
              <Field label="Default Size (px)" v="qr_default_size" settings={settings} set={set} type="number" />
              <Toggle label="Include Logo in QR" v="qr_include_logo" settings={settings} set={set} />
              <Select label="Error Correction" v="qr_error_correction" settings={settings} set={set} options={[['L', 'Low (L)'], ['M', 'Medium (M)'], ['Q', 'Quartile (Q)'], ['H', 'High (H)']]} />
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

function Field({ label, v, settings, set, type = 'text' }) {
  const { t } = usePreferences()
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">{t(label)}</label>
      <input type={type} value={settings[v] ?? ''} onChange={(e) => set(v, e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
    </div>
  )
}

function TextArea({ label, v, settings, set, span }) {
  const { t } = usePreferences()
  return (
    <div className={`space-y-1.5 ${span ? 'sm:col-span-2' : ''}`}>
      <label className="block text-sm font-semibold text-slate-700">{t(label)}</label>
      <textarea rows={3} value={settings[v] ?? ''} onChange={(e) => set(v, e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
    </div>
  )
}

function Select({ label, v, settings, set, options }) {
  const { t } = usePreferences()
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">{t(label)}</label>
      <select value={settings[v] ?? ''} onChange={(e) => set(v, e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
        {options.map(([val, text]) => <option key={val} value={val}>{t(text)}</option>)}
      </select>
    </div>
  )
}

function Toggle({ label, v, settings, set }) {
  const { t } = usePreferences()
  const on = String(settings[v]) === 'true'
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">{t(label)}</label>
      <button type="button" onClick={() => set(v, on ? 'false' : 'true')}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-indigo-600' : 'bg-slate-300'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}
