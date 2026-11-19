import { usePreferences } from '../context/PreferencesContext'
import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const LINKS = [
  { to: '/operator/orders', label: 'Order Management', key: 'orders' },
  {
    key: 'receipts',
    label: 'Receipts',
    children: [
      { to: '/operator/receipts/printed', label: 'Printed Receipts', key: 'receipts-printed' },
    ],
  },
  { to: '/operator/reports', label: 'Reports', key: 'reports' },
  { to: '/account', label: 'My Account', key: 'account' },
  { to: '/operator/settings', label: 'Settings', key: 'settings' },
]

export default function OperatorNav({ active }) {
  const { t } = usePreferences()
  const [openMenu, setOpenMenu] = useState(null)
  const { logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="app-sidebar operator-sidebar" aria-label={t("Operator sections")}>
      <div className="sidebar-section">
        <div className="sidebar-title">{t("OPERATOR")}</div>
        {LINKS.map((link) => {
          if (link.children) {
            const isOpen = openMenu === link.key
            return (
              <div key={link.key} className="sidebar-group">
                <button
                  type="button"
                  className={`sidebar-link${isOpen ? ' open' : ''}`}
                  onClick={() => setOpenMenu(isOpen ? null : link.key)}
                >
                  {t(link.label)}
                  <span className="sidebar-arrow">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <div className="sidebar-children">
                    {link.children.map((child) => (
                      <NavLink
                        key={child.key}
                        to={child.to}
                        className={({ isActive }) =>
                          `sidebar-link sidebar-link-sub${isActive || active === child.key ? ' active' : ''}`
                        }
                      >
                        {t(child.label)}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          }
          return (
            <NavLink
              key={link.key}
              to={link.to}
              className={({ isActive }) =>
                `sidebar-link${isActive || active === link.key ? ' active' : ''}`
              }
            >
              {t(link.label)}
            </NavLink>
          )
        })}
        <button type="button" className="sidebar-link sidebar-logout" onClick={handleLogout}>{t("Logout")}</button>
      </div>
    </nav>
  )
}
