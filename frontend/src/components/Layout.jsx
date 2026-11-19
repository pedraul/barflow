import React, { useState, useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useSubscription } from '../context/SubscriptionContext'
import { usePreferences } from '../context/PreferencesContext'
import BranchBadge from './BranchBadge'
import ShiftControl from './ShiftControl'
import BackButton from './BackButton'

export default function Layout({ children, navLinks, sidebar, logoutButton }) {
  const { status } = useSubscription()
  const { t } = usePreferences()
  const { pathname } = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isSubscriptionRoute = pathname.startsWith('/dashboard/owner') || pathname.startsWith('/owner/subscription')
  const isLoginRoute = pathname === '/login'
  const isSystemDisabled = !isLoginRoute && !isSubscriptionRoute && status !== 'active'

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

  // Navigating anywhere collapses the menu so only the chosen page is shown.
  useEffect(() => { setMobileMenuOpen(false) }, [pathname])

  return (
    <div className="layout-root">
      {/* One top bar for phone and computer: menu toggle + back button */}
      {sidebar && (
        <>
          {mobileMenuOpen && (
            <div
              className="sidebar-overlay"
              onClick={closeMobileMenu}
            />
          )}
          <header className="mobile-topbar app-topbar">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={t('Toggle navigation')}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
            <BackButton />
            <div className="mobile-brand">BarFlow</div>
            <BranchBadge />
            <div className="shift-control-slot"><ShiftControl /></div>
            {logoutButton && <div className="mobile-logout-wrapper">{logoutButton}</div>}
          </header>
        </>
      )}

      <div className="layout-body">
        {/* Collapsible navigation drawer (all screen sizes) */}
        {sidebar && (
          <aside
            className={`sidebar sidebar-mobile ${mobileMenuOpen ? 'sidebar-open' : ''}`}
            onClick={(event) => {
              if (event.target.closest('button, a')) closeMobileMenu()
            }}
          >
            {sidebar}
          </aside>
        )}

        {navLinks && !sidebar && (
          <nav className="page-nav-wrapper" aria-label={t('Page navigation')}>
            {navLinks}
          </nav>
        )}

        <main className="app-content">
          {isSystemDisabled ? (
            <div className="subscription-lock">
              <h1>{t('Subscription required')}</h1>
              <p>{t('This BarFlow account is disabled because there is no active subscription.')}</p>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  )
}
