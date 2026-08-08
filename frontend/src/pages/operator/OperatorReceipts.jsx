import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { fetchOperatorOrders } from '../../api/endpoints'
import {
  LayoutDashboard, ShoppingBag, ChefHat, CheckCircle2, BarChart3,
  Clock, FileText, Printer, GlassWater,
  FileSpreadsheet, User, LogOut, Menu, MessageSquare
} from 'lucide-react'

const MONEY = (v) => `${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function SidebarLink({ icon, label, badge, badgeColor, status, active, onClick }) {
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); onClick?.() }} className={`flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/60 hover:text-white transition group ${active ? 'font-medium' : ''} text-slate-400`}>
      <div className="flex items-center gap-3">
        <span className={active ? 'text-slate-400' : 'text-slate-500 group-hover:text-slate-300'}>{icon}</span>
        <span className="font-medium">{label}</span>
      </div>
      {badge !== undefined && (
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      )}
      {status && <span className={`w-2 h-2 rounded-full ${status}`}></span>}
    </a>
  )
}

export default function OperatorReceipts() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [tab, setTab] = useState('printed')
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/operator/orders', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        setReceipts(data || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const printedReceipts = receipts.filter((r) => r.status === 'Served' || r.status === 'Paid')

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0B132B] text-slate-400 flex flex-col justify-between shrink-0">
        <div>
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800 text-white font-bold text-xl">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white">
              <GlassWater size={20} className="transform rotate-180" />
            </div>
            <span>BarFlow</span>
          </div>

          <nav className="p-4 space-y-6 text-sm">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Order Management</p>
              <div className="space-y-1">
                <SidebarLink icon={<FileText size={18} />} label="New Orders" onClick={() => navigate('/operator/orders')} />
                <SidebarLink icon={<ChefHat size={18} />} label="Preparing" onClick={() => navigate('/operator/orders')} />
                <SidebarLink icon={<CheckCircle2 size={18} />} label="Ready" onClick={() => navigate('/operator/orders')} />
                <SidebarLink icon={<FileText size={18} />} label="All Orders" onClick={() => navigate('/operator/orders')} />
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Receipts</p>
              <div className="space-y-1">
                <SidebarLink icon={<Printer size={18} />} label="Printed Receipts" active={tab === 'printed'} onClick={() => setTab('printed')} />
              </div>
            </div>

            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Other</p>
              <div className="space-y-1">
                <SidebarLink icon={<FileSpreadsheet size={18} />} label="Reports" onClick={() => navigate('/operator/reports')} />
                <SidebarLink icon={<MessageSquare size={18} />} label="Chats" onClick={() => navigate('/notifications')} />
                <SidebarLink icon={<User size={18} />} label="My Account" onClick={() => navigate('/account')} />
              </div>
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button onClick={() => { navigate('/login') }} className="flex items-center gap-3 px-3 py-2.5 text-red-400 hover:bg-red-950/30 rounded-lg font-medium transition w-full">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button className="text-slate-500 hover:text-slate-700">
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-semibold text-slate-900">Receipts</h1>
          </div>
          <div className="flex items-center gap-6">
            <button className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
              <Printer size={16} /> Print
            </button>
            <div className="flex items-center gap-3 border-l pl-6 border-slate-200">
              <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
                OP
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-900 leading-tight">Operator</p>
                <p className="text-xs text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span> Online</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="flex border-b border-slate-200">
              <button onClick={() => setTab('printed')} className={`px-6 py-3 text-sm font-semibold transition ${tab === 'printed' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}>
                Printed Receipts
              </button>
            </div>

            <div className="p-4 space-y-4">
              {loading ? (
                <div className="text-center text-slate-400 py-8">Loading receipts...</div>
              ) : receipts.length === 0 ? (
                <div className="text-center text-slate-400 py-8">No receipts</div>
              ) : receipts.map((receipt) => (
                <div key={receipt.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50/40 hover:bg-slate-50 transition space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{receipt.orderNumber}</span>
                      <span className="text-xs text-slate-500 font-medium">Table {receipt.tableNumber}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${receipt.status === 'Served' || receipt.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{receipt.status}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">{receipt.createdAt}</span>
                  </div>
                  <div className="space-y-1">
                    {(receipt.items || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs text-slate-600">
                        <span>{item.name}</span>
                        <span className="text-slate-400">x{item.quantity}</span>
                        <span className="font-medium text-slate-700">{MONEY(item.price)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-dashed border-slate-200 pt-2 flex justify-between items-center">
                    <span className="text-xs text-slate-500 font-bold">Total</span>
                    <span className="text-sm font-black text-slate-900">{MONEY(receipt.total)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button onClick={() => navigate(`/operator/receipt/${receipt.id}`)} className="text-xs font-semibold border border-slate-200 text-slate-600 py-1.5 rounded-md hover:bg-white transition bg-white shadow-xs">View</button>
                    <button onClick={() => { navigate(`/operator/receipt/${receipt.id}`); }} className="text-xs font-semibold border border-slate-200 text-slate-600 py-1.5 rounded-md hover:bg-white transition flex items-center justify-center gap-1 bg-white shadow-xs"><Printer size={12} /> Print</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
