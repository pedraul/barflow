import React from 'react'
import { usePreferences } from '../../context/PreferencesContext'

export function SidebarLink({ icon, label, badge, badgeColor, status, active, onClick, className = '' }) {
  const { t } = usePreferences()
  return (
    <a
      href="#"
      onClick={(e) => { e.preventDefault(); onClick?.() }}
      className={`flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-700 hover:text-white transition group ${active ? 'font-medium' : ''} text-slate-300 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className={active ? 'text-slate-300' : 'text-slate-400 group-hover:text-white'}>{icon}</span>
        <span className="font-medium">{t(label)}</span>
      </div>
      {badge !== undefined && (
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      )}
      {status && <span className={`w-2 h-2 rounded-full ${status}`}></span>}
    </a>
  )
}

export function StatCard({ label, value, linkText, onClick }) {
  const { t } = usePreferences()
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-32 ${onClick ? 'cursor-pointer transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500' : ''}`}
      role={onClick ? 'link' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${t(label)}: ${value}. ${linkText ? t(linkText) : t('View details')}` : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick?.()
        }
      }}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t(label)}</p>
          <p className="text-2xl font-black text-slate-900">{value}</p>
        </div>
      </div>
      {linkText && (
        <span className="text-xs font-bold text-blue-600 tracking-wide transition text-left">
          {t(linkText)}
        </span>
      )}
    </div>
  )
}

export function OrderListItem({ id, type, typeColor = "bg-blue-100 text-blue-600 font-bold", station, table, time, items, total, onView, onProcess }) {
  const { t } = usePreferences()
  return (
    <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/40 hover:bg-slate-50 transition space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900 text-sm">{id}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeColor}`}>{type}</span>
          {station && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">
              {t('Sent to')} {station === 'both' ? t('Kitchen + Bar') : station.charAt(0).toUpperCase() + station.slice(1)}
            </span>
          )}
          <span className="text-xs text-slate-500 font-medium">{table}</span>
        </div>
        <span className="text-[11px] text-slate-400 font-medium">{time}</span>
      </div>
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between text-xs text-slate-600">
            <span>{item.name}</span>
            <span className="text-slate-400">x{item.qty}</span>
            <span className="font-medium text-slate-700">{item.price}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-slate-200 pt-2 flex justify-between items-center">
        <span className="text-xs text-slate-500 font-bold">{t('Total')}</span>
        <span className="text-sm font-black text-slate-900">{total}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        <button onClick={onView} className="text-xs font-semibold border border-slate-200 text-slate-600 py-1.5 rounded-md hover:bg-white transition bg-white shadow-xs">{t('View')}</button>
        <button onClick={onProcess} className="text-xs font-semibold bg-emerald-600 text-white py-1.5 rounded-md hover:bg-emerald-700 transition shadow-xs">{t('Process Order')}</button>
      </div>
    </div>
  )
}

export function StepIcon({ active, icon, title, subtitle, done }) {
  const { t } = usePreferences()
  return (
    <div className="flex flex-col items-center z-10 text-center">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition border ${
        done ? 'bg-emerald-50 border-emerald-500 text-emerald-600' :
        active ? 'bg-purple-50 border-purple-500 text-purple-600' :
        'bg-slate-100 border-slate-200 text-slate-400'
      }`}>
        {icon}
      </div>
      <p className="text-[10px] font-bold text-slate-800 mt-1.5">{t(title)}</p>
      <p className="text-[9px] text-slate-400 font-medium leading-none mt-0.5">{t(subtitle)}</p>
    </div>
  )
}

export function StepLine({ active }) {
  return (
    <div className={`flex-1 h-0.5 -mt-5 mx-1 transition ${active ? 'bg-emerald-400' : 'bg-slate-100'}`} />
  )
}

export function QuickActionButton({ label, onClick }) {
  const { t } = usePreferences()
  return (
    <button onClick={onClick} className="flex items-center gap-2 border border-slate-200 rounded-lg p-2.5 text-left bg-slate-50/50 hover:bg-slate-50 transition shadow-xs w-full">
      <span className="text-[11px] font-bold text-slate-800 leading-tight">{t(label)}</span>
    </button>
  )
}
