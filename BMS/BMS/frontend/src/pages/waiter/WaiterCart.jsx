import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { createWaiterOrder } from '../../api/endpoints'

const money = (v) =>
  'RWF ' +
  Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

export default function WaiterCart() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [cart, setCart] = useState([])
  const [table, setTable] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const storedBiz = sessionStorage.getItem('waiter_business_id') || ''
    const currentBiz = user?.businessId ? String(user.businessId) : ''
    if (storedBiz && currentBiz && storedBiz !== currentBiz) {
      sessionStorage.removeItem('waiter_cart')
      sessionStorage.removeItem('waiter_table')
      sessionStorage.removeItem('waiter_business_id')
      setCart([])
      setTable('')
    }
    if (!storedBiz && currentBiz) {
      const storedCart = JSON.parse(sessionStorage.getItem('waiter_cart') || '[]')
      if (storedCart.length > 0) {
        sessionStorage.removeItem('waiter_cart')
        sessionStorage.removeItem('waiter_table')
        sessionStorage.setItem('waiter_business_id', currentBiz)
        setCart([])
        setTable('')
        return
      }
    }
    try {
      const storedCart = JSON.parse(sessionStorage.getItem('waiter_cart') || '[]')
      const storedTable = sessionStorage.getItem('waiter_table') || ''
      setCart(storedCart)
      setTable(storedTable)
    } catch {
      setCart([])
    }
  }, [user?.businessId])

  const cartTotal = useMemo(
    () => cart.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [cart]
  )
  const cartCount = useMemo(
    () => cart.reduce((sum, i) => sum + i.quantity, 0),
    [cart]
  )

  const changeQty = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    )
  }

  const removeItem = (productId) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId))
  }

  const handleSubmit = async () => {
    setError(null)
    if (!cart.length) {
      setError('Cart is empty.')
      return
    }
    setSubmitting(true)
    try {
      const result = await createWaiterOrder({
        customer: String(table).trim() || 'Walk-in customer',
        items: cart.map((i) => ({
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
      })

      sessionStorage.removeItem('waiter_cart')
      sessionStorage.removeItem('waiter_table')

      navigate('/waiter/checkout', {
        state: {
          order: {
            id: result.id,
            orderNumber: result.orderNumber,
            tableNumber: result.tableNumber || String(table).trim() || 'Walk-in customer',
            orderType: result.orderType,
            total: result.total,
            subtotal: result.subtotal,
            tax: result.tax,
            items: result.items,
            waiterName: user?.name || 'Waiter',
          },
        },
      })
    } catch (err) {
      const backendMessage = err.response?.data?.error || err.message
      setError(backendMessage || 'Failed to place order.')
    } finally {
      setSubmitting(false)
    }
  }

  if (cart.length === 0 && !submitting) {
    return (
      <div className="page waiter-cart">
        <div className="user-page-heading">
          <div>
            <p className="eyebrow">Waiter workspace</p>
            <h1>Customer's cart</h1>
          </div>
        </div>
        <section className="section-card" style={{ textAlign: 'center', padding: '48px 16px' }}>
          <p style={{ color: 'var(--text-4)' }}>The customer's cart is empty.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="page waiter-cart">
      <div className="user-page-heading">
        <div>
          <p className="eyebrow">Waiter workspace</p>
          <h1>Customer's cart</h1>
          <p>
            This is the customer's order. Review it, then send it to the system
            operator. The operator routes it to the kitchen or bar.
          </p>
        </div>
      </div>

      {error && (
        <div className="subscription-lock" style={{ padding: '12px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <section className="section-card">
        <div className="section-title-row">
          <h2>Customer's cart</h2>
          <span className="user-pending">{cartCount} item(s)</span>
        </div>

        <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
          Table number
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          placeholder="e.g. 5"
          aria-label="Table number"
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            fontSize: 16,
            width: 160,
            marginBottom: 16,
          }}
        />

        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 12, padding: 12, fontSize: 13, color: '#6c757d', background: 'white', borderRadius: 8, marginBottom: 8 }}>
              <div style={{ flex: 4 }}>Item</div>
              <div style={{ flex: 2 }}>Unit Price</div>
              <div style={{ width: 120, textAlign: 'center' }}>Qty</div>
              <div style={{ width: 120, textAlign: 'right' }}>Total</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cart.map((i) => (
                <div key={i.productId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'white', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 4, minWidth: 0 }}>
                    <div style={{ width: 50, height: 50, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                      {i.imageUrl ? <img src={i.imageUrl} alt={i.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: '#f0f0f0' }}>🍽</div>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{i.name}</div>
                      <div style={{ color: '#6c757d', fontSize: 13 }}>{i.category || ''}</div>
                    </div>
                  </div>

                  <div style={{ flex: 2, alignSelf: 'center' }}>{money(i.price)}</div>

                  <div style={{ width: 120, textAlign: 'center' }}>
                    <button type="button" onClick={() => changeQty(i.productId, -1)} style={qtyBtn}>−</button>
                    <span style={{ margin: '0 8px', fontWeight: 700 }}>{i.quantity}</span>
                    <button type="button" onClick={() => changeQty(i.productId, 1)} style={qtyBtn}>+</button>
                  </div>

                  <div style={{ width: 120, textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#e63946' }}>{money(i.price * i.quantity)}</div>
                    <button type="button" onClick={() => removeItem(i.productId)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', padding: 2 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <Row label="Total" value={money(cartTotal)} strong />
            </div>
          </div>

          <aside style={{ width: 320, background: 'white', borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Order Summary</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', color: '#6c757d' }}><span>Subtotal</span><span>{money(cartTotal)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', color: '#6c757d' }}><span>Discount</span><span>{money(0)}</span></div>
            <div style={{ height: 1, background: '#e9ecef', margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}><span>Total</span><span>{money(cartTotal)}</span></div>

            <div style={{ marginTop: 18, display: 'flex', gap: 12, flexDirection: 'column' }}>
              <button type="button" className="secondary-action" style={{ width: '100%' }} onClick={() => navigate('/waiter/new-order')}>Add Items</button>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="button" className="secondary-action" style={{ flex: 1 }} onClick={() => navigate('/waiter/new-order')}>Back to menu</button>
                <button type="button" className="pay-action" style={{ flex: 2, padding: '12px' }} disabled={submitting} onClick={handleSubmit}>{submitting ? 'Placing order…' : 'Place Order'}</button>
              </div>
            </div>
          </aside>
        </div>

        
      </section>
    </div>
  )
}

function Row({ label, value, strong }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        fontWeight: strong ? 700 : 500,
        fontSize: strong ? 16 : 14,
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

const qtyBtn = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'white',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
}
