# GREENRICH ONE — Inventory + Manufacturing ERP Build Blueprint

**Status:** Architecture and rollout plan, NOT a production release  
**Basis:** `flow chart of material and vendor mapping(1).xlsx` (Sheet1, A1:I94), existing Greenrich code and production workflow documentation, Odoo Inventory/MRP reference workflows.  
**Scope:** Inventory, purchasing, manufacturing, subcontracting, quality, costing and connected order-to-dispatch. This does not imply implementing every Odoo enterprise application.

## 1. Objective

Develop an integrated, mobile-friendly, company-scoped Greenrich ERP on the existing GreenRich ONE platform. Reuse and reconcile existing CRM, Operations & Production, purchase, QC, WMS, dispatch and vendor records. Do not create a second production stock system or silently rewrite existing quantities.

The provided reference represents a hybrid process: finished FG-001 MGB100 (FRP, 2,000 L) uses SFG/IM/RM components, and work may be performed at Greenrich or external vendors (cutting/folding, machining, assembly and FRP work). Import is **draft mapping only**, pending engineering validation.

## 2. Fundamental accounting / stock rules

1. **On Hand** is actual physical posted quantity: never reduce it merely by creating/editing an SO or PO.
2. Stock changes only on authorised, validated physical transactions, such as goods receipt, transfer, material issue, production completion, dispatch, return or signed adjustment. Each transaction is auditable.
3. **Forecast = On Hand + pending approved incoming − pending outbound demand**. Display reserved/free-to-promise independently. Do not double-count SO and dispatch reservations.
4. A transfer of Greenrich-owned material from Greenrich Warehouse to a subcontractor is a **location/custody transfer**, not a sale. Keep vendor-owned, customer-owned and Greenrich-owned inventory distinct.
5. Same product may be *Saleable* and/or *Purchasable*. Manufacturing routes and subcontract routes are additional configuration, not mutually exclusive with these flags.
6. Confirm quantity semantics and UOM before costing: kg of raw sheet != nos of cut parts. Scrap, rejection, good output and unprocessed vendor balance must reconcile.
7. Product keys: immutable internal ID + SKU uniqueness per company. SKU changes after transaction links require a controlled migration.
8. A single atomic stock posting service (server-side, locked and idempotent) must eventually replace fragmented direct inventory updates. Existing ledgers should be migrated only after reconciliation; keep history.

## 3. Major ERP feature groups

| Domain | Required functions |
|---|---|
| Product master | FG/SFG/IM/RM; categories; images; SKU/ref; UOM and conversions; make/buy/subcontract; saleable/purchasable; taxes, cost, variants, active/archive |
| Warehouses | Multi-company and multi-warehouse; bins/shelves; internal transfers; transit; vendor-held; QC-hold; scrap; opening adjustments; stock ledger; cycle count; barcode |
| Purchase | Requisitions, RFQ, vendor comparison, approval, PO, scheduled delivery, GRN, partial receipt, return to vendor, invoice matching |
| BOM | Multi-level FG→SFG→IM→RM, effective versions, per-parent quantities, revisions and approval, alternatives, scrap/yield, cycle checks |
| Manufacturing | MO, planned/actual input, work orders, routing, factory work centres, capacity, operator/time, WIP, yield, rework and finished goods |
| Subcontracting | Job-work STN/challan, issue to vendor, material in vendor custody, expected return, actual consumption/scrap/return, job charges, aging and outstanding |
| Quality | Incoming, in-process, final QC, checklists, acceptance/rejection, hold/release, nonconformance, rework |
| Planning | MRP/BOM explosion, shortage, resupply plan, reorder min/max, lead time, forecast, reservations and alerts |
| Costing | Raw material, job work, labour, overhead, scrap, planned vs actual MO cost; valuation reports |
| Reporting | On hand, available/forecast, stock by location, vendor stock, aged POs, manufacturing status, material variance, traceability, audit |
| Advanced | Lots/serials, batch/expiry for microbes, warranty, attachments, approval flows, role restrictions, mobile shop floor, notifications, APIs |

## 4. Required screens

1. **Inventory Dashboard** — on-hand, forecast, incoming, outgoing, low stock, items at vendor, pending QC, pending GRN.
2. **Products** — Odoo-inspired Kanban/list + product details with General, Sales, Purchase, Inventory, Manufacturing tabs and smart counters.
3. **Warehouses & Locations** — locations, balances, internal transfers, adjustments, cycle counts, stock history.
4. **Purchase** — requisitions, RFQs, POs, receipts, vendor return, bills (with financial integrations later).
5. **Manufacturing** — engineering BOM, routing/work-centres, MOs, WOs, shop floor and quality.
6. **Subcontracting / Job Work** — vendor mapping, outgoing material, outstanding, receipts, yield/waste, charges and due dates.
7. **Reports & Settings** — controls, alerts, costing, UOM, access approvals, imports, audit exports.

