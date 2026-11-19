import { usePreferences } from '../../context/PreferencesContext'
import React from 'react'
export default function Bills() {
  const { t } = usePreferences()
  return (
    <div className="page">
      <div className="user-page-heading"><div><p className="eyebrow">{t("Waiter workspace")}</p><h1>{t("Bills")}</h1><p>{t("Billing lives in the Waiter dashboard for now.")}</p></div></div>
    </div>
  )
}
