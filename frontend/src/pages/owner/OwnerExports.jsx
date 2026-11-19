import React, { useState } from 'react'
import { usePreferences } from '../../context/PreferencesContext'

const EXPORTS = [
  { key: 'everything', title: 'Full business data', desc: 'Every branch, user, product, order, and setting in one archive.', message: 'Full business data exported.' },
  { key: 'ledger', title: 'Financial ledger', desc: 'All payments, refunds, and salary movements for accounting.', message: 'Financial ledger exported.' },
  { key: 'staff', title: 'Staff records', desc: 'Current staff accounts, roles, branches, and salaries.', message: 'Staff records exported.' },
  { key: 'sales', title: 'Sales & VAT report', desc: 'Daily sales and tax summary ready for filing.', message: 'Sales & VAT report exported.' },
]

export default function OwnerExports({ onExport }) {
  const { t } = usePreferences()
  const [exported, setExported] = useState('')

  const runExport = (item) => {
    setExported(t(item.message))
    if (onExport) onExport(item.message)
  }

  return (
    <div className="od-section">
      <section className="user-section">
        <h2>{t('Export')}</h2>
        <p>{t('Download full business exports for backup and audit.')}</p>

        <div className="export-grid">
          {EXPORTS.map((item) => (
            <div key={item.key} className="export-card">
              <h3>{t(item.title)}</h3>
              <p>{t(item.desc)}</p>
              <button type="button" className="pay-action" onClick={() => runExport(item)}>{t('Export')}</button>
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
