import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import * as api from '../api/endpoints'

const CustomerContext = createContext(null)

export function CustomerProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      const stored = sessionStorage.getItem('customer_cart')
      const storedBiz = sessionStorage.getItem('customer_business_id')
      if (!stored) return []
      if (!storedBiz) {
        sessionStorage.removeItem('customer_cart')
        return []
      }
      const parsed = JSON.parse(stored)
      const items = Array.isArray(parsed) ? parsed : []
      const hasUntaggedItems = items.some((item) => !item.businessId)
      const hasMismatchedItems = items.some((item) => item.businessId && item.businessId !== storedBiz)
      if (hasUntaggedItems || hasMismatchedItems) {
        sessionStorage.removeItem('customer_cart')
        return []
      }
      return items
    } catch {
      sessionStorage.removeItem('customer_cart')
      return []
    }
  })
  const [tableNumber, setTableNumber] = useState(() => {
    try {
      return sessionStorage.getItem('customer_table') || '1'
    } catch {
      return '1'
    }
  })
  const [businessId, setBusinessId] = useState(() => {
    try {
      return sessionStorage.getItem('customer_business_id') || ''
    } catch {
      return ''
    }
  })
  const [currentOrder, setCurrentOrder] = useState(() => {
    try {
      const stored = sessionStorage.getItem('current_order')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [deferredOrder, setDeferredOrder] = useState(() => {
    try {
      const stored = sessionStorage.getItem('deferred_order')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [menu, setMenu] = useState(null)
  const [menuLoading, setMenuLoading] = useState(false)
  const [menuError, setMenuError] = useState(null)
  const placingRef = useRef(false)

  // Persist cart to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('customer_cart', JSON.stringify(cart))
  }, [cart])

  // Persist table number
  useEffect(() => {
    sessionStorage.setItem('customer_table', tableNumber)
  }, [tableNumber])

  // Persist business id
  useEffect(() => {
    if (businessId) {
      sessionStorage.setItem('customer_business_id', businessId)
    } else {
      sessionStorage.removeItem('customer_business_id')
    }
  }, [businessId])

  // Persist current order
  useEffect(() => {
    if (currentOrder) {
      sessionStorage.setItem('current_order', JSON.stringify(currentOrder))
    } else {
      sessionStorage.removeItem('current_order')
    }
  }, [currentOrder])

  // Persist deferred order
  useEffect(() => {
    if (deferredOrder) {
      sessionStorage.setItem('deferred_order', JSON.stringify(deferredOrder))
    } else {
      sessionStorage.removeItem('deferred_order')
    }
  }, [deferredOrder])

  const loadMenu = useCallback(async (table, bizId) => {
    setMenuLoading(true)
    setMenuError(null)
    try {
      const data = await api.fetchMenu(table || tableNumber, bizId)
      setMenu(data)
      if (table) setTableNumber(String(table))
      if (bizId) {
        const bizStr = String(bizId)
        setBusinessId(bizStr)
        if (businessId && businessId !== bizStr) {
          setCart([])
          sessionStorage.removeItem('customer_cart')
        }
      }
    } catch (err) {
      setMenuError(err.message)
    } finally {
      setMenuLoading(false)
    }
  }, [api, tableNumber, businessId])

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id)
      const currentQty = existing ? existing.quantity : 0
      const available = Number(product.quantity) || 0
      if (currentQty + 1 > available) return prev
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          imageUrl: product.imageUrl || '',
          unit: product.unit || 'unit',
          maxStock: Number(product.quantity) || 0,
          businessId: businessId || '',
        },
      ]
    })
  }

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId))
  }

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item
        const max = item.maxStock ?? 9999
        return { ...item, quantity: Math.min(quantity, max) }
      })
    )
  }

  const clearCart = () => {
    setCart([])
  }

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }

  const getCartCount = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0)
  }

  const placeOrder = async () => {
    if (placingRef.current) throw new Error('Order is already being placed')
    if (cart.length === 0) throw new Error('Cart is empty')

    placingRef.current = true

    const payload = {
      tableNumber,
      items: cart.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      businessId: businessId || undefined,
    }
    try {
      const result = await api.placeCustomerOrder(payload)
      setCurrentOrder(result)
      clearCart()
      await loadMenu(tableNumber, businessId)
      return result
    } finally {
      placingRef.current = false
    }
  }

  const placeDeferredOrder = async () => {
    if (placingRef.current) throw new Error('Order is already being placed')
    if (cart.length === 0) throw new Error('Cart is empty')

    placingRef.current = true

    const payload = {
      tableNumber,
      items: cart.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      businessId: businessId || undefined,
    }
    try {
      const result = await api.placeCustomerOrder(payload)
      setDeferredOrder(result)
      clearCart()
      await loadMenu(tableNumber, businessId)
      return result
    } finally {
      placingRef.current = false
    }
  }

  const clearDeferredOrder = () => {
    setDeferredOrder(null)
  }

  const resetSession = () => {
    setCart([])
    setCurrentOrder(null)
    setDeferredOrder(null)
    setMenu(null)
    setBusinessId('')
    sessionStorage.removeItem('customer_cart')
    sessionStorage.removeItem('current_order')
    sessionStorage.removeItem('deferred_order')
    sessionStorage.removeItem('customer_table')
    sessionStorage.removeItem('customer_business_id')
  }

  return (
    <CustomerContext.Provider
      value={{
        cart,
        tableNumber,
        businessId,
        currentOrder,
        deferredOrder,
        menu,
        menuLoading,
        menuError,
        loadMenu,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        getCartTotal,
        getCartCount,
        placeOrder,
        placeDeferredOrder,
        clearDeferredOrder,
        setCurrentOrder,
        setDeferredOrder,
        resetSession,
      }}
    >
      {children}
    </CustomerContext.Provider>
  )
}

export function useCustomer() {
  const context = useContext(CustomerContext)
  if (!context) {
    throw new Error('useCustomer must be used within CustomerProvider')
  }
  return context
}

export default CustomerContext