import React, { useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useSubscription } from '../context/SubscriptionContext'

export default function Layout({ children, navLinks, sidebar }) {
  const { status } = useSubscription()
  const { pathname } = useLocation()
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

  return (
    <div className="layout-root">
      {/* Mobile top bar + hamburger (visible on all role pages on mobile) */}
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
          <aside className={`sidebar sidebar-mobile ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
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
