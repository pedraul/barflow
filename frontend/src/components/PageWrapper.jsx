import React from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { usePreferences } from '../context/PreferencesContext'

export default function PageWrapper() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()

  const showBack = typeof window !== 'undefined' && window.history.length > 1 && location.pathname !== '/login'

  const handleBack = () => {
    if (location.pathname === '/settings' || location.pathname.startsWith('/settings/')) {
      navigate('/dashboard/owner')
      return
    }
    navigate(-1)
  }

  const title = (() => {
    const parts = location.pathname.split('/').filter(Boolean)
    if (parts.length === 0) return t('Home')
    return parts.slice(-1)[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  })()

  return (
    <div className="page-screen">
      <header className="mobile-header">
        {showBack ? (
          <button
            type="button"
            className="back-btn"
            onClick={handleBack}
            aria-label={t('Back')}
          >
            {t('Back')}
          </button>
        ) : (
          <div className="back-placeholder" />
        )}
        <div className="mobile-title">{t(title)}</div>
        <div className="right-placeholder" />
      </header>
      <main className="page-content">
        <Outlet />
      </main>
    </div>
  )
}
