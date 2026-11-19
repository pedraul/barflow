import React from 'react'
import { usePreferences } from '../../context/PreferencesContext'

export default function Settings() {
  const { t } = usePreferences()
  return (
    <div className="page accountant-settings">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Accountant workspace')}</p>
          <h1>{t('Settings')}</h1>
          <p>{t('Manage your accountant preferences and security.')}</p>
        </div>
      </div>

      <section className="user-section">
        <h2>{t('Preferences')}</h2>
        <div className="user-info-grid">
          <div className="summary-card">
            <strong>{t('View Only')}</strong>
            <span>{t('Read-only access to financial data')}</span>
          </div>
          <div className="summary-card">
            <strong>{t('Secure')}</strong>
            <span>{t('All actions are logged in audit trail')}</span>
          </div>
        </div>
        <p style={{ marginTop: 16, color: 'var(--text-3)' }}>
          {t('Accountant settings are managed by the owner or super admin. Contact your administrator for changes to permissions or access rights.')}
        </p>
      </section>
    </div>
  )
}
