import React from 'react'
import { QrCode, Smartphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useOwner } from '../context/OwnerContext'
import QRCode from './QRCode'
import { buildTableMenuUrl } from '../config/tableMenuUrl'
import { usePreferences } from '../context/PreferencesContext'

export default function QRCodeDisplay() {
  const { t } = usePreferences()
  const { user } = useAuth()
  const { activeBranchId } = useOwner()
  const businessId = user?.businessId
  const branchId = String(user?.role || '').toLowerCase() === 'owner' ? activeBranchId : user?.branchId
  const menuUrl = buildTableMenuUrl({
    tableNumber: 1,
    businessId,
    branchId,
    businessSlug: user?.businessSlug,
  })

  return (
    <aside className="w-full sm:w-auto max-w-sm rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-3 shadow-sm flex items-center gap-3">
      <div className="rounded-xl bg-white p-2 shadow-sm border border-slate-100 shrink-0">
        <QRCode value={menuUrl} size={132} level="M" ariaLabel={t('QR code for CLIENT TABLE 1')} />
      </div>
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-violet-700"><QrCode size={15} /> {t('CLIENT TABLE 1')}</span>
        <h2 className="font-bold text-slate-900 mt-1">{t('Scan to order')}</h2>
        <p className="text-xs leading-5 text-slate-500 mt-1">{t('Customers scan this code to open the menu for Table 1.')}</p>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 mt-2"><Smartphone size={14} /> {t('Ready to scan')}</span>
      </div>
    </aside>
  )
}
