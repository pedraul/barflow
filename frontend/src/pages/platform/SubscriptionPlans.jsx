import React, { useEffect, useState } from 'react'
import { fetchPlans, createPlan, updatePlan } from '../../api/endpoints'
import { useToast } from '../../context/ToastContext'

export default function SubscriptionPlans() {
  const { showSuccess } = useToast()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  
  // Single base price state (Annual Price)
  const [form, setForm] = useState({
    name: '',
    description: '',
    priceYearly: '',
    features: ''
  })
  
  const [saving, setSaving] = useState(false)

  useEffect(() => { load(true) }, [])

  const load = async (initial = false) => {
    if (initial) setLoading(true)
    try {
      const data = await fetchPlans()
      setPlans(data)
    } catch (e) {
      console.error('Failed to load plans:', e)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      priceYearly: '',
      features: ''
    })
    setEditing(null)
    setShowForm(false)
  }

  const handleEdit = (plan) => {
    setForm({
      name: plan.name,
      description: plan.description || '',
      priceYearly: String(plan.priceYearly || ''),
      features: (plan.features || []).join('\n'),
    })
    setEditing(plan.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    
    try {
      const payload = {
        name: form.name,
        description: form.description,
        priceMonthly: Number(form.priceYearly) / 12 || 0,
        priceYearly: Number(form.priceYearly) || 0,
        discountQuarterly: 0,
        discountAnnually: 0,
        features: form.features.split('\n').filter(Boolean).map(f => f.trim()),
      }
      
      if (editing) {
        await updatePlan(editing, payload)
      } else {
        await createPlan(payload)
      }
      resetForm()
      await load(false)
      showSuccess('Changes saved successfully.')
    } catch (e) {
      console.error('Failed to save plan:', e)
      alert('Failed to save plan.')
    } finally {
      setSaving(false)
    }
  }

  if (loading && plans.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subscription Plans</h1>
          <p className="text-sm text-slate-500 mt-1">Manage pricing plans for businesses</p>
        </div>
        <button
          onClick={() => { showForm ? resetForm() : setShowForm(true) }}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
        >
          {showForm ? 'Cancel' : 'Add Plan'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-900">{editing ? 'Edit Plan' : 'New Plan'}</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Plan Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                placeholder="e.g. Standard Tier, Enterprise"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            {/* Annual Price Field */}
            <div className="sm:col-span-2 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
              <div>
                <label className="block text-sm font-bold text-indigo-950 mb-1">Annual Price (RWF)</label>
                <input
                  type="number"
                  value={form.priceYearly}
                  onChange={(e) => setForm({ ...form, priceYearly: e.target.value })}
                  className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-semibold"
                  placeholder="e.g. 480000"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Features (one per line)</label>
              <textarea
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                rows={4}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {saving ? 'Saving...' : editing ? 'Update Plan' : 'Create Plan'}
          </button>
        </form>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const annualPrice = plan.priceYearly || 0

          return (
            <div key={plan.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-slate-900">{plan.name}</h3>
                    <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
                  </div>
                  {!plan.isActive && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500 rounded-full">Inactive</span>
                  )}
                </div>

                <div className="mb-4 space-y-1">
                  <p className="text-2xl font-bold text-slate-900">{annualPrice.toLocaleString()} RWF <span className="text-xs font-normal text-slate-500">/ year</span></p>
                </div>

                <ul className="space-y-2 mb-6">
                  {(plan.features || []).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => handleEdit(plan)}
                className="w-full py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition mt-auto"
              >
                Edit Plan
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}