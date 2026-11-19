import React from 'react'
import { usePreferences } from '../../context/PreferencesContext'
export default function Salaries() {
  const { t } = usePreferences()
  return (
    <div className="page">
      <div className="user-page-heading"><div><p className="eyebrow">{t('Owner workspace')}</p><h1>{t('Salaries')}</h1><p>{t('Salary management lives in the Owner dashboard for now.')}</p></div></div>
    </div>
  )
}
