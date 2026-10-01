import React, { useEffect, useState } from 'react'
import { Database, Upload, RefreshCw, HardDriveDownload, Clock, Trash2, Download } from 'lucide-react'
import { fetchPlatformBackups, createPlatformBackup, deletePlatformBackup, restorePlatformBackup, fetchPlatformSettings, updatePlatformSettings } from '../../api/endpoints'

export default function BackupRestore() {
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
      flash('✅ Backup created successfully.')
    } catch (e) {
      flash('❌ ' + (e.response?.data?.error || 'Backup failed.'))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this backup?')) return
    try {
      await deletePlatformBackup(id)
      await load()
    } catch (e) {
      alert(e.response?.data?.error || 'Delete failed.')
    }
  }

  const handleRestore = async (rec) => {
    if (!window.confirm(`Restore from "${rec.name}"? This will overwrite current platform data.`)) return
    try {
      await restorePlatformBackup(rec.id)
      flash(`✅ Restore from "${rec.name}" completed.`)
      await load()
    } catch (e) {
      flash('❌ ' + (e.response?.data?.error || 'Restore failed.'))
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
      flash('✅ Backup schedule saved.')
    } catch (e) {
      flash('❌ ' + (e.response?.data?.error || 'Save failed.'))
    }
  }

  const setS = (k, v) => setSettings((p) => ({ ...p, [k]: v }))

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Backup &amp; Restore</h1>
        <p className="text-sm text-slate-500 mt-1">Protect and restore platform data</p>
      </div>

      {message && <div className="p-3 rounded-lg text-sm font-medium border bg-emerald-50 border-emerald-200 text-emerald-700">{message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manual backup */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 mb-4"><Database size={16} className="text-[#4F46E5]" /><span>Manual Backup</span></div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Backup Type</label>
              <select value={backupType} onChange={(e) => setBackupType(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="full">Full Backup</option>
                <option value="incremental">Incremental</option>
                <option value="database">Database Only</option>
                <option value="file">File Backup</option>
                <option value="config">Configuration</option>
              </select>
            </div>
            <button onClick={handleBackup} disabled={creating} className="w-full px-5 py-2.5 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition inline-flex items-center justify-center gap-2">
              <HardDriveDownload size={16} /> {creating ? 'Creating...' : 'Create Backup Now'}
            </button>
          </div>
        </div>

        {/* Schedule */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 mb-4"><Clock size={16} className="text-[#4F46E5]" /><span>Backup Schedule</span></div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Automatic Backups</label>
              <button type="button" onClick={() => setS('backup_auto_enabled', String(settings.backup_auto_enabled) === 'true' ? 'false' : 'true')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${String(settings.backup_auto_enabled) === 'true' ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${String(settings.backup_auto_enabled) === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Frequency</label>
                <select value={settings.backup_frequency ?? 'daily'} onChange={(e) => setS('backup_frequency', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Retention (days)</label>
                <input type="number" value={settings.backup_retention_days ?? 30} onChange={(e) => setS('backup_retention_days', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
            <button onClick={saveSchedule} className="w-full px-5 py-2.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 font-semibold">Save Schedule</button>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900"><Clock size={16} className="text-[#4F46E5]" /><span>Backup History</span></div>
          <button onClick={load} className="text-xs font-bold text-[#4F46E5] hover:underline inline-flex items-center gap-1"><RefreshCw size={12} /> Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="text-left px-3 py-2 font-semibold">Backup Name</th>
                <th className="text-left px-3 py-2 font-semibold">Type</th>
                <th className="text-left px-3 py-2 font-semibold">Size</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="text-left px-3 py-2 font-semibold">Created</th>
                <th className="text-right px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={6} className="px-3 py-3 text-center text-slate-400">No backups yet. Create your first backup above.</td></tr>}
              {history.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold text-slate-900 font-mono text-xs">{h.name}</td>
                  <td className="px-3 py-2 text-slate-700 capitalize">{h.type}</td>
                  <td className="px-3 py-2 text-slate-700">{h.size}</td>
                  <td className="px-3 py-2"><span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded-full capitalize">{h.status}</span></td>
                  <td className="px-3 py-2 text-slate-400">{new Date(h.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button title="Download" onClick={() => handleDownload(h)} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"><Download size={15} /></button>
                      <button title="Restore" onClick={() => handleRestore(h)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50"><Upload size={15} /></button>
                      <button title="Delete" onClick={() => handleDelete(h.id)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
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
