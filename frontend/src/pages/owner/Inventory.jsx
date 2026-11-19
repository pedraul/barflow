import React from 'react'
import { PackageSearch } from 'lucide-react'
import { usePreferences } from '../../context/PreferencesContext'
export default function Inventory() {
  const { t } = usePreferences()
  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{t('Owner workspace')}</p>
          <h1 className="text-2xl font-extrabold text-slate-900">{t('Inventory')}</h1>
          <p className="text-sm text-slate-500">{t('Inventory reporting lives in the Owner dashboard for now.')}</p>
        </div>
        <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
          <PackageSearch size={24} />
        </div>
      </div>
    </div>
  )
}
