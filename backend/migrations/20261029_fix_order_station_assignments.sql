WITH categorized_orders AS (
  SELECT
    o.id,
    LOWER(BTRIM(COALESCE(o.order_type, ''))) AS order_type,
    COUNT(oi.id) AS item_count,
    BOOL_OR(
      CASE
        WHEN BTRIM(COALESCE(p.category, '')) = '' THEN LOWER(BTRIM(COALESCE(o.order_type, ''))) ~ '(drink|beverage)'
        ELSE p.category ~* '(drink|beverage|beer|wine|cocktail|mocktail|soft|liquor|spirit|juice|water|energy|tea|coffee|soda|milkshake)'
      END
    ) AS has_drinks,
    BOOL_OR(
      CASE
        WHEN BTRIM(COALESCE(p.category, '')) = '' THEN LOWER(BTRIM(COALESCE(o.order_type, ''))) !~ '(drink|beverage)'
        ELSE NOT (p.category ~* '(drink|beverage|beer|wine|cocktail|mocktail|soft|liquor|spirit|juice|water|energy|tea|coffee|soda|milkshake)')
      END
    ) AS has_food
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
  LEFT JOIN products p ON p.id = oi.product_id
  GROUP BY o.id, o.order_type
)
UPDATE orders o
SET station = CASE
  WHEN c.item_count = 0 AND c.order_type ~ '(drink|beverage)' THEN 'bar'
  WHEN COALESCE(c.has_drinks, FALSE) AND COALESCE(c.has_food, FALSE) THEN 'both'
  WHEN COALESCE(c.has_drinks, FALSE) THEN 'bar'
  ELSE 'kitchen'
END
FROM categorized_orders c
WHERE o.id = c.id;
