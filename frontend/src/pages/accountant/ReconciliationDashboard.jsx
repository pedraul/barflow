import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Papa from 'papaparse'
import { X } from 'lucide-react'
import {
  fetchReconciliationTransactions,
  fetchReconciliations,
  matchReconciliationItems,
  autoMatchReconciliation,
  unmatchReconciliationItem,
  uploadBankStatement,
  createAdjustment,
} from '../../api/endpoints'
import { usePreferences } from '../../context/PreferencesContext'

const ITEMS_PER_PAGE = 10
const ACCOUNTS = ['Cash Till', 'Mobile Money', 'Bank / Card']
const STATUSES = ['Matched', 'Unmatched', 'In System Only', 'In Statement Only']
const TYPES = ['Deposit', 'Payment', 'Expense', 'Refund']
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'unreconciled', label: 'Unreconciled Items' },
  { key: 'history', label: 'Reconciliation History' },
]
const KIND_LABELS = {
  payment: 'Payment received', refund: 'Refund', transfer: 'Transfer', salary: 'Salary',
  withdrawal: 'Withdrawal', adjustment: 'Adjustment', expense: 'Expense', statement: 'Statement line',
}

const formatRWF = (amount) => {
  if (amount === null || amount === undefined || amount === '') return '—'
  const formatted = Math.abs(Number(amount)).toLocaleString(undefined, { maximumFractionDigits: 0 })
  return Number(amount) < 0 ? `-${formatted}` : formatted
}

const apiError = (err, fallback) => err?.response?.data?.error || err?.message || fallback

function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white rounded-xl border border-slate-200 shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-base">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
        {footer && <div className="flex gap-2 p-5 border-t border-slate-100">{footer}</div>}
      </div>
    </div>
  )
}

