import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function NewOrder() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [table, setTable] = useState('1')

  const openMenu = () => {
    // Navigate to the waiter's own menu system (categories -> items -> cart -> order)
    navigate('/waiter/new-order')
  }

  return (
    <div className="page waiter-new-order">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Waiter workspace</p>
          <h1>New order</h1>
          <p>
            Choose the table, then open the menu. Browse categories, add items to the cart,
            and from “My cart” place the order — it goes to the operator who routes it to the
            kitchen or bar. The client can then check out and pay.
          </p>
        </div>
      </div>

      <section className="user-section">
        <h2>Which table is this order for?</h2>
        <label className="order-waiter">
          Table number
          <input
            type="text"
            inputMode="numeric"
            value={table}
            onChange={(e) => setTable(e.target.value)}
            placeholder="e.g. 5"
            aria-label="Table number"
          />
        </label>

        <div className="create-user-form-actions">
          <button type="button" className="secondary-action" onClick={() => navigate('/waiter/dashboard')}>
            Cancel
          </button>
          <button type="button" className="pay-action" onClick={openMenu}>
            Open bar menu ➡️
          </button>
        </div>

        <p className="text-sm" style={{ marginTop: '16px', color: '#6c757d' }}>
          Taking the order for: {user?.name || 'Waiter'}
        </p>
      </section>
    </div>
  )
}
