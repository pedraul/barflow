import React from 'react'
import { usePreferences } from '../../context/PreferencesContext'
export default function StockAdjustment() {
  const { t } = usePreferences()
  return (
    <div className="page">
      <div className="user-page-heading"><div><p className="eyebrow">{t('Manager workspace')}</p><h1>{t('Stock adjustment')}</h1><p>{t('Stock adjustments live in the Manager dashboard for now.')}</p></div></div>
    </div>
  )
}
