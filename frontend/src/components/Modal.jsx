import React from 'react'
import { usePreferences } from '../context/PreferencesContext'

export default function Modal({ title, onClose, children }) {
  const { t } = usePreferences()
  const translatedTitle = typeof title === 'string' ? t(title) : title
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label={translatedTitle} onClick={(event) => event.stopPropagation()}>
        {translatedTitle && <h2>{translatedTitle}</h2>}
        {children}
      </div>
    </div>
  )
}
