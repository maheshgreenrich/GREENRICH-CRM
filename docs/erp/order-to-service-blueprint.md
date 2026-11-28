# GreenRich ONE — End-to-end ERP blueprint (review draft)

**Sources:** user-provided "Greenrich_End_to_End_ERP_Process_Flowcharts(3).docx" (pages 1–13); "flow chart of material and vendor mapping(3).xlsx" (Sheet1 A1:I94); written six-phase manufacturing specification (30 October 2026). All material figures require business validation prior to live posting.

**Target:** single existing GreenRich ONE application (GitHub Pages frontend + Supabase/Postgres), not an independent ERP. Reuse `gr_profiles`, `gr_roles`, `gr_role_permissions`, `gr_companies`, shared customers, CRM leads, existing Sales Orders, `gr_crm_records`, `gr_ops_records`, dispatch and supplier drafts. Respect company separation.

## Existing system versus needed changes

| Process | Current implementation | Required production capability |
|---|---|---|
| Lead → quotation → SO | Lead pipeline + Sales Orders; not all technical quotation functions are live | Qualification details, visits, versioned GST quotation, accepted customer PO and release approval |
| FG / multilevel BOM | 31 draft items, 30 draft BOM links and 8 draft vendors in `gr_ops_records`; existing read-only BOM preview accepts validated data only | Versioned BOM, reliable inventory ledger, reservations, multi-stage shortages, order-to-plan linkage |
| RM purchase | Purchase requisition and PO draft/status forms in Operations | Vendor comparison, approvals, received quantities, quality receipt and 3-way match |
| External job work | Draft job-work records | Challan movement, vendor-held balances, yield + scrap reconciliation, accepted/rejected output and subcontract cost |
| Production + QC | Work-order and QC draft/status forms | Atomic SFG consumption, routing, WIP, NCR rework, serialized finished-goods receipts |
| Dispatch | Existing order and dispatch records | QC/commercial release, packing slip, invoice/e-way bill where required, LR/AWB, POD |
| Accounting | Accounts foundation code exists in GitHub but production accounting tables are not present in current Supabase schema | Atomic journal posting from invoices/receipts/bills, receivables and payment matching |
| Service | Draft service status forms | Installed base, warranty clock, visits, PM/AMC tickets and recurring consumables |

*As of 30 October 2026, the connected database contains only the existing draft BOM/vendor/material records; these are not an inventory ledger.*

## Order lifecycle

1. Lead captures source, contact, requirements, salesperson, Hot/Warm/Cold, interaction notes and site-visit needs.
2. Approved technical/commercial quotation includes GST, scope, warranty, freight, exclusions and payment milestones. Attach customer PO.
3. Released sales order creates immutable planning demand in **the same company**. Do not release merely on draft SO save.
4. FG available-to-promise = accepted warehouse quantity − active reservations − QC holds. WIP and vendor-held material are not FG available.
5. If sufficient FG is available, reserve that quantity for the order and route to packing; otherwise plan **only the shortage**.
6. Select *validated revision* of FG-001 BOM; explode FG → SFG → IM → RM. For each node, subtract eligible free stock before expanding children. Aggregate common RMs across paths without double-counting reservations.
7. Block automatic PR, PO and work-order release if quantities/UOM, parent links, stock evidence, QC acceptance, vendor route or revision are missing/unapproved. Show explicit warnings rather than assuming zero.
8. Procurement creates approved PR/RFQ/PO by vendor and required-by date. Goods receipt records accepted, rejected and pending inspection quantities. Vendor invoices are 3-way matched.
9. Subcontracting issues stock under a unique challan to a vendor location; receiving output records accepted/rejected quantities; balances are reconciled before job closure.
10. Work order reserves and issues SFG/IM, records operation completion, consumption and QC. Failed inspection triggers NCR/rework; only approved FG receipt increases sellable stock.
11. Dispatch requires QC and commercial clearance, product/serial/quantity/label verification and packing evidence. Record invoice, transport documents, LR/AWB and delivery POD.
12. Financial closure requires payments, advances/TDS/retention deductions and ledger reconciliation. Installation, warranty, AMC and consumables continue on the same customer/order history.

## FG-001 material structure from source workbook

- **FG-001:** MGB100 FRP composter, 2,000 L; reference finished unit 1 nos.
- **SFG-001–007:** top-door hinge (1); front-door hinge (1); stayrod (1); stayrod L-angle (2); side-bin handles (2); top-door hinge labelled **400 litr** (2); nipple (2).
- **IM-001–005:** top-door plate, front-door plate, side-handle plate, threaded nipple pipe, nipple support plate.
- **RM-001–018:** sheets, hinges, bar, pipes, bolts/nuts, handles, rivets and rubber beading. Proposed FG-direct accessories RM-015 through RM-018 must be verified.
- The workbook includes suppliers/operations for Sivaji Enterprises, SM Engineering, Royal Spring, Manisha Steel, Balaji Fastners, Apex Bolta, Bakkim Steel and Greenrich/VBK/Akshaya as labelled. Classify actual vendor versus internal department; do not create duplicate customer/vendor masters from names without review.

