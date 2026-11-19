import { usePreferences } from '../context/PreferencesContext'
import React from 'react'
export default function Sidebar({ links, active, onSelect }) {
  const { t } = usePreferences()
  return (
    <nav className="app-sidebar" aria-label={t("Sidebar")}>
      {links.map((link) => (
        <button
          type="button"
          key={link.key}
          className={`sidebar-link${active === link.key ? ' active' : ''}`}
          onClick={() => onSelect?.(link.key)}
        >
          {t(link.label)}
        </button>
      ))}
    </nav>
  )
}
