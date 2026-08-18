import React, { useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSubscription } from '../context/SubscriptionContext'

export default function Layout({ children, navLinks, sidebar, logoutButton }) {
  const { status } = useSubscription()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isSubscriptionRoute = pathname.startsWith('/dashboard/owner') || pathname.startsWith('/owner/subscription')
  const isLoginRoute = pathname === '/login'
  const isSystemDisabled = !isLoginRoute && !isSubscriptionRoute && status !== 'active'

  const dashboardPaths = new Set([
    '/dashboard/owner', '/dashboard/manager', '/dashboard/accountant', '/dashboard/kitchen', '/dashboard/bar', '/dashboard/operator',
    '/manager/dashboard', '/accountant/dashboard', '/waiter/dashboard', '/dashboard',
    '/kitchen', '/bar'
  ])

  const showSidebarDesktop = sidebar && dashboardPaths.has(pathname)
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

  const handleBack = () => {
    if (pathname === '/settings' || pathname.startsWith('/settings/')) {
      navigate('/dashboard/owner')
      return
    }
    navigate(-1)
  }

  return (
    <div className="layout-root">
      {/* Desktop top bar with back button (PC only) */}
      {sidebar && (
        <header className="desktop-topbar">
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
          <div className="desktop-brand">BarFlow</div>
          {logoutButton && <div className="desktop-logout-wrapper">{logoutButton}</div>}
        </header>
      )}

      {/* Mobile top bar + hamburger (visible on mobile only) */}
      {sidebar && (
        <>
          {mobileMenuOpen && (
            <div
              className="sidebar-overlay"
              onClick={closeMobileMenu}
            />
          )}
          <header className="mobile-topbar">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
            <div className="mobile-brand">BarFlow</div>
            {logoutButton && <div className="mobile-logout-wrapper">{logoutButton}</div>}
          </header>
        </>
      )}

      <div className="layout-body">
        {/* Desktop sidebar: only on dashboard paths */}
        {showSidebarDesktop && (
          <aside className="sidebar sidebar-desktop">
            {sidebar}
          </aside>
        )}

        {/* Mobile sidebar drawer: available on all role pages */}
        {sidebar && (
          <aside
            className={`sidebar sidebar-mobile ${mobileMenuOpen ? 'sidebar-open' : ''}`}
            onClick={closeMobileMenu}
          >
            {sidebar}
          </aside>
        )}

        {navLinks && !showSidebarDesktop && (
          <nav className="page-nav-wrapper" aria-label="Page navigation">
            {navLinks}
          </nav>
        )}

        <main className="app-content">
          {isSystemDisabled ? (
            <div className="subscription-lock">
              <h1>Subscription required</h1>
              <p>This BarFlow account is disabled because there is no active subscription.</p>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  )
}
