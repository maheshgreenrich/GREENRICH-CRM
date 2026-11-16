# Sales Orders: Allow Backorders and Automatically Reconcile Stock

## Confirmed defect
`greenrich-crm-inline.js` -> `adjustStockForSale(copy, old, next)` throws `Insufficient stock` when requested quantity exceeds available stock. This prevents sales-order creation. Current code immediately decrements product stock for active orders, and restores stock on cancel/delete. Do **not** simply remove the exception: that would create negative/incorrect stock and double allocations.

## Required behavior
- On product selection and quantity change, show current available stock, requested quantity, shortage, and timestamp below product selector.
- Saving a sales order never fails solely because stock is insufficient. Show a warning; persist the order with stock status.
- Order statuses independent of stock: Pending, Completed, Cancelled, Returned. Fulfilment statuses: Pending Stock, Partially Allocated, Ready for Dispatch, Dispatched.
- Available stock = verified on-hand minus committed allocations. Never make it negative. Keep separate order allocations and unfulfilled demand.
- Example: 9 available, order 100 -> allocate up to 9, backorder 91, display Low Stock.
- Reconcile on product stock receipt/change and on sales order create/edit/cancel. Recompute within a transaction and lock inventory rows; preserve FIFO allocation or explicit priority.
- When enough stock arrives, transition to Ready for Dispatch and clear warning. Never automatically mark Dispatched or issue invoice.
- Action column displays Low Stock / Pending Stock or Ready for Dispatch. Warn in Sales Order detail and form.
- Use Supabase as source of truth, not browser localStorage snapshots. All company permissions/RLS apply.

## Implementation gate
Current sales and product stock live in legacy `gr_crm_records` and `greenrich-crm-cloud.js` browser synchronization. Design atomic server-side stock allocation (RPC or Edge Function + transaction) before changing the blocking frontend logic. Inspect Sales Ops approval, dispatch and invoice lifecycle for compatibility.

## Acceptance tests
1. Zero stock, order 100 -> order saved, backorder 100.
2. Nine stock, order 100 -> order saved, shortage 91, no negative inventory.
3. Stock receipt 91 -> pending order becomes Ready for Dispatch.
4. Two concurrent orders for last nine units -> no overselling.
5. Edit quantity / change product / cancel -> allocations reconciled exactly once.
6. Cross-company stock never used.
7. Reconnect/reload on another device shows same warning and status.
8. Invoice, approval, dispatch and audit history remain valid.

**Status:** requirements documented only; no stock behavior or production database changed.
