import { usePreferences } from '../context/PreferencesContext'
import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSubscription } from '../context/SubscriptionContext'
import Navbar from '../components/Navbar'
import ShiftControl from '../components/ShiftControl'
import useMyGrants from '../hooks/useMyGrants'

function OperatorFloatingTools() {
  const { t } = usePreferences()
  const { has } = useMyGrants()
  const canManageStaff = has('create_employees') || has('edit_employees') || has('reset_passwords')
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 50, display: 'flex', gap: 8, alignItems: 'center' }}>
      {canManageStaff && (
        <Link
          to="/staff"
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow ring-1 ring-slate-200 hover:bg-slate-50"
        >
          {t('Staff')}
        </Link>
      )}
      <ShiftControl />
    </div>
  )
}

export default function OperatorBareLayout({ children }) {
  const { t } = usePreferences()
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
            <h1>{t("Subscription required")}</h1>
            <p>{t("This BarFlow account is disabled because there is no active subscription.")}</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <>
      {children}
      <OperatorFloatingTools />
    </>
  )
}