## 5. Suggested data architecture (subject to inventory of existing DB)

- Canonical `erp_items` and existing CRM/ops ID crosswalk, **not** a blind replacement of existing product tables.
- `erp_warehouses`, `erp_locations`, `erp_stock_moves`, `erp_stock_move_lines`, and read-only `erp_stock_balances` (derived from posted moves or maintained transactionally with reconciliation).
- `erp_bom_headers`, `erp_bom_lines`, `erp_operations`, `erp_routings`, `erp_work_centres`.
- `erp_mos`, `erp_work_orders`, `erp_material_issues`, `erp_qc_checks`, `erp_job_work_orders`, `erp_vendor_stock_events`.
- `erp_purchase_requisitions`, `erp_purchase_orders`, `erp_grns` and source references to existing authorised documents.
- `erp_lots`, `erp_serials`, `erp_cost_layers`, `erp_audit_events` as later modules.
- Prefer evolving existing `gr_production_*`, `gr_inventory_*` and `gr_ops_records` transactions rather than adding duplicate tables. Above names are conceptual, **not approved migration names**.

All company access is enforced using existing authenticated RLS/role policies. SQL posting services must check company, roles, source document status, idempotency token, stock availability, UOM and status transitions atomically.

## 6. Phased delivery and acceptance gates

### Phase 0 — Discovery / functional freeze
- Inventory current tables, RPCs, triggers and UI workflows; map CRM/Production/Location stock authorities.
- Engineering review of FG-001→SFG→IM→RM; correct missing per-unit quantities, UOM, alternate vendors, work locations and 400L-labelled component.
- Test baseline, rollback plan and read-only reporting before changing posting.
- **Pass gate:** each stock quantity has one documented system of record and a reconciliation method.

### Phase 1 — Canonical Inventory
- Single product crosswalk, location balances and audit; counted opening by authorized Stores.
- Atomic transfers, receipts, dispatch, adjustments; reservation separately from physical On Hand.
- Product counters and forecast must reflect actual document states.
- **Pass gate:** SO 10 on physical 20 does NOT alter On Hand; approved PO 10 yields Forecast 20; physical dispatch only posts once.

### Phase 2 — Purchasing / vendor custody
- PO approval, GRN partial delivery, vendor-held stock, STN, vendor issue/receipt reconciliation, basic pending alerts.
- **Pass gate:** 50 kg issue → 50 kg vendor custody; consumption, waste, returned stock and accepted parts reconcile with no duplicate deduction.

### Phase 3 — Production / multi-level BOM
- Approved engineering BOM revisions, make/buy routes, MRP explosion, MO/WO, work-centre and subcontract operations, WIP, in-house vs vendor work.
- **Pass gate:** one FG-001 build can trace all inputs through intermediate and semi-finished stages, QC and approved finished receipt.

### Phase 4 — Quality, costing, traceability
- QC hold/rework/scrap, actual vs standard costs, labour/job-work charges, serial/batch/expiry, cost variance.
- **Pass gate:** failed QC cannot credit sellable stock; costing and physical quantities reconcile.

### Phase 5 — Advanced automation / rollout
- Reorder automation, role approvals, notifications, barcode/mobile shop floor, dashboards, exports, ecommerce/accounting integrations.
- **Pass gate:** UAT with Purchase, Stores, Operations, Accounts, Sales, QA and an authorised manager; controlled production go-live with backup/rollback.

## 7. Non-negotiable implementation guardrails

- Do **not** import workbook quantities as physical stock, post speculative POs, or overwrite production data to make dashboards look correct.
- Do **not** infer supplier GST/vendor tax identity or government compliance from an Excel flow chart.
- Keep existing live workflows functional until their replacements pass transaction and multi-user regression tests.
- Use staged migrations, transactional/idempotency tests, RLS tests, stock reconciliation, event logs and rollback.
- Never mix numeric amounts across kg and nos.
- Build original Greenrich white/blue UI inspired by Odoo concepts, not a claim of a complete Odoo clone.

## 8. First focused development sprint

1. Map every existing stock update path in CRM, Dispatch, Production, Warehouse, Job Work and PO receipt.
2. Define and test `on_hand`, `reserved`, `incoming`, `outgoing`, `forecast`, `at_vendor`, `wip`, `qc_hold` and `scrap`.
3. Draft an approved per-SKU opening/warehouse reconciliation sheet for FG-001 and GRCOM25.
4. Specify one atomic stock posting API with immutable history, idempotency and company permissions.
5. Add end-to-end test cases for SO→PO→job work→assembly→QC→GRN→dispatch.

**Implementation is not authorised by this document alone.** It is a blueprint to guide staged code and database changes without corrupting current balances.
