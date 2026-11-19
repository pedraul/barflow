import React from 'react'
import { Link } from 'react-router-dom'
import { usePreferences } from '../../context/PreferencesContext'

const CARDS = [
  { to: '/manager/staff/create', title: 'Create user', desc: 'Add a new staff account.' },
  { to: '/manager/staff/manage', title: 'Manage users', desc: 'Edit, delete, activate or deactivate accounts.' },
  { to: '/manager/staff/password', title: 'Password management', desc: 'Reset a user’s password.' },
]

export default function Staff() {
  const { t } = usePreferences()
  return (
    <div className="page manager-staff">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t('Manager workspace')}</p>
          <h1>{t('Staff')}</h1>
          <p>{t('Manage user accounts, passwords, and access.')}</p>
        </div>
      </div>

      <div className="link-grid overview-grid">
        {CARDS.map((card) => (
          <Link key={card.to} to={card.to} className="quick-link-btn">
            {t(card.title)}
            <small>{t(card.desc)}</small>
          </Link>
        ))}
      </div>
    </div>
  )
}
