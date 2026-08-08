import React, { useEffect, useState, useRef } from 'react'
import { ArrowLeft, GlassWater } from 'lucide-react'
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../../api/endpoints'

const BAR_CATEGORIES = [
  'Beer', 'Wine', 'Spirits', 'Cocktails', 'Mocktails',
  'Soft Drinks', 'Juices', 'Water', 'Energy Drinks', 'Hot Beverages (Coffee & Tea)',
]

const emptyForm = {
  name: '', category: '', price: '', costPrice: '', unit: 'unit',
  minStockLevel: '0', imageUrl: '', quantity: '0',
}

export default function ManagerBarMenu() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const fileInputRef = useRef(null)

  const loadProducts = async () => {
    setLoading(true); setError(null)
    try {
      const data = await fetchProducts()
      setProducts(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProducts() }, [])

  const itemsInCategory = selectedCategory
    ? products.filter((p) => String(p.category || '').trim().toLowerCase() === String(selectedCategory).trim().toLowerCase())
    : []

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectCategory = (category) => {
    setSelectedCategory(category)
    setEditingId(null)
    setForm({ ...emptyForm, category })
    setImagePreview('')
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedCategory) {
      setError('Select a bar category first.')
      return
    }
    setSaving(true); setError(null)
    try {
      const payload = {
        name: form.name,
        category: selectedCategory,
        price: Number(form.price) || 0,
        costPrice: Number(form.costPrice) || 0,
        unit: form.unit || 'unit',
        minStockLevel: Number(form.minStockLevel) || 0,
        imageUrl: form.imageUrl,
        quantity: Number(form.quantity) || 0,
        isActive: true,
      }
      if (editingId) {
        await updateProduct(editingId, payload)
      } else {
        await createProduct(payload)
      }
      setForm({ ...emptyForm, category: selectedCategory })
      setEditingId(null)
      setImagePreview('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadProducts()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (product) => {
    setEditingId(product.id)
    setForm({
      name: product.name,
      category: product.category || selectedCategory || '',
      price: String(product.price ?? 0),
      costPrice: String(product.costPrice ?? 0),
      unit: product.unit || 'unit',
      minStockLevel: String(product.minStockLevel ?? 0),
      imageUrl: product.imageUrl || '',
      quantity: String(product.quantity ?? 0),
    })
    setImagePreview(product.imageUrl || '')
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setSaving(true); setError(null)
    try {
      await deleteProduct(deletingId)
      setDeletingId(null)
      await loadProducts()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const triggerImageUpload = () => fileInputRef.current?.click()

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.')
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result
      setForm((prev) => ({ ...prev, imageUrl: base64 }))
      setImagePreview(base64)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Manager workspace</p>
          <h1 className="text-2xl font-black text-slate-900">Bar menu</h1>
          <p className="text-sm text-slate-500">Select a bar category, then add the drinks menu items under it. Items appear instantly for waiters and QR menu customers.</p>
        </div>
        <button type="button" onClick={loadProducts} className="secondary-action" disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div style={{ color: 'var(--danger-text)', background: 'var(--danger-bg)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)' }}>{error}</div>}

      {!selectedCategory ? (
        <section className="user-section">
          <h2>Choose a bar category</h2>
          <p className="text-sm text-slate-500" style={{ marginBottom: '1rem' }}>Click a category to add or manage the drinks that belong to it.</p>
          <div className="stock-grid">
            {BAR_CATEGORIES.map((category) => {
              const count = products.filter((p) => String(p.category || '').trim().toLowerCase() === String(category).trim().toLowerCase()).length
              return (
                <button key={category} type="button" onClick={() => handleSelectCategory(category)} className="stock-card"
                  style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <GlassWater size={18} />
                    <strong>{category}</strong>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>{count} item{count === 1 ? '' : 's'}</span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {selectedCategory && (
        <>
          <button type="button" className="secondary-action"
            onClick={() => { setSelectedCategory(null); setEditingId(null); setForm({ ...emptyForm }); setImagePreview(''); setError(null) }}>
            <ArrowLeft size={16} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} /> Back to categories
          </button>

          <section className="user-section">
            <h2>{editingId ? 'Edit drink' : `Add drink to ${selectedCategory}`}</h2>
            <form onSubmit={handleSubmit} className="create-user-form">
              <label>
                Drink name
                <input type="text" name="name" value={form.name} onChange={handleChange} required placeholder="Drink name" />
              </label>
              <label>
                Category
                <input type="text" value={selectedCategory} disabled />
              </label>
              <label>
                Price (RWF)
                <input type="number" name="price" value={form.price} onChange={handleChange} required min="0" step="1" />
              </label>
              <label>
                Cost price (RWF)
                <input type="number" name="costPrice" value={form.costPrice} onChange={handleChange} min="0" step="1" />
              </label>
              <label>
                Unit
                <input type="text" name="unit" value={form.unit} onChange={handleChange} placeholder="e.g. unit, bottle, litre" />
              </label>
              <label>
                Quantity in stock
                <input type="number" name="quantity" value={form.quantity} onChange={handleChange} min="0" step="1" />
              </label>
              <label>
                Min stock level
                <input type="number" name="minStockLevel" value={form.minStockLevel} onChange={handleChange} min="0" step="1" />
              </label>
              <label>
                Image
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                  <button type="button" className="secondary-action" onClick={triggerImageUpload} style={{ margin: 0 }}>Choose image</button>
                  {form.imageUrl && (
                    <button type="button" className="danger-action" onClick={() => { setForm((prev) => ({ ...prev, imageUrl: '' })); setImagePreview(''); if (fileInputRef.current) fileInputRef.current.value = '' }} style={{ margin: 0 }}>Remove</button>
                  )}
                </div>
                {imagePreview && (
                  <img src={imagePreview} alt="Preview" style={{ marginTop: '0.5rem', width: '80px', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                )}
                <input type="text" name="imageUrl" value={form.imageUrl} onChange={handleChange} placeholder="Or paste image URL here..." style={{ marginTop: '0.5rem' }} />
              </label>
              <div className="create-user-form-actions">
                {editingId && (
                  <button type="button" className="secondary-action" onClick={() => { setEditingId(null); setForm({ ...emptyForm, category: selectedCategory }); setImagePreview('') }} disabled={saving}>Cancel</button>
                )}
                <button type="submit" className="pay-action" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update drink' : 'Add drink'}
                </button>
              </div>
            </form>
          </section>

          <section className="user-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>Drinks in {selectedCategory}</h2>
              <button type="button" className="secondary-action" onClick={loadProducts} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {!itemsInCategory.length && !loading && (
              <p style={{ color: 'var(--text-3)' }}>No drinks in this category yet. Add your first drink above.</p>
            )}

            <div className="stock-grid">
              {itemsInCategory.map((product) => (
                <div key={product.id} className={`stock-card${Number(product.quantity) <= Number(product.minStockLevel) ? ' out-of-stock' : ''}`}>
                  {product.imageUrl && (
                    <div className="product-image">
                      <img src={product.imageUrl} alt={product.name} onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.classList.add('image-error'); }} />
                    </div>
                  )}
                  <div className="stock-info">
                    <strong>{product.name}</strong>
                    <span>{Number(product.price).toLocaleString()} RWF {product.unit ? `/ ${product.unit}` : ''}</span>
                    <span style={{ fontWeight: 700, color: Number(product.quantity) <= Number(product.minStockLevel) ? 'var(--danger-text)' : 'var(--text)' }}>
                      Qty: {Number(product.quantity).toLocaleString()}
                    </span>
                    {Number(product.quantity) <= Number(product.minStockLevel) && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--danger-text)', fontWeight: 700 }}>Low stock</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" className="secondary-action" style={{ flex: 1, margin: 0, padding: '0.4rem', fontSize: '0.8rem' }} onClick={() => handleEdit(product)}>Edit</button>
                    <button type="button" className="danger-action" style={{ flex: 1, margin: 0, padding: '0.4rem', fontSize: '0.8rem' }} onClick={() => setDeletingId(product.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {deletingId && (
        <div className="modal-backdrop" onClick={() => setDeletingId(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Delete menu item</h2>
            <p>Are you sure you want to remove this drink from the menu? This action cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button type="button" className="secondary-action" onClick={() => setDeletingId(null)} disabled={saving}>Cancel</button>
              <button type="button" className="danger-action" onClick={handleDelete} disabled={saving} style={{ color: 'var(--danger-text)', background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}>
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
