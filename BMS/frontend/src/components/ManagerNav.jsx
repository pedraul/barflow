import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const LINKS = [
  { to: '/manager/dashboard', label: 'Dashboard', key: 'dashboard', perm: null },
  { to: '/manager/orders', label: 'Orders', key: 'orders', perm: null },
  { to: '/manager/staff', label: 'Staff', key: 'staff', perm: 'canManageUsers' },
  { to: '/manager/transfer', label: 'Transfer', key: 'transfer', perm: 'canTransfer' },
  { to: '/manager/logs', label: 'Logs', key: 'logs', perm: 'canViewWithdrawLogs' },
  { to: '/manager/settings', label: 'System settings', key: 'settings', perm: 'canManageSettings' },
  { to: '/account', label: 'My account', key: 'account', perm: null },
  { to: '/manager/stock-menu', label: 'Stock menu', key: 'stock-menu', perm: null },
  { to: '/manager/reports', label: 'Reports', key: 'reports', perm: 'canViewRevenue' },
  { to: '/manager/revenue', label: 'Revenue', key: 'revenue', perm: 'canViewRevenue' },
]

export default function ManagerNav({ active }) {
  const { permissions } = useAuth()

  return (
    <nav className="section-nav manager-nav" aria-label="Manager sections">
      {LINKS.filter((link) => !link.perm || permissions[link.perm]).map((link) => (
        <NavLink
          key={link.key}
          to={link.to}
          className={({ isActive }) =>
            `section-tab${isActive || active === link.key ? ' active' : ''}`
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}
