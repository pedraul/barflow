import React, { useMemo, useState } from 'react'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'login', label: 'Login' },
  { key: 'user', label: 'Users' },
  { key: 'sale', label: 'Sales' },
  { key: 'payment', label: 'Payments' },
  { key: 'refund', label: 'Refunds' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'shift', label: 'Shifts' },
  { key: 'salary', label: 'Salary' },
  { key: 'settings', label: 'Settings' },
]

const TAG_COLORS = {
  login: 'bg-blue-100 text-blue-800',
  user: 'bg-emerald-100 text-emerald-800',
  sale: 'bg-amber-100 text-amber-800',
  payment: 'bg-emerald-100 text-emerald-800',
  refund: 'bg-red-100 text-red-800',
  inventory: 'bg-indigo-100 text-indigo-800',
  shift: 'bg-purple-100 text-purple-800',
  salary: 'bg-orange-100 text-orange-800',
  settings: 'bg-slate-100 text-slate-600',
}

export default function OwnerAudit({ entries }) {
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(
    () => (filter === 'all' ? entries : entries.filter((entry) => entry.type === filter)),
    [entries, filter]
  )

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      <nav className="flex flex-wrap gap-2" aria-label="Audit filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold border transition ${filter === f.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-300 hover:border-indigo-500 hover:text-indigo-600'}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </nav>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Audit logs</h2>
        {filtered.length ? (
          filtered.map((entry) => (
            <p key={entry.id} className="my-2 text-slate-700">
              <span className={`inline-block text-[11px] uppercase tracking-wide rounded px-1.5 py-0.5 mr-2 font-bold ${TAG_COLORS[entry.type] || 'bg-slate-100 text-slate-600'}`}>{entry.type}</span>
              <strong className="text-slate-900">{entry.actor}</strong> {entry.action} <span className="text-slate-400">· {entry.time}</span>
            </p>
          ))
        ) : (
          <p className="text-slate-400">No audit entries recorded yet.</p>
        )}
      </section>
    </div>
  )
}
