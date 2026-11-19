import React, { useEffect, useState, useRef } from 'react'
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../../api/endpoints'
import compressImage from '../../utils/compressImage'
import { usePreferences } from '../../context/PreferencesContext'

const emptyForm = {
  name: '',
  category: '',
  price: '',
  costPrice: '',
  unit: 'unit',
  minStockLevel: '0',
  imageUrl: '',
  quantity: '0',
}

export default function ManagerStockMenu() {
  const { t } = usePreferences()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const fileInputRef = useRef(null)
  const categories = [...new Map(
    products
      .map((product) => String(product.category || '').trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .map((category) => [category.toLocaleLowerCase(), category])
  ).values()]

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

  useEffect(() => {
    loadProducts()
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const category = form.category.trim().replace(/\s+/g, ' ')
    if (!category) {
      setError(t('Select an existing category or create a new one.'))
      return
    }
    setSaving(true); setError(null)
    try {
      const payload = {
        name: form.name,
        category,
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
      setForm({ ...emptyForm })
      setCreatingCategory(false)
      setEditingId(null)
      setImagePreview('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadProducts()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (product) => {
    setEditingId(product.id)
    setCreatingCategory(false)
    setForm({
      name: product.name,
      category: product.category || '',
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
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setCreatingCategory(false)
    setImagePreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressedImage = await compressImage(file)
      setForm((prev) => ({ ...prev, imageUrl: compressedImage }))
      setImagePreview(compressedImage)
      setError(null)
    } catch (uploadError) {
      setError(uploadError.message)
    }
  }

  const triggerImageUpload = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('Manager workspace')}</p>
          <h1 className="text-2xl font-black text-slate-900">{t('Stock menu')}</h1>
          <p className="text-sm text-slate-500">{t('Add, update, and manage menu items. Quantities update automatically when customers place orders.')}</p>
        </div>
        <button type="button" onClick={loadProducts} className="secondary-action" disabled={loading}>
          {loading ? t('Refreshing...') : t('Refresh')}
        </button>
      </div>

      {error && <div style={{ color: 'var(--danger-text)', background: 'var(--danger-bg)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)' }}>{error}</div>}

      <section className="user-section">
        <h2>{editingId ? t('Edit menu item') : t('Add menu item')}</h2>
        <form onSubmit={handleSubmit} className="create-user-form">
          <label>
            {t('Product name')}
            <input type="text" name="name" value={form.name} onChange={handleChange} required placeholder={t('e.g. Primus Beer 500ml')} />
          </label>
          <label>
            {t('Category')}
            {!creatingCategory ? (
              <select
                value={form.category}
                onChange={(e) => {
                  if (e.target.value === '__new_category__') {
                    setCreatingCategory(true)
                    setForm((prev) => ({ ...prev, category: '' }))
                  } else {
                    setForm((prev) => ({ ...prev, category: e.target.value }))
                  }
                }}
                required
              >
                <option value="">{t('Select a category')}</option>
                {categories.map((category) => <option key={category.toLocaleLowerCase()} value={category}>{category}</option>)}
                <option value="__new_category__">{t('+ Create a new category')}</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="text" name="category" value={form.category} onChange={handleChange} required autoFocus placeholder={t('New category name')} />
                <button type="button" className="secondary-action" onClick={() => { setCreatingCategory(false); setForm((prev) => ({ ...prev, category: '' })) }} style={{ margin: 0 }}>
                  {t('Choose existing')}
                </button>
              </div>
            )}
            <small style={{ color: 'var(--text-3)' }}>{t('Choose where this item belongs, or create a category for it.')}</small>
          </label>
          <label>
            {t('Price (RWF)')}
            <input type="number" name="price" value={form.price} onChange={handleChange} required min="0" step="1" />
          </label>
          <label>
            {t('Cost price (RWF)')}
            <input type="number" name="costPrice" value={form.costPrice} onChange={handleChange} min="0" step="1" />
          </label>
          <label>
            {t('Unit')}
            <input type="text" name="unit" value={form.unit} onChange={handleChange} placeholder={t('e.g. unit, kg, litre')} />
          </label>
          <label>
            {t('Quantity in stock')}
            <input type="number" name="quantity" value={form.quantity} onChange={handleChange} min="0" step="1" />
          </label>
          <label>
            {t('Min stock level')}
            <input type="number" name="minStockLevel" value={form.minStockLevel} onChange={handleChange} min="0" step="1" />
          </label>
          <label>
            {t('Image')}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              <button type="button" className="secondary-action" onClick={triggerImageUpload} style={{ margin: 0 }}>
                {t('Choose image')}
              </button>
              {form.imageUrl && (
                <button type="button" className="danger-action" onClick={() => { setForm((prev) => ({ ...prev, imageUrl: '' })); setImagePreview(''); if (fileInputRef.current) fileInputRef.current.value = '' }} style={{ margin: 0 }}>
                  {t('Remove')}
                </button>
              )}
            </div>
            {imagePreview && (
              <img
                src={imagePreview}
                alt={t('Preview')}
                style={{ marginTop: '0.5rem', width: '80px', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
              />
            )}
            <input
              type="text"
              name="imageUrl"
              value={form.imageUrl}
              onChange={handleChange}
              placeholder={t('Or paste image URL here...')}
              style={{ marginTop: '0.5rem' }}
            />
          </label>
          <div className="create-user-form-actions">
            {editingId && (
              <button type="button" className="secondary-action" onClick={cancelEdit} disabled={saving}>{t('Cancel')}</button>
            )}
            <button type="submit" className="pay-action" disabled={saving}>
              {saving ? t('Saving...') : editingId ? t('Update item') : t('Add item')}
            </button>
          </div>
        </form>
      </section>

      <section className="user-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{t('Menu items')}</h2>
          <button type="button" className="secondary-action" onClick={loadProducts} disabled={loading}>
            {loading ? t('Refreshing...') : t('Refresh')}
          </button>
        </div>

        {!products.length && !loading && (
          <p style={{ color: 'var(--text-3)' }}>{t('No menu items yet. Add your first item above.')}</p>
        )}

        <div className="stock-grid">
          {products.map((product) => (
            <div key={product.id} className={`stock-card${Number(product.quantity) <= Number(product.minStockLevel) ? ' out-of-stock' : ''}`}>
              {product.imageUrl && (
                <div className="product-image">
                  <img src={product.imageUrl} alt={product.name} onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.classList.add('image-error'); }} />
                </div>
              )}
              <div className="stock-info">
                <strong>{product.name}</strong>
                <span>{Number(product.price).toLocaleString()} {t('RWF')} {product.unit ? `/ ${product.unit}` : ''}</span>
                <span style={{ fontWeight: 700, color: Number(product.quantity) <= Number(product.minStockLevel) ? 'var(--danger-text)' : 'var(--text)' }}>
                  {t('Qty:')} {Number(product.quantity).toLocaleString()}
                </span>
                {Number(product.quantity) <= Number(product.minStockLevel) && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--danger-text)', fontWeight: 700 }}>{t('Low stock')}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button type="button" className="secondary-action" style={{ flex: 1, margin: 0, padding: '0.4rem', fontSize: '0.8rem' }} onClick={() => handleEdit(product)}>{t('Edit')}</button>
                <button type="button" className="danger-action" style={{ flex: 1, margin: 0, padding: '0.4rem', fontSize: '0.8rem' }} onClick={() => setDeletingId(product.id)}>{t('Delete')}</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {deletingId && (
        <div className="modal-backdrop" onClick={() => setDeletingId(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{t('Delete menu item')}</h2>
            <p>{t('Are you sure you want to remove this item from the menu? This action cannot be undone.')}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button type="button" className="secondary-action" onClick={() => setDeletingId(null)} disabled={saving}>{t('Cancel')}</button>
              <button type="button" className="danger-action" onClick={handleDelete} disabled={saving} style={{ color: 'var(--danger-text)', background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}>
                {saving ? t('Deleting...') : t('Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
