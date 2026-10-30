# GreenRich ONE | Connected Order-to-Stock PILOT

This is a working **Supabase-backed production-training pilot** inside the existing **Operations & Production** sidebar page. It creates a test product in the EXISTING Stock & Products master and a TEST Sales Order in `gr_pilot_orders`, and advances real database transactions through a validated sequence. It does not create a commercial sales invoice, GST bill, real supplier PO, live service ticket, or real-stock valuation. All records use a PILOT prefix and the product is inactive/not sellable.

## How to access
Open GreenRich ONE → Operations & Production → **Connected Order-to-Stock · Pilot**.

## Test dataset installed
- Company: GreenRich Grow India Pvt Ltd
- SKU: **PILOT-HOME-40**, description: *Home Composter 40L — Workflow Test*
- New CRM product master record: **[PILOT] Home Composter 40L**, price ₹0, inactive, initial stock **0**
- One company-scoped test SO: **[TEST] Sample Customer (no real commitment)**, quantity **1**
- Demo BOM: collection tab ×1, lid/top cap ×1, inner tray ×1
- Choose existing **Sivaji Enterprises** vendor draft; its mobile/address/GST are NOT verified and have not been fabricated
- Vendor PO creates `PILOT-PO-xxxx` in dedicated pilot history and does not issue a legal/commercial purchase order
- Vendor job-work sample uses **50 kg material lot**: 8 consumed, 2 scrap, 40 held at vendor; this example is NOT approved BOM consumption for a finished product

## Full walkthrough / தமிழ் வழிகாட்டி
1. Select **PILOT-HOME-40**. Verify pilot finished stock 0 and order status.
2. **Check Finished Stock** → write a note → Complete.
3. **Create Vendor PO** → select Sivaji Enterprises, enter note → Complete. Vendor 360 shows the pilot PO history. Do not enter fake GSTIN/mobile.
4. **Receive Raw Materials in Warehouse** → enter **50 kg**, the test warehouse ledger records +50.
5. **Issue Material to Vendor** → enter **50 kg**, warehouse goes 50→0 and vendor-held stock goes 0→50.
6. **Job Work & Wastage** → 50 issued = 8 used + 2 scrap + 40 at vendor + 0 returned. After posting vendor stock = 40.
7. **Receive Processed Parts** → enter accepted quantity **1**.
8. **Final Assembly** → complete and enter note.
9. **Stickering** → complete and enter note.
10. **Incoming Inspection** → PASS required; failed inspection blocks the next step.
11. **Final Quality Check** → PASS required; failed QC blocks the finished-stock receipt.
12. **Automatic Finished Stock** → click Complete. The server inserts **+1** into the pilot finished-stock ledger and **atomically updates the existing CRM product stock to 1**. Manual changes to pilot stock through the product editor are rejected by a database trigger.
13. **Dispatch** → click Complete. The server inserts **−1**, so available finished stock returns to 0.
14. **Service / Warranty** → click Complete. The test service record appears in the order's Service history.

Every step records actor, timestamp, details and note. Buttons use transactional RPC calls, not optimistic local state. Opening the page on another device reads the same Supabase records. Database Realtime order updates refresh the screen for other authorized sessions.

## Different workflows for different product types
Select **Create product & workflow** inside pilot. A wizard accepts company, SKU, product name, components (code | name | qty | unit) and configurable stage codes. Built-in sets:
- SIMPLE: stock check → assembly → sticker → QC → stock → dispatch → service
- OUTSOURCED: stock check → vendor PO → RM receipt → issue → job work → received components → assembly → sticker → inspection → QC → stock → dispatch → service
- DIRECT: stock check → physical receipt → inspection → QC → stock → dispatch → service

Custom stage sequences are validated server-side; STOCK_CHECK must be first, SERVICE last, and QC before receipt into finished stock. For job work, vendor PO, RM receipt, issue, job-work and processed receipt are required in order. New products start at stock zero. For a finished commercial product, use the existing fully validated manufacturing process rather than this limited pilot.

## Vendor 360
The pilot reuses vendor records in `gr_ops_records(kind='vendor')`; it does not create duplicate vendor masters. Admin/Purchase-authorized staff can update **vendor company name, phone, address, GSTIN** in this record. Changes have before/after audit snapshots. A pilot PO history is displayed for the selected vendor. No government or real-world vendor identifier has been invented.

## Data architecture
- `gr_pilot_products`: company-scoped workflow and BOM linked to existing CRM product master
- `gr_pilot_orders`: test Sales Orders (not mixed into commercial Sales Orders/revenue)
- `gr_pilot_events`: immutable stage history
- `gr_pilot_pos`: pilot vendor PO (not official purchase orders)
- `gr_pilot_material_events`: per-order RM location ledger (warehouse and vendor)
- `gr_pilot_stock_events`: approved FG receipt and dispatch movements
- `gr_pilot_service`: linked pilot service record
- `gr_pilot_vendor_history`: vendor master change audit
- DB RPCs: `gr_pilot_product_create`, `gr_pilot_start_order`, `gr_pilot_update_vendor`, `gr_pilot_step`.

RLS scopes all reads to companies. Transaction functions enforce active role, required stage, note, QC PASS, stock availability, quantity reconciliation and immutable event logging. PILOT product changes are blocked from direct manual stock edits.

## Verified tests
- Migration applied in rollback-only PostgreSQL transaction, included 1 test product and 1 test SO.
- Ran all **13 transitions** as an authenticated Admin test subject; received a tested +1 FG stock receipt, then -1 dispatch, and 1 service ticket. Final CRM stock = 0.
- Material location ledger reconciled warehouse = 0 kg, vendor = 40 kg.
- Direct attempt to set the PILOT product stock to 99 was denied.
- Test transaction rolled back before the actual migration was installed, leaving production records unchanged.
- JS integration tests verify the new tab, script load ordering, permissions, vendor/PO/history references and SQL control rules.

## Explicit NOT-YET-PRODUCTION features
- Pilot raw materials and BOM quantities are example records, not signed off for purchasing.
- No official PO, 3-way-match bill, accounting journal, GST invoice, e-way bill, POD or actual service case is generated.
- No general multi-item production reservations, landed costs, batch/serial tracking or multiple warehouses are implemented.
- Commercial Sales Orders remain on the existing Sales Orders page. Pilot test orders are intentionally separate to avoid polluting revenue/dispatch reports.
- The example is a functional pilot for learning and testing. For commercial go-live, replace sample material sources with real approved BOM, opening stock, vendor details, departmental sign-offs and inventory audit controls.
