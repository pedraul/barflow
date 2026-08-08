import React from 'react'
export default function Sidebar({ links, active, onSelect }) {
  return (
    <nav className="app-sidebar" aria-label="Sidebar">
      {links.map((link) => (
        <button
          type="button"
          key={link.key}
          className={`sidebar-link${active === link.key ? ' active' : ''}`}
          onClick={() => onSelect?.(link.key)}
        >
          {link.label}
        </button>
      ))}
    </nav>
  )
}
