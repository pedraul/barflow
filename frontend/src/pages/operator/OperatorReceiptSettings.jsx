import { usePreferences } from '../../context/PreferencesContext'
import BackButton from '../../components/BackButton'
import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChefHat, CheckCircle2, FileText, Printer, GlassWater, FileSpreadsheet, User, LogOut } from 'lucide-react'
import { fetchReceiptSettings, saveReceiptSettings } from '../../api/endpoints'

const DEFAULT_SETTINGS = {
  showBusinessName: true, businessNameText: '',
  showDescription: true, descriptionText: '',
  showAddress: true, addressText: '',
  showPhone: true, phoneText: '',
  showEmail: true, emailText: '',
  showTin: true, tinText: '',
  showReceiptNo: true, showDate: true, showTime: true,
  showWaiter: true, showTable: true, showOrderType: true,
  showClientName: true, showClientPhone: true,
  showItems: true, showSubtotal: true, showDiscount: true, showTotal: true,
  showPaymentMethod: true, showAmountPaid: true, showPaymentRef: true,
  showPaymentStatus: true, showCustomerNumber: true,
  showFooterNote: true, footerNoteText: '',
}

const SETTING_GROUPS = [
  {
    label: 'Business Information',
    settings: [
      { key: 'showBusinessName', textKey: 'businessNameText', label: 'Business Name', placeholder: 'e.g. Kigali Grill' },
      { key: 'showDescription', textKey: 'descriptionText', label: 'Business Description', placeholder: 'e.g. A cozy restaurant serving authentic cuisine' },
      { key: 'showAddress', textKey: 'addressText', label: 'Address / Location', placeholder: 'e.g. KG 12 Ave, Kigali, Rwanda' },
      { key: 'showPhone', textKey: 'phoneText', label: 'Phone Number', placeholder: 'e.g. +250 788 123 456' },
      { key: 'showEmail', textKey: 'emailText', label: 'Email Address', placeholder: 'e.g. info@kigaligrill.com' },
      { key: 'showTin', textKey: 'tinText', label: 'TIN Number', placeholder: 'e.g. 123456789' },
    ],
  },
  {
    label: 'Order Details',
    settings: [
      { key: 'showReceiptNo', label: 'Receipt Number' },
      { key: 'showDate', label: 'Date' },
      { key: 'showTime', label: 'Time' },
      { key: 'showWaiter', label: 'Waiter Name' },
      { key: 'showTable', label: 'Table Number' },
      { key: 'showOrderType', label: 'Order Type' },
      { key: 'showClientName', label: 'Client Name' },
      { key: 'showClientPhone', label: 'Client Phone' },
    ],
  },
  {
    label: 'Items & Totals',
    settings: [
      { key: 'showItems', label: 'Order Items' },
      { key: 'showSubtotal', label: 'Subtotal' },
      { key: 'showDiscount', label: 'Discount' },
      { key: 'showTotal', label: 'Total' },
    ],
  },
  {
    label: 'Payment Info',
    settings: [
      { key: 'showPaymentMethod', label: 'Payment Method' },
      { key: 'showAmountPaid', label: 'Amount Paid' },
      { key: 'showPaymentRef', label: 'Payment Reference' },
      { key: 'showPaymentStatus', label: 'Payment Status' },
      { key: 'showCustomerNumber', label: 'Customer Number' },
    ],
  },
  {
    label: 'Footer',
    settings: [
      { key: 'showFooterNote', textKey: 'footerNoteText', label: 'Footer Note', placeholder: 'e.g. Thank you for dining with us!' },
    ],
  },
]

function SidebarLink({ icon, label, onClick }) {
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); onClick && onClick() }} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/60 hover:text-white transition group text-slate-400">
      <div className="flex items-center gap-3">
        <span className="text-slate-500 group-hover:text-slate-300">{icon}</span>
        <span className="font-medium">{label}</span>
      </div>
    </a>
  )
}

