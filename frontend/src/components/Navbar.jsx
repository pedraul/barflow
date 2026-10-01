import React from 'react'
import { Link } from 'react-router-dom'
import { Search, User, LogOut } from 'lucide-react'

export default function Navbar({ user, onLogout }) {
  return (
    <header className="amazon-header">
      <div className="amazon-header-inner">
        <Link to="/" className="amazon-logo" aria-label="BarFlow home">
          Bar<span className="amazon-logo-accent">Flow</span>
        </Link>

        <form
          className="amazon-search"
          onSubmit={(e) => e.preventDefault()}
          role="search"
        >
          <input
            type="search"
            placeholder="Search products, orders, users..."
            aria-label="Search"
          />
          <button type="submit" aria-label="Search">
            <Search size={18} />
          </button>
        </form>

        <nav className="amazon-actions">
          {user ? (
            <>
              <button
                type="button"
                className="amazon-action"
                onClick={onLogout}
                title="Logout"
              >
                <LogOut size={20} />
                <span className="amazon-action-text">Logout</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="amazon-action">
              <User size={20} />
              <span className="amazon-action-text">Sign In</span>
            </Link>
          )}

        </nav>
      </div>
    </header>
  )
}
