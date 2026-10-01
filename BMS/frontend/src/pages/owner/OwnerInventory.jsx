import React, { useMemo, useState } from 'react'
import { PackageSearch, AlertTriangle, BarChart3 } from 'lucide-react'

export default function OwnerInventory({ inventory }) {
  const [subTab, setSubTab] = useState('stock')

  const lowStock = useMemo(() => inventory.filter((row) => row.stock <= row.reorder), [inventory])
  const valuation = useMemo(
    () => inventory.reduce((sum, row) => sum + row.stock * 1500, 0),
    [inventory]
  )

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      <nav className="flex gap-1 border-b border-slate-200 mb-6" aria-label="Inventory sections">
        <button type="button" className={`px-4 py-2.5 font-semibold text-sm border-b-2 border-transparent -mb-px transition ${subTab === 'stock' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 hover:text-slate-900'}`} onClick={() => setSubTab('stock')}>Stock levels</button>
        <button type="button" className={`px-4 py-2.5 font-semibold text-sm border-b-2 border-transparent -mb-px transition ${subTab === 'low' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 hover:text-slate-900'}`} onClick={() => setSubTab('low')}>
          Low stock{lowStock.length ? ` (${lowStock.length})` : ''}
        </button>
        <button type="button" className={`px-4 py-2.5 font-semibold text-sm border-b-2 border-transparent -mb-px transition ${subTab === 'valuation' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 hover:text-slate-900'}`} onClick={() => setSubTab('valuation')}>Valuation</button>
      </nav>

      {subTab === 'stock' && (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Inventory reports</h2>
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Item</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Branch</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Stock</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Reorder at</th>
                  <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventory.map((row) => (
                  <tr key={row.id} className="hover:bg-indigo-50">
                    <td className="p-2 text-slate-700">{row.item}</td>
                    <td className="p-2 text-slate-700">{row.branch}</td>
                    <td className="p-2 text-slate-700">{row.stock}</td>
                    <td className="p-2 text-slate-700">{row.reorder}</td>
                    <td className="p-2"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${row.stock <= row.reorder ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>{row.stock <= row.reorder ? 'Reorder' : 'OK'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {subTab === 'low' && (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Low stock</h2>
          <p className="text-sm text-slate-500 mb-4">Items at or below their reorder threshold need restocking.</p>
          {lowStock.length ? (
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Item</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Branch</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Stock</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Reorder at</th>
                    <th className="bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider p-2 border-b border-slate-200 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStock.map((row) => (
                    <tr key={row.id} className="hover:bg-indigo-50">
                      <td className="p-2 text-slate-700">{row.item}</td>
                      <td className="p-2 text-slate-700">{row.branch}</td>
                      <td className="p-2 text-slate-700">{row.stock}</td>
                      <td className="p-2 text-slate-700">{row.reorder}</td>
                      <td className="p-2"><button type="button" className="text-indigo-600 hover:underline font-medium" onClick={() => setSubTab('stock')}>View stock</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400">All stock levels are healthy.</p>
          )}
        </section>
      )}

      {subTab === 'valuation' && (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Valuation</h2>
          <p className="text-sm text-slate-500 mb-4">Estimated inventory value at the current unit cost.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{inventory.length}</strong>
              <span className="text-slate-500 text-sm font-medium">Tracked items</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{inventory.reduce((sum, row) => sum + row.stock, 0).toLocaleString()}</strong>
              <span className="text-slate-500 text-sm font-medium">Total units</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r"></div>
              <strong className="block text-2xl font-extrabold text-slate-900 tracking-tight">{`${(valuation).toLocaleString()} RWF`}</strong>
              <span className="text-slate-500 text-sm font-medium">Estimated value</span>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
