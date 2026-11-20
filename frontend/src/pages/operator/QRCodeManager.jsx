import { usePreferences } from '../../context/PreferencesContext'
import React, { useCallback, useEffect, useState } from 'react'
import QRCode from '../../components/QRCode'
import { useAuth } from '../../context/AuthContext'
import { useOwner } from '../../context/OwnerContext'
import { buildTableMenuUrl } from '../../config/tableMenuUrl'
import { createManagedTable, fetchManagedTables } from '../../api/endpoints'
import useMyGrants from '../../hooks/useMyGrants'

export default function QRCodeManager() {
  const { t } = usePreferences()
  const { user } = useAuth()
  const { activeBranchId, branches, setActiveBranchId, fetchBranches, createBranch } = useOwner()
  const [tableNumber, setTableNumber] = useState('')
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [printTableId, setPrintTableId] = useState(null)
  const [showBranchForm, setShowBranchForm] = useState(false)
  const [newBranch, setNewBranch] = useState({ name: '', address: '' })
  const [savingBranch, setSavingBranch] = useState(false)
  const isOwner = String(user?.role || '').toLowerCase() === 'owner'
  const branchId = isOwner ? activeBranchId : user?.branchId
  const selectedBranch = branches.find((branch) => branch.id === branchId)

  useEffect(() => {
    if (isOwner && !branches.length) {
      fetchBranches().catch((err) => {
        setError(err.message || t("Could not load branches."))
      })
    }
  }, [isOwner, branches.length, fetchBranches])

  const loadTables = useCallback(async () => {
    if (!branchId || branchId === 'all') {
      setTables([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await fetchManagedTables(branchId)
      setTables(result)
    } catch (err) {
      setError(err.response?.data?.error || err.message || t("Could not load tables."))
    } finally {
      setLoading(false)
    }
  }, [branchId])

  useEffect(() => {
    loadTables()
  }, [loadTables])

  useEffect(() => {
    const resetPrintSelection = () => setPrintTableId(null)
    window.addEventListener('afterprint', resetPrintSelection)
    return () => window.removeEventListener('afterprint', resetPrintSelection)
  }, [])

  const addTable = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!Number.isSafeInteger(Number(tableNumber)) || Number(tableNumber) <= 0) {
      setError(t("Enter a whole table number greater than zero."))
      return
    }
    setSaving(true)
    try {
      const createdTable = await createManagedTable(Number(tableNumber), branchId)
      setTables((current) => [
        ...current.filter((table) => Number(table.tableNumber) !== Number(createdTable.tableNumber)),
        createdTable,
      ].sort((left, right) => Number(left.tableNumber) - Number(right.tableNumber)))
      setMessage(t("Table") + " " + createdTable.tableNumber + " " + t("was added to this branch's QR codes."))
      setTableNumber('')
      await loadTables()
    } catch (err) {
      setError(err.response?.data?.error || err.message || t("Could not add table."))
    } finally {
      setSaving(false)
    }
  }

  const addBranch = async (event) => {
    event.preventDefault()
    const name = newBranch.name.trim()
    if (!name) return
    setError('')
    setMessage('')
    setSavingBranch(true)
    try {
      const branch = await createBranch({ name, address: newBranch.address.trim() })
      await fetchBranches()
      setActiveBranchId(branch.id)
      setNewBranch({ name: '', address: '' })
      setShowBranchForm(false)
      setMessage(t('Branch created successfully.'))
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('Could not create branch.'))
    } finally {
      setSavingBranch(false)
    }
  }

  const canManageTables = branchId && branchId !== 'all'
  // Owners can always add tables; managers only once the owner grants "Add tables".
  const { has: hasGrant, loaded: grantsLoaded } = useMyGrants()
  const mayAddTables = isOwner || hasGrant('manage_tables')
  const canAddTables = canManageTables && mayAddTables

  return (
    <div className="page qr-manager">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">{t("Table QR codes")}</p>
          <h1>{t("Tables & QR Codes")}</h1>
          <p>{t("Add each dining table, then print its QR code with the table number. Customers can scan it to open the menu and place an order for that table.")}</p>
        </div>
      </div>

      <section className="qr-controls no-print" aria-label={t("Table management")}>
        {isOwner ? (
          <>
            <label className="qr-count-label">{t("Branch")}<select
                value={activeBranchId || 'all'}
                onChange={(event) => setActiveBranchId(event.target.value)}
                aria-label={t("Select branch for table management")}
              >
                <option value="all">{t("Select a branch")}</option>
                {branches.filter((branch) => branch.isActive !== false).map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
            <button type="button" className="primary-btn" onClick={() => setShowBranchForm((open) => !open)} disabled={savingBranch}>
              {showBranchForm ? t("Cancel") : t("Create branch")}
            </button>
          </>
        ) : (
          <p className="qr-count-label">{t("Branch:")}{' '}{user?.branch || selectedBranch?.name || t("Your assigned branch")}</p>
        )}
        {mayAddTables && (
          <form onSubmit={addTable} className="flex flex-wrap items-end gap-3">
            <label className="qr-count-label">{t("Table number")}<input
                type="number"
                min="1"
                step="1"
                value={tableNumber}
                onChange={(event) => setTableNumber(event.target.value)}
                aria-label={t("Table number")}
                required
                disabled={!canAddTables || saving}
              />
            </label>
            <button type="submit" className="primary-btn" disabled={!canAddTables || saving}>
              {saving ? t("Adding…") : t("Add table")}
            </button>
          </form>
        )}
        <button
          type="button"
          className="primary-btn"
          onClick={() => {
            setPrintTableId(null)
            window.setTimeout(() => window.print(), 0)
          }}
          disabled={!tables.length}
        >{t("Print all QR codes")}</button>
        {tables.length > 0 && <span className="qr-operator">{tables.length}{' '}{t("table")}{tables.length === 1 ? '' : t("s")}</span>}
      </section>

      {isOwner && showBranchForm && (
        <form onSubmit={addBranch} className="qr-controls no-print" aria-label={t("Create branch")}>
          <label className="qr-count-label">{t("Branch name")}<input
              type="text"
              value={newBranch.name}
              onChange={(event) => setNewBranch((current) => ({ ...current, name: event.target.value }))}
              required
              maxLength={120}
              disabled={savingBranch}
            />
          </label>
          <label className="qr-count-label">{t("Address")}<input
              type="text"
              value={newBranch.address}
              onChange={(event) => setNewBranch((current) => ({ ...current, address: event.target.value }))}
              maxLength={250}
              disabled={savingBranch}
            />
          </label>
          <button type="submit" className="primary-btn" disabled={savingBranch || !newBranch.name.trim()}>
            {savingBranch ? t("Creating…") : t("Create branch")}
          </button>
        </form>
      )}

      {!canManageTables && (
        <p className="no-print" role="status">{t("Select a branch to add tables and print its QR codes.")}</p>
      )}
      {!isOwner && grantsLoaded && !mayAddTables && (
        <p className="qr-access-note no-print" role="status">
          {t("You can view and print the QR codes of existing tables. To add new tables, ask the owner to grant you the “Add tables” access.")}
        </p>
      )}
      {error && <p className="error-box no-print" role="alert">{t(error)}</p>}
      {message && <p className="success-box no-print" role="status">{message}</p>}

      {loading ? (
        <p className="no-print">{t("Loading tables…")}</p>
      ) : tables.length ? (
        <div className={`qr-grid${printTableId ? ' print-one' : ''}`}>
          {tables.map((table) => {
            const url = buildTableMenuUrl({
              tableNumber: table.tableNumber,
              businessId: user.businessId,
              branchId: table.branchId,
              businessSlug: user.businessSlug,
            })
            return (
              <article className={`qr-card${printTableId === table.id ? ' print-selected' : ''}`} key={table.id}>
                <QRCode value={url} size={190} level="M" />
                <div className="qr-meta">
                  <strong className="qr-table-label">{t("CLIENT TABLE")}{' '}{table.tableNumber}</strong>
                  <span>{table.branchName}</span>
                </div>
                <button
                  type="button"
                  className="qr-card-print no-print"
                  onClick={() => {
                    setPrintTableId(table.id)
                    window.setTimeout(() => window.print(), 0)
                  }}
                >{t("Print Table")}{table.tableNumber}
                </button>
              </article>
            )
          })}
        </div>
      ) : canManageTables && !loading ? (
        <p className="no-print">{mayAddTables ? t("No tables have been added for this branch. Add a table number to generate its printable QR code.") : t("No tables have been added for this branch yet.")}</p>
      ) : null}
    </div>
  )
}
