import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle2, ArrowLeft, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { fetchMenu } from '../../api/endpoints'

const money = (value) => `${Number(value || 0).toLocaleString('en-RW')} RWF`

// Bar/drinks categories and food/kitchen categories, matching the manager's
// Bar menu and Kitchen menu pages so the waiter can browse them by section.
const BAR_CATEGORIES = [
  'Beer', 'Wine', 'Spirits', 'Cocktails', 'Mocktails',
  'Soft Drinks', 'Juices', 'Water', 'Energy Drinks', 'Hot Beverages (Coffee & Tea)',
]

const FOOD_CATEGORIES = [
  'Appetizers', 'Snacks', 'BBQ & Grills', 'Chicken Dishes', 'Beef Dishes',
  'Pork Dishes', 'Fish & Seafood', 'Burgers', 'Pizza', 'Sandwiches',
  'Fries & Chips', 'Main Meals', 'Local Dishes', 'Salads', 'Desserts',
]

export default function WaiterNewOrder() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [menu, setMenu] = useState(null)
  const [cart, setCart] = useState([])
  const [selectedSection, setSelectedSection] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [search, setSearch] = useState('')

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

  const add = (product) => setCart((current) => {
    const found = current.find((item) => item.productId === product.id)
    if (found) return current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
    return [...current, { productId: product.id, name: product.name, price: product.price, quantity: 1, imageUrl: product.imageUrl || '' }]
  })
  const change = (id, delta) => setCart((current) => current.map((item) => item.productId === id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0))
  const proceed = () => {
    sessionStorage.setItem('waiter_cart', JSON.stringify(cart))
    if (!sessionStorage.getItem('waiter_table')) {
      sessionStorage.setItem('waiter_table', 'Walk-in customer')
    }
    navigate('/waiter/cart')
  }

  return <div className="page waiter-new-order bg-white min-h-screen">
    <div className="p-6 lg:p-8">
      <div className="mb-5 flex flex-wrap justify-between gap-5"><div><p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Waiter workspace</p><h1 className="text-3xl font-extrabold text-slate-950">New Order for Customer</h1><p className="text-slate-500 mt-1">Build the customer's order and send it to the operator for routing.</p></div></div>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_350px] border border-slate-200 rounded-xl overflow-hidden min-h-[680px]">
        <section className="p-6">
          {/* Search bar always visible */}
          <div className="flex justify-between gap-4 mb-5">
            <div className="relative w-80 max-w-full">
              <Search size={18} className="absolute left-3 top-3 text-slate-400"/>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu..." className="w-full border rounded-lg py-2 pl-9 pr-3"/>
            </div>
          </div>

          {/* If a category is selected, show items in that category */}
          {selectedCategory ? (
            <>
              <button onClick={() => { setSelectedCategory(null); setSearch('') }} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg font-bold text-sm hover:bg-slate-800 transition shadow-md mb-4">
                <ArrowLeft size={18} /> Back to categories
              </button>
              <h2 className="text-2xl font-extrabold">{selectedCategory}</h2>
              <p className="text-slate-500 text-sm mt-1">Choose items to add to the customer's order</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-5">
                {(search ? searchItems : categoryItems).map((item) => {
                  const inCart = cart.find((cartItem) => cartItem.productId === item.id)
                  const soldOut = Number(item.quantity) <= 0
                  return (
                    <article key={item.id} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white">
                      <div className="relative h-44 bg-slate-100 overflow-hidden">
                        <div className="absolute inset-0 grid place-items-center text-slate-400"><UtensilsCrossed size={30} /><span className="text-xs mt-1">No image</span></div>
                        {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="relative z-10 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                      </div>
                      <div className="p-3">
                        <h3 className="font-bold text-base">{item.name}</h3>
                        <p className="font-bold text-base mt-1">{money(item.price)}</p>
                        <button disabled={soldOut} onClick={() => add(item)} className="mt-3 w-full border border-slate-300 rounded-lg py-1.5 flex justify-between px-3 font-semibold text-sm hover:border-amber-500 disabled:opacity-50">
                          {soldOut ? 'Sold out' : 'Add'} <Plus className="rounded bg-amber-600 text-white p-0.5" size={18} />
                        </button>
                        {inCart && <p className="text-xs text-emerald-600 mt-2 flex gap-1 items-center"><CheckCircle2 size={14} />{inCart.quantity} in order</p>}
                      </div>
                    </article>
                  )
                })}
                {(search ? searchItems : categoryItems).length === 0 && (
                  <p className="col-span-full text-center text-slate-500 py-12">
                    {search ? `No items found matching "${search}"` : 'No items in this category.'}
                  </p>
                )}
              </div>
            </>
          ) : search ? (
            /* Search results view */
            <>
              <h2 className="text-2xl font-extrabold mb-4">Search Results</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-2">
                {searchItems.map((item) => {
                  const inCart = cart.find((cartItem) => cartItem.productId === item.id)
                  const soldOut = Number(item.quantity) <= 0
                  return (
                    <article key={item.id} className="overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white">
                      <div className="relative h-44 bg-slate-100 overflow-hidden">
                        <div className="absolute inset-0 grid place-items-center text-slate-400"><UtensilsCrossed size={30} /><span className="text-xs mt-1">No image</span></div>
                        {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="relative z-10 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                      </div>
                      <div className="p-3">
                        <h3 className="font-bold text-base">{item.name}</h3>
                        <p className="font-bold text-base mt-1">{money(item.price)}</p>
                        <button disabled={soldOut} onClick={() => add(item)} className="mt-3 w-full border border-slate-300 rounded-lg py-1.5 flex justify-between px-3 font-semibold text-sm hover:border-amber-500 disabled:opacity-50">
                          {soldOut ? 'Sold out' : 'Add'} <Plus className="rounded bg-amber-600 text-white p-0.5" size={18} />
                        </button>
                        {inCart && <p className="text-xs text-emerald-600 mt-2 flex gap-1 items-center"><CheckCircle2 size={14} />{inCart.quantity} in order</p>}
                      </div>
                    </article>
                  )
                })}
                {searchItems.length === 0 && (
                  <p className="col-span-full text-center text-slate-500 py-12">No items found matching "{search}"</p>
                )}
              </div>
            </>
          ) : !selectedSection ? (
            /* Menu sections view — Bar menu (drinks) and Food menu */
            <>
              <h2 className="text-2xl font-extrabold mb-1">Menu</h2>
              <p className="text-slate-500 mb-5">Choose the menu section, then select a category to browse items</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={() => { setSelectedSection('bar'); setSearch('') }} className="border border-slate-200 rounded-xl shadow-sm bg-white p-8 text-left hover:border-amber-500 hover:shadow-md transition">
                  <div className="text-2xl font-black text-slate-900">Bar menu</div>
                  <div className="text-sm text-slate-500 mt-1">Beer, Wine, Spirits, Cocktails, Soft Drinks, Juices, Water, Energy Drinks, Hot Beverages</div>
                </button>
                <button onClick={() => { setSelectedSection('food'); setSearch('') }} className="border border-slate-200 rounded-xl shadow-sm bg-white p-8 text-left hover:border-amber-500 hover:shadow-md transition">
                  <div className="text-2xl font-black text-slate-900">Food menu</div>
                  <div className="text-sm text-slate-500 mt-1">Appetizers, Snacks, BBQ & Grills, Chicken, Beef, Pork, Fish & Seafood, Burgers, Pizza, Sandwiches, Fries, Main Meals, Local Dishes, Salads, Desserts</div>
                </button>
              </div>
            </>
          ) : (
            /* Categories of the selected section */
            <>
              <button onClick={() => { setSelectedSection(null); setSelectedCategory(null); setSearch('') }} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg font-bold text-sm hover:bg-slate-800 transition shadow-md mb-4">
                <ArrowLeft size={18} /> Back to menu sections
              </button>
              <h2 className="text-2xl font-extrabold">{selectedSection === 'bar' ? 'Bar menu' : 'Food menu'} — Categories</h2>
              <p className="text-slate-500 text-sm mt-1">Select a category to browse items</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-5">
                {(selectedSection === 'bar' ? barCategories : foodCategories).map((group) => (
                  <button key={group.name} onClick={() => setSelectedCategory(group.name)} className="border border-slate-200 rounded-xl shadow-sm bg-white p-5 text-left hover:border-amber-500 hover:shadow-md transition">
                    <div className="text-xl font-bold text-slate-900">{group.name}</div>
                    <div className="text-xs text-slate-500 mt-1">{group.items?.length || 0} items</div>
                  </button>
                ))}
                {(selectedSection === 'bar' ? barCategories : foodCategories).length === 0 && (
                  <p className="col-span-full text-center text-slate-500 py-12">No categories in this section yet. The manager needs to add menu items first.</p>
                )}
              </div>
            </>
          )}
        </section>

        {/* Cart sidebar */}
        <aside className="p-5 border-l border-slate-200">
          <div className="flex justify-between border-b pb-4">
            <h2 className="font-bold text-lg">Your Order ({count})</h2>
            <button onClick={() => setCart([])} className="text-red-600 text-sm">Clear All</button>
          </div>
          {cart.length === 0 ? (
            <p className="text-center text-slate-500 py-10">No items added yet.</p>
          ) : (
            <>
              <div className="divide-y">
                {cart.map((item) => (
                  <div key={item.productId} className="py-4 flex gap-2">
                    <div className="flex-1">
                      <strong>{item.name}</strong>
                      <p className="text-sm">{money(item.price)}</p>
                      <span className="border rounded inline-flex gap-3 items-center px-2 mt-2">
                        <button onClick={() => change(item.productId, -1)}><Minus size={14}/></button>
                        {item.quantity}
                        <button onClick={() => change(item.productId, 1)}><Plus size={14}/></button>
                      </span>
                    </div>
                    <div className="text-right">
                      <button onClick={() => change(item.productId, -item.quantity)}><Trash2 size={16} className="text-slate-400"/></button>
                      <p className="font-bold mt-5">{money(item.price * item.quantity)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 mt-3">
                <div className="flex justify-between"><span>Subtotal</span><span>{money(total)}</span></div>
                <div className="flex justify-between text-xl font-extrabold mt-3"><span>Total</span><span className="text-amber-600">{money(total)}</span></div>
                <button disabled={!cart.length} onClick={proceed} className="w-full mt-5 bg-gradient-to-r from-amber-500 to-orange-600 text-white py-3 rounded-lg font-bold disabled:opacity-50 flex justify-center gap-2">
                  <ShoppingCart size={19}/>View Cart & Place Order
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
      <p className="mt-4 text-sm text-slate-500">Waiter: {user?.name || 'Waiter'} · Orders are sent to the system operator, who routes food to the kitchen and drinks to the bar.</p>
    </div>
  </div>
}
