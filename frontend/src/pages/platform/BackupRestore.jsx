import React, { useEffect, useState } from 'react'
import { fetchPlatformBackups, createPlatformBackup, deletePlatformBackup, restorePlatformBackup, fetchPlatformSettings, updatePlatformSettings } from '../../api/endpoints'
import { useToast } from '../../context/ToastContext'
import { usePreferences, stripIcons } from '../../context/PreferencesContext'

const BACKUP_TYPE_LABELS = {
  full: 'Full Backup',
  incremental: 'Incremental',
  database: 'Database Only',
  file: 'File Backup',
  config: 'Configuration',
}

export default function BackupRestore() {
  const { showSuccess } = useToast()
  const { t } = usePreferences()
  const [history, setHistory] = useState([])
  const [settings, setSettings] = useState({})
  const [backupType, setBackupType] = useState('full')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [b, s] = await Promise.all([fetchPlatformBackups(), fetchPlatformSettings()])
      setHistory(b)
      setSettings(s.flat || {})
    } catch (e) {
      console.error('Failed to load backups:', e)
    } finally {
      setLoading(false)
    }
  }

  const flash = (m) => { setMessage(m); setTimeout(() => setMessage(''), 3500) }

  const handleBackup = async () => {
    setCreating(true)
    try {
      await createPlatformBackup(backupType)
      await load()
      showSuccess(t('Backup created successfully.'))
    } catch (e) {
      flash('❌ ' + (e.response?.data?.error || t('Backup failed.')))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm(t('Delete this backup?'))) return
    try {
      await deletePlatformBackup(id)
      await load()
      showSuccess(t('Deleted successfully.'))
    } catch (e) {
      alert(e.response?.data?.error || t('Delete failed.'))
    }
  }

  const handleRestore = async (rec) => {
    if (!window.confirm(`${t('Restore from')} "${rec.name}"? ${t('This will overwrite current platform data.')}`)) return
    try {
      await restorePlatformBackup(rec.id)
      showSuccess(t('Backup restored successfully.'))
      await load()
    } catch (e) {
      flash('❌ ' + (e.response?.data?.error || t('Restore failed.')))
    }
  }

  const handleDownload = (rec) => {
    const content = `BarFlow backup metadata\nName: ${rec.name}\nType: ${rec.type}\nSize: ${rec.size}\nStatus: ${rec.status}\nCreated: ${new Date(rec.createdAt).toLocaleString()}\n`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${rec.name}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const saveSchedule = async () => {
    try {
      await updatePlatformSettings({
        backup_auto_enabled: settings.backup_auto_enabled,
        backup_frequency: settings.backup_frequency,
        backup_retention_days: settings.backup_retention_days,
      })
      showSuccess(t('Changes saved successfully.'))
    } catch (e) {
      flash('❌ ' + (e.response?.data?.error || t('Save failed.')))
    }
  }

  const setS = (k, v) => setSettings((p) => ({ ...p, [k]: v }))

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('Backup & Restore')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('Protect and restore platform data')}</p>
      </div>

      {message && <div className="p-3 rounded-lg text-sm font-medium border bg-emerald-50 border-emerald-200 text-emerald-700">{stripIcons(message)}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manual backup */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 mb-4"><span>{t('Manual Backup')}</span></div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">{t('Backup Type')}</label>
              <select value={backupType} onChange={(e) => setBackupType(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="full">{t('Full Backup')}</option>
                <option value="incremental">{t('Incremental')}</option>
                <option value="database">{t('Database Only')}</option>
                <option value="file">{t('File Backup')}</option>
                <option value="config">{t('Configuration')}</option>
              </select>
            </div>
            <button onClick={handleBackup} disabled={creating} className="w-full px-5 py-2.5 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition inline-flex items-center justify-center gap-2">
              {creating ? t('Creating...') : t('Create Backup Now')}
            </button>
          </div>
        </div>

        {/* Schedule */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 mb-4"><span>{t('Backup Schedule')}</span></div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">{t('Automatic Backups')}</label>
              <button type="button" onClick={() => setS('backup_auto_enabled', String(settings.backup_auto_enabled) === 'true' ? 'false' : 'true')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${String(settings.backup_auto_enabled) === 'true' ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${String(settings.backup_auto_enabled) === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">{t('Frequency')}</label>
                <select value={settings.backup_frequency ?? 'daily'} onChange={(e) => setS('backup_frequency', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="hourly">{t('Hourly')}</option>
                  <option value="daily">{t('Daily')}</option>
                  <option value="weekly">{t('Weekly')}</option>
                  <option value="monthly">{t('Monthly')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">{t('Retention (days)')}</label>
                <input type="number" value={settings.backup_retention_days ?? 30} onChange={(e) => setS('backup_retention_days', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
            <button onClick={saveSchedule} className="w-full px-5 py-2.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 font-semibold">{t('Save Schedule')}</button>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900"><span>{t('Backup History')}</span></div>
          <button onClick={load} className="text-xs font-bold text-[#4F46E5] hover:underline inline-flex items-center gap-1">{t('Refresh')}</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="text-left px-3 py-2 font-semibold">{t('Backup Name')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Type')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Size')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Status')}</th>
                <th className="text-left px-3 py-2 font-semibold">{t('Created')}</th>
                <th className="text-right px-3 py-2 font-semibold">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={6} className="px-3 py-3 text-center text-slate-400">{t('No backups yet. Create your first backup above.')}</td></tr>}
              {history.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold text-slate-900 font-mono text-xs">{h.name}</td>
                  <td className="px-3 py-2 text-slate-700 capitalize">{typeof BACKUP_TYPE_LABELS[h.type] === 'string' ? t(BACKUP_TYPE_LABELS[h.type]) : h.type}</td>
                  <td className="px-3 py-2 text-slate-700">{h.size}</td>
                  <td className="px-3 py-2"><span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded-full capitalize">{h.status === 'completed' ? t('Completed') : h.status}</span></td>
                  <td className="px-3 py-2 text-slate-400">{new Date(h.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button title={t('Download')} onClick={() => handleDownload(h)} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100">{t('Download')}</button>
                      <button title={t('Restore')} onClick={() => handleRestore(h)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50">{t('Restore')}</button>
                      <button title={t('Delete')} onClick={() => handleDelete(h.id)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50">{t('Delete')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
