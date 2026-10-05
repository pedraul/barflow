import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Search, ShoppingCart, Plus, Minus, Trash2, CheckCircle2, UtensilsCrossed, ArrowLeft } from 'lucide-react'
import { useCustomer } from '../../context/CustomerContext'

const money = (value) => `${Number(value || 0).toLocaleString('en-RW')} RWF`

const BAR_CATEGORIES = ['Beer', 'Wine', 'Spirits', 'Cocktails', 'Mocktails', 'Soft Drinks', 'Juices', 'Water', 'Energy Drinks', 'Tea and Coffee']
const FOOD_CATEGORIES = ['Appetizers', 'Snacks', 'BBQ & Grills', 'Chicken Dishes', 'Beef Dishes', 'Pork Dishes', 'Fish & Seafood', 'Burgers', 'Pizza', 'Sandwiches', 'Fries & Chips', 'Main Meals', 'Local Dishes', 'Salads', 'Desserts']


export default function MenuPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { menu, menuLoading, menuError, loadMenu, addToCart, cart, updateQuantity, removeFromCart, getCartTotal, getCartCount, tableNumber, currentOrder, setCurrentOrder, setDeferredOrder, resetSession } = useCustomer()
  const [selectedSection, setSelectedSection] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [search, setSearch] = useState('')

  const isFreshScan = !!searchParams.get('table')
  const businessId = searchParams.get('businessId') || undefined

  useEffect(() => {
    if (isFreshScan && currentOrder) {
      setCurrentOrder(null)
      setDeferredOrder(null)
    }
  }, [isFreshScan, currentOrder, setCurrentOrder, setDeferredOrder])

  useEffect(() => { loadMenu(searchParams.get('table') || '1', businessId) }, [searchParams, loadMenu, businessId])
  useEffect(() => { if (currentOrder && !isFreshScan) navigate('/payment') }, [currentOrder, navigate, isFreshScan])
  useEffect(() => {
    const categoryParam = searchParams.get('category')
    if (categoryParam) setSelectedCategory(categoryParam)
  }, [searchParams])

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
    const itemsByCat = new Map(categories.map((group) => [group.name.toLowerCase().trim(), group.items || []]))
    return BAR_CATEGORIES.map((cat) => ({ name: cat, items: itemsByCat.get(cat.toLowerCase().trim()) || [] }))
  }, [selectedSection, categories])

  const foodCategories = useMemo(() => {
    if (!selectedSection || selectedSection !== 'food') return []
    const itemsByCat = new Map(categories.map((group) => [group.name.toLowerCase().trim(), group.items || []]))
    return FOOD_CATEGORIES.map((cat) => ({ name: cat, items: itemsByCat.get(cat.toLowerCase().trim()) || [] }))
  }, [selectedSection, categories])

  const cartItem = (id) => cart.find((item) => item.productId === id)

  if (menuLoading) return <div className="min-h-screen grid place-items-center text-slate-600">Loading menu…</div>
  if (menuError) return <div className="min-h-screen grid place-items-center text-red-600">Unable to load the menu. <button className="underline" onClick={() => loadMenu()}>Try again</button></div>

  return <div className="min-h-screen bg-white text-slate-900">
    <header className="h-[90px] px-6 md:px-10 border-b border-slate-200 flex items-center gap-6 sticky top-0 bg-white z-20">
      <div className="flex items-center gap-3 min-w-max"><UtensilsCrossed className="text-amber-500" size={38} /><div><h1 className="font-extrabold tracking-wide text-xl">{menu?.businessName || 'BARFLOW'}</h1><p className="text-[10px] tracking-[.25em] text-slate-500">RESTAURANT & BAR</p></div></div>
      <div className="hidden md:flex flex-1 max-w-md ml-auto relative"><Search className="absolute left-4 top-3 text-slate-400" size={20} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for food or drinks..." className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 outline-none focus:border-amber-500" /></div>
      <button onClick={() => navigate('/cart')} className="ml-auto md:ml-0 relative rounded-xl bg-slate-950 text-white px-5 py-3 flex gap-2 items-center font-semibold"><ShoppingCart size={19} /> View cart {getCartCount() > 0 && <span className="rounded-full bg-emerald-500 w-5 h-5 grid place-items-center text-xs">{getCartCount()}</span>}</button>
    </header>

    <main className="grid grid-cols-1 lg:grid-cols-[1fr_350px] min-h-[calc(100vh-90px)]">
      {selectedCategory ? (
        <section className="p-5">
          <button onClick={() => setSelectedCategory(null)} className="inline-flex items-center gap-3 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-base hover:bg-slate-800 transition shadow-md mb-4">
            <ArrowLeft size={22} /> Back to categories
          </button>
          <h2 className="text-2xl font-extrabold">{selectedCategory}</h2>
          <p className="text-slate-500 text-sm mt-1">Choose your favorite from our menu</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mt-4">
            {categoryItems.map((item) => {
              const inCart = cartItem(item.id)
              const soldOut = Number(item.quantity) <= 0
              return (
                  <article key={item.id} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white w-full">
                  <div className="relative h-44 bg-slate-100 flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 grid place-items-center text-slate-400"><UtensilsCrossed size={30} /><span className="text-xs mt-1">No image</span></div>
                    {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="relative z-10 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                  </div>
                    <div className="p-2.5">
                      <h3 className="font-bold text-sm text-slate-900 leading-tight line-clamp-1">{item.name}</h3>
                      <p className="font-bold text-sm mt-1 text-slate-900">{money(item.price)}</p>
                      <button disabled={soldOut} onClick={() => addToCart(item)} className="mt-2 w-full border border-slate-300 rounded-md py-1.5 flex justify-between px-2 font-semibold text-xs hover:border-amber-500 disabled:opacity-50">
                        {soldOut ? 'Sold out' : 'Add'} <Plus className="rounded bg-amber-600 text-white p-0.5" size={16} />
                      </button>
                      {inCart && (
                        <div className="mt-2 flex items-center justify-between border border-slate-200 rounded-md px-2 py-1">
                          <button onClick={() => updateQuantity(item.id, inCart.quantity - 1)} className="text-slate-600 hover:text-red-600 font-bold text-sm leading-none">−</button>
                          <span className="text-xs font-semibold">{inCart.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, inCart.quantity + 1)} className="text-slate-600 hover:text-emerald-700 font-bold text-sm leading-none">+</button>
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
          <h2 className="text-3xl font-extrabold mb-2">Menu</h2>
          <p className="text-slate-500 mt-1">Choose a menu section, then pick a category</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
            <button onClick={() => setSelectedSection('bar')} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white text-left hover:border-amber-500 hover:shadow-md transition">
              <img src="/drinks.webp" alt="" className="h-48 w-full object-cover" />
              <div className="p-6">
                <div className="text-2xl font-black text-slate-900">Bar menu</div>
                <div className="text-sm text-slate-500 mt-1">Beer, Wine, Spirits, Cocktails, Soft Drinks, Juices, Water, Energy Drinks, Tea and Coffee</div>
              </div>
            </button>
            <button onClick={() => setSelectedSection('food')} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white text-left hover:border-amber-500 hover:shadow-md transition">
              <img src="/food.webp" alt="" className="h-48 w-full object-cover" />
              <div className="p-6">
                <div className="text-2xl font-black text-slate-900">Food menu</div>
                <div className="text-sm text-slate-500 mt-1">Appetizers, Snacks, BBQ & Grills, Chicken, Beef, Pork, Fish & Seafood, Burgers, Pizza, Sandwiches, Fries, Main Meals, Local Dishes, Salads, Desserts</div>
              </div>
            </button>
          </div>
        </section>
      ) : (
        <section className="p-7">
          <button onClick={() => setSelectedSection(null)} className="inline-flex items-center gap-3 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-base hover:bg-slate-800 transition shadow-md mb-4">
            <ArrowLeft size={22} /> Back to menu sections
          </button>
          <h2 className="text-3xl font-extrabold mb-2">{selectedSection === 'bar' ? 'Bar menu' : 'Food menu'} — Categories</h2>
          <p className="text-slate-500 mt-1">Select a category to browse items</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-5">
            {(selectedSection === 'bar' ? barCategories : foodCategories).map((group) => (
              <button key={group.name} onClick={() => setSelectedCategory(group.name)} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white text-left hover:border-amber-500 hover:shadow-md transition">
                <img
                  src={group.items?.find((item) => item.imageUrl)?.imageUrl || (selectedSection === 'bar' ? '/drinks.webp' : '/food.webp')}
                  alt=""
                  className="h-28 w-full object-cover"
                />
                <div className="p-4">
                  <div className="text-xl font-bold text-slate-900">{group.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{group.items?.length || 0} items</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {search && (
        <section className="p-5 border-t lg:border-t-0 lg:border-l border-slate-200">
          <h2 className="text-xl font-extrabold mb-3">Search Results</h2>
          {searchItems.length === 0 ? (
            <p className="text-slate-500">No items found matching "{search}"</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {searchItems.map((item) => {
                const inCart = cartItem(item.id)
                const soldOut = Number(item.quantity) <= 0
                return (
                <article key={item.id} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white w-full">
                  <div className="relative h-44 bg-slate-100 flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 grid place-items-center text-slate-400"><UtensilsCrossed size={30} /><span className="text-xs mt-1">No image</span></div>
                    {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="relative z-10 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                  </div>
                    <div className="p-2.5">
                      <h3 className="font-bold text-sm text-slate-900 leading-tight line-clamp-1">{item.name}</h3>
                      <p className="font-bold text-sm mt-1 text-slate-900">{money(item.price)}</p>
                      <button disabled={soldOut} onClick={() => addToCart(item)} className="mt-2 w-full border border-slate-300 rounded-md py-1.5 flex justify-between px-2 font-semibold text-xs hover:border-amber-500 disabled:opacity-50">
                        {soldOut ? 'Sold out' : 'Add'} <Plus className="rounded bg-amber-600 text-white p-0.5" size={16} />
                      </button>
                      {inCart && (
                        <div className="mt-2 flex items-center justify-between border border-slate-200 rounded-md px-2 py-1">
                          <button onClick={() => updateQuantity(item.id, inCart.quantity - 1)} className="text-slate-600 hover:text-red-600 font-bold text-sm leading-none">−</button>
                          <span className="text-xs font-semibold">{inCart.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, inCart.quantity + 1)} className="text-slate-600 hover:text-emerald-700 font-bold text-sm leading-none">+</button>
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

      <aside className="border-l border-slate-200 p-4 bg-white">
        <div className="flex justify-between border-b pb-4">
          <h2 className="font-bold text-lg">Your Order ({getCartCount()})</h2>
          {cart.length > 0 && <button onClick={() => cart.forEach((item) => removeFromCart(item.productId))} className="text-red-600 text-sm">Clear All</button>}
        </div>
        {cart.length === 0 ? <p className="text-slate-500 text-center py-12">Your order is empty.</p> : (
          <>
            <div className="divide-y">
              {cart.map((item) => (
                  <div key={item.productId} className="py-4 flex gap-3">
                    <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">{item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />}</div>
                    <div className="flex-1">
                    <div className="flex justify-between font-semibold">
                      <span>{item.name}</span>
                      <button onClick={() => removeFromCart(item.productId)}><Trash2 size={16} className="text-slate-400" /></button>
                    </div>
                    <p className="text-sm text-slate-600">{money(item.price)}</p>
                    <div className="mt-2 flex justify-between items-center">
                      <span className="border rounded flex items-center gap-3 px-2">
                        <button onClick={() => updateQuantity(item.productId, item.quantity - 1)}><Minus size={14} /></button>
                        {item.quantity}
                        <button onClick={() => updateQuantity(item.productId, item.quantity + 1)}><Plus size={14} /></button>
                      </span>
                      <strong>{money(item.price * item.quantity)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t pt-4 mt-3 space-y-2">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{money(getCartTotal())}</span></div>
              <div className="flex justify-between text-xl font-extrabold pt-2"><span>Total</span><span className="text-amber-600">{money(getCartTotal())}</span></div>
              <button onClick={() => navigate('/cart')} className="w-full mt-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg py-3 font-bold">View Cart & Checkout</button>
            </div>
          </>
        )}
      </aside>
    </main>
  </div>
}
