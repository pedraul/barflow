import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { SubscriptionProvider } from './context/SubscriptionContext'
import { OrdersProvider } from './context/OrdersContext'
import { UsersProvider } from './context/UsersContext'
import { SalaryProvider } from './context/SalaryContext'
import { AuditLogProvider } from './context/AuditLogContext'
import { AuthProvider } from './context/AuthContext'
import './styles.css'

const openExternalLinkInEdge = (href) => {
  const normalizedHref = href.startsWith('http://') || href.startsWith('https://') ? href : `https://${href}`
  window.location.assign(`microsoft-edge:${normalizedHref}`)
}

document.addEventListener('click', (event) => {
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!anchor) return

  const href = anchor.getAttribute('href')
  const target = anchor.getAttribute('target')
  if (!href) return

  // If link explicitly opens in new tab or is a download/mail/tel, let default behavior occur
  if (target === '_blank' || anchor.hasAttribute('download') || href.startsWith('mailto:') || href.startsWith('tel:')) return

  // Resolve URL relative to current location
  let url
  try { url = new URL(href, window.location.href) } catch (e) { url = null }

  // External absolute URLs — open in Edge (unless new tab)
  if (url && url.origin !== window.location.origin) {
    event.preventDefault()
    openExternalLinkInEdge(url.href)
    return
  }

  // Hash links — let browser handle
  if (href.startsWith('#')) return

  // Internal same-origin navigation: use history pushState + popstate so React Router handles it (SPA navigation)
  if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../') || (url && url.origin === window.location.origin)) {
    event.preventDefault()
    const dest = url ? url.pathname + url.search + url.hash : href
    window.history.pushState({}, '', dest)
    window.dispatchEvent(new PopStateEvent('popstate'))
    return
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <SubscriptionProvider>
          <OrdersProvider>
            <UsersProvider>
              <SalaryProvider>
                <AuditLogProvider>
                  <App />
                </AuditLogProvider>
              </SalaryProvider>
            </UsersProvider>
          </OrdersProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
