import React from 'react'
import { useLocation } from 'react-router-dom'
import { useSubscription } from '../context/SubscriptionContext'
import Navbar from '../components/Navbar'

export default function OperatorBareLayout({ children }) {
  const { status } = useSubscription()
  const { pathname } = useLocation()
  const isLoginRoute = pathname === '/login'
  const isSystemDisabled = !isLoginRoute && status !== 'active'

  if (isSystemDisabled) {
    return (
      <div className="app-shell">
        <Navbar user={null} onLogout={() => {}} />
        <main className="app-content">
          <div className="subscription-lock">
            <h1>Subscription required</h1>
            <p>This BarFlow account is disabled because there is no active subscription.</p>
          </div>
        </main>
      </div>
    )
  }

  return <>{children}</>
}
