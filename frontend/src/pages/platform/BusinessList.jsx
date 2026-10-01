import React, { useEffect, useMemo, useState } from 'react'
import { Search, Eye, Pencil, Trash2, ShieldCheck, Ban, Play, X, RefreshCw, Building2 } from 'lucide-react'
import { fetchBusinesses, toggleBusinessStatus, setUnpaidBusinessAccess, updateBusiness, deleteBusiness } from '../../api/endpoints'
import { PROVINCES, DISTRICTS_BY_PROVINCE } from '../../constants/locationOptions'

const BUSINESS_TYPES = ['bar', 'restaurant', 'hotel', 'lounge', 'other']

export default function BusinessList() {
  const [businesses, setBusinesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [provinceFilter, setProvinceFilter] = useState('all')
  const [districtFilter, setDistrictFilter] = useState('all')
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      load()
    }, 0)
    return () => clearTimeout(timer)
  }, [provinceFilter, districtFilter])

  const load = async () => {
    setLoading(true)
    try {
      setBusinesses(await fetchBusinesses({
        province: provinceFilter === 'all' ? null : provinceFilter,
        district: districtFilter === 'all' ? null : districtFilter,
      }))
    } catch (e) {
      console.error('Failed to load businesses:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (id, action) => {
    setActionLoading(`${id}-${action}`)
    try {
      await toggleBusinessStatus(id, action)
      await load()
    } catch (e) {
      console.error('Action failed:', e)
      alert(e.response?.data?.error || 'Action failed.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUnpaidAccess = async (business, granted) => {
    const message = granted
      ? `Grant unpaid access to ${business.name}? They can use BarFlow before paying their subscription.`
      : `Revoke unpaid access from ${business.name}? Their next request will be blocked.`
    if (!window.confirm(message)) return

    setActionLoading(`${business.id}-access`)
    try {
      await setUnpaidBusinessAccess(business.id, granted)
      await load()
    } catch (e) {
      alert(e.response?.data?.error || 'Could not update unpaid access.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (b) => {
    if (!window.confirm(`Delete "${b.name}"? This permanently removes the business and all its data.`)) return
    setActionLoading(`${b.id}-delete`)
    try {
      await deleteBusiness(b.id)
      await load()
    } catch (e) {
      alert(e.response?.data?.error || 'Delete failed.')
    } finally {
      setActionLoading(null)
    }
  }

  const openEdit = (b) => {
    setEditForm({
      name: b.name || '',
      registrationCode: b.registrationCode || '',
      contactEmail: b.contactEmail || '',
      contactPhone: b.contactPhone || '',
      address: b.address || '',
      province: b.province || '',
      district: b.district || '',
      sector: b.sector || '',
      city: b.city || '',
      country: b.country || 'Rwanda',
      businessType: b.businessType || 'bar',
    })
    setEditing(b)
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      await updateBusiness(editing.id, editForm)
      setEditing(null)
      await load()
    } catch (e) {
      alert(e.response?.data?.error || 'Update failed.')
    } finally {
      setSaving(false)
    }
  }

  const hasPendingRenewal = (b) => b.isVerified && b.subPaymentStatus === 'pending'
  const getStatus = (b) => b.isSuspended ? 'Suspended' : (b.unpaidAccessGranted ? 'Access granted' : (hasPendingRenewal(b) ? 'Renewal pending' : (b.hasActiveSubscription ? 'Active' : (b.isVerified ? 'Subscription inactive' : 'Pending'))))

  const filtered = useMemo(() => businesses.filter((b) => {
    const s = getStatus(b)
    const matchesQ = !q || [b.name, b.contactEmail, b.registrationCode, b.contactPhone].some((v) => (v || '').toLowerCase().includes(q.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || s.toLowerCase() === statusFilter
    const matchesType = typeFilter === 'all' || b.businessType === typeFilter
    const matchesProvince = provinceFilter === 'all' || (b.province || '').toLowerCase() === provinceFilter.toLowerCase()
    const matchesDistrict = districtFilter === 'all' || (b.district || '').toLowerCase() === districtFilter.toLowerCase()
    return matchesQ && matchesStatus && matchesType && matchesProvince && matchesDistrict
  }), [businesses, q, statusFilter, typeFilter, provinceFilter, districtFilter])

  const badge = (b) => {
    const s = getStatus(b)
    const map = { Active: 'bg-emerald-100 text-emerald-700', Pending: 'bg-amber-100 text-amber-700', 'Renewal pending': 'bg-amber-100 text-amber-700', 'Access granted': 'bg-sky-100 text-sky-700', 'Subscription inactive': 'bg-orange-100 text-orange-700', Suspended: 'bg-red-100 text-red-700' }
    return <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${map[s]}`}>{s}</span>
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Businesses</h1>
          <p className="text-sm text-slate-500 mt-1">{businesses.length} businesses registered on BarFlow</p>
        </div>
        <button onClick={load} className="px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition inline-flex items-center gap-2">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, code, phone..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="subscription inactive">Subscription inactive</option>
          <option value="pending">Pending</option>
          <option value="access granted">Access granted</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white capitalize focus:ring-2 focus:ring-indigo-500 outline-none">
          <option value="all">All types</option>
          {BUSINESS_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
        </select>
        <select value={provinceFilter} onChange={(e) => { setProvinceFilter(e.target.value); setDistrictFilter('all') }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
          <option value="all">All provinces</option>
          {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
          <option value="all">All districts</option>
          {(DISTRICTS_BY_PROVINCE[provinceFilter] || Object.values(DISTRICTS_BY_PROVINCE).flat()).sort().map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1120px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="text-left px-3 py-2 font-semibold">Business</th>
                  <th className="text-left px-3 py-2 font-semibold">Code</th>
                  <th className="text-left px-3 py-2 font-semibold">Contact</th>
                  <th className="text-left px-3 py-2 font-semibold">Type</th>
                  <th className="text-left px-3 py-2 font-semibold">Location</th>
                  <th className="text-left px-3 py-2 font-semibold">Plan</th>
                  <th className="text-left px-3 py-2 font-semibold">Registered</th>
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                  <th className="text-left px-3 py-2 font-semibold">Unpaid access</th>
                  <th className="sticky right-0 z-20 text-right px-3 py-2 font-semibold bg-slate-50">Actions</th>
                </tr>
              </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={10} className="px-3 py-3 text-center text-slate-400">No businesses found.</td></tr>}
              {filtered.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-900">{b.name}</div>
                    <div className="text-xs text-slate-400">{b.city || 'N/A'} · {b.country || ''}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600 font-mono text-xs">{b.registrationCode || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="text-slate-700">{b.contactEmail || 'N/A'}</div>
                    <div className="text-xs text-slate-400">{b.contactPhone || ''}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-700 capitalize">{b.businessType || 'N/A'}</td>
                  <td className="px-3 py-2 text-slate-700">
                    <div className="font-medium">{b.province || '—'}</div>
                    <div className="text-xs text-slate-400">{b.district || ''} {b.sector ? `· ${b.sector}` : ''}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-700">{b.plan}</span>
                    <div className="text-xs text-slate-400 capitalize">{b.subStatus}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{b.createdAt ? new Date(b.createdAt).toLocaleDateString() : 'N/A'}</td>
                  <td className="px-3 py-2">{badge(b)}</td>
                  <td className="px-3 py-2">
                    {b.unpaidAccessGranted ? (
                      <button type="button" title="Revoke unpaid platform access" onClick={() => handleUnpaidAccess(b, false)} disabled={actionLoading === `${b.id}-access`} className="px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-40">
                        {actionLoading === `${b.id}-access` ? 'Saving...' : 'Revoke access'}
                      </button>
                    ) : b.hasActiveSubscription ? (
                      <span className="text-xs text-emerald-700">Subscription active</span>
                    ) : b.isSuspended ? (
                      <span className="text-xs text-slate-400">Suspended</span>
                    ) : (
                      <button type="button" title="Grant platform access before payment" onClick={() => handleUnpaidAccess(b, true)} disabled={actionLoading === `${b.id}-access`} className="px-2.5 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 rounded-lg hover:bg-sky-100 disabled:opacity-40">
                        {actionLoading === `${b.id}-access` ? 'Saving...' : 'Grant access'}
                      </button>
                    )}
                  </td>
                  <td className="sticky right-0 z-10 px-3 py-2 bg-white">
                    <div className="flex min-w-max justify-end gap-1.5">
                      <IconBtn title="View" onClick={() => setViewing(b)} color="text-slate-600 hover:bg-slate-100"><Eye size={15} /></IconBtn>
                      <IconBtn title="Edit" onClick={() => openEdit(b)} color="text-blue-600 hover:bg-blue-50"><Pencil size={15} /></IconBtn>
                      {hasPendingRenewal(b) && !b.isSuspended && (
                        <button type="button" title="Verify renewal" onClick={() => handleAction(b.id, 'verify')} disabled={actionLoading === `${b.id}-verify`} className="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-40">
                          {actionLoading === `${b.id}-verify` ? 'Verifying...' : 'Verify renewal'}
                        </button>
                      )}
                      {!b.isVerified && !b.isSuspended && (
                        <IconBtn title="Verify business" onClick={() => handleAction(b.id, 'verify')} disabled={actionLoading === `${b.id}-verify`} color="text-emerald-600 hover:bg-emerald-50"><ShieldCheck size={15} /></IconBtn>
                      )}
                      {b.isSuspended ? (
                        <IconBtn title="Activate" onClick={() => handleAction(b.id, 'activate')} disabled={actionLoading === `${b.id}-activate`} color="text-emerald-600 hover:bg-emerald-50"><Play size={15} /></IconBtn>
                      ) : (
                        <IconBtn title="Suspend" onClick={() => handleAction(b.id, 'suspend')} disabled={actionLoading === `${b.id}-suspend`} color="text-amber-600 hover:bg-amber-50"><Ban size={15} /></IconBtn>
                      )}
                      <IconBtn title="Delete" onClick={() => handleDelete(b)} disabled={actionLoading === `${b.id}-delete`} color="text-red-600 hover:bg-red-50"><Trash2 size={15} /></IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View modal */}
      {viewing && (
        <Modal title="Business Details" onClose={() => setViewing(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <Detail label="Name" value={viewing.name} />
            <Detail label="Registration Code" value={viewing.registrationCode || '—'} />
            <Detail label="Type" value={viewing.businessType} />
            <Detail label="Status" value={getStatus(viewing)} />
            <Detail label="Unpaid Access" value={viewing.unpaidAccessGranted ? 'Granted' : 'Not granted'} />
            <Detail label="Email" value={viewing.contactEmail || '—'} />
            <Detail label="Phone" value={viewing.contactPhone || '—'} />
            <Detail label="Province" value={viewing.province || '—'} />
            <Detail label="District" value={viewing.district || '—'} />
            <Detail label="Sector" value={viewing.sector || '—'} />
            <Detail label="City" value={viewing.city || '—'} />
            <Detail label="Country" value={viewing.country || '—'} />
            <Detail label="Address" value={viewing.address || '—'} />
            <Detail label="Plan" value={viewing.plan} />
            <Detail label="Users" value={String(viewing.userCount ?? 0)} />
            <Detail label="Registered" value={viewing.createdAt ? new Date(viewing.createdAt).toLocaleString() : '—'} />
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Business Name" value={editForm.name} onChange={(v) => setEditForm({ ...editForm, name: v })} />
            <FormField label="Registration Code" value={editForm.registrationCode} onChange={(v) => setEditForm({ ...editForm, registrationCode: v })} />
            <FormField label="Email" value={editForm.contactEmail} onChange={(v) => setEditForm({ ...editForm, contactEmail: v })} />
            <FormField label="Phone" value={editForm.contactPhone} onChange={(v) => setEditForm({ ...editForm, contactPhone: v })} />
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Province</label>
              <select value={editForm.province} onChange={(e) => setEditForm({ ...editForm, province: e.target.value, district: '', sector: '' })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select province</option>
                {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">District</label>
              <select value={editForm.district} onChange={(e) => setEditForm({ ...editForm, district: e.target.value, sector: '' })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" disabled={!editForm.province}>
                <option value="">Select district</option>
                {(DISTRICTS_BY_PROVINCE[editForm.province] || []).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <FormField label="Sector" value={editForm.sector} onChange={(v) => setEditForm({ ...editForm, sector: v })} />
            <FormField label="City" value={editForm.city} onChange={(v) => setEditForm({ ...editForm, city: v })} />
            <FormField label="Country" value={editForm.country} onChange={(v) => setEditForm({ ...editForm, country: v })} />
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Business Type</label>
              <select value={editForm.businessType} onChange={(e) => setEditForm({ ...editForm, businessType: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white capitalize focus:ring-2 focus:ring-indigo-500 outline-none">
                {BUSINESS_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <FormField label="Address" value={editForm.address} onChange={(v) => setEditForm({ ...editForm, address: v })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
            <button onClick={saveEdit} disabled={saving} className="px-5 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function IconBtn({ children, title, onClick, disabled, color }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled} className={`p-1.5 rounded-lg transition disabled:opacity-40 ${color}`}>
      {children}
    </button>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-bold text-slate-900 flex items-center gap-2"><Building2 size={18} className="text-[#4F46E5]" /> {title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-slate-800 font-medium mt-0.5 capitalize">{value}</p>
    </div>
  )
}

function FormField({ label, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">{label}</label>
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
    </div>
  )
}
