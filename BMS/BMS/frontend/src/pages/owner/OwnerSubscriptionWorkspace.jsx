import React, { useState, useEffect } from 'react'

// Country & Currency Configuration (drives both pricing conversion and the payment gateway)
const COUNTRIES_CONFIG = {
  rwanda: {
    name: 'Rwanda',
    flag: '🇷🇼',
    currency: 'RWF',
    rate: 1,
    paymentMethods: [
      { id: 'momo_rw', name: 'MTN Mobile Money', provider: 'MTN', logoBg: 'logo-mtn', type: 'Mobile Money', fee: '0.5%' },
      { id: 'airtel_rw', name: 'Airtel Money', provider: 'Airtel', logoBg: 'logo-airtel', type: 'Mobile Money', fee: 'Free' },
      { id: 'card_rw', name: 'Credit/Debit Card', provider: 'Visa/Mastercard', logoBg: 'logo-card', type: 'Card Online', fee: '2.9%' },
    ],
  },
  kenya: {
    name: 'Kenya',
    flag: '🇰🇪',
    currency: 'KES',
    rate: 0.11,
    paymentMethods: [
      { id: 'mpesa_ke', name: 'M-Pesa Express', provider: 'Safaricom', logoBg: 'logo-mpesa', type: 'Mobile Money', fee: '1%' },
      { id: 'card_ke', name: 'Credit/Debit Card', provider: 'Visa/Mastercard', logoBg: 'logo-card', type: 'Card Online', fee: '2.9%' },
    ],
  },
  uganda: {
    name: 'Uganda',
    flag: '🇺🇬',
    currency: 'UGX',
    rate: 2.85,
    paymentMethods: [
      { id: 'momo_ug', name: 'MTN MoMo Uganda', provider: 'MTN', logoBg: 'logo-mtn', type: 'Mobile Money', fee: '0.8%' },
      { id: 'airtel_ug', name: 'Airtel Money Uganda', provider: 'Airtel', logoBg: 'logo-airtel', type: 'Mobile Money', fee: '0.5%' },
    ],
  },
  usa: {
    name: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    rate: 0.00078,
    paymentMethods: [
      { id: 'stripe_card', name: 'Secure Card Payment', provider: 'Stripe', logoBg: 'logo-stripe', type: 'Card Online', fee: '2.9% + $0.30' },
      { id: 'paypal', name: 'PayPal checkout', provider: 'PayPal', logoBg: 'logo-paypal', type: 'Express Wallet', fee: '3.49%' },
    ],
  },
}

// Base Pricing in RWF
const BASE_PRICING = {
  Basic: { monthly: 35000, quarterly: 99000, yearly: 357000 },
  Pro: { monthly: 75000, quarterly: 213000, yearly: 765000 },
}

const PLAN_FEATURES = {
  Basic: ['1 branch', '10 staff accounts', '5,000 tx/month'],
  Pro: ['5 branches', '50 staff accounts', 'Unlimited tx/month'],
}

const INVOICES = [
  { code: 'INV-2026-007', date: '1 Jul 2026', amount: 'RWF 75,000' },
  { code: 'INV-2026-006', date: '1 Jun 2026', amount: 'RWF 75,000' },
  { code: 'INV-2026-005', date: '1 May 2026', amount: 'RWF 75,000' },
]

const USAGE = [
  { label: 'Branches Allocated', value: '2 of 5', width: '40%', bar: 'obw-bar-indigo' },
  { label: 'Provisioned Staff Accounts', value: '14 of 50', width: '28%', bar: 'obw-bar-indigo' },
  { label: 'Transactions (This Month)', value: '1,284 / Unlimited', width: '10%', bar: 'obw-bar-green' },
]

const SUB_TABS = [
  { key: 'plan', label: 'Plan & Billing' },
  { key: 'payment', label: 'Payment Methods' },
  { key: 'invoices', label: 'Invoices' },
]

