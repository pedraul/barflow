import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePreferences } from '../context/PreferencesContext'

/**
 * Top-bar back button. Goes to the previous screen; when there is no
 * in-app history (fresh tab / reload) it falls back to the user's dashboard.
 */
export default function BackButton({ fallback }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const { t } = usePreferences()

  const handleBack = () => {
    if (pathname === '/settings' || pathname.startsWith('/settings/')) {
      navigate('/dashboard/owner')
      return
    }
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1)
      return
    }
    navigate(fallback || `/dashboard/${String(user?.role || '').toLowerCase()}`)
  }

  return (
    <button type="button" className="back-btn" onClick={handleBack} aria-label={t('Back')} title={t('Back')}>
      {t('Back')}
    </button>
  )
}