export default function ReconciliationDashboard() {
  const { t } = usePreferences()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStatus = searchParams.get('status')
  const [activeTab, setActiveTab] = useState(initialStatus === 'unreconciled' ? 'unreconciled' : 'overview')
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [bankAccountFilter, setBankAccountFilter] = useState(ACCOUNTS.includes(searchParams.get('account')) ? searchParams.get('account') : '')
  const [statusFilter, setStatusFilter] = useState(STATUSES.includes(initialStatus) ? initialStatus : '')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedRows, setSelectedRows] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [notice, setNotice] = useState(null) // { tone: 'success' | 'error', text }
  const [busy, setBusy] = useState(false)

  const [detailItem, setDetailItem] = useState(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadAccount, setUploadAccount] = useState('Bank / Card')
  const [uploadPreview, setUploadPreview] = useState([])
  const [uploadError, setUploadError] = useState('')
  const emptyAdjustment = { description: '', amount: '', type: 'Expense', date: '', bankAccount: 'Bank / Card' }
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustment)
  const [adjustmentError, setAdjustmentError] = useState('')
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false)
  const fileInputRef = useRef(null)
  const requestId = useRef(0)

  // Follow links from the dashboard (e.g. ?status=In%20System%20Only) while the page is open.
  useEffect(() => {
    const status = searchParams.get('status')
    const account = searchParams.get('account')
    if (status === 'unreconciled') setActiveTab('unreconciled')
    else if (STATUSES.includes(status)) setStatusFilter(status)
    if (ACCOUNTS.includes(account)) setBankAccountFilter(account)
  }, [searchParams])

  // Debounce the search box so the server isn't queried on every key press.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const loadTransactions = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const params = {}
      if (activeTab === 'unreconciled' && !statusFilter) params.status = 'unreconciled'
      else if (statusFilter) params.status = statusFilter
      if (typeFilter) params.type = typeFilter
      if (bankAccountFilter) params.bankAccount = bankAccountFilter
      if (searchTerm) params.search = searchTerm
      const data = await fetchReconciliationTransactions(params)
      if (id !== requestId.current) return
      setTransactions(Array.isArray(data) ? data : [])
      setCurrentPage(1)
      setSelectedRows((prev) => prev.filter((rowId) => (data || []).some((d) => d.id === rowId)))
    } catch (err) {
      if (id !== requestId.current) return
      setTransactions([])
      setNotice({ tone: 'error', text: apiError(err, t('Failed to load transactions.')) })
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [activeTab, statusFilter, typeFilter, bankAccountFilter, searchTerm, t])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      setHistory(await fetchReconciliations() || [])
    } catch (err) {
      setHistory([])
      setNotice({ tone: 'error', text: apiError(err, t('Failed to load reconciliation history.')) })
    } finally {
      setHistoryLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (activeTab === 'history') loadHistory()
    else loadTransactions()
  }, [activeTab, loadTransactions, loadHistory])

  const changeTab = (key) => {
    setActiveTab(key)
    setSelectedRows([])
    if (key === 'unreconciled' && statusFilter === 'Matched') setStatusFilter('')
    const next = new URLSearchParams(searchParams)
    if (key === 'unreconciled') next.set('status', 'unreconciled')
    else next.delete('status')
    setSearchParams(next, { replace: true })
  }

  const totalItems = transactions.length
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE))
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedTransactions = transactions.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const counts = useMemo(() => {
    const result = { Matched: 0, Unmatched: 0, 'In System Only': 0, 'In Statement Only': 0 }
    transactions.forEach((item) => { result[item.status] = (result[item.status] || 0) + 1 })
    return result
  }, [transactions])
  const statementBalance = transactions.reduce((sum, item) => sum + (item.statementAmount ?? 0), 0)
  const systemBalance = transactions.reduce((sum, item) => sum + (item.systemAmount ?? 0), 0)
  const difference = statementBalance - systemBalance

  const allOnPageSelected = paginatedTransactions.length > 0 && paginatedTransactions.every((item) => selectedRows.includes(item.id))
  const toggleSelectAll = () => {
    const pageIds = paginatedTransactions.map((item) => item.id)
    setSelectedRows((prev) => allOnPageSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])])
  }
  const toggleSelectRow = (id) => {
    setSelectedRows((prev) => prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id])
  }

  const renderStatusBadge = (status) => {
    const styles = {
      Matched: 'bg-emerald-100 text-emerald-700',
      Unmatched: 'bg-amber-100 text-amber-700',
      'In System Only': 'bg-orange-100 text-orange-700',
      'In Statement Only': 'bg-rose-100 text-rose-600',
    }
    return <span className={`px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap ${styles[status] || 'bg-slate-100 text-slate-600'}`}>{t(status)}</span>
  }

  const runAction = async (action, successText) => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await action()
      setNotice({ tone: 'success', text: typeof successText === 'function' ? successText(result) : successText })
      setSelectedRows([])
      await loadTransactions()
      return result
    } catch (err) {
      setNotice({ tone: 'error', text: apiError(err, t('The action failed. Please try again.')) })
      return null
    } finally {
      setBusy(false)
    }
  }

  const selectedItems = transactions.filter((item) => selectedRows.includes(item.id))
  const selectedStatementLines = selectedItems.filter((item) => item.kind === 'statement').length

  const handleMatchSelected = () => runAction(
    () => matchReconciliationItems(selectedRows),
    (r) => r?.difference !== undefined
      ? `${t('Statement line matched.')}${Math.abs(r.difference) >= 0.5 ? ` ${t('Difference:')} ${formatRWF(r.difference)} RWF` : ''}`
      : `${r?.matched || 0} ${t('item(s) confirmed as reconciled.')}${r?.skipped ? ` ${r.skipped} ${t('were already matched.')}` : ''}`
  )

  const handleAutoMatch = () => runAction(
    () => autoMatchReconciliation(),
    (r) => r?.statementLinesChecked
      ? `${t('Auto match paired')} ${r.matched} ${t('of')} ${r.statementLinesChecked} ${t('open statement line(s).')}`
      : t('There are no open statement lines to match. Upload a statement first.')
  )

  const handleUnmatch = async (item) => {
    const result = await runAction(() => unmatchReconciliationItem(item.id), t('Match removed. The item is open again.'))
    if (result) setDetailItem(null)
  }

  const parseCsvFile = (file) => {
    setUploadFile(file)
    setUploadError('')
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => String(h || '').trim().toLowerCase(),
      complete: (results) => {
        const parsed = results.data.map((row) => {
          const credit = row.credit ?? row.deposit ?? row['money in']
          const debit = row.debit ?? row.withdrawal ?? row['money out']
          let amount = row.amount
          if ((amount === undefined || amount === '') && (credit || debit)) {
            amount = credit ? String(credit) : `-${String(debit).replace(/^-/, '')}`
          }
          return {
            date: row.date || row['transaction date'] || row['value date'] || '',
            description: row.description || row.details || row.narration || '',
            reference: row.reference || row.ref || row['transaction id'] || '',
            type: row.type || '',
            amount: amount ?? '',
          }
        }).filter((row) => row.date || row.amount)
        if (!parsed.length) setUploadError(t('No rows found. The file needs Date and Amount columns.'))
        setUploadPreview(parsed)
      },
      error: () => {
        setUploadPreview([])
        setUploadError(t('This file could not be read as CSV.'))
      },
    })
  }

  const closeUpload = () => {
    setShowUploadModal(false)
    setUploadFile(null)
    setUploadPreview([])
    setUploadError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUploadStatement = async () => {
    if (!uploadFile || uploadPreview.length === 0) {
      setUploadError(t('Please select a valid CSV file first.'))
      return
    }
    setUploading(true)
    setUploadError('')
    try {
      const result = await uploadBankStatement({ filename: uploadFile.name, bankAccount: uploadAccount, transactions: uploadPreview })
      const skipped = result?.skippedRows?.length ? ` ${t('Skipped rows:')} ${result.skippedRows.join(', ')}.` : ''
      setNotice({ tone: 'success', text: `${t('Uploaded')} ${result?.count ?? uploadPreview.length} ${t('statement line(s) from')} ${uploadFile.name}. ${t('Click Auto Match to pair them with system records.')}${skipped}` })
      closeUpload()
      if (activeTab === 'history') setActiveTab('overview')
      else await loadTransactions()
    } catch (err) {
      setUploadError(apiError(err, t('Failed to upload bank statement.')))
    } finally {
      setUploading(false)
    }
  }

  const downloadTemplate = () => {
    const csv = 'Date,Description,Reference,Type,Amount\n2026-11-01,MoMo deposit,TX123,Deposit,15000\n2026-11-02,Bank charges,,Expense,-500\n'
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'statement-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const closeAdjustment = () => {
    setShowAdjustmentModal(false)
    setAdjustmentForm(emptyAdjustment)
    setAdjustmentError('')
  }

  const handleCreateAdjustment = async () => {
    if (!adjustmentForm.description.trim() || !Number(adjustmentForm.amount)) {
      setAdjustmentError(t('Enter a description and a non-zero amount.'))
      return
    }
    setSubmittingAdjustment(true)
    setAdjustmentError('')
    try {
      await createAdjustment({
        description: adjustmentForm.description.trim(),
        amount: Math.abs(Number(adjustmentForm.amount)),
        type: adjustmentForm.type,
        bankAccount: adjustmentForm.bankAccount,
        date: adjustmentForm.date || new Date().toISOString().split('T')[0],
      })
      setNotice({ tone: 'success', text: t('Adjustment created. It now appears as a system transaction you can match.') })
      closeAdjustment()
      if (activeTab !== 'history') await loadTransactions()
    } catch (err) {
      setAdjustmentError(apiError(err, t('Failed to create adjustment.')))
    } finally {
      setSubmittingAdjustment(false)
    }
  }

  const resetFilters = () => {
    setBankAccountFilter('')
    setStatusFilter('')
    setTypeFilter('')
    setSearchInput('')
    setSearchTerm('')
  }

  const inputClass = 'w-full border border-slate-200 rounded-lg p-2 text-sm bg-white text-slate-700 focus:outline-none focus:border-indigo-500'
  const sideButton = 'w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-indigo-200 text-indigo-600 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition disabled:opacity-50'

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
      <main className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto w-full">

        <div className="border-b border-slate-200 flex gap-6 text-sm font-medium overflow-x-auto" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => changeTab(tab.key)}
              className={`pb-3 whitespace-nowrap transition-all ${activeTab === tab.key ? 'text-indigo-600 font-semibold border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>

        {notice && (
          <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${notice.tone === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label={t('Close')} className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
          </div>
        )}

        {activeTab === 'history' ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">{t('Reconciliation History')}</h2>
              <button type="button" onClick={loadHistory} className="text-xs text-indigo-600 font-semibold hover:underline">{t('Refresh')}</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="p-2 pl-5">{t('Date')}</th>
                    <th className="p-2">{t('Action')}</th>
                    <th className="p-2 text-right">{t('Items')}</th>
                    <th className="p-2 text-right">{t('System Amount')}</th>
                    <th className="p-2 text-right">{t('Statement Amount')}</th>
                    <th className="p-2 text-right">{t('Difference')}</th>
                    <th className="p-2">{t('By')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {historyLoading ? (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">{t('Loading…')}</td></tr>
                  ) : history.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">{t('No reconciliation activity yet.')}</td></tr>
                  ) : history.map((h) => (
                    <tr key={h.id}>
                      <td className="p-2 pl-5 whitespace-nowrap text-slate-500">{h.date}</td>
                      <td className="p-2 font-semibold text-slate-900">{t(h.action)}</td>
                      <td className="p-2 text-right">{h.matchedCount}</td>
                      <td className="p-2 text-right">{formatRWF(h.recorded)}</td>
                      <td className="p-2 text-right">{formatRWF(h.banked)}</td>
                      <td className={`p-2 text-right font-semibold ${Math.abs(h.difference) >= 0.5 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatRWF(h.difference)}</td>
                      <td className="p-2">{h.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { label: 'Statement Balance', value: formatRWF(statementBalance), note: 'From uploaded statements and confirmed items', tone: 'text-indigo-950' },
                { label: 'System Balance', value: formatRWF(systemBalance), note: 'As per system records', tone: 'text-emerald-600' },
                { label: 'Difference', value: formatRWF(difference), note: 'Statement minus system', tone: Math.abs(difference) >= 0.5 ? 'text-rose-600' : 'text-emerald-600' },
                { label: 'Reconciled Items', value: counts.Matched, note: `${t('Out of')} ${totalItems} ${t('items shown')}`, tone: 'text-indigo-950' },
              ].map((card) => (
                <div key={card.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">{t(card.label)}</div>
                  <div className={`text-2xl font-bold mt-1 ${card.tone}`}>{card.value}</div>
                  <div className="text-xs text-slate-400 mt-1">{t(card.note)}</div>
                </div>
              ))}
            </div>

            <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 text-indigo-900 text-sm">
              {t('Upload a bank or mobile money statement, then click Auto Match. To pair items by hand, select one statement line and one system transaction and click Match Selected. Cash you have counted can be confirmed by selecting the items and clicking Match Selected.')}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between min-w-0">
                <div>
                  <div className="p-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
                    <h2 className="text-base font-bold text-slate-800">
                      {activeTab === 'unreconciled' ? t('Unreconciled Items') : t('Transactions to Reconcile')} <span className="text-slate-400 font-normal">({totalItems})</span>
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="search"
                        placeholder={t('Search transactions...')}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 w-full sm:w-56"
                      />
                      <button
                        type="button"
                        className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                        disabled={selectedRows.length === 0 || busy}
                        onClick={handleMatchSelected}
                        title={selectedStatementLines ? t('Select one statement line and one system transaction') : t('Confirm the selected system transactions')}
                      >
                        {t('Match Selected')}{selectedRows.length ? ` (${selectedRows.length})` : ''}
                      </button>
                      <button type="button" className="px-4 py-1.5 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition" onClick={() => setShowAdjustmentModal(true)}>
                        {t('Adjust')}
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                        <tr>
                          <th className="p-2 w-10 text-center">
                            <input type="checkbox" aria-label={t('Select all on this page')} checked={allOnPageSelected} onChange={toggleSelectAll} />
                          </th>
                          <th className="p-2">{t('Date')}</th>
                          <th className="p-2">{t('Description')}</th>
                          <th className="p-2">{t('Account')}</th>
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
                          <tr><td colSpan={10} className="p-8 text-center text-slate-400">{activeTab === 'unreconciled' ? t('Nothing left to reconcile.') : t('No transactions found.')}</td></tr>
                        ) : paginatedTransactions.map((item) => {
                          const isSelected = selectedRows.includes(item.id)
                          return (
                            <tr key={item.id} className={`hover:bg-slate-50/80 transition ${isSelected ? 'bg-indigo-50/40' : ''}`}>
                              <td className="p-2 text-center">
                                <input type="checkbox" aria-label={t('Select')} checked={isSelected} onChange={() => toggleSelectRow(item.id)} />
                              </td>
                              <td className="p-2 whitespace-nowrap font-medium text-slate-600">{item.date}</td>
                              <td className="p-2">
                                <div className="font-semibold text-slate-900">{item.description}</div>
                                <div className="text-[10px] text-slate-400">{t(KIND_LABELS[item.kind] || item.kind)}{item.ref ? ` · ${item.ref}` : ''}</div>
                              </td>
                              <td className="p-2 whitespace-nowrap">{t(item.bankAccount)}</td>
                              <td className="p-2 whitespace-nowrap">{t(item.type)}</td>
                              <td className="p-2 text-right font-medium">{formatRWF(item.statementAmount)}</td>
                              <td className="p-2 text-right font-medium">{formatRWF(item.systemAmount)}</td>
                              <td className={`p-2 text-right font-medium ${Math.abs(item.difference) >= 0.5 && item.status !== 'Matched' ? 'text-rose-600' : ''}`}>{formatRWF(item.status === 'Matched' ? 0 : item.difference)}</td>
                              <td className="p-2 text-center">{renderStatusBadge(item.status)}</td>
                              <td className="p-2 text-center">
                                <div className="flex items-center justify-center gap-2 text-slate-500">
                                  <button type="button" onClick={() => setDetailItem(item)} className="hover:text-indigo-600 transition">{t('View')}</button>
                                  {(item.status === 'Matched' || item.status === 'Unmatched') && (
                                    <button type="button" disabled={busy} onClick={() => handleUnmatch(item)} className="hover:text-rose-600 transition disabled:opacity-50">{t('Unmatch')}</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-4 border-t border-slate-100 flex flex-wrap gap-2 items-center justify-between text-xs text-slate-500">
                  <div>
                    {totalItems > 0
                      ? <>{t('Showing')} {startIndex + 1} {t('to')} {Math.min(startIndex + ITEMS_PER_PAGE, totalItems)} {t('of')} {totalItems} {t('entries')}</>
                      : t('No entries')}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button type="button" className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>{t('Prev')}</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => totalPages <= 7 || page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                      .map((page, i, list) => (
                        <React.Fragment key={page}>
                          {i > 0 && page - list[i - 1] > 1 && <span className="px-1">…</span>}
                          <button type="button" className={`w-7 h-7 rounded-lg ${currentPage === page ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100'}`} onClick={() => setCurrentPage(page)}>{page}</button>
                        </React.Fragment>
                      ))}
                    <button type="button" className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>{t('Next')}</button>
                  </div>
                </div>
              </div>

              <div className="space-y-6 min-w-0">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <h3 className="font-bold text-slate-800 text-sm mb-2">{t('Reconciliation Controls')}</h3>
                  <button type="button" onClick={() => setShowUploadModal(true)} className={sideButton}>{t('Upload Bank Statement')}</button>
                  <button type="button" onClick={handleAutoMatch} disabled={busy} className={sideButton}>{busy ? t('Working…') : t('Auto Match')}</button>
                  <button type="button" onClick={() => setShowAdjustmentModal(true)} className={sideButton}>{t('Create Adjustment')}</button>
                  <button type="button" onClick={() => changeTab('history')} className={sideButton}>{t('Reconciliation History')}</button>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-800 text-sm">{t('Filters')}</h3>
                  <div className="space-y-3 text-xs">
                    <label className="block">
                      <span className="block text-slate-500 font-semibold mb-1">{t('Account')}</span>
                      <select value={bankAccountFilter} onChange={(e) => setBankAccountFilter(e.target.value)} className={inputClass}>
                        <option value="">{t('All Accounts')}</option>
                        {ACCOUNTS.map((a) => <option key={a} value={a}>{t(a)}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-slate-500 font-semibold mb-1">{t('Status')}</span>
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
                        <option value="">{activeTab === 'unreconciled' ? t('All unreconciled') : t('All Statuses')}</option>
                        {STATUSES.filter((s) => activeTab !== 'unreconciled' || s !== 'Matched').map((s) => <option key={s} value={s}>{t(s)}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-slate-500 font-semibold mb-1">{t('Type')}</span>
                      <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputClass}>
                        <option value="">{t('All Types')}</option>
                        {TYPES.map((type) => <option key={type} value={type}>{t(type)}</option>)}
                      </select>
                    </label>
                  </div>
                  <button type="button" onClick={resetFilters} className="w-full py-2 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 transition">
                    {t('Reset filters')}
                  </button>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <h3 className="font-bold text-slate-800 text-sm">{t('Summary by Status')}</h3>
                  <div className="space-y-2.5 text-xs">
                    {[
                      ['Matched', 'bg-emerald-500'],
                      ['Unmatched', 'bg-amber-500'],
                      ['In System Only', 'bg-orange-500'],
                      ['In Statement Only', 'bg-rose-500'],
                    ].map(([status, dot]) => (
                      <button key={status} type="button" onClick={() => setStatusFilter(statusFilter === status ? '' : status)} className={`w-full flex items-center justify-between rounded-md px-1 py-0.5 hover:bg-slate-50 ${statusFilter === status ? 'bg-indigo-50' : ''}`}>
                        <span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${dot}`} />{t(status)}</span>
                        <span className="flex gap-3">
                          <span className="font-semibold text-slate-800">{counts[status] || 0}</span>
                          <span className="text-slate-400 w-12 text-right">{totalItems ? `${(((counts[status] || 0) / totalItems) * 100).toFixed(1)}%` : '0%'}</span>
                        </span>
                      </button>
                    ))}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between font-bold text-slate-800 px-1">
                      <span>{t('Total')}</span>
                      <span className="flex gap-3"><span>{totalItems}</span><span className="w-12 text-right">100%</span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {detailItem && (
          <Modal
            title={t('Transaction details')}
            onClose={() => setDetailItem(null)}
            footer={(
              <>
                {(detailItem.status === 'Matched' || detailItem.status === 'Unmatched') && (
                  <button type="button" disabled={busy} onClick={() => handleUnmatch(detailItem)} className="flex-1 py-2 border border-rose-200 text-rose-600 rounded-lg text-sm font-semibold hover:bg-rose-50 disabled:opacity-50">{t('Unmatch')}</button>
                )}
                <button type="button" onClick={() => setDetailItem(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50">{t('Close')}</button>
              </>
            )}
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ['Description', detailItem.description],
                ['Source', t(KIND_LABELS[detailItem.kind] || detailItem.kind)],
                ['Reference', detailItem.ref || '—'],
                ['Date', detailItem.date],
                ['Account', t(detailItem.bankAccount)],
                ['Type', t(detailItem.type)],
                ['Statement Amount', formatRWF(detailItem.statementAmount)],
                ['System Amount', formatRWF(detailItem.systemAmount)],
                ['Difference', formatRWF(detailItem.status === 'Matched' ? 0 : detailItem.difference)],
                ['Status', t(detailItem.status)],
                ...(detailItem.statementLine ? [['Matched statement line', `${detailItem.statementLine.description}${detailItem.statementLine.ref ? ` (${detailItem.statementLine.ref})` : ''}`]] : []),
                ...(detailItem.manual ? [['Matched', t('Confirmed by hand (no statement line)')]] : []),
                ...(detailItem.matchedBy ? [['Matched by', `${detailItem.matchedBy}${detailItem.matchedAt ? ` · ${new Date(detailItem.matchedAt).toLocaleString()}` : ''}`]] : []),
                ...(detailItem.filename ? [['Statement file', detailItem.filename]] : []),
              ].map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt className="text-slate-500">{t(label)}</dt>
                  <dd className="font-medium text-slate-900 break-words">{value}</dd>
                </React.Fragment>
              ))}
            </dl>
            {detailItem.status === 'Unmatched' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                {t('The statement and system amounts differ. Create an adjustment for the difference (for example a bank fee), or unmatch and pair the correct line.')}
              </p>
            )}
          </Modal>
        )}

        {showUploadModal && (
          <Modal
            wide
            title={t('Upload Bank Statement')}
            onClose={closeUpload}
            footer={(
              <>
                <button type="button" onClick={handleUploadStatement} disabled={uploading || !uploadPreview.length} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-50">
                  {uploading ? t('Uploading...') : t('Upload Statement')}
                </button>
                <button type="button" onClick={closeUpload} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition">{t('Cancel')}</button>
              </>
            )}
          >
            <label className="block text-xs font-semibold text-slate-600">
              {t('Account this statement belongs to')}
              <select value={uploadAccount} onChange={(e) => setUploadAccount(e.target.value)} className={`${inputClass} mt-1`}>
                {ACCOUNTS.map((a) => <option key={a} value={a}>{t(a)}</option>)}
              </select>
            </label>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center space-y-3">
              <p className="text-sm text-slate-600">{t('CSV with columns: Date, Description, Reference, Type, Amount. Money out can be negative, or use Debit/Credit columns.')}</p>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && parseCsvFile(e.target.files[0])} className="hidden" />
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition">{t('Choose CSV File')}</button>
                <button type="button" onClick={downloadTemplate} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50">{t('Download template')}</button>
              </div>
              {uploadFile && <p className="text-xs text-slate-500">{t('Selected:')} {uploadFile.name}</p>}
            </div>
            {uploadError && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{uploadError}</p>}
            {uploadPreview.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3 max-h-56 overflow-auto">
                <p className="text-xs font-semibold text-slate-600 mb-2">{t('Preview')} ({uploadPreview.length} {t('rows')})</p>
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="p-1">{t('Date')}</th>
                      <th className="p-1">{t('Description')}</th>
                      <th className="p-1">{t('Reference')}</th>
                      <th className="p-1 text-right">{t('Amount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {uploadPreview.slice(0, 8).map((row, idx) => (
                      <tr key={idx} className="text-slate-700">
                        <td className="p-1 whitespace-nowrap">{row.date}</td>
                        <td className="p-1">{row.description}</td>
                        <td className="p-1">{row.reference}</td>
                        <td className="p-1 text-right">{row.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Modal>
        )}

        {showAdjustmentModal && (
          <Modal
            title={t('Create Adjustment')}
            onClose={closeAdjustment}
            footer={(
              <>
                <button type="button" onClick={handleCreateAdjustment} disabled={submittingAdjustment} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-50">
                  {submittingAdjustment ? t('Saving...') : t('Create Adjustment')}
                </button>
                <button type="button" onClick={closeAdjustment} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition">{t('Cancel')}</button>
              </>
            )}
          >
            <p className="text-xs text-slate-500">{t('Use an adjustment for money that is not in the system yet, such as bank charges or interest. Deposits add money; the other types take money out. Expenses also count in the expense totals.')}</p>
            <label className="block text-xs font-semibold text-slate-600">
              {t('Description')}
              <input type="text" value={adjustmentForm.description} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, description: e.target.value })} placeholder={t('e.g. Bank fee adjustment')} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              {t('Amount (RWF)')}
              <input type="number" min="0" step="any" value={adjustmentForm.amount} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, amount: e.target.value })} placeholder="0" className={`${inputClass} mt-1`} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-600">
                {t('Type')}
                <select value={adjustmentForm.type} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, type: e.target.value })} className={`${inputClass} mt-1`}>
                  {TYPES.map((type) => <option key={type} value={type}>{t(type)}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                {t('Account')}
                <select value={adjustmentForm.bankAccount} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, bankAccount: e.target.value })} className={`${inputClass} mt-1`}>
                  {ACCOUNTS.map((a) => <option key={a} value={a}>{t(a)}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold text-slate-600">
              {t('Date')}
              <input type="date" value={adjustmentForm.date} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, date: e.target.value })} className={`${inputClass} mt-1`} />
            </label>
            {adjustmentError && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{adjustmentError}</p>}
          </Modal>
        )}
      </main>
    </div>
  )
}
