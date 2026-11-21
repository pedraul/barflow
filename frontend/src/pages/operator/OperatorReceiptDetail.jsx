import { usePreferences } from '../../context/PreferencesContext'
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchOperatorOrders, fetchOperatorDashboard } from '../../api/endpoints'

const MONEY = (v) => `${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function Receipt({ data }) {
  const { t } = usePreferences()
  return (
    <div className="operator-receipt-paper relative w-full max-w-[380px] bg-white shadow-2xl drop-shadow-xl my-4 print:shadow-none">
      <div
        className="absolute top-0 left-0 right-0 h-1 bg-[radial-gradient(circle,_transparent_70%,_#e5e7eb_70%)] bg-[length:10px_10px]"
      />

      <div className="operator-receipt-content px-6 py-8 space-y-4">

        <div className="operator-receipt-business text-center">
          <h1 className="text-xl font-extrabold tracking-wide text-black uppercase">
            {data.businessName}
          </h1>
          <p className="text-xs font-medium text-gray-700 mt-1">
            {data.description || data.subtitle}
          </p>
          <p className="text-xs text-gray-700 mt-1">
            {data.address}
          </p>
          <p className="text-xs text-gray-700 font-medium">{t("Tel:")}{data.phone}
          </p>
          <p className="text-xs text-gray-700">{t("Email:")}{data.email}
          </p>
          <p className="text-xs text-gray-700">{t("TIN:")}{' '}{data.registrationCode}</p>
        </div>

        <div className="border-b-2 border-dashed border-gray-400 my-2" />

        <h2 className="text-center font-bold text-base text-black uppercase tracking-wider mb-2">{t("Receipt")}</h2>

        <div className="operator-receipt-meta text-xs space-y-1 text-gray-800">
          <div className="flex justify-between">
            <span>
              <strong>{t("Receipt No:")}</strong> {data.receiptNo}
            </span>
            <span>
              <strong>{t("Date:")}</strong> <span className="underline">{data.date}</span>
            </span>
          </div>

          <div className="flex justify-between">
            <span>
              <strong>{t("Time:")}</strong> {data.time}
            </span>
            <span>
              <strong>{t("Waiter:")}</strong> {data.cashier}
            </span>
          </div>

          <div className="flex justify-between">
            <span>
              <strong>{t("Table:")}</strong> {data.table}
            </span>
            <span>
              <strong>{t("Order Type:")}</strong> {data.orderType}
            </span>
          </div>

          <div className="flex justify-between">
            <span>
              <strong>{t("Client Name:")}</strong> {data.clientName}
            </span>
            <span>
              <strong>{t("Phone:")}</strong> {data.clientPhone}
            </span>
          </div>
        </div>

        <div className="border-b-2 border-dashed border-gray-400 my-2" />

        <div className="grid grid-cols-12 text-xs font-bold text-black border-b border-gray-300 pb-1 mb-2">
          <span className="col-span-6">{t("Item")}</span>
          <span className="col-span-2 text-center">{t("Qty")}</span>
          <span className="col-span-2 text-right">{t("Price")}</span>
          <span className="col-span-2 text-right">{t("Total")}</span>
        </div>

        <div className="operator-receipt-items space-y-2 text-xs text-gray-800">
          {data.items.map((item, index) => (
            <div key={index} className="grid grid-cols-12">
              <span className="col-span-6 font-medium">{item.name}</span>
              <span className="col-span-2 text-center">{item.qty}</span>
              <span className="col-span-2 text-right">{item.price}</span>
              <span className="col-span-2 text-right font-medium">
                {item.total}
              </span>
            </div>
          ))}
        </div>

        <div className="border-b-2 border-dashed border-gray-400 my-2" />

        <div className="text-xs space-y-1">
          <div className="flex justify-between font-medium">
            <span>{t("Subtotal")}</span>
            <span>{data.subtotal}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>{t("Discount")}</span>
            <span>{data.discount}</span>
          </div>
        </div>

        <div className="border-b-2 border-black my-1" />

        <div className="flex justify-between items-center text-base font-extrabold text-black">
          <span>{t("TOTAL")}</span>
          <span>{data.total}{' '}{t("RWF")}</span>
        </div>

        <div className="border-b-2 border-black my-1" />

        <div className="text-xs space-y-1 mt-2">
          <div className="flex justify-between">
            <span className="font-semibold">{t("Payment Method:")}</span>
            <span>{data.paymentMethod}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">{t("Amount Paid:")}</span>
            <span>{data.amountPaid}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">{t("Payment Ref:")}</span>
            <span>{data.paymentRef}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">{t("Status:")}</span>
            <span className={'font-bold ' + (data.paymentStatus === 'PAID' ? 'text-green-600' : 'text-amber-600')}>
              {data.paymentStatus}
            </span>
          </div>
        </div>

        <div className="border-b-2 border-dashed border-gray-400 my-2" />

        <p className="text-xs text-gray-800">
          <strong>{t("Customer Number:")}</strong> {data.customerNumber}
        </p>

        <div className="text-center mt-4 space-y-1">
          <p className="text-xs italic text-gray-700">
            {data.footerNote || t("Thank you for dining with us!")}
          </p>
        </div>
      </div>

      <div
        className="absolute -bottom-2 left-0 right-0 h-1 bg-[radial-gradient(circle,_transparent_70%,_#e5e7eb_70%)] bg-[length:10px_10px]"
      />
    </div>
  )
}

export default function OperatorReceiptDetail() {
  const { t } = usePreferences()
  const { id } = useParams()
  const navigate = useNavigate()
  const [receipt, setReceipt] = useState(null)
  const [businessInfo, setBusinessInfo] = useState({
    name: 'BarFlow',
    address: 'KG 12 Ave',
    phone: '+250 788 123 456',
    tin: '123456789',
    subtitle: 'Good Drinks • Good Food • Good Vibes',
    city: 'Kigali',
    country: 'Rwanda',
    description: '',
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchOperatorOrders()
        const found = (data || []).find((r) => String(r.id) === String(id))
        setReceipt(found || null)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  useEffect(() => {
    const loadBusiness = async () => {
      try {
        const dash = await fetchOperatorDashboard()
        setBusinessInfo({
          name: dash.businessName || 'BarFlow',
          address: dash.businessAddress || 'KG 12 Ave, Kigali, Rwanda',
          phone: dash.businessPhone || '+250 788 123 456',
          tin: dash.businessTaxId || '123456789',
          subtitle: 'Good Drinks • Good Food • Good Vibes',
          city: dash.businessCity || 'Kigali',
          country: dash.businessCountry || 'Rwanda',
          email: dash.businessEmail || '',
          registrationCode: dash.businessRegistrationCode || '',
          description: dash.businessDescription || '',
        })
      } catch (e) {
        // use defaults
      }
    }
    loadBusiness()
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6c757d' }}>{t("Loading receipt...")}</div>
  if (!receipt) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#6c757d' }}>{t("Receipt not found.")}{' '}
      <button className="secondary-action" onClick={() => navigate('/operator/receipts/printed')}>{t("Back")}</button>
    </div>
  )

  const isPrinted = receipt.status === 'Served' || receipt.status === 'Paid'
  const dt = new Date(receipt.createdAt)
  const hasValidCreatedAt = Number.isFinite(dt.getTime())
  const today = hasValidCreatedAt ? dt.toLocaleDateString('en-GB') : 'Date unavailable'
  const currentTime = hasValidCreatedAt
    ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Time unavailable'
  const receiptPeriod = hasValidCreatedAt
    ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    : 'ORDER'
  const receiptNo = `RCP-${receiptPeriod}-${String(receipt.orderNumber).padStart(4, '0')}`
  const items = (receipt.items || []).map((i) => ({
    name: i.name,
    qty: i.quantity,
    price: Number(i.price || 0).toLocaleString(),
    total: Number(i.lineTotal || i.price * i.quantity || 0).toLocaleString(),
  }))
  const subtotal = items.reduce((s, i) => s + Number(i.total.replace(/,/g, '')), 0)

  const receiptData = {
    businessName: receipt.businessName || businessInfo.name || 'BarFlow',
    description: receipt.businessDescription || businessInfo.description || '',
    subtitle: businessInfo.subtitle,
    address: [receipt.businessAddress || businessInfo.address, receipt.businessCity || businessInfo.city, receipt.businessCountry || businessInfo.country].filter(Boolean).join(', '),
    phone: receipt.businessPhone || businessInfo.phone,
    email: receipt.businessEmail || businessInfo.email || '',
    registrationCode: receipt.businessRegistrationCode || businessInfo.registrationCode || '-',
    tin: businessInfo.tin,
    receiptNo,
    date: today,
    time: currentTime,
    cashier: receipt.waiterName || t('Operator'),
    table: 'Table ' + receipt.tableNumber,
    orderType: receipt.source === 'qr' ? 'QR Order' : 'Waiter Order',
    clientName: receipt.customerName || 'Walk-in',
    clientPhone: receipt.customerPhone || '-',
    items,
    subtotal: MONEY(subtotal),
    discount: '0',
    total: MONEY(Number(receipt.total || subtotal)),
    paymentMethod: receipt.paymentMethod || 'Cash',
    amountPaid: MONEY(Number(receipt.total || subtotal)),
    paymentRef: receipt.paymentRef || '-',
    paymentStatus: isPrinted ? 'PAID' : 'PENDING',
    customerNumber: receipt.customerPhone || '-',
    footerNote: '',
  }

  return (
    <div className="operator-receipt-print-page min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-8 font-sans text-[#0B132B]">
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-3 mb-4 no-print">
          <button className="secondary-action" onClick={() => navigate('/operator/receipts/' + (isPrinted ? 'printed' : 'draft'))}>{t("← Back")}</button>
          <button className="pay-action" onClick={() => window.print()}>{t("🖨 Print Receipt")}</button>
        </div>
        <Receipt data={receiptData} />
      </div>
    </div>
  )
}
