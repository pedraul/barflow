import { usePreferences } from '../../context/PreferencesContext'
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { fetchMenu } from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString('en-RW')} RWF`

// Bar/drinks categories and food/kitchen categories, matching the manager's
// Bar menu and Kitchen menu pages so the waiter can browse them by section.
const BAR_CATEGORIES = [
  'Beer', 'Wine', 'Spirits', 'Cocktails', 'Mocktails',
  'Soft Drinks', 'Juices', 'Water', 'Energy Drinks', 'Tea and Coffee',
]

const FOOD_CATEGORIES = [
  'Appetizers', 'Snacks', 'BBQ & Grills', 'Chicken Dishes', 'Beef Dishes',
  'Pork Dishes', 'Fish & Seafood', 'Burgers', 'Pizza', 'Sandwiches',
  'Fries & Chips', 'Main Meals', 'Local Dishes', 'Salads', 'Desserts',
]

export default function WaiterNewOrder() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [menu, setMenu] = useState(null)
  const [cart, setCart] = useState([])
  const [selectedSection, setSelectedSection] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [search, setSearch] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [cartNotice, setCartNotice] = useState('')

  useEffect(() => {
    if (!cartNotice) return undefined
    const timeout = window.setTimeout(() => setCartNotice(''), 2200)
    return () => window.clearTimeout(timeout)
  }, [cartNotice])

  useEffect(() => {
    const storedBiz = sessionStorage.getItem('waiter_business_id') || ''
    const currentBiz = user?.businessId ? String(user.businessId) : ''
    if (storedBiz && currentBiz && storedBiz !== currentBiz) {
      sessionStorage.removeItem('waiter_cart')
      sessionStorage.removeItem('waiter_table')
      sessionStorage.removeItem('waiter_business_id')
    }
    if (currentBiz) {
      sessionStorage.setItem('waiter_business_id', currentBiz)
    }
    fetchMenu('1', user?.businessId).then(setMenu).catch(() => setMenu({ categories: [] }))
  }, [user?.businessId])

  // Load existing cart from sessionStorage so items added from the cart
  // are combined with the previous order instead of creating a new one
  useEffect(() => {
    try {
      const storedCart = JSON.parse(sessionStorage.getItem('waiter_cart') || '[]')
      if (storedCart.length > 0) {
        setCart(storedCart)
      }
    } catch {
      // ignore
    }
  }, [])

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

  // Categories grouped by the two menu sections the waiter browses:
  // Bar menu (drinks) and Food menu (kitchen). Every category from the
  // manager's Bar/Kitchen menu lists is always shown (with its item count),
  // so the waiter sees the same category list the manager manages.
  const barCategories = useMemo(() => {
    if (!selectedSection || selectedSection !== 'bar') return []
    const itemsByCat = new Map(categories.map((group) => [group.name.toLowerCase().trim(), group.items || []]))
    return BAR_CATEGORIES.map((cat) => ({
      name: cat,
      items: itemsByCat.get(cat.toLowerCase().trim()) || [],
    }))
  }, [selectedSection, categories])

  const foodCategories = useMemo(() => {
    if (!selectedSection || selectedSection !== 'food') return []
    const itemsByCat = new Map(categories.map((group) => [group.name.toLowerCase().trim(), group.items || []]))
    return FOOD_CATEGORIES.map((cat) => ({
      name: cat,
      items: itemsByCat.get(cat.toLowerCase().trim()) || [],
    }))
  }, [selectedSection, categories])

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

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const count = cart.reduce((sum, item) => sum + item.quantity, 0)

  const add = (product) => {
    setCart((current) => {
      const found = current.find((item) => item.productId === product.id)
      if (found) return current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      return [...current, { productId: product.id, name: product.name, price: product.price, quantity: 1, imageUrl: product.imageUrl || '' }]
    })
    setCartNotice(product.name + " " + t("added to cart"))
  }
  const change = (id, delta) => setCart((current) => current.map((item) => item.productId === id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0))
  const proceed = () => {
    sessionStorage.setItem('waiter_cart', JSON.stringify(cart))
    // The waiter chooses the table (or Walk-in) on the cart page.
    navigate('/waiter/cart')
  }

  return <div className="page waiter-new-order bg-white min-h-screen">
    {cartNotice && <div role="status" aria-live="polite" className="customer-cart-toast">{cartNotice}</div>}
    <div className="p-6 lg:p-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold text-amber-600 uppercase tracking-wider">{t("Waiter workspace")}</p><h1 className="text-3xl font-extrabold text-slate-950">{t("New Order for Customer")}</h1><p className="text-slate-500 mt-1">{t("Build the customer's order and send it to the operator for routing.")}</p></div><button type="button" onClick={() => setCartOpen((open) => !open)} aria-expanded={cartOpen} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 font-bold text-white shadow-sm hover:bg-slate-700">{' '}{t("My Cart")}{' '}<span className="grid h-6 min-w-6 place-items-center rounded-full bg-orange-500 px-1 text-xs">{count}</span></button></div>
      <div className="waiter-order-layout min-h-[680px]">
        <section className="waiter-order-menu w-full rounded-xl border border-slate-200 bg-white p-5 md:p-7">
          {/* Search bar always visible */}
          <div className="flex justify-between gap-4 mb-5">
            <div className="relative w-full max-w-xl">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search menu...")} className="w-full border rounded-lg py-2 pl-3 pr-3"/>
            </div>
          </div>

          {/* If a category is selected, show items in that category */}
          {selectedCategory ? (
            <>
              <button onClick={() => { setSelectedCategory(null); setSearch('') }} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg font-bold text-sm hover:bg-slate-800 transition shadow-md mb-4">
                {t("Back to categories")}</button>
              <h2 className="text-2xl font-extrabold">{t(selectedCategory)}</h2>
              <p className="text-slate-500 text-sm mt-1">{t("Choose items to add to the customer's order")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mt-5">
                {(search ? searchItems : categoryItems).map((item) => {
                  const inCart = cart.find((cartItem) => cartItem.productId === item.id)
                  const soldOut = Number(item.quantity) <= 0
                  return (
                    <article key={item.id} className="waiter-market-card overflow-hidden border border-slate-200 rounded-xl bg-white">
                      <div className="relative h-44 bg-slate-100 overflow-hidden">
                        <div className="absolute inset-0 grid place-items-center text-slate-400"><span className="text-xs mt-1">{t("No image")}</span></div>
                        {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="relative z-10 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                      </div>
                      <div className="p-3">
                        <h3 className="font-bold text-base">{item.name}</h3>
                        <p className="font-bold text-base mt-1">{money(item.price)}</p>
                        <button disabled={soldOut} onClick={() => add(item)} className="mt-3 w-full border border-slate-300 rounded-lg py-1.5 flex justify-between px-3 font-semibold text-sm hover:border-amber-500 disabled:opacity-50">
                          {soldOut ? t("Sold out") : t("Add")} 
                        </button>
                        {inCart && <p className="text-xs text-emerald-600 mt-2 flex gap-1 items-center">{inCart.quantity}{' '}{t("in order")}</p>}
                      </div>
                    </article>
                  )
                })}
                {(search ? searchItems : categoryItems).length === 0 && (
                  <p className="col-span-full text-center text-slate-500 py-12">
                    {search ? `No items found matching "${search}"` : t("No items in this category.")}
                  </p>
                )}
              </div>
            </>
          ) : search ? (
            /* Search results view */
            <>
              <h2 className="text-2xl font-extrabold mb-4">{t("Search Results")}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mt-2">
                {searchItems.map((item) => {
                  const inCart = cart.find((cartItem) => cartItem.productId === item.id)
                  const soldOut = Number(item.quantity) <= 0
                  return (
                    <article key={item.id} className="waiter-market-card overflow-hidden border border-slate-200 rounded-xl bg-white">
                      <div className="relative h-44 bg-slate-100 overflow-hidden">
                        <div className="absolute inset-0 grid place-items-center text-slate-400"><span className="text-xs mt-1">{t("No image")}</span></div>
                        {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="relative z-10 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                      </div>
                      <div className="p-3">
                        <h3 className="font-bold text-base">{item.name}</h3>
                        <p className="font-bold text-base mt-1">{money(item.price)}</p>
                        <button disabled={soldOut} onClick={() => add(item)} className="mt-3 w-full border border-slate-300 rounded-lg py-1.5 flex justify-between px-3 font-semibold text-sm hover:border-amber-500 disabled:opacity-50">
                          {soldOut ? t("Sold out") : t("Add")} 
                        </button>
                        {inCart && <p className="text-xs text-emerald-600 mt-2 flex gap-1 items-center">{inCart.quantity}{' '}{t("in order")}</p>}
                      </div>
                    </article>
                  )
                })}
                {searchItems.length === 0 && (
                  <p className="col-span-full text-center text-slate-500 py-12">{t("No items found matching \"")}{search}"</p>
                )}
              </div>
            </>
          ) : !selectedSection ? (
            /* Menu sections view — Bar menu (drinks) and Food menu */
            <>
              <h2 className="text-2xl font-extrabold mb-1">{t("Menu")}</h2>
              <p className="text-slate-500 mb-5">{t("Choose the menu section, then select a category to browse items")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={() => { setSelectedSection('bar'); setSearch('') }} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white text-left hover:border-amber-500 hover:shadow-md transition">
                  <img src="/drinks.webp" alt="" className="h-48 w-full object-cover" />
                  <div className="p-6">
                    <div className="text-2xl font-black text-slate-900">{t("Bar menu")}</div>
                    <div className="text-sm text-slate-500 mt-1">{t("Beer, Wine, Spirits, Cocktails, Soft Drinks, Juices, Water, Energy Drinks, Tea and Coffee")}</div>
                  </div>
                </button>
                <button onClick={() => { setSelectedSection('food'); setSearch('') }} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white text-left hover:border-amber-500 hover:shadow-md transition">
                  <img src="/food.webp" alt="" className="h-48 w-full object-cover" />
                  <div className="p-6">
                    <div className="text-2xl font-black text-slate-900">{t("Food menu")}</div>
                    <div className="text-sm text-slate-500 mt-1">{t("Appetizers, Snacks, BBQ & Grills, Chicken, Beef, Pork, Fish & Seafood, Burgers, Pizza, Sandwiches, Fries, Main Meals, Local Dishes, Salads, Desserts")}</div>
                  </div>
                </button>
              </div>
            </>
          ) : (
            /* Categories of the selected section */
            <>
              <button onClick={() => { setSelectedSection(null); setSelectedCategory(null); setSearch('') }} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg font-bold text-sm hover:bg-slate-800 transition shadow-md mb-4">
                {t("Back to menu sections")}</button>
              <h2 className="text-2xl font-extrabold">{selectedSection === 'bar' ? t("Bar menu") : t("Food menu")}{' '}{t("— Categories")}</h2>
              <p className="text-slate-500 text-sm mt-1">{t("Select a category to browse items")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-5">
                {(selectedSection === 'bar' ? barCategories : foodCategories).map((group) => (
                  <button key={group.name} onClick={() => setSelectedCategory(group.name)} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white text-left hover:border-amber-500 hover:shadow-md transition">
                    <img
                      src={group.items?.find((item) => item.imageUrl)?.imageUrl || (selectedSection === 'bar' ? '/drinks.webp' : '/food.webp')}
                      alt=""
                      className="h-28 w-full object-cover"
                    />
                    <div className="p-4">
                      <div className="text-xl font-bold text-slate-900">{t(group.name)}</div>
                      <div className="text-xs text-slate-500 mt-1">{group.items?.length || 0}{' '}{t("items")}</div>
                    </div>
                  </button>
                ))}
                {(selectedSection === 'bar' ? barCategories : foodCategories).length === 0 && (
                  <p className="col-span-full text-center text-slate-500 py-12">{t("No categories in this section yet. The manager needs to add menu items first.")}</p>
                )}
              </div>
            </>
          )}
        </section>

        {cartOpen && <aside className="waiter-order-cart p-5 border border-slate-200 bg-white">
          <div className="flex justify-between border-b pb-4">
            <h2 className="font-bold text-lg">{t("Your Order (")}{count})</h2>
            <button onClick={() => setCart([])} className="text-red-600 text-sm">{t("Clear All")}</button>
          </div>
          {cart.length === 0 ? (
            <p className="text-center text-slate-500 py-10">{t("No items added yet.")}</p>
          ) : (
            <>
              <div className="divide-y">
                {cart.map((item) => (
                  <div key={item.productId} className="py-4 flex gap-2">
                    <div className="flex-1">
                      <strong>{item.name}</strong>
                      <p className="text-sm">{money(item.price)}</p>
                      <span className="border rounded inline-flex gap-3 items-center px-2 mt-2">
                        <button aria-label={t('Decrease quantity')} onClick={() => change(item.productId, -1)} className="px-1 font-bold">-</button>
                        {item.quantity}
                        <button aria-label={t('Increase quantity')} onClick={() => change(item.productId, 1)} className="px-1 font-bold">+</button>
                      </span>
                    </div>
                    <div className="text-right">
                      <button aria-label={t('Remove item')} onClick={() => change(item.productId, -item.quantity)} className="text-sm font-semibold text-red-600 hover:underline">{t('Remove')}</button>
                      <p className="font-bold mt-5">{money(item.price * item.quantity)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 mt-3">
                <div className="flex justify-between"><span>{t("Subtotal")}</span><span>{money(total)}</span></div>
                <div className="flex justify-between text-xl font-extrabold mt-3"><span>{t("Total")}</span><span className="text-amber-600">{money(total)}</span></div>
                <button disabled={!cart.length} onClick={proceed} className="w-full mt-5 bg-gradient-to-r from-amber-500 to-orange-600 text-white py-3 rounded-lg font-bold disabled:opacity-50 flex justify-center gap-2">
                  {t("View Cart & Place Order")}</button>
              </div>
            </>
          )}
        </aside>}
      </div>
      <p className="mt-4 text-sm text-slate-500">{t("Waiter:")}{' '}{user?.name || t("Waiter")}{' '}{t("· Orders are sent to the system operator, who routes food to the kitchen and drinks to the bar.")}</p>
    </div>
  </div>
}
