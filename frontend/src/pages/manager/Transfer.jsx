import React from 'react'
import { Link } from 'react-router-dom'

const CARDS = [
  { to: '/manager/transfer/transfers', title: 'Approve transfers', desc: 'Review and approve outgoing transfers.' },
  { to: '/manager/transfer/refunds', title: 'Approve refunds', desc: 'Review and approve refund requests.' },
  { to: '/manager/transfer/payrolls', title: 'Approve payrolls', desc: 'Review and approve salary payouts.' },
]

export default function Transfer() {
  return (
    <div className="page manager-transfer">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Manager workspace</p>
          <h1>Transfer</h1>
          <p>Approve money movements that need a manager’s sign-off.</p>
        </div>
      </div>

      <div className="link-grid overview-grid">
        {CARDS.map((card) => (
          <Link key={card.to} to={card.to} className="quick-link-btn">
            {card.title}
            <small>{card.desc}</small>
          </Link>
        ))}
      </div>
    </div>
  )
}
