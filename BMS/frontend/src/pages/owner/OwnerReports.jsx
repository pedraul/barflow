import React, { useMemo, useState } from 'react'
import { BarChart3, GitBranch, Scale } from 'lucide-react'

const money = (value) => `${value.toLocaleString()} RWF`

export default function OwnerReports({ liveSales, branches, variance }) {
  const [subTab, setSubTab] = useState('overview')

  const totalSales = useMemo(() => liveSales.reduce((sum, s) => sum + s.amount, 0), [liveSales])
  const totalVariance = useMemo(() => variance.reduce((sum, v) => sum + v.loss, 0), [variance])
  const activeBranches = branches.filter((b) => b.status === 'Active').length

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      <nav className="flex gap-1 border-b border-slate-200 mb-6" aria-label="Reports sections">
        <button type="button" className={`px-4 py-2.5 font-semibold text-sm border-b-2 border-transparent -mb-px transition ${subTab === 'overview' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 hover:text-slate-900'}`} onClick={() => setSubTab('overview')}>Overview</button>
        <button type="button" className={`px-4 py-2.5 font-semibold text-sm border-b-2 border-transparent -mb-px transition ${subTab === 'branch' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 hover:text-slate-900'}`} onClick={() => setSubTab('branch')}>Branch performance</button>
        <button type="button" className={`px-4 py-2.5 font-semibold text-sm border-b-2 border-transparent -mb-px transition ${subTab === 'variance' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 hover:text-slate-900'}`} onClick={() => setSubTab('variance')}>Variance</button>
      </nav>

      {subTab === 'overview' && (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Reports</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{money(totalSales)}</strong>
              <span className="text-slate-500 text-sm font-medium">Sales today</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{money(totalVariance)}</strong>
              <span className="text-slate-500 text-sm font-medium">Total variance</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{activeBranches}</strong>
              <span className="text-slate-500 text-sm font-medium">Active branches</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{money(branches.reduce((sum, b) => sum + (b.staff || 0), 0))}</strong>
              <span className="text-slate-500 text-sm font-medium">Total staff</span>
            </div>
          </div>
          <button type="button" className="mt-4 text-indigo-600 hover:underline font-medium" onClick={() => setSubTab('branch')}>View branch performance →</button>
        </section>
      )}

      {subTab === 'branch' && (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Branch performance</h2>
          <p className="text-sm text-slate-500 mb-4">Sales and staffing across every branch.</p>
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Branch</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Manager</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Staff</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Status</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Today's sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branches.map((branch) => {
                  const sales = liveSales.filter((s) => s.branch === branch.name).reduce((sum, s) => sum + s.amount, 0)
                  return (
                    <tr key={branch.id} className="hover:bg-indigo-50">
                      <td className="p-3 text-slate-700">{branch.name}</td>
                      <td className="p-3 text-slate-700">{branch.manager}</td>
                      <td className="p-3 text-slate-700">{branch.staff}</td>
                      <td className="p-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${branch.status === 'Active' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>{branch.status}</span></td>
                      <td className="p-3 text-slate-700">{money(sales)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {subTab === 'variance' && (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Variance</h2>
          <p className="text-sm text-slate-500 mb-4">Expected vs actual takings and recorded losses.</p>
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Branch</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Expected</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Actual</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Loss</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-3 border-b border-slate-200 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {variance.map((row) => (
                  <tr key={row.id} className="hover:bg-indigo-50">
                    <td className="p-3 text-slate-700">{row.branch}</td>
                    <td className="p-3 text-slate-700">{money(row.expected)}</td>
                    <td className="p-3 text-slate-700">{money(row.actual)}</td>
                    <td className="p-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${row.loss > 0 ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>{money(row.loss)}</span></td>
                    <td className="p-3 text-slate-700">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
