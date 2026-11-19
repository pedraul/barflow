const DRINK_CATEGORY_TERMS = [
  'drink', 'beverage', 'beer', 'wine', 'cocktail', 'mocktail', 'soft',
  'liquor', 'spirit', 'juice', 'water', 'energy', 'tea', 'coffee',
  'soda', 'milkshake',
]

export function isDrinkCategory(category) {
  const normalized = String(category || '').trim().toLowerCase()
  return DRINK_CATEGORY_TERMS.some((term) => normalized.includes(term))
}
