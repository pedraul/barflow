import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { registerBusiness, fetchPlans } from '../../api/endpoints'
import { useAuth } from '../../context/AuthContext'
import { buildWorkspaceUrl } from '../../config/workspaceUrl'
import {
  Building2, LayoutDashboard, Briefcase, CreditCard, RefreshCw, BarChart3,
  Users, ClipboardList, Settings, Menu, Bell, LogOut, Info, CheckCircle2,
  Eye, EyeOff, UserPlus, ShieldAlert
} from 'lucide-react'
import { PROVINCES, DISTRICTS_BY_PROVINCE } from '../../constants/locationOptions'

export default function RegisterBusiness() {
  const { login, user } = useAuth()
  const [description, setDescription] = useState('')

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const navigate = useNavigate()

  const getDashboardPath = () => {
    if (!user) return '/login'
    const role = user.role || user.userRole || ''
    if (role === 'super_admin' || role === 'admin') return '/admin'
    if (role === 'owner') return '/dashboard/owner'
    if (role === 'manager') return '/dashboard/manager'
    if (role === 'accountant') return '/dashboard/accountant'
    if (role === 'waiter') return '/dashboard/waiter'
    if (role === 'kitchen') return '/dashboard/kitchen'
    if (role === 'bar') return '/dashboard/bar'
    if (role === 'operator') return '/dashboard/operator'
    return '/login'
  }

  useEffect(() => {
    const loadPlans = async () => {
      setLoadingPlans(true)
      try {
        const data = await fetchPlans()
        const active = (data || []).filter((p) => p.isActive !== false)
        setPlans(active)
        if (active.length && !form.subscriptionPlanId) {
          setForm((prev) => ({ ...prev, subscriptionPlanId: active[0].id }))
        }
      } catch (e) {
        console.error('Failed to load plans:', e)
      } finally {
        setLoadingPlans(false)
      }
    }
    loadPlans()
  }, [])
  const [form, setForm] = useState({
    businessName: '', registrationCode: '', businessType: '',
    email: '', phone: '', alternatePhone: '',
    address: '', province: '', district: '', sector: '', city: '', country: '',
    currencyCode: 'RWF', timeZone: 'Africa/Kigali',
    subscriptionPlanId: '', billingCycle: 'monthly',
    ownerName: '', ownerEmail: '', ownerPhone: '',
    username: '', password: '', confirmPassword: '',
    description: ''
  })
  const [plans, setPlans] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(true)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [businessId, setBusinessId] = useState('')
  const [ownerCredentials, setOwnerCredentials] = useState(null)

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await registerBusiness({
        businessName: form.businessName,
        businessType: form.businessType,
        contactEmail: form.email,
        contactPhone: form.phone,
        address: form.address,
        city: form.city,
        country: form.country,
        currencyCode: form.currencyCode,
        timeZone: form.timeZone,
        registrationCode: form.registrationCode,
        ownerName: form.ownerName,
        ownerEmail: form.ownerEmail,
        ownerPhone: form.ownerPhone,
        username: form.username,
        password: form.password,
        planId: form.subscriptionPlanId,
        billingCycle: form.billingCycle,
        description: form.description,
        province: form.province,
        district: form.district,
        sector: form.sector,
      })
      setBusinessId(res.registrationCode || '')
      setOwnerCredentials({
        username: res.ownerUsername || form.username || form.ownerEmail,
        email: res.ownerEmail || form.ownerEmail,
      })
      if (res.token && res.user) {
        login({ token: res.token, user: res.user })
        window.location.assign(buildWorkspaceUrl({ ...res.user, businessSlug: res.businessSlug }, '/owner/subscription'))
        return
      }
      navigate('/owner/subscription')
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Business Registered!</h2>
          <p className="text-slate-600 mb-6">
            Your business has been registered successfully. Your account will be reviewed by our team.
            You will receive a confirmation email once verified.
          </p>
          {businessId && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-6 text-left">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Business ID</p>
              <p className="text-lg font-black text-slate-900 font-mono">{businessId}</p>
            </div>
          )}
          {ownerCredentials && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6 text-left">
              <p className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-2">Owner Login Credentials</p>
              <div className="space-y-1 text-sm text-slate-700">
                <p><span className="font-semibold">Username:</span> <span className="font-mono">{ownerCredentials.username}</span></p>
                <p><span className="font-semibold">Email:</span> <span className="font-mono">{ownerCredentials.email}</span></p>
                <p className="text-xs text-slate-500 mt-2">Use these credentials to log in after admin verification.</p>
              </div>
            </div>
          )}
          <button
            onClick={() => navigate('/login')}
            className="inline-block px-6 py-2.5 bg-[#4F46E5] text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased">

      {/* 1. LEFT NAVIGATION BRAND SIDEBAR */}
      <aside className="hidden md:flex w-64 bg-[#0A1128] text-slate-400 flex-col justify-between shrink-0 border-r border-slate-900">
        <div>
          {/* Platform Header Context Branding */}
          <div className="h-20 flex flex-col justify-center px-6 border-b border-slate-900">
            <div className="flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transform rotate-180">
                <path d="M8 22h8" /><path d="M12 11v11" /><path d="m19 3-7 8-7-8Z" />
              </svg>
              <span className="text-xl font-black text-white tracking-tight">BarFlow</span>
            </div>
            <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mt-0.5 pl-8">Platform Admin</span>
          </div>

          {/* Nav Categories */}
          <nav className="p-4 space-y-6 text-xs font-semibold">
            <div>
              <a href="#" className="flex items-center gap-3 px-3 py-2.5 bg-[#4F46E5]/20 text-[#818CF8] rounded-lg transition font-bold">
                <LayoutDashboard size={16} /> Dashboard
              </a>
            </div>

            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">Management</p>
              <SidebarLink icon={<Briefcase size={16} />} label="Businesses" active={true} />
              <SidebarLink icon={<CreditCard size={16} />} label="Subscription Plans" />
              <SidebarLink icon={<RefreshCw size={16} />} label="Subscriptions" />
              <SidebarLink icon={<BarChart3 size={16} />} label="Platform Statistics" />
            </div>

            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">System</p>
              <SidebarLink icon={<Users size={16} />} label="Admins" />
              <SidebarLink icon={<ClipboardList size={16} />} label="Audit Logs" />
              <SidebarLink icon={<Settings size={16} />} label="Settings" />
            </div>
          </nav>
        </div>

        {/* Profile/Footer Indicator Row */}
        <div className="p-4 border-t border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-xs">
              SA
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-white leading-tight">Super Admin</p>
              <p className="text-[10px] text-slate-500 truncate max-w-[120px]">superadmin@barflow.rw</p>
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT CONTENT FRAME AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">

        {/* TOP INTERFACE NAVBAR */}
        <header className="hidden md:flex h-20 bg-white border-b border-slate-200 items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button className="text-slate-500 hover:text-slate-800"><Menu size={20} /></button>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">Register New Business</h1>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                <span>Dashboard</span> <span className="font-normal text-slate-300">/</span>
                <span>Businesses</span> <span className="font-normal text-slate-300">/</span>
                <span className="text-slate-600">Register New Business</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative cursor-pointer p-1.5 hover:bg-slate-50 rounded-full transition">
              <Bell size={20} className="text-slate-600" />
              <span className="absolute top-1 right-1 bg-[#4F46E5] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">3</span>
            </div>
            <button className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-red-600 transition border-l pl-6 border-slate-200">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>

        {/* FORM MAIN SCROLL CONTAINER */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          <form onSubmit={handleSubmit} className="max-w-7xl mx-auto space-y-6 pb-12">

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                {error}
              </div>
            )}

            {/* CARD ONE: Business Information */}
            <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-2.5 text-[#4F46E5] border-b border-slate-100 pb-3">
                <div className="p-1.5 bg-[#4F46E5]/10 rounded-lg"><Building2 size={18} /></div>
                <h2 className="font-bold text-sm text-slate-900">Business Information</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <FormInput name="businessName" label="Business Name" required placeholder="Enter business name" value={form.businessName} onChange={handleInputChange} />
                <FormInput name="registrationCode" label="Registration Code / TIN" placeholder="Enter registration number (optional)" value={form.registrationCode} onChange={handleInputChange} />

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Business Type <span className="text-red-500">*</span></label>
                  <select name="businessType" value={form.businessType} onChange={handleInputChange} className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium text-slate-700">
                    <option value="">Select business type</option>
                    <option value="bar">Bar & Lounge</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="hotel">Hotel & Hospitality</option>
                    <option value="lounge">Lounge</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <FormInput name="email" label="Email Address" required type="email" placeholder="Enter business email" value={form.email} onChange={handleInputChange} />
                <FormInput name="phone" label="Phone Number" required placeholder="Enter phone number" value={form.phone} onChange={handleInputChange} />
                <FormInput name="alternatePhone" label="Alternate Phone" placeholder="Enter alternate phone (optional)" value={form.alternatePhone} onChange={handleInputChange} />

                <div className="md:col-span-2">
                  <FormInput name="address" label="Address" required placeholder="Enter business address" value={form.address} onChange={handleInputChange} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Province <span className="text-red-500">*</span></label>
                  <select name="province" value={form.province} onChange={(e) => { handleInputChange(e); setForm((prev) => ({ ...prev, district: '', sector: '' })) }} className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium text-slate-700">
                    <option value="">Select province</option>
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">District <span className="text-red-500">*</span></label>
                  <select name="district" value={form.district} onChange={(e) => { handleInputChange(e); setForm((prev) => ({ ...prev, sector: '' })) }} className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium text-slate-700" disabled={!form.province}>
                    <option value="">Select district</option>
                    {(DISTRICTS_BY_PROVINCE[form.province] || []).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <FormInput name="sector" label="Sector" placeholder="Enter sector" value={form.sector} onChange={handleInputChange} />
                <FormInput name="city" label="City" required placeholder="Enter city" value={form.city} onChange={handleInputChange} />

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Country <span className="text-red-500">*</span></label>
                  <select name="country" value={form.country} onChange={handleInputChange} className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium text-slate-700">
                    <option value="">Select country</option>
                    <option value="Rwanda">Rwanda</option>
                    <option value="Kenya">Kenya</option>
                    <option value="Uganda">Uganda</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Default Currency</label>
                  <select name="currencyCode" value={form.currencyCode} onChange={handleInputChange} className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium text-slate-700">
                    <option value="RWF">RWF (Rwandan Franc)</option>
                    <option value="KES">KES (Kenyan Shilling)</option>
                    <option value="UGX">UGX (Ugandan Shilling)</option>
                    <option value="USD">USD (US Dollar)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Time Zone</label>
                  <select name="timeZone" value={form.timeZone} onChange={handleInputChange} className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium text-slate-700">
                    <option value="Africa/Kigali">Africa/Kigali</option>
                    <option value="Africa/Nairobi">Africa/Nairobi</option>
                    <option value="Africa/Kampala">Africa/Kampala</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>

              </div>

              {/* Description Block */}
              <div className="space-y-1.5 relative">
                <label className="text-xs font-bold text-slate-700">Description (Optional)</label>
                <textarea
                  maxLength={500}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    setForm((prev) => ({ ...prev, description: e.target.value }))
                  }}
                  placeholder="Enter a short description about the business"
                  rows={3}
                  className="w-full bg-white border border-slate-200 rounded-lg p-3.5 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium resize-none placeholder:text-slate-400"
                ></textarea>
                <span className="absolute bottom-3 right-3 text-[10px] font-bold text-slate-400">
                  {description.length}/500
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Subscription Plan <span className="text-red-500">*</span></label>
                  <select name="subscriptionPlanId" value={form.subscriptionPlanId} onChange={handleInputChange} className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium text-slate-700" disabled={loadingPlans}>
                    <option value="">Select subscription plan</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Billing Cycle <span className="text-red-500">*</span></label>
                  <select name="billingCycle" value={form.billingCycle} onChange={handleInputChange} className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium text-slate-700">
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annually">Annually</option>
                  </select>
                </div>
              </div>
            </section>

            {/* CARD TWO: Initial Owner Account */}
            <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
              <div className="flex items-center gap-2.5 text-[#4F46E5] border-b border-slate-100 pb-3">
                <div className="p-1.5 bg-[#4F46E5]/10 rounded-lg"><UserPlus size={18} /></div>
                <h2 className="font-bold text-sm text-slate-900">Initial Owner Account</h2>
              </div>

              <div className="grid grid-cols-12 gap-5 items-start">
                <div className="col-span-12 grid grid-cols-1 md:grid-cols-4 gap-5">
                  <FormInput name="ownerName" label="Owner Full Name" required placeholder="Enter owner full name" value={form.ownerName} onChange={handleInputChange} />
                  <FormInput name="ownerEmail" label="Owner Email" required type="email" placeholder="Enter owner email" value={form.ownerEmail} onChange={handleInputChange} />
                  <FormInput name="ownerPhone" label="Owner Phone" required placeholder="Enter owner phone number" value={form.ownerPhone} onChange={handleInputChange} />
                  <FormInput name="username" label="Username" placeholder="Login username (optional)" value={form.username} onChange={handleInputChange} />
                </div>

                <div className="col-span-12 md:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5 relative">
                    <label className="text-xs font-bold text-slate-700">Password <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={form.password}
                        onChange={handleInputChange}
                        placeholder="Enter password"
                        className="w-full bg-white border border-slate-200 rounded-lg pl-3.5 pr-10 py-2 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 relative">
                    <label className="text-xs font-bold text-slate-700">Confirm Password <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirmPassword"
                        value={form.confirmPassword}
                        onChange={handleInputChange}
                        placeholder="Confirm password"
                        className="w-full bg-white border border-slate-200 rounded-lg pl-3.5 pr-10 py-2 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="col-span-12 md:col-span-4 bg-emerald-50/60 border border-emerald-100 text-emerald-800 rounded-lg p-3.5 flex items-start gap-2.5 text-xs font-medium">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Password must be at least 8 characters long and include letters and numbers.
                  </p>
                </div>
              </div>
            </section>

            {/* Form Processing Commit Drawer Options Row */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate(getDashboardPath())}
                className="px-6 py-2.5 border border-slate-200 text-slate-600 font-bold text-sm bg-white rounded-lg hover:bg-slate-50 shadow-xs transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold text-sm rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <Building2 size={16} />
                {loading ? 'Registering...' : 'Register Business'}
              </button>
            </div>

          </form>
        </main>
      </div>
    </div>
  )
}

/* --- REUSABLE CARD INPUT FORM SUB-ELEMENT MODULAR HELPER --- */
function FormInput({ label, name, required = false, type = "text", placeholder, value, onChange }) {
  return (
    <div className="space-y-1.5 w-full">
      <label className="text-xs font-bold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] font-medium placeholder:text-slate-400 text-slate-900 transition"
      />
    </div>
  )
}

function SidebarLink({ icon, label, active = false }) {
  return (
    <a href="#" className={`flex items-center gap-3 px-3 py-2 rounded-lg transition group ${
      active ? 'text-white bg-slate-800/40' : 'hover:bg-slate-800/30 hover:text-slate-200'
    }`}>
      <span className={active ? 'text-[#818CF8]' : 'text-slate-500 group-hover:text-slate-400'}>{icon}</span>
      <span>{label}</span>
    </a>
  )
}