**Source issues to resolve before validation:**
1. RM-002 (Sheet1 row 9), RM-003 (row 15), RM-004 (row 20), RM-009 (row 45) have no quantity in the uploaded workbook. Their BOM quantity must remain undefined.
2. RM-001 is 50 kg on row 5; that may represent a purchase/issued lot rather than per-FG consumption. Do **not** multiply 50 kg per finished product without signed BOM consumption quantity.
3. RM-015 to RM-018 are listed below the last SFG, but their FG-direct parentage is an inferred link; confirm.
4. SFG-006 is described as a hinge for 400 litres, while FG-001 is 2,000 litres. Verify specification compatibility before release.
5. RM sheet code duplicates by description (RM-001/003/006/007/014); do not merge distinct codes until procurement confirms interchangeability, gauge/size, and UOM.
6. Missing base warehouse structure, opening stock, QC holds/reservations, serialisation requirements, yield rates and BOM revision approval.
7. Clarify CGST/SGST/IGST, job-work challan/GST/e-way requirements with finance. No statutory document will be auto-issued by the preview engine.

## Job-work quantity invariant

For a vendor-issued lot:
```
issued_qty = net_consumption + documented_scrap + unused_at_vendor + qty_returned
50 kg = 8 kg + 2 kg + 40 kg + 0 kg
```
If 40 kg is returned, record `unused_at_vendor=0`, `qty_returned=40`; **never** record 40 kg in both places. Vendor-held stock remains Greenrich-owned until consumed/returned/otherwise reconciled; quality-rejected output is separately held and not accepted.

## Proposed implementation components (within existing CRM)

- `Sales Orders`: add **Release for planning** only after approved quotation/PO and credit/technical checks.
- `Stock & Products`: item master and true warehouse available/reserved/QC-hold/WIP, plus lot/serial; no binary stock flag as the source of truth.
- `Operations & Production`: **Order & Production Pipeline**, BOM revision validation, shortages, material availability, Work Orders, QC and NCR.
- `Purchase Orders`: PR and supplier PO, GRN and 3-way comparison, vendor requisitions and job-work subcontract POs.
- `Dispatch`: release checklist, packing/labels, invoice/transport tracking and POD.
- `Accounts`: real invoice/bill/payment journals, aging, TDS/advance/retention settlement.
- `Customers`: historical interaction, quotations, fulfilled orders, delivered serial numbers, warranty and service/AMC.

## Data model to add after source sign-off

- `erp_item_revisions(company_id,item_code,bom_revision,...) ` and `erp_bom_lines(company_id,parent,child,quantity_per_parent,unit,source_route,status)`, linked to existing material master.
- `erp_stock_locations(company_id,code,type,warehouse_or_vendor)`, `erp_stock_events(company_id,source_event,item,lot,from_location,to_location,qty,unit)`: append-only and idempotent; no direct browser stock updates.
- `erp_reservations` per sales order and source document, with row locks preventing double-allocation.
- `erp_planning_runs` tied to released SO + approved BOM revision + stock snapshot; outputs shortages and demands.
- `erp_procurement_demands`, purchase approvals and goods receipt/QC events.
- `erp_job_work_orders`, `erp_job_work_movements` and settlement events.
- `erp_work_orders`, `erp_operations`, QC results/NCR and FG acceptance receipt.
- `erp_delivery_evidence` and `erp_installed_base` linked to the original customer/order.
- Post ledgers via the single AccountingService using DB transactions; never post invoices from a browser payload.

All new tables require enforced company/user authorization, transaction-checked lifecycle operations, unique idempotency keys, audit records, and period locking where financial. `gr_ops_records` remains legacy configuration/history; do not overwrite it or generate parallel vendor/customer masters.

## Release phases and acceptance tests

| Phase | Implementation | Acceptance gate |
|---|---|---|
| A | Approved BOM/UOM/vendor mapping + immutable stock balances | FG/SFG/RM availability distinguishes accepted, reserved, vendor stock, QC hold and WIP; no negative stock |
| B | Released sales order → FG stock check → planning run | 1 FG reserved once or exact shortage created; duplicate run idempotent |
| C | PR/PO + GRN/IQC and job-work material movement | Partial receipts/rejected goods; 50=8+2+40 reconciliation |
| D | Work order, in-process QC, FG receipt | Only QC-passed FG increments sellable on-hand; bad QC triggers NCR |
| E | Packing/dispatch/POD and invoicing | Cannot dispatch more than released/packed; invoice reconciles with ledger |
| F | Financial/installation/service closure | Collected/allocated receipts reconcile with balances and installed-base warranty |

**Testing requirements:** two-company isolation; employee scope; FG available path; FG shortage path; partial availability; invalid/unapproved BOM; mixed UOM; duplicate RM aggregation; repeated planning requests; vendor-held and QC held stock; negative stock race; job-work yield/wastage/returns; rejected receipt; serial issuance; reversal/void; reports reconcile to ledger.

**Go-live condition:** no automatic purchase, consumption, stock transfer, GST invoice or journal posting until master data is approved and all release-stage tests pass.
