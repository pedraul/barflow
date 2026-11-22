import React, { useEffect, useState } from 'react'
import { fetchPlatformActivity, fetchPlatformEmailNotifications } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'
import { useAdminAccess } from './adminAccess'

const PAGE_SIZE = 50
const CATEGORY_STYLES = {
  login: 'bg-blue-50 text-blue-700 border-blue-200',
  security: 'bg-rose-50 text-rose-700 border-rose-200',
  activity: 'bg-slate-50 text-slate-600 border-slate-200',
}

export default function ActivityLog() {
  const { t } = usePreferences()
  const { can } = useAdminAccess()
  const showEmails = can('reports', 'settings')
  const [tab, setTab] = useState('activity')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('Activity Log')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('What platform admins did, and the emails the platform sent')}</p>
      </div>

      {showEmails && (
        <div className="flex gap-2 border-b border-slate-200">
          {[['activity', 'Admin Activity'], ['emails', 'Email Log']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {t(label)}
            </button>
          ))}
        </div>
      )}

      {tab === 'emails' && showEmails ? <EmailLog /> : <AdminActivity />}
    </div>
  )
}

function AdminActivity() {
  const { t } = usePreferences()
  const [data, setData] = useState({ items: [], total: 0, modules: [] })
  const [filters, setFilters] = useState({ q: '', module: '', category: '' })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Debounce the free-text search.
  useEffect(() => {
    const id = setTimeout(() => { setPage(0); setFilters((f) => ({ ...f, q: search.trim() })) }, 350)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
    fetchPlatformActivity(params)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e.response?.data?.error || t('Failed to load activity.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filters, page])

  const setFilter = (key, value) => { setPage(0); setFilters((f) => ({ ...f, [key]: value })) }
  const pages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))

  const exportCsv = () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [[t('Date'), t('Admin'), t('Action'), t('Module'), t('Category'), t('IP Address')]]
      .concat(data.items.map((r) => [new Date(r.createdAt).toISOString(), r.actor, r.action, r.module, r.category, r.ip]))
    const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `platform_activity_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search action or admin...')}
          className="flex-1 min-w-[200px] max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
        <select value={filters.module} onChange={(e) => setFilter('module', e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
          <option value="">{t('All modules')}</option>
          {data.modules.map((m) => <option key={m} value={m}>{t(m)}</option>)}
        </select>
        <select value={filters.category} onChange={(e) => setFilter('category', e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
          <option value="">{t('All categories')}</option>
          <option value="activity">{t('Activity')}</option>
          <option value="login">{t('Sign-ins')}</option>
          <option value="security">{t('Security')}</option>
        </select>
        <button onClick={exportCsv} disabled={!data.items.length} className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">CSV</button>
      </div>

      {error && <div className="p-3 rounded-lg text-sm border bg-red-50 border-red-300 text-red-800">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="text-left px-3 py-2 font-semibold">{t('Date')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Admin')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Action')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Module')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('IP Address')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">{t('Loading...')}</td></tr>}
              {!loading && data.items.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">{t('No activity found.')}</td></tr>}
              {!loading && data.items.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{r.actor}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.action}
                    {r.category && r.category !== 'activity' && (
                      <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-semibold border rounded ${CATEGORY_STYLES[r.category] || CATEGORY_STYLES.activity}`}>{t(r.category)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{t(r.module || '—')}</td>
                  <td className="px-3 py-2 text-slate-400 font-mono" title={r.device || ''}>{r.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pager page={page} pages={pages} total={data.total} onPage={setPage} />
    </div>
  )
}

function EmailLog() {
  const { t } = usePreferences()
  const [items, setItems] = useState([])
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    // The endpoint pages by limit/offset; ask for one extra row to know whether a next page exists.
    fetchPlatformEmailNotifications({ limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE })
      .then((d) => { if (!cancelled) setItems(Array.isArray(d) ? d : []) })
      .catch((e) => { if (!cancelled) setError(e.response?.data?.error || t('Failed to load emails.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page])

  const hasNext = items.length > PAGE_SIZE
  const shown = items.slice(0, PAGE_SIZE).filter((e) => !status || e.status === status)

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
          <option value="">{t('All statuses')}</option>
          <option value="sent">{t('Sent')}</option>
          <option value="failed">{t('Failed')}</option>
          <option value="pending">{t('Pending')}</option>
        </select>
      </div>

      {error && <div className="p-3 rounded-lg text-sm border bg-red-50 border-red-300 text-red-800">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="text-left px-3 py-2 font-semibold">{t('Date')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Recipient')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Subject')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Type')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">{t('Loading...')}</td></tr>}
              {!loading && shown.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">{t('No emails found.')}</td></tr>}
              {!loading && shown.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{e.sentAt ? new Date(e.sentAt).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-800">{e.recipientName || '—'}</div>
                    <div className="text-slate-400">{e.recipientEmail}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{e.subject}</td>
                  <td className="px-3 py-2 text-slate-500">{String(e.notificationType || '').replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${e.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : e.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{t(e.status || 'unknown')}</span>
                    {e.errorMessage && <div className="text-[10px] text-rose-600 mt-1 max-w-xs break-words">{e.errorMessage}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 text-xs">
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40">{t('Previous')}</button>
        <span className="text-slate-500">{t('Page')} {page + 1}</span>
        <button onClick={() => setPage((p) => p + 1)} disabled={!hasNext} className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40">{t('Next')}</button>
      </div>
    </div>
  )
}

function Pager({ page, pages, total, onPage }) {
  const { t } = usePreferences()
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-500">{total} {t('entries')}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40">{t('Previous')}</button>
        <span className="text-slate-500">{t('Page')} {page + 1} / {pages}</span>
        <button onClick={() => onPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1} className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40">{t('Next')}</button>
      </div>
    </div>
  )
}
