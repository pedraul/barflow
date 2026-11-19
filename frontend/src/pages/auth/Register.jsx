import React from 'react'
import { Link } from 'react-router-dom'
import { usePreferences } from '../../context/PreferencesContext'

export default function Register() {
  const { t } = usePreferences()
  return (
    <div className="page page-center">
      <div className="card auth-card">
        <div className="auth-brand">Bar<span>Solution</span></div>
        <h1>{t('Create account')}</h1>
        <p className="auth-subtitle">{t('Account registration is managed by the Owner from the user management workspace.')}</p>
        <Link to="/login" className="pay-action">{t('Back to login')}</Link>
      </div>
    </div>
  )
}
