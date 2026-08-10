import React from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'

export default function PageWrapper() {
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
    if (parts.length === 0) return 'Home'
    return parts.slice(-1)[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  })()

  const isDashboardRoute = [
    '/dashboard', '/owner', '/manager', '/accountant', '/waiter',
    '/kitchen', '/bar', '/operator', '/settings'
  ].some((prefix) => location.pathname.startsWith(prefix))

  return (
    <div className="page-screen">
      {!isDashboardRoute && (
        <header className="mobile-header">
          {showBack ? (
            <button
              type="button"
              className="back-btn"
              onClick={handleBack}
              aria-label="Back"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          ) : (
            <div className="back-placeholder" />
          )}
          <div className="mobile-title">{title}</div>
          <div className="right-placeholder" />
        </header>
      )}
      <main className="page-content">
        <Outlet />
      </main>
    </div>
  )
}
