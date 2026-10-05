import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const showSuccess = useCallback((message) => {
    setToast({ message })
  }, [])

  const dismiss = useCallback(() => setToast(null), [])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  return (
    <ToastContext.Provider value={{ showSuccess }}>
      {children}
      {toast && (
        <div className="fixed right-4 top-4 z-[100] flex max-w-sm items-center gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg" role="status" aria-live="polite">
          <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
          <span className="flex-1">{toast.message}</span>
          <button type="button" onClick={dismiss} className="shrink-0 text-emerald-700 hover:text-emerald-900" aria-label="Dismiss notification">
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}
