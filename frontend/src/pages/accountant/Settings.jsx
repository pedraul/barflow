import React from 'react'

export default function Settings() {
  return (
    <div className="page accountant-settings">

      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Accountant workspace</p>
          <h1>Settings</h1>
          <p>Manage your accountant preferences and security.</p>
        </div>
      </div>

      <section className="user-section">
        <h2>Preferences</h2>
        <div className="user-info-grid">
          <div className="summary-card">
            <strong>View Only</strong>
            <span>Read-only access to financial data</span>
          </div>
          <div className="summary-card">
            <strong>Secure</strong>
            <span>All actions are logged in audit trail</span>
          </div>
        </div>
        <p style={{ marginTop: 16, color: 'var(--text-3)' }}>
          Accountant settings are managed by the owner or super admin. Contact your administrator for changes to permissions or access rights.
        </p>
      </section>
    </div>
  )
}
