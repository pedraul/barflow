import React, { useState } from 'react'

const EXPORTS = [
  { key: 'everything', title: 'Full business data', desc: 'Every branch, user, product, order, and setting in one archive.', message: 'Full business data exported.' },
  { key: 'ledger', title: 'Financial ledger', desc: 'All payments, refunds, and salary movements for accounting.', message: 'Financial ledger exported.' },
  { key: 'staff', title: 'Staff records', desc: 'Current staff accounts, roles, branches, and salaries.', message: 'Staff records exported.' },
  { key: 'sales', title: 'Sales & VAT report', desc: 'Daily sales and tax summary ready for filing.', message: 'Sales & VAT report exported.' },
]

export default function OwnerExports({ onExport }) {
  const [exported, setExported] = useState('')

  const runExport = (item) => {
    setExported(item.message)
    if (onExport) onExport(item.message)
  }

  return (
    <div className="od-section">
      <section className="user-section">
        <h2>Export</h2>
        <p>Download full business exports for backup and audit.</p>

        <div className="export-grid">
          {EXPORTS.map((item) => (
            <div key={item.key} className="export-card">
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
              <button type="button" className="pay-action" onClick={() => runExport(item)}>Export</button>
            </div>
          ))}
        </div>

        {exported && (
          <p className="creation-success"><span>✓</span>{exported}</p>
        )}
      </section>
    </div>
  )
}
