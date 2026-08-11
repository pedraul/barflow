import React from 'react'
import QRCode from '../QRCode'
import { Printer } from 'lucide-react'
import { PUBLIC_APP_URL } from '../config/publicAppUrl'

export default function MenuQRWidget({ embedded = false }) {
  const url = `${PUBLIC_APP_URL}/menu`

  const printMenuQR = () => {
    const qrMarkup = document.getElementById('menu-qr-code-for-print')?.outerHTML
    if (!qrMarkup) return

    const printWindow = window.open('', '_blank', 'width=600,height=700')
    if (!printWindow) return

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Customer Menu QR Code</title>
          <style>
            @page { margin: 18mm; }
            body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; text-align: center; }
            .qr-print-card { border: 2px solid #0f172a; border-radius: 16px; padding: 28px; max-width: 340px; margin: 0 auto; }
            h1 { font-size: 24px; margin: 0 0 10px; }
            p { font-size: 16px; margin: 10px 0 22px; color: #475569; }
            svg { margin: 0 auto; }
            small { display: block; margin-top: 20px; color: #64748b; word-break: break-all; }
          </style>
        </head>
        <body>
          <main class="qr-print-card">
            <h1>Scan to Order</h1>
            <p>Scan this code to view our menu and place your order.</p>
            ${qrMarkup}
            <small>${url}</small>
          </main>
          <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div className={`menu-qr-widget${embedded ? ' menu-qr-widget--embedded' : ''}`}>
      <div className="menu-qr-card no-print">
        <div className="menu-qr-head">
          <span className="menu-qr-title">Menu QR</span>
        </div>
        <div id="menu-qr-code-for-print"><QRCode value={url} size={220} level="M" /></div>
        <p className="menu-qr-caption">Scan to open menu &amp; order</p>
        <button
          type="button"
          onClick={printMenuQR}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition"
        >
          <Printer size={14} /> Print customer QR
        </button>
      </div>
    </div>
  )
}
