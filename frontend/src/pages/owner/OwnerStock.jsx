import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOwner } from '../../context/OwnerContext'
import { usePreferences } from '../../context/PreferencesContext'

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

/**
 * Read-only view of the items in stock and their current value.
 * Value = quantity in stock × cost price. Follows the branch picker.
 */
export default function OwnerStock() {
  const { t } = usePreferences()
  const { fetchRevenueDetails, activeBranchId } = useOwner()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [inStockOnly, setInStockOnly] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchRevenueDetails('stock-value')
      setRows(data?.rows || [])
    } catch (e) {
      setRows([])
      setError(e.message || t('Unable to load stock.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [activeBranchId, fetchRevenueDetails])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter((r) => !inStockOnly || r.quantity > 0)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.branchName || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, search, inStockOnly])

  const totals = useMemo(() => ({
    items: rows.filter((r) => r.quantity > 0).length,
    quantity: rows.reduce((s, r) => s + r.quantity, 0),
    value: rows.reduce((s, r) => s + r.value, 0),
  }), [rows])

  const th = 'bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200'

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{t('Owner workspace')}</p>
          <h1 className="text-2xl font-extrabold text-slate-900 flex flex-wrap items-center gap-2">
            {t('Stock & Value')}
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-0.5">{t('Read only')}</span>
          </h1>
          <p className="text-sm text-slate-500">{t('Items in stock and their current value (quantity × cost price).')}</p>
        </div>
        <Link to="/owner/revenue" className="text-sm font-semibold text-slate-700 border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50">{t('Back to Revenue')}</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Items in stock', value: totals.items },
          { label: 'Total quantity', value: totals.quantity.toLocaleString() },
          { label: 'Current Stock Value', value: fmt(totals.value) },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
            <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{c.value}</strong>
            <span className="text-slate-500 text-sm font-medium">{t(c.label)}</span>
          </div>
        ))}
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search items or branch...')}
            aria-label={t('Search items or branch...')}
            className="flex-1 min-w-[180px] px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
          />
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
            {t('Only items in stock')}
          </label>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            {error}{' '}<button type="button" onClick={load} className="font-semibold underline">{t('Retry')}</button>
          </p>
        )}
        {loading && <p className="text-sm text-slate-500">{t('Loading…')}</p>}
        {!loading && !error && filtered.length === 0 && <p className="text-sm text-slate-400">{t('No records found.')}</p>}

        {!loading && filtered.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>{t('Item')}</th>
                  <th className={`${th} text-left`}>{t('Branch')}</th>
                  <th className={`${th} text-right`}>{t('Quantity')}</th>
                  <th className={`${th} text-right`}>{t('Cost price')}</th>
                  <th className={`${th} text-right`}>{t('Selling price')}</th>
                  <th className={`${th} text-right`}>{t('Value')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className={r.quantity > 0 ? '' : 'text-slate-400'}>
                    <td className="p-2 font-semibold text-slate-900">{r.name}</td>
                    <td className="p-2 text-slate-600">{r.branchName || '—'}</td>
                    <td className="p-2 text-right">{r.quantity === 0 ? t('Out of stock') : r.quantity}</td>
                    <td className="p-2 text-right">{fmt(r.costPrice)}</td>
                    <td className="p-2 text-right">{fmt(r.sellingPrice)}</td>
                    <td className="p-2 text-right font-semibold text-slate-900">{fmt(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
