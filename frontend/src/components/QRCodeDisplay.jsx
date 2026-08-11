import React from 'react'
import { QrCode, Smartphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { PUBLIC_APP_URL } from '../config/publicAppUrl'

/**
 * QR Code Display Component
 * Shows a QR code that customers can scan to access the menu and place orders.
 * Uses qrserver.com API (no external library needed).
 */
const FRONTEND_URL = PUBLIC_APP_URL
const QR_SIZE = 132

export default function QRCodeDisplay() {
  const { user } = useAuth()
  const businessId = user?.businessId
  const menuUrl = businessId ? `${FRONTEND_URL}/menu?businessId=${businessId}` : `${FRONTEND_URL}/menu`

  return (
    <aside className="w-full sm:w-auto max-w-sm rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-3 shadow-sm flex items-center gap-3">
      <div className="rounded-xl bg-white p-2 shadow-sm border border-slate-100 shrink-0">
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&data=${encodeURIComponent(menuUrl)}`}
          alt="QR code for the customer menu"
          width={QR_SIZE}
          height={QR_SIZE}
          className="block rounded-md"
        />
      </div>
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-700"><QrCode size={15} /> CUSTOMER MENU</span>
        <h2 className="font-bold text-slate-900 mt-1">Scan to order</h2>
        <p className="text-xs leading-5 text-slate-500 mt-1">Customers scan this code to browse the menu and submit their own order.</p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 mt-2"><Smartphone size={14} /> Ready to scan</span>
      </div>
    </aside>
  )
}
