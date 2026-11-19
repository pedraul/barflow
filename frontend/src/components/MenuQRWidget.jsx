import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import QRCode from '../QRCode'
import { Printer } from 'lucide-react'
import { buildTableMenuUrl } from '../config/tableMenuUrl'
import { fetchManagedTables } from '../api/endpoints'
import { usePreferences } from '../context/PreferencesContext'

export default function MenuQRWidget({
  embedded = false,
  businessId,
  branchId,
  branchName,
  businessSlug,
  addTablesPath,
}) {
  const { t } = usePreferences()
  const [printError, setPrintError] = useState('')
  const [printSelection, setPrintSelection] = useState(null)
  const [registeredTables, setRegisteredTables] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    if (!branchId || branchId === 'all') {
      setRegisteredTables([])
      setLoading(false)
      return undefined
    }
    setRegisteredTables([])
    setLoading(true)
    setLoadError('')
    fetchManagedTables(branchId)
      .then((result) => { if (active) setRegisteredTables(result || []) })
      .catch((error) => { if (active) setLoadError(error.response?.data?.error || error.message || t('Could not load table QR codes.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [branchId, t])

  const registeredByNumber = new Map(registeredTables.map((table) => [Number(table.tableNumber), table]))
  const tables = Array.from({ length: 100 }, (_, index) => {
    const tableNumber = index + 1
    return registeredByNumber.get(tableNumber) || { tableNumber, branchId, branchName }
  }).concat(registeredTables.filter((table) => Number(table.tableNumber) > 100))
    .sort((left, right) => Number(left.tableNumber) - Number(right.tableNumber))

  const getTableUrl = (table) => {
    return buildTableMenuUrl({
      tableNumber: table.tableNumber,
      businessId,
      branchId: table.branchId,
      businessSlug,
    })
  }

  useEffect(() => {
    if (!printSelection) return undefined

    let frameId
    const stopPrinting = () => {
      document.body.classList.remove('account-qr-printing')
      setPrintSelection(null)
    }

    document.body.classList.add('account-qr-printing')
    window.addEventListener('afterprint', stopPrinting)
    frameId = window.requestAnimationFrame(() => {
      try {
        window.print()
      } catch (error) {
        stopPrinting()
        setPrintError(`${t('Could not open the print dialog:')} ${error.message}`)
      }
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('afterprint', stopPrinting)
      document.body.classList.remove('account-qr-printing')
    }
  }, [printSelection])

  const printTables = (selectedTables) => {
    setPrintError('')
    setPrintSelection(selectedTables)
  }

  return (
    <div className={`menu-qr-widget${embedded ? ' menu-qr-widget--embedded' : ''}`}>
      {loading && <p role="status" className="account-table-qr-note">{t('Loading registered table QR codes…')}</p>}
      {loadError && <p role="alert" className="error-box">{loadError}</p>}
      <div className="account-table-qr-grid">
        {tables.map((table) => {
          return (
            <article className="account-table-qr-card" key={table.tableNumber}>
              <strong>{t('CLIENT TABLE')} {table.tableNumber}</strong>
              <QRCode
                value={getTableUrl(table)}
                size={180}
                level="M"
                ariaLabel={`${t('QR code for CLIENT TABLE')} ${table.tableNumber}`}
              />
              {table.branchName && <span>{table.branchName}</span>}
              <button type="button" onClick={() => printTables([table])}>
                <Printer size={14} /> {t('Print CLIENT TABLE')} {table.tableNumber}
              </button>
            </article>
          )
        })}
      </div>
      <button type="button" className="account-table-qr-print-all" onClick={() => printTables(tables)}>
        <Printer size={16} /> {t('Print QR codes for all tables')}
      </button>
      {printError && <p role="alert" className="error-box">{printError}</p>}
      {printSelection && createPortal(
        <div className="account-table-qr-print-area">
          <div className="account-table-qr-print-grid">
            {printSelection.map((table) => (
              <article className="account-table-qr-print-card" key={table.tableNumber}>
                <strong>{t('CLIENT TABLE')} {table.tableNumber}</strong>
                <QRCode value={getTableUrl(table)} size={190} level="M" />
                {table.branchName && <span>{table.branchName}</span>}
              </article>
            ))}
          </div>
        </div>,
        document.body
      )}
      {addTablesPath && (
        <p className="account-table-qr-note">
          {t('These codes are ready to use. Managers and owners can also add tables in')}{' '}
          <Link to={addTablesPath}>{t('table management')}</Link>.
        </p>
      )}
    </div>
  )
}
