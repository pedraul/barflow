import React from 'react'
import { Link } from 'react-router-dom'
import { usePreferences } from '../context/PreferencesContext'

export default function Navbar({ user, onLogout }) {
  const { t } = usePreferences()
  return (
    <header className="amazon-header">
      <div className="amazon-header-inner">
        <Link to="/" className="amazon-logo" aria-label={t('BarFlow home')}>{t("Bar")}<span className="amazon-logo-accent">{t("Flow")}</span>
        </Link>

        <form
          className="amazon-search"
          onSubmit={(e) => e.preventDefault()}
          role="search"
        >
          <input
            type="search"
            placeholder={t('Search products, orders, users...')}
            aria-label={t('Search')}
          />
          <button type="submit" aria-label={t('Search')}>{t('Search')}</button>
        </form>

        <nav className="amazon-actions">
          {user ? (
            <>
              <button
                type="button"
                className="amazon-action"
                onClick={onLogout}
                title={t('Logout')}
              >
                <span className="amazon-action-text">{t('Logout')}</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="amazon-action">
              <span className="amazon-action-text">{t('Sign In')}</span>
            </Link>
          )}

        </nav>
      </div>
    </header>
  )
}
