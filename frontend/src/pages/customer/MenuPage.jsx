import { usePreferences } from '../../context/PreferencesContext'
import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Search, ShoppingCart, Plus, Minus, Trash2, CheckCircle2, UtensilsCrossed, ArrowLeft, ClipboardList } from 'lucide-react'
import { useCustomer } from '../../context/CustomerContext'
import useMyCustomerOrders from '../../hooks/useMyCustomerOrders'

const money = (value) => `${Number(value || 0).toLocaleString('en-RW')} RWF`

const BAR_KEYWORDS = ['beer', 'wine', 'spirits', 'cocktails', 'mocktails', 'soft drinks', 'juices', 'water', 'energy drinks', 'tea and coffee', 'coffee', 'tea']

function isBarCategory(name) {
  const lower = String(name || '').toLowerCase().trim()
  return BAR_KEYWORDS.some((kw) => lower === kw || lower.startsWith(kw))
}


export default function MenuPage() {
  const { t } = usePreferences()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { menu, menuLoading, menuError, loadMenu, addToCart, cart, updateQuantity, removeFromCart, getCartTotal, getCartCount, tableNumber, currentOrder, setCurrentOrder, setDeferredOrder, resetSession, businessId: ctxBusinessId } = useCustomer()
  const [selectedSection, setSelectedSection] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [search, setSearch] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [cartNotice, setCartNotice] = useState('')

  const isFreshScan = !!searchParams.get('table')
  const businessId = searchParams.get('businessId') || undefined
  const branchId = searchParams.get('branchId') || undefined

  useEffect(() => {
    if (isFreshScan && currentOrder) {
      setCurrentOrder(null)
      setDeferredOrder(null)
    }
  }, [isFreshScan, currentOrder, setCurrentOrder, setDeferredOrder])

  useEffect(() => { loadMenu(searchParams.get('table') || '1', businessId, branchId) }, [searchParams, loadMenu, businessId, branchId])
  // Only this customer's own (device-tracked) unpaid orders — not the whole table's.
  const { orders: activeOrders, loaded: myOrdersLoaded } = useMyCustomerOrders(businessId || ctxBusinessId)
  const browsing = searchParams.get('browse') === '1'
  const myOrdersUrl = (() => {
    const params = new URLSearchParams(searchParams)
    params.delete('browse')
    return `/my-orders?${params.toString()}`
  })()

  // Re-scanning the QR with unpaid orders lands on the order status page first.
  useEffect(() => {
    if (isFreshScan && !browsing && myOrdersLoaded && activeOrders.length > 0) {
      navigate(myOrdersUrl, { replace: true })
    }
  }, [isFreshScan, browsing, myOrdersLoaded, activeOrders.length, navigate, myOrdersUrl])
  useEffect(() => { if (currentOrder && !isFreshScan) navigate('/payment') }, [currentOrder, navigate, isFreshScan])
  useEffect(() => {
    const categoryParam = searchParams.get('category')
    if (categoryParam) setSelectedCategory(categoryParam)
  }, [searchParams])

  useEffect(() => {
    if (!cartNotice) return undefined
    const timeout = window.setTimeout(() => setCartNotice(''), 2200)
    return () => window.clearTimeout(timeout)
  }, [cartNotice])

  const categories = useMemo(() => menu?.categories || [], [menu])
  const allItems = useMemo(() => categories.flatMap((group) => group.items.map((item) => ({ ...item, category: group.name }))), [categories])

  const categoryItems = useMemo(() => {
    if (!selectedCategory) return []
    return allItems.filter((item) => item.category === selectedCategory)
  }, [allItems, selectedCategory])

  const searchItems = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return []
    return allItems.filter((item) => item.name.toLowerCase().includes(q))
  }, [allItems, search])

  const barCategories = useMemo(() => {
    if (!selectedSection || selectedSection !== 'bar') return []
    return categories
      .filter((group) => isBarCategory(group.name))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [selectedSection, categories])

  const foodCategories = useMemo(() => {
    if (!selectedSection || selectedSection !== 'food') return []
    return categories
      .filter((group) => !isBarCategory(group.name))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [selectedSection, categories])

  const cartItem = (id) => cart.find((item) => item.productId === id)
  const addMenuItem = (item) => {
    const existing = cartItem(item.id)
    if (existing && existing.quantity >= Number(item.quantity)) {
      setCartNotice(t("No more") + " " + item.name + " " + t("available"))
      return
    }
    addToCart(item)
    setCartNotice(item.name + " " + t("added to cart"))
  }

  if (menuLoading) return <div className="min-h-screen grid place-items-center text-slate-600">{t("Loading menu…")}</div>
  if (menuError) return <div className="min-h-screen grid place-items-center text-red-600">{t("Unable to load the menu.")}{' '}<button className="underline" onClick={() => loadMenu()}>{t("Try again")}</button></div>

  return <div className="customer-storefront min-h-screen text-slate-900">
    {cartNotice && <div role="status" aria-live="polite" className="customer-cart-toast"><CheckCircle2 size={19} />{cartNotice}</div>}
    <header className="customer-menu-header customer-store-header sticky top-0 z-30 flex items-center gap-4 border-b border-slate-200 bg-white px-5 py-3 md:px-8">
      <div className="customer-menu-brand flex shrink-0 items-center gap-3"><UtensilsCrossed className="text-orange-600" size={34} /><div><h1 className="font-extrabold tracking-tight text-xl">{menu?.businessName || t("BARFLOW")}</h1><p className="text-[10px] font-semibold tracking-[.2em] text-slate-500">{t("RESTAURANT & BAR")}</p></div></div>
      {isFreshScan && <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 sm:inline-flex">{t("Table")}{' '}{tableNumber}</span>}
      <div className="customer-store-search relative ml-auto flex min-w-0 flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={19} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search the menu")} aria-label={t("Search the menu")} className="w-full rounded-l-lg border border-slate-400 bg-white py-3 pl-10 pr-3 outline-none focus:border-slate-700" />
        <button type="button" aria-label={t("Search menu")} className="rounded-r-lg bg-slate-800 px-4 text-white hover:bg-slate-700"><Search size={19} /></button>
      </div>
      {activeOrders.length > 0 && (
        <button type="button" onClick={() => navigate(myOrdersUrl)} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-semibold text-slate-800 hover:bg-slate-100">
          <ClipboardList size={22} /> <span className="hidden sm:inline">{t("My orders")}</span>
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-emerald-600 px-1 text-xs text-white">{activeOrders.length}</span>
        </button>
      )}
      <button type="button" onClick={() => setCartOpen((open) => !open)} aria-expanded={cartOpen} aria-controls="customer-cart-panel" className="relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-semibold text-slate-800 hover:bg-slate-100"><ShoppingCart size={22} /> <span>{t("My Cart")}</span><span className="grid h-5 min-w-5 place-items-center rounded-full bg-orange-600 px-1 text-xs text-white">{getCartCount()}</span></button>
    </header>

    {activeOrders.length > 0 && (
      <section className="border-b border-amber-200 bg-amber-50 px-5 py-4 md:px-10" aria-live="polite">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-slate-900">{t("Your active orders")}</h2>
            <button type="button" onClick={() => navigate(myOrdersUrl)} className="text-sm font-semibold text-amber-800 underline">{t("Track my orders")}</button>
          </div>
          <div className="mt-3 space-y-3">
            {activeOrders.map((order) => {
              const served = String(order.status || '').toLowerCase() === 'served'
              return (
                <div key={order.orderId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-4">
                  <div>
                    <p className="font-semibold text-slate-900">{t("Order")}{' '}{order.orderNumber}{' '}{t("· Table")}{' '}{order.tableNumber}</p>
                    <p className="mt-1 text-sm text-slate-600">{(order.items || []).map((item) => `${item.name} ×${item.quantity}`).join(', ')}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{money(order.total)} · <span className={served ? 'text-emerald-700' : 'text-amber-700'}>{order.status}</span></p>
                  </div>
                  {served && (
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-800"
                      onClick={() => navigate('/payment', {
                        state: {
                          order,
                          returnTo: `${window.location.pathname}${window.location.search}`,
                        },
                      })}
                    >{t("Pay")}</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>
    )}

    {cartOpen && <section id="customer-cart-panel" className="customer-cart-panel w-full border-b border-slate-200 px-4 py-4 md:px-8" aria-label={t("Your cart")}>
      <div className="mx-auto w-full max-w-screen-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-extrabold"><ShoppingCart size={21} />{' '}{t("My Cart")}{' '}<span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm text-amber-800">{getCartCount()}</span></h2>
            <p className="mt-1 text-sm text-slate-600">{t("Your selected items stay here while you browse.")}</p>
          </div>
          <div className="flex items-center gap-3">
            {cart.length > 0 && <button type="button" onClick={() => cart.forEach((item) => removeFromCart(item.productId))} className="text-sm font-semibold text-slate-500 hover:text-red-600">{t("Clear cart")}</button>}
            <strong className="text-lg">{money(getCartTotal())}</strong>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => navigate('/cart')}
              className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3 font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >{t("Continue")}</button>
          </div>
        </div>
        {cart.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">{t("Your cart is empty. Add items from the menu below.")}</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {cart.map((item) => (
              <div key={item.productId} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-12 w-12 rounded-md object-cover" /> : <div className="grid h-12 w-12 place-items-center rounded-md bg-slate-100"><UtensilsCrossed size={18} className="text-slate-400" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.name}</p>
                  <p className="text-sm text-slate-500">{money(item.price * item.quantity)}</p>
                </div>
                <div className="flex items-center gap-2 rounded-md border px-2 py-1">
                  <button type="button" aria-label={`${t('Remove one')} ${item.name}`} onClick={() => updateQuantity(item.productId, item.quantity - 1)}><Minus size={14} /></button>
                  <span className="min-w-4 text-center text-sm font-semibold">{item.quantity}</span>
                  <button type="button" aria-label={`${t('Add one')} ${item.name}`} onClick={() => updateQuantity(item.productId, item.quantity + 1)}><Plus size={14} /></button>
                </div>
                <button type="button" aria-label={`${t('Remove')} ${item.name}`} onClick={() => removeFromCart(item.productId)}><Trash2 size={16} className="text-slate-400 hover:text-red-600" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>}

    <main className="customer-store-main w-full min-h-[calc(100vh-180px)]">
      {search ? null : selectedCategory ? (
        <section className="customer-product-section p-5 md:p-8">
          <button onClick={() => setSelectedCategory(null)} className="inline-flex items-center gap-3 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-base hover:bg-slate-800 transition shadow-md mb-4">
            <ArrowLeft size={22} />{t("Back to categories")}</button>
          <h2 className="text-2xl font-extrabold">{selectedCategory}</h2>
          <p className="text-slate-500 text-sm mt-1">{t("Choose your favorite from our menu")}</p>
          <div className="customer-product-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4 mt-4">
            {categoryItems.map((item) => {
              const inCart = cartItem(item.id)
              const soldOut = Number(item.quantity) <= 0
              return (
                  <article key={item.id} className="customer-product-card overflow-hidden border border-slate-200 rounded-xl bg-white w-full">
                  <div className="customer-product-image relative h-40 sm:h-52 bg-slate-100 flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 grid place-items-center text-slate-400"><UtensilsCrossed size={24} /><span className="text-[10px] mt-1">{t("No image")}</span></div>
                    {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="relative z-10 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                  </div>
                    <div className="p-2 sm:p-2.5">
                      <h3 className="font-bold text-[11px] sm:text-sm text-slate-900 leading-tight line-clamp-1">{item.name}</h3>
                      <p className="font-bold text-xs sm:text-sm mt-0.5 text-slate-900">{money(item.price)}</p>
                      <button disabled={soldOut} onClick={() => addMenuItem(item)} className="mt-1.5 w-full border border-slate-300 rounded-md py-1 flex justify-between px-1.5 font-semibold text-[11px] hover:border-amber-500 disabled:opacity-50">
                        {soldOut ? t("Sold out") : t("Add")} <Plus className="rounded bg-amber-600 text-white p-0.5" size={14} />
                      </button>
                      {inCart && (
                        <div className="mt-1.5 flex items-center justify-between border border-slate-200 rounded-md px-1.5 py-0.5">
                          <button aria-label={t('Decrease quantity')} onClick={() => updateQuantity(item.id, inCart.quantity - 1)} className="text-slate-600 hover:text-red-600 font-bold text-xs leading-none">−</button>
                          <span className="text-[11px] font-semibold">{inCart.quantity}</span>
                          <button aria-label={t('Increase quantity')} onClick={() => updateQuantity(item.id, inCart.quantity + 1)} className="text-slate-600 hover:text-emerald-700 font-bold text-xs leading-none">+</button>
                        </div>
                      )}
                    </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : !selectedSection ? (
        <section className="p-7">
          <h2 className="text-3xl font-extrabold mb-2">{t("Menu")}</h2>
          <p className="text-slate-500 mt-1">{t("Choose a menu section, then pick a category")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
            <button onClick={() => setSelectedSection('bar')} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white text-left hover:border-amber-500 hover:shadow-md transition">
              <img src="/drinks.webp" alt="" className="h-48 w-full object-cover" />
              <div className="p-6">
                <div className="text-2xl font-black text-slate-900">{t("Bar menu")}</div>
                <div className="text-sm text-slate-500 mt-1">{t("Beer, Wine, Spirits, Cocktails, Soft Drinks, Juices, Water, Energy Drinks, Tea and Coffee")}</div>
              </div>
            </button>
            <button onClick={() => setSelectedSection('food')} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white text-left hover:border-amber-500 hover:shadow-md transition">
              <img src="/food.webp" alt="" className="h-48 w-full object-cover" />
              <div className="p-6">
                <div className="text-2xl font-black text-slate-900">{t("Food menu")}</div>
                <div className="text-sm text-slate-500 mt-1">{t("Appetizers, Snacks, BBQ & Grills, Chicken, Beef, Pork, Fish & Seafood, Burgers, Pizza, Sandwiches, Fries, Main Meals, Local Dishes, Salads, Desserts")}</div>
              </div>
            </button>
          </div>
        </section>
      ) : (
        <section className="p-7">
          <button onClick={() => setSelectedSection(null)} className="inline-flex items-center gap-3 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-base hover:bg-slate-800 transition shadow-md mb-4">
            <ArrowLeft size={22} />{t("Back to menu sections")}</button>
          <h2 className="text-3xl font-extrabold mb-2">{selectedSection === 'bar' ? t("Bar menu") : t("Food menu")}{' '}{t("— Categories")}</h2>
          <p className="text-slate-500 mt-1">{t("Select a category to browse items")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 mt-5">
            {(selectedSection === 'bar' ? barCategories : foodCategories).map((group) => (
              <button key={group.name} onClick={() => setSelectedCategory(group.name)} className="customer-category-card overflow-hidden border border-slate-200 rounded-xl bg-white text-left transition">
                <img
                  src={group.items?.find((item) => item.imageUrl)?.imageUrl || (selectedSection === 'bar' ? '/drinks.webp' : '/food.webp')}
                  alt=""
                  className="h-28 w-full object-cover"
                />
                <div className="p-4">
                  <div className="text-xl font-bold text-slate-900">{group.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{group.items?.length || 0}{' '}{t("items")}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {search && (
        <section className="w-full p-5 border-t border-slate-200">
          <h2 className="text-xl font-extrabold mb-3">{t("Search Results")}</h2>
          {searchItems.length === 0 ? (
            <p className="text-slate-500">{t("No items found matching \"")}{search}"</p>
          ) : (
            <div className="customer-product-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
              {searchItems.map((item) => {
                const inCart = cartItem(item.id)
                const soldOut = Number(item.quantity) <= 0
                return (
                <article key={item.id} className="customer-product-card overflow-hidden border border-slate-200 rounded-xl bg-white w-full">
                  <div className="customer-product-image relative h-40 sm:h-52 bg-slate-100 flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 grid place-items-center text-slate-400"><UtensilsCrossed size={24} /><span className="text-[10px] mt-1">{t("No image")}</span></div>
                    {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="relative z-10 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                  </div>
                    <div className="p-2 sm:p-2.5">
                      <h3 className="font-bold text-[11px] sm:text-sm text-slate-900 leading-tight line-clamp-1">{item.name}</h3>
                      <p className="font-bold text-xs sm:text-sm mt-0.5 text-slate-900">{money(item.price)}</p>
                      <button disabled={soldOut} onClick={() => addMenuItem(item)} className="mt-1.5 w-full border border-slate-300 rounded-md py-1 flex justify-between px-1.5 font-semibold text-[11px] hover:border-amber-500 disabled:opacity-50">
                        {soldOut ? t("Sold out") : t("Add")} <Plus className="rounded bg-amber-600 text-white p-0.5" size={14} />
                      </button>
                      {inCart && (
                        <div className="mt-1.5 flex items-center justify-between border border-slate-200 rounded-md px-1.5 py-0.5">
                          <button aria-label={t('Decrease quantity')} onClick={() => updateQuantity(item.id, inCart.quantity - 1)} className="text-slate-600 hover:text-red-600 font-bold text-xs leading-none">−</button>
                          <span className="text-[11px] font-semibold">{inCart.quantity}</span>
                          <button aria-label={t('Increase quantity')} onClick={() => updateQuantity(item.id, inCart.quantity + 1)} className="text-slate-600 hover:text-emerald-700 font-bold text-xs leading-none">+</button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

    </main>
  </div>
}
