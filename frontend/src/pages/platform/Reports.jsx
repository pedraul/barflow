import React, { useEffect, useState } from 'react'
import { fetchPlatformReports, fetchPlatformStats } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const CURRENCY = 'RWF'
const formatCurr = (v) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0 }).format(v || 0)

export default function Reports() {
  const { t } = usePreferences()
  const [report, setReport] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [r, s] = await Promise.all([fetchPlatformReports(), fetchPlatformStats()])
      setReport(r)
      setStats(s)
    } catch (e) {
      console.error('Failed to load reports:', e)
    } finally {
      setLoading(false)
    }
  }

  const buildRows = () => {
    const rows = [
      [t('Metric'), t('Value')],
      [t('Total Businesses'), stats?.totalBusinesses ?? 0],
      [t('New (this period)'), report?.growth?.reduce((s, g) => s + g.registrations, 0) ?? 0],
      [t('Active Subscriptions'), stats?.activeSubscriptions ?? 0],
      [t('Expired Subscriptions'), stats?.expiredSubscriptions ?? 0],
      [t('Income This Month'), report?.income?.thisMonth ?? 0],
      [t('Income This Year'), report?.income?.thisYear ?? 0],
      [t('Income All Time'), report?.income?.allTime ?? 0],
    ]
    return rows
  }

  const exportCsv = () => {
    const rows = buildRows().map((r) => r.join(',')).join('\n')
    download(rows, `platform_report_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv')
  }
  const exportExcel = () => {
    const rows = buildRows().map((r) => r.join('\t')).join('\n')
    download(rows, `platform_report_${new Date().toISOString().slice(0, 10)}.xls`, 'application/vnd.ms-excel')
  }
  const exportPdf = () => window.print()

  const download = (content, filename, type) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  const maxRev = Math.max(1, ...(report?.growth || []).map((g) => g.revenue))
  const maxReg = Math.max(1, ...(report?.growth || []).map((g) => g.registrations))

  const metrics = [
    { title: t('Total Businesses'), value: stats?.totalBusinesses ?? 0 },
    { title: t('Active Subscriptions'), value: stats?.activeSubscriptions ?? 0 },
    { title: t('Expired'), value: stats?.expiredSubscriptions ?? 0 },
    { title: t('Monthly Income'), value: formatCurr(report?.income?.thisMonth) },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('Reports')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('Platform analytics and financials')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportPdf} className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-2">PDF</button>
          <button onClick={exportExcel} className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-2">Excel</button>
          <button onClick={exportCsv} className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 inline-flex items-center gap-2">CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between shadow-xs">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wide text-slate-500 uppercase block">{m.title}</span>
              <p className="text-2xl font-black text-slate-900 tracking-tight">{m.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Income summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <IncomeCard label={t('This Month')} value={formatCurr(report?.income?.thisMonth)} />
        <IncomeCard label={t('This Year')} value={formatCurr(report?.income?.thisYear)} />
        <IncomeCard label={t('All Time')} value={formatCurr(report?.income?.allTime)} />
      </div>

      {/* Growth chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 mb-4"><span>{t('Revenue (last 6 months)')}</span></div>
          <div className="h-48 flex items-end justify-between gap-2">
            {(report?.growth || []).map((g, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="w-full bg-indigo-500 rounded-t hover:bg-indigo-600 transition relative" style={{ height: `${Math.round((g.revenue / maxRev) * 100)}%`, minHeight: g.revenue > 0 ? 4 : 0 }}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 whitespace-nowrap">{formatCurr(g.revenue)}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400">{g.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 mb-4"><span>{t('New Registrations')}</span></div>
          <div className="h-48 flex items-end justify-between gap-2">
            {(report?.growth || []).map((g, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="w-full bg-emerald-500 rounded-t hover:bg-emerald-600 transition relative" style={{ height: `${Math.round((g.registrations / maxReg) * 100)}%`, minHeight: g.registrations > 0 ? 4 : 0 }}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100">{g.registrations}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400">{g.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plan breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-2 font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 mb-4"><span>{t('Businesses by Plan')}</span></div>
        <div className="space-y-3">
          {(report?.byPlan || []).length === 0 && <p className="text-sm text-slate-400">{t('No data.')}</p>}
          {(report?.byPlan || []).map((p) => {
            const total = (report.byPlan || []).reduce((s, x) => s + x.count, 0) || 1
            const pct = Math.round((p.count / total) * 100)
            return (
              <div key={p.plan}>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1"><span>{p.plan}</span><span>{p.count} ({pct}%)</span></div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} /></div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function IncomeCard({ label, value }) {
  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-5">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
    </div>
  )
}
