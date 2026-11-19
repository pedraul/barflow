import React, { useEffect, useMemo, useState } from 'react'
import { fetchMenu } from '../api/endpoints'
import { addItemsToExistingOrder } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { usePreferences } from '../context/PreferencesContext'
import { ArrowLeft, Search, ShoppingCart } from 'lucide-react'

const money = (value) => `${Number(value || 0).toLocaleString('en-RW')} RWF`

export default function AddItemsToOrderModal({ order, onClose, onSuccess }) {
  const { user } = useAuth()
  const { t } = usePreferences()
  const [menu, setMenu] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [search, setSearch] = useState('')
  const [additions, setAdditions] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    fetchMenu('1', user?.businessId).then(setMenu).catch(() => setMenu({ categories: [] }))
  }, [user?.businessId])

const allCategories = useMemo(() => menu?.categories || [], [menu])
  const categories = useMemo(() => {
    const seen = new Set()
    return allCategories.filter((group) => {
      const name = group.name.toLowerCase().trim()
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
  }, [allCategories])

  const allItems = useMemo(() => allCategories.flatMap((group) => group.items.map((item) => ({ ...item, category: group.name }))), [allCategories])

  const categoryItems = useMemo(() => {
    if (!selectedCategory) return []
    const selectedLower = selectedCategory.toLowerCase().trim()
    return allItems.filter((item) => item.category.toLowerCase().trim() === selectedLower)
  }, [allItems, selectedCategory])

  const searchItems = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return []
    return allItems.filter((item) => item.name.toLowerCase().includes(q))
  }, [allItems, search])

  const changeQty = (productId, delta) => {
    setAdditions((prev) => {
      const current = prev[productId] || 0
      const next = Math.max(0, current + delta)
      if (next === 0) {
        const { [productId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [productId]: next }
    })
  }

  const hasAdditions = Object.values(additions).some((qty) => qty > 0)
  const additionsCount = Object.values(additions).reduce((a, b) => a + b, 0)
  const totalAdditions = Object.entries(additions).reduce((sum, [id, qty]) => {
    const product = allItems.find((p) => p.id === Number(id))
    return sum + (product ? product.price * qty : 0)
  }, 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFeedback(null)

    if (!hasAdditions) {
      setFeedback({ type: 'error', text: t('Select at least one item to add.') })
      return
    }

    setSubmitting(true)
    try {
      const itemsToAdd = Object.entries(additions)
        .filter(([_, qty]) => qty > 0)
        .map(([productId, quantity]) => {
          const product = allItems.find((p) => String(p.id) === String(productId))
          return {
            productId: product?.id ?? productId,
            name: product?.name ?? '',
            quantity,
            price: product?.price ?? 0,
          }
        })

      await addItemsToExistingOrder(order.id, { items: itemsToAdd })

      setFeedback({ type: 'success', text: t('Items added to order successfully.') })
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 800)
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.error || err.message || t('Failed to add items.') })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label={t('Add items to order')} onClick={(event) => event.stopPropagation()} style={{ maxWidth: '700px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2>{t('Add Items — Order')} {order.orderNumber ?? order.id}</h2>

        {feedback && (
          <div style={{
            padding: '10px 12px',
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 14,
            border: feedback.type === 'error' ? '1px solid #f5c6cb' : '1px solid #c3e6cb',
            backgroundColor: feedback.type === 'error' ? '#f8d7da' : '#d4edda',
            color: feedback.type === 'error' ? '#721c24' : '#155724',
          }}>
            {feedback.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Search bar (always visible) */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={selectedCategory ? `${t('Search in')} ${selectedCategory}...` : t('Search all items...')}
              style={{ width: '100%', padding: '8px 10px 8px 34px', borderRadius: 6, border: '1px solid #cbd5e0', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          {/* If a category is selected, show items in that category */}
          {selectedCategory ? (
            <>
              <button type="button" onClick={() => { setSelectedCategory(null); setSearch('') }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                  backgroundColor: '#1e293b', color: 'white', borderRadius: 8, border: 'none',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 10,
                }}
              >
                <ArrowLeft size={16} /> {t('Back to categories')}
              </button>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{selectedCategory}</h3>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{t('Select the items to add to this order')}</p>

              <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
                {(search ? searchItems : categoryItems).length === 0 ? (
                  <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', padding: 20, fontSize: 13 }}>
                    {search ? `${t('No items found matching')} "${search}"` : t('No items in this category.')}
                  </p>
                ) : (search ? searchItems : categoryItems).map((item) => {
                  const qty = additions[item.id] || 0
                  const soldOut = Number(item.quantity) <= 0
                  return (
                    <div key={item.id} style={{
                      border: '1px solid #e2e8f0', borderRadius: 8, padding: 10,
                      opacity: soldOut ? 0.5 : 1,
                    }}>
                      {item.imageUrl ? (
                        <div style={{ height: 80, marginBottom: 6, borderRadius: 4, overflow: 'hidden', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <img src={item.imageUrl} alt={item.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                        </div>
                      ) : (
                        <div style={{ height: 80, marginBottom: 6, borderRadius: 4, backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#94a3b8' }}>{t('No image')}</div>
                      )}
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{item.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>{money(item.price)}</div>
                      {soldOut ? (
                        <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{t('Sold out')}</div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button type="button" aria-label={t('Decrease quantity')} onClick={() => changeQty(item.id, -1)} style={qtyBtnStyle}>−</button>
                          <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 600, fontSize: 13 }}>{qty}</span>
                          <button type="button" aria-label={t('Increase quantity')} onClick={() => changeQty(item.id, 1)} style={qtyBtnStyle}>+</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          ) : search ? (
            /* Search results view */
            <>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t('Search Results')}</h3>
              <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
                {searchItems.length === 0 ? (
                  <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', padding: 20, fontSize: 13 }}>{t('No items found.')}</p>
) : searchItems.map((item) => {
                   const qty = additions[item.id] || 0
                   const soldOut = Number(item.quantity) <= 0
                   return (
                     <div key={item.id} style={{
                       border: '1px solid #e2e8f0', borderRadius: 8, padding: 10,
                       opacity: soldOut ? 0.5 : 1,
                     }}>
                       {item.imageUrl ? (
                         <div style={{ height: 80, marginBottom: 6, borderRadius: 4, overflow: 'hidden', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <img src={item.imageUrl} alt={item.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                         </div>
                       ) : (
                         <div style={{ height: 80, marginBottom: 6, borderRadius: 4, backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#94a3b8' }}>{t('No image')}</div>
                       )}
                       <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{item.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>{money(item.price)}</div>
                      {soldOut ? (
                        <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{t('Sold out')}</div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button type="button" aria-label={t('Decrease quantity')} onClick={() => changeQty(item.id, -1)} style={qtyBtnStyle}>−</button>
                          <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 600, fontSize: 13 }}>{qty}</span>
                          <button type="button" aria-label={t('Increase quantity')} onClick={() => changeQty(item.id, 1)} style={qtyBtnStyle}>+</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            /* Category grid view */
            <>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t('Categories')}</h3>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{t('Select a category to browse items')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
                {categories.map((group) => (
                  <button
                    key={group.name}
                    type="button"
                    onClick={() => setSelectedCategory(group.name)}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '14px 12px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = '#d97706'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{group.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{group.items?.length || 0} {t('items')}</div>
                  </button>
                ))}
                {categories.length === 0 && (
                  <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', padding: 20, fontSize: 13 }}>{t('No categories available.')}</p>
                )}
              </div>
            </>
          )}

          {/* Summary */}
          {hasAdditions && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderTop: '1px solid #e2e8f0', marginBottom: 12,
              fontSize: 14, fontWeight: 700,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShoppingCart size={16} /> {additionsCount} {t('item(s) to add')}
              </span>
              <span style={{ color: '#d97706' }}>{money(totalAdditions)}</span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            <button type="button" className="secondary-action" style={{ padding: '8px 14px' }} onClick={onClose} disabled={submitting}>
              {t('Cancel')}
            </button>
            <button type="submit" className="pay-action" style={{ padding: '8px 14px' }} disabled={submitting || !hasAdditions}>
              {submitting ? t('Adding...') : `${t('Add to Order')}${hasAdditions ? ` (${additionsCount})` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const qtyBtnStyle = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: '1px solid #cbd5e0',
  background: 'white',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}