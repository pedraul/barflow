import React from 'react'
import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/waiter/dashboard', label: 'Dashboard', key: 'dashboard' },
  { to: '/waiter/new-order', label: 'Bar menu', key: 'new-order' },
  { to: '/waiter/cart', label: 'My cart', key: 'cart' },
  { to: '/waiter/orders', label: 'Ready orders pickup', key: 'orders' },
  { to: '/account', label: 'My account', key: 'account' },
  { to: '/waiter/settings', label: 'Settings', key: 'settings' },
]

export default function WaiterNav({ active }) {
  return (
    <nav className="section-nav waiter-nav" aria-label="Waiter sections">
      {LINKS.map((link) => (
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
