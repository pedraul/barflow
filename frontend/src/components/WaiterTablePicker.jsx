import React, { useEffect, useState } from 'react'
import { usePreferences } from '../context/PreferencesContext'
import { fetchBranchTables } from '../api/endpoints'
import { hasRealTable } from '../utils/orderDisplay'

// Table selection: '' = not chosen yet, WALK_IN = no table, otherwise the table number.
export const WALK_IN = 'walk-in'
const STORAGE_KEY = 'waiter_table'

export function normalizeStoredTable(value) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (v === WALK_IN) return WALK_IN
  // Old builds stored "Walk-in customer" automatically; make the waiter choose again.
  if (/^walk[ -]?in/i.test(v)) return ''
  return v
}

/** The table chosen for the order being built (kept for the whole session). */
export function readStoredTable() {
  try {
    return normalizeStoredTable(sessionStorage.getItem(STORAGE_KEY))
  } catch {
    return ''
  }
}

export function storeTable(value) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* storage unavailable */ }
}

/** What the API stores as the order's table. */
export const tableOrderValue = (table) => (table === WALK_IN ? 'Walk-in customer' : String(table).trim())

/** "Table 5", "Walk-in customer" or "Not selected". */
export function tableLabel(table, t = (s) => s) {
  if (!table) return t('Not selected')
  if (table === WALK_IN || !hasRealTable(table)) return t('Walk-in customer')
  return `${t('Table')} ${table}`
}

/** Dining tables of the waiter's branch (the same ones that have printed QR codes). */
export function useBranchTables() {
  const [tables, setTables] = useState([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetchBranchTables()
      .then((list) => { if (!cancelled) setTables(Array.isArray(list) ? list : []) })
      .catch(() => { if (!cancelled) setTables([]) })
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])
  return { tables, loaded }
}

/**
 * Lets the waiter choose the table an order is for (or Walk-in).
 * `collapsible` folds it down to "Order for: Table 5 [Change table]" once chosen.
 * `missing` highlights it when the waiter tried to place an order without a table.
 */
export default function WaiterTablePicker({ table, onChange, tables, loaded, missing = false, collapsible = false }) {
  const { t } = usePreferences()
  const [open, setOpen] = useState(!table)

  useEffect(() => {
    if (!table) setOpen(true)
  }, [table])

  const expanded = !collapsible || open || !table
  const pick = (value) => {
    onChange(value)
    if (collapsible && value) setOpen(false)
  }

  return (
    <div className={`waiter-table-picker${!table ? ' needs-choice' : ''}${expanded ? '' : ' is-collapsed'}`}>
      <div className="waiter-table-picker-head">
        <span className="waiter-table-picker-title">{t("Order for table")} <span className="waiter-table-required">*</span></span>
        <span className="waiter-table-picker-actions">
          <span className={`waiter-table-picker-current${!table ? ' is-empty' : ''}`}>{tableLabel(table, t)}</span>
          {collapsible && table && (
            <button type="button" className="waiter-table-change" aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
              {expanded ? t("Done") : t("Change table")}
            </button>
          )}
        </span>
      </div>

      {expanded && (!loaded ? (
        <p className="waiter-table-picker-hint">{t("Loading tables…")}</p>
      ) : tables.length > 0 ? (
        <>
          {!table && (
            <p className={`waiter-table-picker-hint${missing ? ' is-error' : ''}`} role={missing ? 'alert' : undefined}>
              {missing ? t("Select the table this order is for (or Walk-in) before placing it.") : t("Tap the table this order is for.")}
            </p>
          )}
          <div className="waiter-table-grid" role="radiogroup" aria-label={t("Choose a table")}>
            {tables.map((tb) => {
              const value = String(tb.tableNumber)
              const selected = table === value
              return (
                <button
                  key={tb.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => pick(value)}
                  className={`waiter-table-chip${selected ? ' is-selected' : ''}`}
                >
                  {value}
                </button>
              )
            })}
            <button
              type="button"
              role="radio"
              aria-checked={table === WALK_IN}
              onClick={() => pick(WALK_IN)}
              className={`waiter-table-chip is-walkin${table === WALK_IN ? ' is-selected' : ''}`}
            >
              {t("Walk-in")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={`waiter-table-picker-hint${missing && !table ? ' is-error' : ''}`} role={missing && !table ? 'alert' : undefined}>
            {t("No tables are set up for this branch yet. Type the table number, or choose Walk-in.")}
          </p>
          <div className="waiter-table-manual-row">
            <input
              type="text"
              inputMode="numeric"
              value={table === WALK_IN ? '' : table}
              onChange={(e) => onChange(e.target.value.trim())}
              onKeyDown={(e) => { if (e.key === 'Enter' && table && collapsible) setOpen(false) }}
              placeholder={t("e.g. 5")}
              aria-label={t("Table number")}
              className="waiter-cart-table-input waiter-table-manual"
            />
            <button
              type="button"
              aria-pressed={table === WALK_IN}
              onClick={() => pick(WALK_IN)}
              className={`waiter-table-chip is-walkin${table === WALK_IN ? ' is-selected' : ''}`}
            >
              {t("Walk-in")}
            </button>
          </div>
        </>
      ))}
    </div>
  )
}
