import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import {
  Landmark,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  FileText,
  CreditCard,
  Upload,
  Zap,
  PlusCircle,
  History,
  Eye,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Search,
  X,
  FileSpreadsheet
} from 'lucide-react'
import { fetchReconciliationTransactions, createReconciliation, uploadBankStatement, createAdjustment } from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const ITEMS_PER_PAGE = 10

export default function ReconciliationDashboard() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Overview')
  const [searchTerm, setSearchTerm] = useState('')
  const [bankAccountFilter, setBankAccountFilter] = useState('All Accounts')
  const [statusFilter, setStatusFilter] = useState('All Statuses')
  const [typeFilter, setTypeFilter] = useState('All Types')
  const [selectedRows, setSelectedRows] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])

  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadPreview, setUploadPreview] = useState([])
  const [adjustmentForm, setAdjustmentForm] = useState({ description: '', amount: '', type: 'Deposit', date: '' })
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false)

  const fileInputRef = useRef(null)

  useEffect(() => {
    loadTransactions()
  }, [statusFilter, typeFilter, bankAccountFilter, searchTerm])

  const loadTransactions = async () => {
    setLoading(true)
    try {
      const params = {}
      if (statusFilter !== 'All Statuses') params.status = statusFilter
      if (typeFilter !== 'All Types') params.type = typeFilter
      if (bankAccountFilter !== 'All Accounts') params.bankAccount = bankAccountFilter
      if (searchTerm) params.search = searchTerm
      const data = await fetchReconciliationTransactions(params)
      setTransactions(data)
      setCurrentPage(1)
      setSelectedRows([])
    } catch {
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  const filteredTransactions = transactions
  const totalItems = filteredTransactions.length
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE))
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const matchedCount = filteredTransactions.filter(t => t.status === 'Matched').length
  const unmatchedCount = filteredTransactions.filter(t => t.status === 'Unmatched').length
  const inSystemOnlyCount = filteredTransactions.filter(t => t.status === 'In System Only').length
  const inStatementOnlyCount = filteredTransactions.filter(t => t.status === 'In Statement Only').length

  const statementBalance = filteredTransactions.reduce((sum, t) => sum + (t.statementAmount || 0), 0)
  const systemBalance = filteredTransactions.reduce((sum, t) => sum + (t.systemAmount || 0), 0)
  const difference = statementBalance - systemBalance

  const formatRWF = (amount) => {
    if (amount === null || amount === undefined) return '-'
    const formatted = Math.abs(amount).toLocaleString()
    return amount < 0 ? `-${formatted}` : `${formatted}`
  }

  const toggleSelectAll = () => {
    if (selectedRows.length === paginatedTransactions.length) {
      setSelectedRows([])
    } else {
      setSelectedRows(paginatedTransactions.map((t) => t.id))
    }
  }

  const toggleSelectRow = (id) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]
    )
  }

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Matched':
        return <span className="px-3 py-1 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">{t('Matched')}</span>
      case 'Unmatched':
        return <span className="px-3 py-1 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">{t('Unmatched')}</span>
      case 'In System Only':
        return <span className="px-3 py-1 rounded-full text-[10px] font-medium bg-red-100 text-red-600">{t('In System Only')}</span>
      case 'In Statement Only':
        return <span className="px-3 py-1 rounded-full text-[10px] font-medium bg-rose-100 text-rose-600">{t('In Statement Only')}</span>
      default:
        return null
    }
  }

  const handleMatchSelected = async () => {
    try {
      await createReconciliation({ recorded: selectedRows.length, banked: selectedRows.length, actor: 'Accountant' })
      loadTransactions()
      setSelectedRows([])
    } catch (err) {
      alert(err.message || t('Failed to match selected items.'))
    }
  }

  const handleAutoMatch = async () => {
    try {
      await createReconciliation({ recorded: totalItems, banked: matchedCount, actor: 'Accountant' })
      loadTransactions()
    } catch (err) {
      alert(err.message || t('Auto match failed.'))
    }
  }

  const handleViewDetails = (item) => {
    alert(`${t('Viewing details for')} ${item.ref}\n\n${t('Description')}: ${item.description}\n${t('Type')}: ${item.type}\n${t('Statement Amount')}: ${formatRWF(item.statementAmount)}\n${t('System Amount')}: ${formatRWF(item.systemAmount)}\n${t('Difference')}: ${formatRWF(item.difference)}\n${t('Status')}: ${item.status}\n${t('Date')}: ${item.date}`)
  }

  const handleEditItem = (item) => {
    alert(`${t('Edit item')} ${item.ref}\n\n${t('Adjust the amounts for this')} ${item.type}.`)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map((row) => ({
          date: row.Date || row.date || new Date().toISOString().split('T')[0],
          description: row.Description || row.description || '',
          reference: row.Reference || row.reference || '',
          type: row.Type || row.type || 'Deposit',
          amount: Number(row.Amount || row.amount || 0)
        }))
        setUploadPreview(parsed)
      },
      error: () => {
        setUploadPreview([])
      }
    })
  }

  const handleUploadStatement = async () => {
    if (!uploadFile || uploadPreview.length === 0) {
      alert(t('Please select a valid CSV file first.'))
      return
    }
    setUploading(true)
    try {
      await uploadBankStatement({
        filename: uploadFile.name,
        transactions: uploadPreview
      })
      alert(`${t('Successfully uploaded')} ${uploadPreview.length} ${t('transactions from')} ${uploadFile.name}.`)
      setShowUploadModal(false)
      setUploadFile(null)
      setUploadPreview([])
      loadTransactions()
    } catch (err) {
      alert(err.message || t('Failed to upload bank statement.'))
    } finally {
      setUploading(false)
    }
  }

  const handleCreateAdjustment = async () => {
    if (!adjustmentForm.description || adjustmentForm.amount === '' || !adjustmentForm.type) {
      alert(t('Please fill in all required fields.'))
      return
    }
    setSubmittingAdjustment(true)
    try {
      await createAdjustment({
        description: adjustmentForm.description,
        amount: Number(adjustmentForm.amount),
        type: adjustmentForm.type,
        date: adjustmentForm.date || new Date().toISOString().split('T')[0]
      })
      alert(t('Adjustment created successfully.'))
      setShowAdjustmentModal(false)
      setAdjustmentForm({ description: '', amount: '', type: 'Deposit', date: '' })
      loadTransactions()
    } catch (err) {
      alert(err.message || t('Failed to create adjustment.'))
    } finally {
      setSubmittingAdjustment(false)
    }
  }

  const handleViewHistory = () => {
    setActiveTab('Reconciliation History')
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
      <main className="p-8 space-y-6 max-w-[1600px] mx-auto w-full">

        {/* TABS HEADER */}
        <div className="border-b border-slate-200 flex gap-8 text-sm font-medium">
          {['Overview', 'Unreconciled Items', 'Reconciliation History'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 relative transition-all ${
                activeTab === tab
                  ? 'text-indigo-600 font-semibold border-b-2 border-indigo-600'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t(tab)}
            </button>
          ))}
        </div>

        {/* SUMMARY STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                {t('Statement Balance')}
                <span className="text-slate-400 cursor-pointer" title={t('Bank statement ending balance')}>ⓘ</span>
              </div>
              <div className="text-2xl font-bold text-indigo-950 mt-1">{formatRWF(statementBalance)}</div>
              <div className="text-xs text-slate-400 mt-1">{t('As per bank statement')}</div>
            </div>
            <div className="p-3 bg-indigo-50 rounded-full text-indigo-600">
              <Landmark className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                {t('System Balance')}
                <span className="text-slate-400 cursor-pointer" title={t('Internal system recorded balance')}>ⓘ</span>
              </div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">{formatRWF(systemBalance)}</div>
              <div className="text-xs text-slate-400 mt-1">{t('As per system records')}</div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-full text-emerald-600">
              <BookOpen className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                {t('Difference')}
                <span className="text-slate-400 cursor-pointer" title={t('Discrepancy to be reconciled')}>ⓘ</span>
              </div>
              <div className="text-2xl font-bold text-rose-600 mt-1">{formatRWF(difference)}</div>
              <div className="text-xs text-slate-400 mt-1">{t('Difference to reconcile')}</div>
            </div>
            <div className="p-3 bg-rose-50 rounded-full text-rose-500">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                {t('Reconciled Items')}
                <span className="text-slate-400 cursor-pointer" title={t('Matched transactions total')}>ⓘ</span>
              </div>
              <div className="text-2xl font-bold text-indigo-950 mt-1">{matchedCount}</div>
              <div className="text-xs text-slate-400 mt-1">{t('Out of')} {totalItems} {t('items')}</div>
            </div>
            <div className="p-3 bg-purple-50 rounded-full text-indigo-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* INSTRUCTIONAL BANNER */}
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 flex items-center gap-3 text-indigo-900 text-sm">
          <div className="p-1 bg-indigo-100 rounded-full text-indigo-600">
            <span className="text-xs font-bold px-1">ⓘ</span>
          </div>
          <span>{t('Review and match your bank statement transactions with your system records. Mark items as matched or adjust as needed.')}</span>
        </div>

        {/* DASHBOARD BODY - TABLES & SIDE PANELS */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

          {/* MAIN TRANSACTIONS TABLE (3 COLS WIDE) */}
          <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
            <div>

              {/* Table Header Controls */}
              <div className="p-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-800">
                  {t('Transactions to Reconcile')} <span className="text-slate-400 font-normal">({totalItems})</span>
                </h2>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={t('Search transactions...')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-60"
                    />
                  </div>

                  <button
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                    disabled={selectedRows.length === 0}
                    onClick={handleMatchSelected}
                  >
                    {t('Match Selected')}
                  </button>
                  <button
                    className="px-4 py-1.5 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
                    onClick={() => setShowAdjustmentModal(true)}
                  >
                    {t('Adjust')}
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th className="p-2 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                          checked={selectedRows.length === paginatedTransactions.length && paginatedTransactions.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="p-2">{t('Date')}</th>
                      <th className="p-2">{t('Description')}</th>
                      <th className="p-2">{t('Reference')}</th>
                      <th className="p-2">{t('Type')}</th>
                      <th className="p-2 text-right">{t('Statement Amount')}</th>
                      <th className="p-2 text-right">{t('System Amount')}</th>
                      <th className="p-2 text-right">{t('Difference')}</th>
                      <th className="p-2 text-center">{t('Status')}</th>
                      <th className="p-2 text-center">{t('Action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {loading ? (
                      <tr><td colSpan={10} className="p-8 text-center text-slate-400">{t('Loading transactions...')}</td></tr>
                    ) : paginatedTransactions.length === 0 ? (
                      <tr><td colSpan={10} className="p-8 text-center text-slate-400">{t('No transactions found.')}</td></tr>
                    ) : (
                      paginatedTransactions.map((item) => {
                        const isSelected = selectedRows.includes(item.id)
                        return (
                          <tr key={item.id} className={`hover:bg-slate-50/80 transition ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                                checked={isSelected}
                                onChange={() => toggleSelectRow(item.id)}
                              />
                            </td>
                            <td className="p-2 whitespace-nowrap text-xs font-medium text-slate-600">{item.date}</td>
                            <td className="p-2 font-semibold text-slate-900">{item.description}</td>
                            <td className="p-2 text-xs font-mono text-slate-500">{item.ref}</td>
                            <td className="p-2 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-xs">
                                <span>{item.type}</span>
                              </div>
                            </td>
                            <td className="p-2 text-right font-medium">{formatRWF(item.statementAmount)}</td>
                            <td className="p-2 text-right font-medium">{formatRWF(item.systemAmount)}</td>
                            <td className="p-2 text-right font-medium">{formatRWF(item.difference)}</td>
                            <td className="p-2 text-center">{renderStatusBadge(item.status)}</td>
                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-2 text-slate-400">
                                <button onClick={() => handleViewDetails(item)} className="hover:text-indigo-600 transition" title={t('View Details')}>
                                  <Eye className="w-4 h-4" />
                                </button>
                                {item.status !== 'Matched' && (
                                  <button onClick={() => handleEditItem(item)} className="hover:text-indigo-600 transition" title={t('Edit Item')}>
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table Footer Pagination */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div>
                {totalItems > 0 ? (
                  <>{t('Showing')} {startIndex + 1} {t('to')} {Math.min(startIndex + ITEMS_PER_PAGE, totalItems)} {t('of')} {totalItems} {t('entries')}</>
                ) : (
                  t('No entries')
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-40"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    className={`w-7 h-7 rounded-lg ${currentPage === page ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100'}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-40"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE CONTROLS & SUMMARY (1 COL WIDE) */}
          <div className="space-y-6">

            {/* Reconciliation Controls */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-800 text-sm mb-4">{t('Reconciliation Controls')}</h3>

              <button onClick={() => setShowUploadModal(true)} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-indigo-200 text-indigo-600 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition">
                <Upload className="w-4 h-4" />
                <span>{t('Upload Bank Statement')}</span>
              </button>

              <button onClick={handleAutoMatch} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-indigo-200 text-indigo-600 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition">
                <Zap className="w-4 h-4" />
                <span>{t('Auto Match')}</span>
              </button>

              <button onClick={() => setShowAdjustmentModal(true)} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-indigo-200 text-indigo-600 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition">
                <PlusCircle className="w-4 h-4" />
                <span>{t('Create Adjustment')}</span>
              </button>

              <button onClick={handleViewHistory} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-indigo-200 text-indigo-600 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition">
                <History className="w-4 h-4" />
                <span>{t('Reconciliation History')}</span>
              </button>
            </div>

            {/* Filters Box */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-sm">{t('Filters')}</h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">{t('Bank Account')}</label>
                  <select
                    value={bankAccountFilter}
                    onChange={(e) => setBankAccountFilter(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 text-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="All Accounts">{t('All Accounts')}</option>
                    <option value="BK Main Account">{t('BK Main Account')}</option>
                    <option value="MoMo Merchant Account">{t('MoMo Merchant Account')}</option>
                    <option value="Cash Till">{t('Cash Till')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 font-semibold mb-1">{t('Status')}</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 text-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="All Statuses">{t('All Statuses')}</option>
                    <option value="Matched">{t('Matched')}</option>
                    <option value="Unmatched">{t('Unmatched')}</option>
                    <option value="In System Only">{t('In System Only')}</option>
                    <option value="In Statement Only">{t('In Statement Only')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 font-semibold mb-1">{t('Type')}</label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 text-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="All Types">{t('All Types')}</option>
                    <option value="Deposit">{t('Deposit')}</option>
                    <option value="Payment">{t('Payment')}</option>
                    <option value="Expense">{t('Expense')}</option>
                    <option value="Refund">{t('Refund')}</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={loadTransactions} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition">
                  {t('Apply Filters')}
                </button>
                <button
                  onClick={() => {
                    setBankAccountFilter('All Accounts')
                    setStatusFilter('All Statuses')
                    setTypeFilter('All Types')
                    setSearchTerm('')
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 transition"
                >
                  {t('Reset')}
                </button>
              </div>
            </div>

            {/* Summary by Status */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-sm">{t('Summary by Status')}</h3>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>{t('Matched')}</span>
                  </div>
                  <div className="flex gap-4">
                      <span className="font-semibold text-slate-800">{matchedCount}</span>
                      <span className="text-slate-400 w-12 text-right">{totalItems ? ((matchedCount / totalItems) * 100).toFixed(2) : 0}</span>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>{t('Unmatched')}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="font-semibold text-slate-800">{unmatchedCount}</span>
                    <span className="text-slate-400 w-12 text-right">{totalItems ? ((unmatchedCount / totalItems) * 100).toFixed(2) : 0}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span>{t('In System Only')}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="font-semibold text-slate-800">{inSystemOnlyCount}</span>
                    <span className="text-slate-400 w-12 text-right">{totalItems ? ((inSystemOnlyCount / totalItems) * 100).toFixed(2) : 0}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400"></span>
                    <span>{t('In Statement Only')}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="font-semibold text-slate-800">{inStatementOnlyCount}</span>
                    <span className="text-slate-400 w-12 text-right">{totalItems ? ((inStatementOnlyCount / totalItems) * 100).toFixed(2) : 0}</span>
                  </div>
                </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between font-bold text-slate-800">
                  <span>{t('Total')}</span>
                  <div className="flex gap-4">
                    <span>{totalItems}</span>
                    <span className="w-12 text-right">{t('100')}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* BOTTOM TIP BANNER */}
        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex items-center gap-3 text-indigo-900 text-xs">
          <Lightbulb className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>{t('Tip:')}</strong> {t('Upload your bank statement and click "Auto Match" to automatically match transactions. Then review unmatched items and create adjustments if necessary.')}
          </span>
        </div>

        {/* UPLOAD BANK STATEMENT MODAL */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowUploadModal(false)}>
            <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-base">{t('Upload Bank Statement')}</h3>
                <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                  <FileSpreadsheet className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
                  <p className="text-sm text-slate-600 mb-3">{t('Upload a CSV file with columns: Date, Description, Reference, Type, Amount')}</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
                  >
                    {t('Choose CSV File')}
                  </button>
                  {uploadFile && (
                    <p className="text-xs text-slate-500 mt-2">{t('Selected:')} {uploadFile.name}</p>
                  )}
                </div>
                {uploadPreview.length > 0 && (
                   <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-x-auto">
                    <p className="text-xs font-semibold text-slate-600 mb-2">{t('Preview (')}{uploadPreview.length} {t('rows)')}</p>
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="text-slate-500">
                          <th className="p-1">{t('Date')}</th>
                          <th className="p-1">{t('Description')}</th>
                          <th className="p-1">{t('Amount')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {uploadPreview.slice(0, 5).map((row, idx) => (
                          <tr key={idx} className="text-slate-700">
                            <td className="p-1">{row.date}</td>
                            <td className="p-1">{row.description}</td>
                            <td className="p-1 text-right">{Number(row.amount).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="flex gap-2 p-5 border-t border-slate-100">
                <button
                  onClick={handleUploadStatement}
                  disabled={uploading || !uploadFile}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {uploading ? t('Uploading...') : t('Upload Statement')}
                </button>
                <button
                  onClick={() => {
                    setShowUploadModal(false)
                    setUploadFile(null)
                    setUploadPreview([])
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
                >
                  {t('Cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CREATE ADJUSTMENT MODAL */}
        {showAdjustmentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAdjustmentModal(false)}>
            <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-base">{t('Create Adjustment')}</h3>
                <button onClick={() => setShowAdjustmentModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{t('Description')}</label>
                  <input
                    type="text"
                    value={adjustmentForm.description}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, description: e.target.value })}
                    placeholder={t('e.g. Bank fee adjustment')}
                    className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{t('Amount (RWF)')}</label>
                  <input
                    type="number"
                    value={adjustmentForm.amount}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, amount: e.target.value })}
                    placeholder={t('0')}
                    className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{t('Type')}</label>
                  <select
                    value={adjustmentForm.type}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, type: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-slate-50 text-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Deposit">{t('Deposit')}</option>
                    <option value="Payment">{t('Payment')}</option>
                    <option value="Expense">{t('Expense')}</option>
                    <option value="Refund">{t('Refund')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{t('Date')}</label>
                  <input
                    type="date"
                    value={adjustmentForm.date}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, date: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 p-5 border-t border-slate-100">
                <button
                  onClick={handleCreateAdjustment}
                  disabled={submittingAdjustment}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {submittingAdjustment ? t('Saving...') : t('Create Adjustment')}
                </button>
                <button
                  onClick={() => {
                    setShowAdjustmentModal(false)
                    setAdjustmentForm({ description: '', amount: '', type: 'Deposit', date: '' })
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
                >
                  {t('Cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
