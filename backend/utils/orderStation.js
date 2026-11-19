const DRINK_CATEGORY_TERMS = [
  'drink', 'beverage', 'beer', 'wine', 'cocktail', 'mocktail', 'soft',
  'liquor', 'spirit', 'juice', 'water', 'energy', 'tea', 'coffee',
  'soda', 'milkshake',
]

export function isDrinkCategory(category) {
  const normalized = String(category || '').trim().toLowerCase()
  return DRINK_CATEGORY_TERMS.some((term) => normalized.includes(term))
}

export function resolveOrderStation(categories = [], orderType = '') {
  const normalizedCategories = categories.map((category) => String(category || '').trim())
  const hasDrink = normalizedCategories.some(isDrinkCategory)
  const orderIsDrinks = isDrinkCategory(orderType)
  const hasFood = normalizedCategories.some((category) =>
    category ? !isDrinkCategory(category) : !orderIsDrinks
  )

  if (hasDrink && hasFood) return 'both'
  if (hasDrink || (normalizedCategories.length && orderIsDrinks && normalizedCategories.every((category) => !category))) return 'bar'
  return 'kitchen'
}