export default function OperatorReceiptSettings() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    fetchReceiptSettings().then(setSettings).catch(() => setSettings(DEFAULT_SETTINGS))
  }, [])

  const toggle = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
    setSaved(false)
  }

  const updateText = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveReceiptSettings(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6c757d' }}>{t("Loading receipt settings...")}</div>
  }

  return (
    <div className="operator-shell flex flex-col md:flex-row min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Mobile topbar */}
      <header className="mobile-topbar app-topbar">
        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label={t("Toggle navigation")}
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
        <BackButton fallback="/operator/orders" />
        <div className="mobile-brand">BarFlow</div>
      </header>

      {/* Desktop sidebar */}
      <aside className="operator-desktop-sidebar hidden md:flex w-64 bg-[#0B132B] text-slate-400 flex flex-col justify-between shrink-0">
        <div>
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800 text-white font-bold text-xl">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white">
              <GlassWater size={20} className="transform rotate-180" />
            </div>
            <span>BarFlow</span>
          </div>

          <nav className="p-4 space-y-6 text-sm">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Order Management")}</p>
              <div className="space-y-1">
                <SidebarLink icon={<FileText size={18} />} label={t("New Orders")} onClick={() => navigate('/operator/orders')} />
                <SidebarLink icon={<ChefHat size={18} />} label={t("Preparing")} onClick={() => navigate('/operator/orders')} />
                <SidebarLink icon={<CheckCircle2 size={18} />} label={t("Ready")} onClick={() => navigate('/operator/orders')} />
                <SidebarLink icon={<FileText size={18} />} label={t("All Orders")} onClick={() => navigate('/operator/orders')} />
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Receipts")}</p>
              <div className="space-y-1">
                <SidebarLink icon={<Printer size={18} />} label={t("Printed Receipts")} onClick={() => navigate('/operator/receipts/printed')} />
                <SidebarLink icon={<FileText size={18} />} label={t("Receipt Settings")} onClick={() => navigate('/operator/receipt-settings')} />
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Other")}</p>
              <div className="space-y-1">
                <SidebarLink icon={<FileSpreadsheet size={18} />} label={t("Reports")} onClick={() => navigate('/operator/reports')} />
                <SidebarLink icon={<User size={18} />} label={t("My Account")} onClick={() => navigate('/account')} />
              </div>
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button onClick={() => { navigate('/login') }} className="flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-950/30 rounded-lg font-medium transition w-full">
            <LogOut size={18} />{t("Logout")}</button>
        </div>
      </aside>

      {/* Mobile sidebar drawer */}
      <aside
        className={`operator-sidebar-mobile ${mobileMenuOpen ? 'operator-sidebar-open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      >
        <div>
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800 text-white font-bold text-xl">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white">
              <GlassWater size={20} className="transform rotate-180" />
            </div>
            <span>BarFlow</span>
          </div>

          <nav className="p-4 space-y-6 text-sm">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Order Management")}</p>
              <div className="space-y-1">
                <SidebarLink icon={<FileText size={18} />} label={t("New Orders")} onClick={() => navigate('/operator/orders')} />
                <SidebarLink icon={<ChefHat size={18} />} label={t("Preparing")} onClick={() => navigate('/operator/orders')} />
                <SidebarLink icon={<CheckCircle2 size={18} />} label={t("Ready")} onClick={() => navigate('/operator/orders')} />
                <SidebarLink icon={<FileText size={18} />} label={t("All Orders")} onClick={() => navigate('/operator/orders')} />
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Receipts")}</p>
              <div className="space-y-1">
                <SidebarLink icon={<Printer size={18} />} label={t("Printed Receipts")} onClick={() => navigate('/operator/receipts/printed')} />
                <SidebarLink icon={<FileText size={18} />} label={t("Receipt Settings")} onClick={() => navigate('/operator/receipt-settings')} />
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("Other")}</p>
              <div className="space-y-1">
                <SidebarLink icon={<FileSpreadsheet size={18} />} label={t("Reports")} onClick={() => navigate('/operator/reports')} />
                <SidebarLink icon={<User size={18} />} label={t("My Account")} onClick={() => navigate('/account')} />
              </div>
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button onClick={() => { navigate('/login') }} className="flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-950/30 rounded-lg font-medium transition w-full">
            <LogOut size={18} />{t("Logout")}</button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-slate-900">{t("Receipt Settings")}</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 border-l pl-6 border-slate-200">
              <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">{t("OP")}</div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-900 leading-tight">{t("Operator")}</p>
                <p className="text-xs text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span>{' '}{t("Online")}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="operator-main flex-1 overflow-y-auto p-6">
          {saved && (
            <div className="mb-4 flex items-center gap-3 bg-emerald-50 border border-emerald-300 rounded-xl px-5 py-4">
              <div>
                <p className="font-bold text-emerald-800 text-sm">{t("Receipt settings saved successfully!")}</p>
                <p className="text-xs text-emerald-600 mt-0.5">{t("Your changes will be applied to all printed receipts.")}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{t("Receipt Layout Settings")}</h2>
              <p className="text-sm text-slate-500 mt-1">{t("Toggle fields ON/OFF and type the text you want printed on the receipt.")}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg px-5 py-2.5 shadow-sm transition disabled:opacity-50"
              >
                {saving ? t("Saving...") : t("Save Settings")}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {SETTING_GROUPS.map((group) => (
              <div key={group.label} className="bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="px-5 py-3 border-b border-slate-100">
                  <h3 className="font-bold text-sm text-slate-900">{t(group.label)}</h3>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.settings.map((s) => {
                    const isOn = !!settings[s.key]
                    const cardClass = 'rounded-lg border p-4 text-left transition ' + (isOn ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/60')
                    const trackClass = 'relative inline-flex h-6 w-11 items-center rounded-full transition ' + (isOn ? 'bg-emerald-500' : 'bg-slate-300')
                    const knobClass = 'inline-block h-4 w-4 transform rounded-full bg-white transition ' + (isOn ? 'translate-x-6' : 'translate-x-1')
                    return (
                      <div key={s.key} className={cardClass}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-800">{t(s.label)}</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isOn}
                            aria-label={`${t(isOn ? 'Disable' : 'Enable')} ${t(s.label)}`}
                            onClick={() => toggle(s.key)}
                            className={trackClass}
                          >
                            <span className={knobClass} />
                          </button>
                        </div>
                        {s.textKey && (
                          <input
                            type="text"
                            value={settings[s.textKey] || ''}
                            onChange={(e) => updateText(s.textKey, e.target.value)}
                            placeholder={s.placeholder ? t(s.placeholder) : ''}
                            disabled={!isOn}
                            className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400 disabled:opacity-50 disabled:bg-slate-100"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 pb-6">
            <button
              onClick={() => navigate('/operator/receipts/printed')}
              className="flex items-center gap-2 border border-slate-200 text-slate-600 font-bold text-sm bg-white rounded-lg px-5 py-2.5 hover:bg-slate-50 shadow-sm transition"
            >
              {t("Back to Receipts")}</button>
          </div>
        </main>
      </div>
    </div>
  )
}