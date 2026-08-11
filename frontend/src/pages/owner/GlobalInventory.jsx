import React, { useEffect, useState } from 'react'
import { useOwner } from '../../context/OwnerContext'
import { PackageSearch, Search } from 'lucide-react'

export default function GlobalInventory() {
  const { fetchGlobalInventory, fetchStockMovements, loading } = useOwner()
  const [inventory, setInventory] = useState([])
  const [movements, setMovements] = useState([])
  const [view, setView] = useState('items') // 'items' | 'movements'
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')

  useEffect(() => {
    loadInventory()
    loadMovements()
  }, [])

  const loadInventory = async () => {
    try { setInventory(await fetchGlobalInventory()) } catch (e) { console.error(e) }
  }
  const loadMovements = async () => {
    try { setMovements(await fetchStockMovements()) } catch (e) { console.error(e) }
  }

  const formatCurr = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'RWF', minimumFractionDigits: 0 }).format(v || 0)

  const branches = [...new Set(inventory.map((i) => i.branch).filter(Boolean))]

  const filteredItems = inventory.filter((i) => {
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !i.sku?.toLowerCase().includes(search.toLowerCase())) return false
    if (branchFilter && i.branch !== branchFilter) return false
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h2 className="m-0 text-2xl font-bold text-slate-900">Global Inventory Monitor</h2>
        <div className="flex gap-2">
          <button onClick={() => setView('items')} className={`rounded-md px-3.5 py-1.5 cursor-pointer text-sm font-medium transition ${view === 'items' ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>Stock Table</button>
          <button onClick={() => setView('movements')} className={`rounded-md px-3.5 py-1.5 cursor-pointer text-sm font-medium transition ${view === 'movements' ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>Stock Movements</button>
        </div>
      </div>

      {view === 'items' && (
        <>
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search by name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-indigo-500">
              <option value="">All Branches</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  {['Name', 'SKU', 'Branch', 'Qty', 'Cost Price', 'Sell Price', 'Min Stock', 'Status'].map((h) => (
                    <th key={h} className="text-left p-2 text-xs text-slate-500 uppercase font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-2.5 text-[13px] text-slate-700">{item.name}</td>
                    <td className="p-2.5 text-[13px] text-slate-400">{item.sku || '—'}</td>
                    <td className="p-2.5 text-[13px] text-slate-700">{item.branch}</td>
                    <td className="p-2.5 text-[13px] font-semibold text-slate-700">{item.quantity} {item.unit}</td>
                    <td className="p-2.5 text-[13px] text-slate-700">{formatCurr(item.costPrice)}</td>
                    <td className="p-2.5 text-[13px] text-slate-700">{formatCurr(item.sellingPrice)}</td>
                    <td className="p-2.5 text-[13px] text-slate-700">{item.minStockLevel}</td>
                    <td className="p-2.5 text-[13px]">
                      {item.lowStock ? (
                        <span className="bg-red-100 text-red-800 px-2.5 py-0.5 rounded-full text-[10px] font-medium">⚠ Low Stock</span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-[10px] font-medium">In Stock</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!filteredItems.length && <tr><td colSpan={8} className="p-5 text-center text-slate-400">No inventory items found.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'movements' && (
        <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-200 text-sm text-slate-500">
            Stock Adjustment History — Last 100 entries
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-200">
                {['Item', 'Type', 'Qty', 'Reason', 'Adjusted By', 'Branch', 'Date'].map((h) => (
                  <th key={h} className="text-left p-2 text-xs text-slate-500 uppercase font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="p-2.5 text-[13px] text-slate-700">{m.itemName}</td>
                  <td className="p-2.5 text-[13px]">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${m.adjustmentType === 'addition' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{m.adjustmentType}</span>
                  </td>
                  <td className="p-2.5 text-[13px] text-slate-700">{m.quantity}</td>
                  <td className="p-2.5 text-[13px] text-slate-700">{m.reason || '—'}</td>
                  <td className="p-2.5 text-[13px] text-slate-700">{m.adjustedBy}</td>
                  <td className="p-2.5 text-[13px] text-slate-700">{m.branch}</td>
                  <td className="p-2.5 text-[13px] text-slate-400">{new Date(m.timestamp).toLocaleDateString()}</td>
                </tr>
              ))}
              {!movements.length && <tr><td colSpan={7} className="p-5 text-center text-slate-400">No stock movements recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {loading && <div className="text-center text-slate-400 p-5">Loading...</div>}
    </div>
  )
}