export default function OwnerSubscriptionWorkspace() {
  const [subTab, setSubTab] = useState('plan')
  const [selectedPlan, setSelectedPlan] = useState('Pro')
  const [selectedCycle, setSelectedCycle] = useState('monthly')
  const [selectedCountry, setSelectedCountry] = useState('rwanda')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('momo_rw')

  const countryData = COUNTRIES_CONFIG[selectedCountry]
  const activePaymentMethods = countryData.paymentMethods

  // Reset the selected payment method whenever the country (and its methods) changes.
  useEffect(() => {
    setSelectedPaymentMethod(activePaymentMethods[0]?.id || '')
  }, [selectedCountry])

  const convertPrice = (baseRwfPrice) => {
    if (baseRwfPrice === null) return 'Custom'
    const converted = baseRwfPrice * countryData.rate
    if (countryData.currency === 'USD') {
      return `${countryData.currency} ${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return `${countryData.currency} ${Math.round(converted).toLocaleString()}`
  }

  const currentPrice = BASE_PRICING[selectedPlan][selectedCycle]
  const priceLabel = typeof currentPrice === 'number' ? convertPrice(currentPrice) : 'Custom'

  const handleCheckout = () => {
    const method = activePaymentMethods.find((m) => m.id === selectedPaymentMethod)
    alert(`Redirecting to ${method?.name || 'payment gateway'} to authorize ${priceLabel} for the ${selectedPlan} (${selectedCycle}) plan.`)
  }

  const cycles = ['monthly', 'quarterly', 'yearly']

  return (
    <div className="obw">
      {/* Banner */}
      <div className="obw-banner">
        <p className="obw-banner-eyebrow">Owner Workspace</p>
        <h1>Owner Billing &amp; Subscription</h1>
        <p>Manage your BarFlow plan, billing region, payment methods, usage limits, and invoices in one secure place.</p>
      </div>

      {/* Sub navigation (links the billing sections together) */}
      <nav className="obw-subnav" aria-label="Subscription sections">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`obw-subtab ${subTab === tab.key ? 'active' : ''}`}
            onClick={() => setSubTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="obw-grid">
        {/* MAIN COLUMN */}
        <div className="obw-main">
          {/* Shared country/region control */}
          <section className="billing-context">
            <div>
              <h2 className="obw-context-title">Billing Region</h2>
              <p className="obw-context-text">Your country sets the currency and unlocks the local payment channels used at checkout.</p>
            </div>
            <div className="country-picker">
              <label htmlFor="billing-country">Billing Country / Region</label>
              <div className="select-wrap">
                <select
                  id="billing-country"
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                >
                  {Object.entries(COUNTRIES_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.flag} {config.name} ({config.currency})
                    </option>
                  ))}
                </select>
                <span className="select-caret" aria-hidden="true">▼</span>
              </div>
            </div>
          </section>

          {/* PLAN & BILLING */}
          {subTab === 'plan' && (
            <section className="obw-card">
              <h2>Plan &amp; Billing Cycle</h2>
              <p>Select a plan, then choose its monthly, quarterly, or yearly price to proceed.</p>

              <div className="obw-cycle" role="tablist" aria-label="Billing cycle">
                {cycles.map((cycle) => (
                  <button
                    key={cycle}
                    type="button"
                    role="tab"
                    aria-selected={selectedCycle === cycle}
                    onClick={() => setSelectedCycle(cycle)}
                    className={`obw-cycle-btn ${selectedCycle === cycle ? 'active' : ''}`}
                  >
                    {cycle}
                  </button>
                ))}
              </div>

              <div className="obw-plan-grid">
                {['Basic', 'Pro'].map((plan) => {
                  const price = convertPrice(BASE_PRICING[plan][selectedCycle])
                  return (
                    <div
                      key={plan}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedPlan(plan)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedPlan(plan)
                        }
                      }}
                      className={`obw-plan-card ${selectedPlan === plan ? 'selected' : ''}`}
                    >
                      {plan === 'Pro' && <span className="obw-plan-badge">Popular</span>}
                      <div>
                        <h3>{plan}</h3>
                        <p className="obw-plan-tag">
                          {plan === 'Basic' ? 'For single bar/restaurant settings.' : 'For growing hospitality groups.'}
                        </p>
                        <p className="obw-plan-price">{price}</p>
                        {selectedCycle !== 'monthly' && (
                          <span className="obw-save-badge">{selectedCycle === 'quarterly' ? 'Save 6%' : 'Save 15%'}</span>
                        )}
                      </div>
                      <ul className="obw-plan-features">
                        {PLAN_FEATURES[plan].map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>

              {/* Checkout callout links to the Payment Methods section */}
              <div className="obw-checkout-callout">
                <div>
                  <span className="obw-muted">Selected Plan: </span>
                  <span className="obw-checkout-plan">
                    {selectedPlan} • {selectedCycle} ({priceLabel})
                  </span>
                </div>
                <button type="button" className="obw-btn-primary" onClick={() => setSubTab('payment')}>
                  Proceed to Payment
                </button>
              </div>
            </section>
          )}

          {/* PAYMENT METHODS */}
          {subTab === 'payment' && (
            <section className="obw-card">
              <div className="obw-card-head-row">
                <div>
                  <h2>Online Payment Gateway</h2>
                  <p>Select an online billing method available for checkout in <strong>{countryData.name}</strong>.</p>
                </div>
              </div>

              <div className="payment-grid">
                {activePaymentMethods.map((method) => (
                  <div
                    key={method.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPaymentMethod(method.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedPaymentMethod(method.id)
                      }
                    }}
                    className={`payment-card ${selectedPaymentMethod === method.id ? 'selected' : ''}`}
                  >
                    <div className="payment-card-top">
                      <span className={`method-logo ${method.logoBg}`}>{method.provider}</span>
                      <input type="radio" readOnly checked={selectedPaymentMethod === method.id} aria-label={method.name} />
                    </div>
                    <div>
                      <p className="method-name">{method.name}</p>
                      <p className="method-meta">{method.type} • Fee: {method.fee}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="obw-payment-current">
                <div className="obw-payment-method">
                  <span className="obw-momo-logo">MTN MoMo</span>
                  <div>
                    <p className="obw-payment-name">MTN Mobile Money</p>
                    <p className="obw-payment-meta">
                      +250 78••• 4812 <span className="obw-default-badge">Default</span>
                    </p>
                  </div>
                </div>
                <button type="button" className="obw-btn-primary" onClick={handleCheckout}>
                  Pay / Renew Now
                </button>
              </div>
            </section>
          )}

          {/* INVOICES */}
          {subTab === 'invoices' && (
            <section className="obw-card">
              <h2>Invoice History</h2>
              <p>View and retrieve invoices for your accounting records.</p>

              <div className="obw-table-wrap">
                <table className="obw-table">
                  <thead>
                    <tr>
                      <th>Invoice Code</th>
                      <th>Billing Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th className="obw-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {INVOICES.map((invoice) => (
                      <tr key={invoice.code}>
                        <td className="obw-strong">{invoice.code}</td>
                        <td className="obw-cell-muted">{invoice.date}</td>
                        <td>{invoice.amount}</td>
                        <td><span className="obw-status-paid">Paid</span></td>
                        <td className="obw-right"><button type="button" className="obw-link-btn">Download</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {/* SIDEBAR (status + usage), linked to the selected plan */}
        <aside className="obw-aside">
          <section className="obw-card">
            <h3 className="obw-section-label">Subscription Overview</h3>
            <div className="obw-status-top">
              <div>
                <p className="obw-status-plan">{selectedPlan} Plan</p>
                <p className="obw-muted">Billed {selectedCycle}</p>
              </div>
              <span className="obw-status-active">
                <span className="obw-pulse-dot" />
                Active
              </span>
            </div>

            <div className="obw-status-meta">
              <div className="obw-status-row"><span className="obw-muted">Current Charge:</span><span className="obw-strong">{priceLabel}</span></div>
              <div className="obw-status-row"><span className="obw-muted">Next Renewal Date:</span><span className="obw-semibold">31 Jul 2026</span></div>
              <div className="obw-status-row"><span className="obw-muted">Auto-Renewal Status:</span><span className="obw-auto-badge">Enabled</span></div>
            </div>

            <div className="obw-status-actions">
              <button type="button" className="obw-btn-cancel" onClick={() => alert('Subscription cancellation requested.')}>Cancel Plan</button>
              <button type="button" className="obw-btn-dark" onClick={() => setSubTab('payment')}>Manage Plan</button>
            </div>
          </section>

          <section className="obw-card">
            <h3 className="obw-section-label">Plan Resource Limits</h3>
            <div className="obw-usage">
              {USAGE.map((item) => (
                <div key={item.label} className="obw-usage-item">
                  <div className="obw-usage-head">
                    <span>{item.label}</span>
                    <span>{item.value}</span>
                  </div>
                  <div className="obw-progress">
                    <div className={`obw-progress-bar ${item.bar}`} style={{ width: item.width }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
