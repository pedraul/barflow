import React from 'react'
import { useLocation } from 'react-router-dom'
import { useSubscription } from '../context/SubscriptionContext'

export default function Layout({ children, navLinks, sidebar }) {
  const { status } = useSubscription()
  const { pathname } = useLocation()
  const isSubscriptionRoute = pathname.startsWith('/dashboard/owner') || pathname.startsWith('/owner/subscription')
  const isLoginRoute = pathname === '/login'
  const isSystemDisabled = !isLoginRoute && !isSubscriptionRoute && status !== 'active'

  const dashboardPaths = new Set([
    '/dashboard/owner', '/dashboard/manager', '/dashboard/accountant', '/dashboard/kitchen', '/dashboard/bar', '/dashboard/operator',
    '/manager/dashboard', '/accountant/dashboard', '/waiter/dashboard', '/dashboard',
    '/kitchen', '/bar'
  ])

  const showSidebar = sidebar && dashboardPaths.has(pathname)

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex flex-1">
        {showSidebar && (
          <aside className="w-64 bg-[#0B132B] text-slate-400 flex flex-col justify-between shrink-0 sticky top-0 h-screen">
            {sidebar}
          </aside>
        )}

        {navLinks && !showSidebar && (
          <nav className="page-nav-wrapper" aria-label="Page navigation">
            {navLinks}
          </nav>
        )}

        <main className="app-content">
          {isSystemDisabled ? (
            <div className="subscription-lock">
              <h1>Subscription required</h1>
              <p>This BarFlow account is disabled because there is no active subscription.</p>
              <Link to="/dashboard/owner">Go to subscription</Link>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  )
}
