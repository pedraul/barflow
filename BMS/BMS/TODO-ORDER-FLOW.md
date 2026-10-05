# Order Flow Fix & Enhancement Checklist

## Issues Identified

1. **NewOrder.jsx** navigates to customer `/menu` (QR flow) instead of using the waiter's own menu system (`WaiterNewOrder.jsx`). This causes orders to be created with `source: 'qr'` instead of `source: 'waiter'`, making them untrackable by the waiter.

2. **Category not showing on item cards** in the waiter's new order page and in the operator's order view.

3. **Missing feature: Add products to existing placed orders** - waiters can restock (remove items) but cannot add new products to an order.

## Plan

- [ ] Fix: Update `NewOrder.jsx` to navigate to waiter's own menu page (`/waiter/new-order`) instead of customer QR menu
- [ ] Fix: Show category label on item cards in `WaiterNewOrder.jsx`
- [ ] Fix: Show category in operator's order view
- [ ] Fix: Show category in waiter's pending orders view
- [ ] Implement: Add API endpoint to add items to existing orders (`POST /api/orders/:id/add-items`)
- [ ] Implement: Create `AddItemsToOrderModal.jsx` component
- [ ] Implement: Integrate add-items modal in waiter's orders page