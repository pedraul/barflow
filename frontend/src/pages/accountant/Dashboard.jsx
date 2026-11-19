import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAccountantSummary } from '../../api/endpoints'
import {
  TrendingUp,
  CreditCard,
  Receipt,
  RotateCcw,
  BarChart3,
  FileText,
  BookOpen,
  DollarSign,
  Settings,
  Bell,
  ChevronDown,
  TrendingDown,
  Building2,
  Menu,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  LogOut,
  ChevronLeft
} from 'lucide-react';
import { usePreferences } from '../../context/PreferencesContext'

const money = (value) => `${Number(value || 0).toLocaleString()}`

export default function AccountantDashboard() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [dateRange, setDateRange] = useState('01 May 2026 - 31 May 2026');
  const [cashFlowFilter, setCashFlowFilter] = useState('This Month');
  const [expenseFilter, setExpenseFilter] = useState('This Month');

  const loadSummary = () => {
    setLoading(true)
    return fetchAccountantSummary()
      .then((result) => setData(result))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let active = true
    loadSummary()
    const refreshTimer = window.setInterval(() => {
      if (active) loadSummary()
    }, 30000)
    return () => { active = false; window.clearInterval(refreshTimer) }
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
        <main className="p-8 space-y-6 max-w-[1600px] mx-auto w-full">
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>{t('Loading dashboard…')}</p>
        </main>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
        <main className="p-8 space-y-6 max-w-[1600px] mx-auto w-full">
          <p style={{ textAlign: 'center', color: 'var(--text-4)', marginTop: '2rem' }}>{t('No dashboard data available.')}</p>
        </main>
      </div>
    )
  }

  const revenue = data.revenue || 0
  const totalSales = data.taxSummary?.totalSales || 0
  const vatTotal = data.taxSummary?.vatCollected || 0
  const expenses = data.expenses || 0
  const profit = data.profit || 0
  const cashInHand = data.cashInHand || 0
  const bankBalance = data.bankBalance || 0

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">

      {/* PAGE CONTENT CONTAINER */}
      <main className="p-8 space-y-6 max-w-[1600px] mx-auto w-full">
        
        {/* TOP KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          
          {/* Total Revenue */}
          <button type="button" onClick={() => navigate('/accountant/sales-revenue')} className="w-full text-left bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <div>
              <div className="text-xs font-medium text-slate-500">{t('Total Revenue')}</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{money(revenue)}</div>
              <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-0.5 mt-1">
                <span>{t('12.5')}</span> <span className="text-slate-400 font-normal">{t('vs Apr 2026')}</span>
              </div>
            </div>
            <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </button>

          <button type="button" onClick={() => navigate('/accountant/sales-revenue')} className="w-full text-left bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <div>
              <div className="text-xs font-medium text-slate-500">{t('Total Sales')}</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{money(totalSales)}</div>
            </div>
            <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600">
              <BarChart3 className="w-5 h-5" />
            </div>
          </button>

          <button type="button" onClick={() => navigate('/accountant/taxes')} className="w-full text-left bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between transition hover:border-amber-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500">
            <div>
              <div className="text-xs font-medium text-slate-500">{t('VAT Total')}</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{money(vatTotal)}</div>
            </div>
            <div className="p-2.5 bg-amber-50 rounded-lg text-amber-600">
              <Receipt className="w-5 h-5" />
            </div>
          </button>

          {/* Total Expenses */}
          <button type="button" onClick={() => navigate('/accountant/reports')} className="w-full text-left bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between transition hover:border-rose-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-500">
            <div>
              <div className="text-xs font-medium text-slate-500">{t('Total Expenses')}</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{money(expenses)}</div>
              <div className="text-[11px] text-rose-600 font-medium flex items-center gap-0.5 mt-1">
                <span>{t('8.3')}</span> <span className="text-slate-400 font-normal">{t('vs Apr 2026')}</span>
              </div>
            </div>
            <div className="p-2.5 bg-rose-50 rounded-lg text-rose-600">
              <TrendingDown className="w-5 h-5" />
            </div>
          </button>

          {/* Net Profit */}
          <button type="button" onClick={() => navigate('/accountant/profit')} className="w-full text-left bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between transition hover:border-indigo-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <div>
              <div className="text-xs font-medium text-slate-500">{t('Net Profit')}</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{money(profit)}</div>
              <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-0.5 mt-1">
                <span>{t('15.7')}</span> <span className="text-slate-400 font-normal">{t('vs Apr 2026')}</span>
              </div>
            </div>
            <div className="p-2.5 bg-indigo-50 rounded-lg text-indigo-600">
              <CreditCard className="w-5 h-5" />
            </div>
          </button>

          {/* Cash in Hand */}
          <button type="button" onClick={() => navigate('/accountant/payments')} className="w-full text-left bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            <div>
              <div className="text-xs font-medium text-slate-500">{t('Cash in Hand')}</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{money(cashInHand)}</div>
              <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-0.5 mt-1">
                <span>{t('5.4')}</span> <span className="text-slate-400 font-normal">{t('vs Apr 2026')}</span>
              </div>
            </div>
            <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600">
              <Receipt className="w-5 h-5" />
            </div>
          </button>

          {/* Bank Balance */}
          <button type="button" onClick={() => navigate('/accountant/payments')} className="w-full text-left bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between transition hover:border-amber-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500">
            <div>
              <div className="text-xs font-medium text-slate-500">{t('Bank Balance')}</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{money(bankBalance)}</div>
              <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-0.5 mt-1">
                <span>{t('6.2')}</span> <span className="text-slate-400 font-normal">{t('vs Apr 2026')}</span>
              </div>
            </div>
            <div className="p-2.5 bg-amber-50 rounded-lg text-amber-600">
              <Building2 className="w-5 h-5" />
            </div>
          </button>

        </div>

        {/* MIDDLE SECTION - CHARTS & BREAKDOWNS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Cash Flow Overview Chart Card (2 Cols) */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{t('Cash Flow Overview')}</h3>
                <div className="flex items-center gap-4 text-xs mt-2">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-emerald-500 rounded-full"></span> {t('Revenue')}</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-rose-400 rounded-full"></span> {t('Expenses')}</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-indigo-600 rounded-full"></span> {t('Net Profit')}</span>
                </div>
              </div>
              <select 
                value={cashFlowFilter} 
                onChange={(e) => setCashFlowFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700"
              >
                <option value="This Month">{t('This Month')}</option>
                <option value="Last Month">{t('Last Month')}</option>
                <option value="This Quarter">{t('This Quarter')}</option>
              </select>
            </div>

            {/* Mock SVG Line Chart */}
            <div className="h-64 w-full pt-4 relative flex flex-col justify-between">
              <div className="absolute inset-0 flex flex-col justify-between text-slate-300 text-xs pointer-events-none">
                <div className="border-b border-slate-100 flex justify-between"><span>{t('8M')}</span></div>
                <div className="border-b border-slate-100 flex justify-between"><span>{t('6M')}</span></div>
                <div className="border-b border-slate-100 flex justify-between"><span>{t('4M')}</span></div>
                <div className="border-b border-slate-100 flex justify-between"><span>{t('2M')}</span></div>
                <div className="border-b border-slate-200 flex justify-between"><span>{t('0')}</span></div>
              </div>

              {/* SVG Curves */}
              <svg className="w-full h-full overflow-visible z-10" viewBox="0 0 500 180">
                {/* Revenue Bars */}
                <rect x="20" y="80" width="6" height="100" fill="#10b981" rx="2" />
                <rect x="70" y="60" width="6" height="120" fill="#10b981" rx="2" />
                <rect x="120" y="40" width="6" height="140" fill="#10b981" rx="2" />
                <rect x="170" y="70" width="6" height="110" fill="#10b981" rx="2" />
                <rect x="220" y="50" width="6" height="130" fill="#10b981" rx="2" />
                <rect x="270" y="80" width="6" height="100" fill="#10b981" rx="2" />
                <rect x="320" y="45" width="6" height="135" fill="#10b981" rx="2" />
                <rect x="370" y="30" width="6" height="150" fill="#10b981" rx="2" />

                {/* Expense Bars */}
                <rect x="30" y="120" width="6" height="60" fill="#f43f5e" rx="2" />
                <rect x="80" y="110" width="6" height="70" fill="#f43f5e" rx="2" />
                <rect x="130" y="100" width="6" height="80" fill="#f43f5e" rx="2" />
                <rect x="180" y="130" width="6" height="50" fill="#f43f5e" rx="2" />
                <rect x="230" y="115" width="6" height="65" fill="#f43f5e" rx="2" />
                <rect x="280" y="140" width="6" height="40" fill="#f43f5e" rx="2" />
                <rect x="330" y="100" width="6" height="80" fill="#f43f5e" rx="2" />
                <rect x="380" y="90" width="6" height="90" fill="#f43f5e" rx="2" />

                {/* Net Profit Trendline */}
                <path
                  d="M 25 120 Q 75 90, 125 60 T 225 70 T 325 40 T 425 20"
                  fill="none"
                  stroke="#4f46e5"
                  strokeWidth="3"
                />
                {/* Nodes */}
                <circle cx="25" cy="120" r="4" fill="#4f46e5" />
                <circle cx="125" cy="60" r="4" fill="#4f46e5" />
                <circle cx="225" cy="70" r="4" fill="#4f46e5" />
                <circle cx="325" cy="40" r="4" fill="#4f46e5" />
                <circle cx="425" cy="20" r="4" fill="#4f46e5" />
              </svg>

              {/* X Axis Labels */}
              <div className="flex justify-between text-[11px] text-slate-400 pt-2 z-10">
                <span>{t('01 May')}</span>
                <span>{t('06 May')}</span>
                <span>{t('11 May')}</span>
                <span>{t('16 May')}</span>
                <span>{t('21 May')}</span>
                <span>{t('26 May')}</span>
                <span>{t('31 May')}</span>
              </div>
            </div>
          </div>

          {/* Expense by Category Donut Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base">{t('Expense by Category')}</h3>
              <select 
                value={expenseFilter} 
                onChange={(e) => setExpenseFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700"
              >
                <option value="This Month">{t('This Month')}</option>
                <option value="Last Month">{t('Last Month')}</option>
              </select>
            </div>

            <div className="flex items-center gap-6 pt-2">
              {/* Donut graphic */}
              <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path className="text-indigo-600" strokeWidth="6" strokeDasharray="42.5, 100" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-blue-500" strokeWidth="6" strokeDasharray="23.1, 100" strokeDashoffset="-42.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-emerald-500" strokeWidth="6" strokeDasharray="12.4, 100" strokeDashoffset="-65.6" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-amber-500" strokeWidth="6" strokeDasharray="8.7, 100" strokeDashoffset="-78" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-purple-500" strokeWidth="6" strokeDasharray="13.3, 100" strokeDashoffset="-86.7" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-xs font-bold text-slate-800">{money(expenses)}</span>
                  <span className="text-[10px] text-slate-400">{t('RWF')}</span>
                </div>
              </div>

              {/* Donut Legend */}
              <div className="space-y-2 text-xs flex-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-600"></span> {t('Purchases')}</span>
                  <span className="font-semibold text-slate-700">{t('42.5%')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500"></span> {t('Salaries')}</span>
                  <span className="font-semibold text-slate-700">{t('23.1%')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span> {t('Utilities')}</span>
                  <span className="font-semibold text-slate-700">{t('12.4%')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span> {t('Rent')}</span>
                  <span className="font-semibold text-slate-700">{t('8.7%')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500"></span> {t('Marketing')}</span>
                  <span className="font-semibold text-slate-700">{t('5.6%')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300"></span> {t('Other')}</span>
                  <span className="font-semibold text-slate-700">{t('7.7%')}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* BOTTOM SECTION - TABLES & LISTS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Recent Transactions Table (2 Cols) */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
            <div>
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-base">{t('Recent Transactions')}</h3>
                <button className="text-xs text-indigo-600 font-semibold hover:underline">{t('View All')}</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="p-2 pl-5">{t('Date')}</th>
                      <th className="p-2">{t('Description')}</th>
                      <th className="p-2">{t('Type')}</th>
                      <th className="p-2 text-right">{t('Amount')}</th>
                      <th className="p-2 text-center">{t('Status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {data.recentTransactions && data.recentTransactions.length > 0 ? (
                      data.recentTransactions.map((tx, idx) => (
                        <tr key={idx}>
                          <td className="p-2 pl-5 text-slate-500">{tx.date ? new Date(tx.date).toLocaleDateString() : '—'}</td>
                          <td className="p-2 text-slate-900 font-semibold">{tx.orderNumber || t('Order')}</td>
                          <td className="p-2 text-emerald-600">{tx.source === 'qr' ? t('QR Order') : tx.source === 'waiter' ? t('Waiter Order') : t('Order')}</td>
                          <td className="p-2 text-right">{money(tx.total)}</td>
                          <td className="p-2 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${tx.status === 'Paid' || tx.status === 'Served' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={5} className="p-2 text-center text-slate-400">{t('No recent transactions.')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Banner Footer inside card */}
            <div className="p-4 bg-indigo-50/60 border-t border-indigo-100 flex items-center justify-between text-xs text-indigo-900">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                <span><strong>{t('Reconciliation Status:')}</strong> {t('You have')} {data.unreconciled?.total || 0} {t('unreconciled transactions')}</span>
              </div>
              <button 
                onClick={() => navigate('/accountant/reconciliations')}
                className="px-3 py-1 bg-white border border-indigo-200 rounded-lg text-indigo-600 font-semibold hover:bg-indigo-50 transition"
              >
                {t('Go to Reconciliation')}
              </button>
            </div>
          </div>

          {/* Unreconciled Items Box */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base">{t('Unreconciled Items')}</h3>
              <button className="text-xs text-indigo-600 font-semibold hover:underline">{t('View All')}</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-rose-50/50 rounded-xl border border-rose-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-slate-700">{t('Unmatched Bank Transactions')}</span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">{data.unreconciled?.unmatchedBank || 0}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-slate-700">{t('In System Only')}</span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">{data.unreconciled?.inSystemOnly || 0}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-slate-700">{t('In Statement Only')}</span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">{data.unreconciled?.inStatementOnly || 0}</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs font-bold text-slate-800 border-t border-slate-100">
              <span>{t('Total Unreconciled')}</span>
              <span className="text-indigo-600 text-sm">{data.unreconciled?.total || 0}</span>
            </div>

            {/* Status Alert Box */}
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3 text-emerald-900 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <div className="font-bold">{t('All Accounts Balanced')}</div>
                <div className="text-[11px] text-emerald-700">{t('Great job! All your accounts are balanced.')}</div>
              </div>
            </div>
          </div>

        </div>

        {/* LOWER GRID SECTION */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Monthly Summary */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">{t('Monthly Summary')}</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="pb-2">{t('Month')}</th>
                    <th className="pb-2">{t('Revenue')}</th>
                    <th className="pb-2">{t('Expenses')}</th>
                    <th className="pb-2">{t('Net Profit')}</th>
                    <th className="pb-2 text-right">{t('Margin')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {data.monthlySummary && data.monthlySummary.length > 0 ? (
                    data.monthlySummary.map((row) => (
                      <tr key={row.month}>
                        <td className="py-2.5 text-slate-900 font-semibold">{row.month}</td>
                        <td className="py-2.5">{money(row.revenue)}</td>
                        <td className="py-2.5">{money(row.expenses)}</td>
                        <td className="py-2.5 text-emerald-600">{money(row.netProfit)}</td>
                        <td className="py-2.5 text-right font-bold text-emerald-600">{row.margin}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={5} className="py-2.5 text-center text-slate-400">{t('No monthly data yet.')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <button type="button" onClick={() => navigate('/accountant/reports')} className="text-xs text-indigo-600 font-semibold hover:underline">{t('View Full Report')}</button>
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" onClick={() => navigate('/accountant/reports?category=sales')} className="text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:border-indigo-300">{t('Revenue')}</button>
                <button type="button" onClick={() => navigate('/accountant/reports?category=transfers')} className="text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:border-indigo-300">{t('Transfers')}</button>
                <button type="button" onClick={() => navigate('/accountant/reports?category=refunds')} className="text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:border-indigo-300">{t('Refunds')}</button>
                <button type="button" onClick={() => navigate('/accountant/reports?category=payroll')} className="text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:border-indigo-300">{t('Payrolls')}</button>
              </div>
            </div>
          </div>

          {/* Tax Summary */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">{t('Tax Summary')}</h3>
              <button className="text-xs text-indigo-600 font-semibold hover:underline">{t('View Details')}</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{t('VAT Collected (Output)')}</span>
                <span className="font-bold text-slate-800">{money(data.taxSummary?.vatCollected || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{t('VAT Paid (Input)')}</span>
                <span className="font-bold text-slate-800">{money(data.taxSummary?.vatPaid || 0)}</span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="font-bold text-rose-600">{t('VAT Payable')}</span>
                <span className="font-bold text-rose-600 text-sm">{money(data.taxSummary?.vatPayable || 0)}</span>
              </div>
            </div>
          </div>

        </div>

      </main>
    </div>
  )
}
