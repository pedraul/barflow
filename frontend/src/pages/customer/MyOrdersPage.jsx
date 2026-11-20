import React, { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ChefHat, Clock, ConciergeBell, UtensilsCrossed } from 'lucide-react'
import { useCustomer } from '../../context/CustomerContext'
import { usePreferences } from '../../context/PreferencesContext'
import useMyCustomerOrders from '../../hooks/useMyCustomerOrders'

const money = (value) => `${Number(value || 0).toLocaleString('en-RW')} RWF`

const STEPS = [
  { key: 'Open', label: 'Received', icon: Clock },
  { key: 'Preparing', label: 'Preparing', icon: ChefHat },
  { key: 'Ready', label: 'Ready', icon: ConciergeBell },
  { key: 'Served', label: 'Served', icon: CheckCircle2 },
]
const stepIndex = (status) => Math.max(0, STEPS.findIndex((s) => s.key === status))

/**
 * Status of the orders this customer placed (tracked on their device).
 * Paid orders disappear automatically. Re-scanning the table QR lands here.
 */
export default function MyOrdersPage() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { businessId: ctxBusinessId, tableNumber: ctxTable } = useCustomer()
  const businessId = searchParams.get('businessId') || ctxBusinessId
  const { orders, loaded } = useMyCustomerOrders(businessId)
  // Table just scanned; otherwise the table of this device's orders.
  const headerTable = searchParams.get('table') || orders.find((o) => o.tableNumber)?.tableNumber || ctxTable

  const menuParams = new URLSearchParams(searchParams)
  menuParams.set('browse', '1')
  const menuUrl = `/menu?${menuParams.toString()}`
  const here = `/my-orders?${searchParams.toString()}`

  // Nothing left to track (e.g. everything got paid) — go back to the menu.
  useEffect(() => {
    if (loaded && orders.length === 0) navigate(menuUrl, { replace: true })
  }, [loaded, orders.length, navigate, menuUrl])

  return (
    <div className="customer-storefront min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 md:px-8">
        <UtensilsCrossed className="text-orange-600" size={30} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight">{t('My orders')}</h1>
          {headerTable && <p className="text-sm text-slate-500">{t('Table')} {headerTable}</p>}
        </div>
        <button
          type="button"
          onClick={() => navigate(menuUrl)}
          className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 font-bold text-white shadow-sm"
        >{t('Go to menu')}</button>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="mb-4 text-sm text-slate-600">
          {t('Your orders update automatically. Once an order is paid it is removed from this list.')}
        </p>

        {!loaded ? (
          <div className="py-16 text-center text-slate-500">{t('Loading your orders…')}</div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const current = stepIndex(order.status)
              return (
                <article key={order.orderId} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-bold">{t('Order')} #{String(order.orderNumber ?? '').padStart(3, '0')}</h2>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {order.tableNumber != null && order.tableNumber !== '' && (
                          <span className="rounded-full bg-orange-50 px-2 py-0.5 font-semibold text-orange-700">
                            {t('Table')} {order.tableNumber}
                          </span>
                        )}
                        <span>{new Date(order.createdAt).toLocaleTimeString()}</span>
                      </p>
                    </div>
                    <strong className="text-lg">{money(order.total)}</strong>
                  </div>

                  <ol className="my-4 grid grid-cols-4 gap-1" aria-label={t('Order progress')}>
                    {STEPS.map((step, i) => {
                      const Icon = step.icon
                      const done = i <= current
                      return (
                        <li key={step.key} className="flex flex-col items-center gap-1 text-center">
                          <span className={`grid h-9 w-9 place-items-center rounded-full ${done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'} ${i === current ? 'ring-4 ring-emerald-100' : ''}`}>
                            <Icon size={17} />
                          </span>
                          <span className={`text-xs font-semibold ${done ? 'text-emerald-700' : 'text-slate-400'}`}>{t(step.label)}</span>
                        </li>
                      )
                    })}
                  </ol>

                  <ul className="divide-y divide-slate-100 border-y border-slate-100 text-sm">
                    {order.items.map((item, idx) => (
                      <li key={`${item.productId}-${idx}`} className="flex justify-between py-2">
                        <span>{item.name} <span className="text-slate-500">×{item.quantity}</span></span>
                        <span className="font-medium">{money(item.lineTotal || item.price * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{t('Not paid yet')}</span>
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-800"
                      onClick={() => navigate('/payment', { state: { order, returnTo: here } })}
                    >{t('Pay')}</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
