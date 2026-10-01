import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchOperatorOrders, fetchOperatorDashboard } from '../../api/endpoints'

const MONEY = (v) => `${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function Receipt({ data }) {
  return (
    <div className="relative w-full max-w-[380px] bg-white shadow-2xl drop-shadow-xl my-4 print:shadow-none">
      <div
        className="absolute top-0 left-0 right-0 h-1 bg-[radial-gradient(circle,_transparent_70%,_#e5e7eb_70%)] bg-[length:10px_10px]"
      />

      <div className="px-6 py-8 space-y-4">
        <div className="flex justify-center mb-2">
          <div className="w-14 h-14 rounded-full border-2 border-black flex items-center justify-center p-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-8 h-8 text-black"
            >
              <path d="M8 22h8" />
              <path d="M7 10h4v12H7z" />
              <path d="M8 2v8" />
              <path d="M12 15a5 5 0 0 0 5-5V3h-5v7a5 5 0 0 0 0 5z" />
              <path d="M14.5 22v-7" />
            </svg>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-extrabold tracking-wide text-black uppercase">
            {data.businessName}
          </h1>
          <p className="text-xs font-medium text-gray-700 mt-1">
            {data.description || data.subtitle}
          </p>
          <p className="text-xs text-gray-700 mt-1">
            {data.address}
          </p>
          <p className="text-xs text-gray-700 font-medium">
            Tel: {data.phone}
          </p>
          <p className="text-xs text-gray-700">
            Email: {data.email}
          </p>
          <p className="text-xs text-gray-700">TIN: {data.registrationCode}</p>
        </div>

        <div className="border-b-2 border-dashed border-gray-400 my-2" />

        <h2 className="text-center font-bold text-base text-black uppercase tracking-wider mb-2">
          Receipt
        </h2>

        <div className="text-xs space-y-1 text-gray-800">
          <div className="flex justify-between">
            <span>
              <strong>Receipt No:</strong> {data.receiptNo}
            </span>
            <span>
              <strong>Date:</strong> <span className="underline">{data.date}</span>
            </span>
          </div>

          <div className="flex justify-between">
            <span>
              <strong>Time:</strong> {data.time}
            </span>
            <span>
              <strong>Waiter:</strong> {data.cashier}
            </span>
          </div>

          <div className="flex justify-between">
            <span>
              <strong>Table:</strong> {data.table}
            </span>
            <span>
              <strong>Order Type:</strong> {data.orderType}
            </span>
          </div>

          <div className="flex justify-between">
            <span>
              <strong>Client Name:</strong> {data.clientName}
            </span>
            <span>
              <strong>Phone:</strong> {data.clientPhone}
            </span>
          </div>
        </div>

        <div className="border-b-2 border-dashed border-gray-400 my-2" />

        <div className="grid grid-cols-12 text-xs font-bold text-black border-b border-gray-300 pb-1 mb-2">
          <span className="col-span-6">Item</span>
          <span className="col-span-2 text-center">Qty</span>
          <span className="col-span-2 text-right">Price</span>
          <span className="col-span-2 text-right">Total</span>
        </div>

        <div className="space-y-2 text-xs text-gray-800">
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
            <span>Subtotal</span>
            <span>{data.subtotal}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Discount</span>
            <span>{data.discount}</span>
          </div>
        </div>

        <div className="border-b-2 border-black my-1" />

        <div className="flex justify-between items-center text-base font-extrabold text-black">
          <span>TOTAL</span>
          <span>{data.total} RWF</span>
        </div>

        <div className="border-b-2 border-black my-1" />

        <div className="text-xs space-y-1 mt-2">
          <div className="flex justify-between">
            <span className="font-semibold">Payment Method:</span>
            <span>{data.paymentMethod}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Amount Paid:</span>
            <span>{data.amountPaid}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Payment Ref:</span>
            <span>{data.paymentRef}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Status:</span>
            <span className={'font-bold ' + (data.paymentStatus === 'PAID' ? 'text-green-600' : 'text-amber-600')}>
              {data.paymentStatus}
            </span>
          </div>
        </div>

        <div className="border-b-2 border-dashed border-gray-400 my-2" />

        <p className="text-xs text-gray-800">
          <strong>Customer Number:</strong> {data.customerNumber}
        </p>

        <div className="text-center mt-4 space-y-1">
          <p className="text-xs italic text-gray-700">
            {data.footerNote || 'Thank you for dining with us!'}
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6c757d' }}>Loading receipt...</div>
  if (!receipt) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#6c757d' }}>
      Receipt not found.{' '}
      <button className="secondary-action" onClick={() => navigate('/operator/receipts/printed')}>Back</button>
    </div>
  )

  const isPrinted = receipt.status === 'Served' || receipt.status === 'Paid'
  const dt = new Date(receipt.createdAt)
  const now = new Date()
  const today = dt.toLocaleDateString('en-GB')
  const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const receiptNo = `RCP-${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(receipt.orderNumber).padStart(4, '0')}`
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
    cashier: receipt.waiterName || 'Operator',
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
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-8 font-sans text-[#0B132B]">
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-3 mb-4 no-print">
          <button className="secondary-action" onClick={() => navigate('/operator/receipts/' + (isPrinted ? 'printed' : 'draft'))}>← Back</button>
          <button className="pay-action" onClick={() => window.print()}>🖨 Print Receipt</button>
        </div>
        <Receipt data={receiptData} />
      </div>
    </div>
  )
}