import React, { useEffect, useState } from 'react'
import { useOwner } from '../../context/OwnerContext'
import { FileSpreadsheet, FileText as FileExcel, FileJson, Filter, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react'

export default function AuditLogViewer() {
  const { fetchAuditLogs, fetchAuditLogsExport, loading } = useOwner()
  const [logs, setLogs] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [filters, setFilters] = useState({ targetModule: '', userId: '' })
  const [modules, setModules] = useState([])

  useEffect(() => { loadLogs() }, [pagination.page])

  const loadLogs = async (extraFilters = {}) => {
    try {
      const params = { page: pagination.page, limit: pagination.limit, ...filters, ...extraFilters }
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k] })
      const data = await fetchAuditLogs(params)
      setLogs(data.logs || [])
      setPagination(data.pagination || pagination)

      const uniqueModules = [...new Set((data.logs || []).map((l) => l.targetModule).filter(Boolean))]
      setModules((prev) => [...new Set([...prev, ...uniqueModules])])
    } catch (e) {
      console.error('Failed to load audit logs:', e)
    }
  }

  const handleFilter = () => {
    setPagination((p) => ({ ...p, page: 1 }))
    loadLogs()
  }

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return
    setPagination((p) => ({ ...p, page: newPage }))
  }

  const handleExport = async (format) => {
    await fetchAuditLogsExport(filters, format)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 items-center flex-wrap">
        <button onClick={() => handleExport('csv')} className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white border border-transparent rounded-md px-3.5 py-1.5 cursor-pointer text-sm font-medium transition">
          <FileSpreadsheet size={15} /> Export CSV
        </button>
        <button onClick={() => handleExport('xls')} className="inline-flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white border border-transparent rounded-md px-3.5 py-1.5 cursor-pointer text-sm font-medium transition">
          <FileExcel size={15} /> Export Excel
        </button>
        <button onClick={() => handleExport('json')} className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white border border-transparent rounded-md px-3.5 py-1.5 cursor-pointer text-sm font-medium transition">
          <FileJson size={15} /> Export JSON
        </button>
        <span className="text-xs text-slate-500">
          {pagination.total} records • Page {pagination.page} of {pagination.totalPages}
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-[11px] text-slate-500 block mb-1 font-medium">Target Module</label>
          <select value={filters.targetModule} onChange={(e) => setFilters({ ...filters, targetModule: e.target.value })}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-indigo-500">
            <option value="">All Modules</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1 font-medium">User ID</label>
          <input type="text" placeholder="Filter by user ID" value={filters.userId}
            onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <button onClick={handleFilter} className="inline-flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white border border-transparent rounded-md px-3.5 py-1.5 cursor-pointer text-sm font-medium transition">
          <Filter size={15} /> Apply Filters
        </button>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              {['Timestamp', 'User ID', 'Actor', 'Action', 'Target Module', 'IP Address'].map((h) => (
                <th key={h} className="text-left p-3 text-xs text-slate-500 uppercase font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="p-2.5 border-b border-slate-100 text-[13px] text-slate-500 font-mono">{new Date(log.timestamp).toLocaleString()}</td>
                <td className="p-2.5 border-b border-slate-100 text-[13px] text-slate-900">{log.userId || '—'}</td>
                <td className="p-2.5 border-b border-slate-100 text-[13px]">{log.actor}</td>
                <td className="p-2.5 border-b border-slate-100 text-[13px]">{log.action}</td>
                <td className="p-2.5 border-b border-slate-100 text-[13px]">
                  <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-lg text-[11px] font-semibold">
                    {log.targetModule || '—'}
                  </span>
                </td>
                <td className="p-2.5 border-b border-slate-100 text-[13px] text-slate-500">{log.ipAddress || '—'}</td>
              </tr>
            ))}
            {!logs.length && <tr><td colSpan={5} className="p-5 text-center text-slate-400">No audit logs found.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-2">
          <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page <= 1}
            className="inline-flex items-center gap-1 bg-slate-200 border-0 rounded-md px-3 py-1.5 cursor-pointer text-sm disabled:opacity-50 disabled:cursor-default transition hover:bg-slate-300">
            <ChevronLeft size={15} /> Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
            className="inline-flex items-center gap-1 bg-slate-200 border-0 rounded-md px-3 py-1.5 cursor-pointer text-sm disabled:opacity-50 disabled:cursor-default transition hover:bg-slate-300">
            Next <ChevronRight size={15} />
          </button>
        </div>
      )}

      {loading && <div className="text-center text-slate-400">Loading...</div>}
    </div>
  )
}