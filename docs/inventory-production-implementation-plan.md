# GREENRICH ONE — Inventory & Production Rework (FG–SFG–IM–RM)

## Source documents reviewed
- `flow chart of material and vendor mapping.xlsx`, Sheet1 A1:I94.
- `Greenrich_End_to_End_ERP_Process_Flowcharts.docx`, process diagrams A–M, 13 pages.
- Existing GREENRICH live `gr_production_action` transaction-backed module (PO, job work STN, QC, stock, RM to SFG).
- Odoo ERP's concepts were used for reference, but Odoo modules have **not been installed** in this app.

## Excel workbook evidence (not approved stock opening figures)
FG-001 = COMPOSTER – MGB100, FRP, 2000 LTR (1 nos), moulding/assembly at VBK/Akshaya.
SFG-001 (top door hinge) -> IM-001 (hinge plate) -> RM-001 (SS sheet).
SFG-002 (front door hinge) -> IM-002 -> RM-003; direct bought hinge RM-004.
SFG-003 (stayrod) -> RM-005 (SS round bar).
SFG-004 (stayrod L-angle) -> RM-006 (SS sheet).
SFG-005 (side bin handle) -> IM-003 -> RM-007/RM-008; fasteners RM-009..RM-011.
SFG-006 (door hinge) -> RM-012.
SFG-007 (nipple) -> IM-004 / IM-005 -> RM-013 / RM-014.
Direct purchases RM-015..RM-018 include handles, pop rivets and rubber beading.
Workbook provides a supplier/operation mapping example. Some component quantities are blank and multiple RM codes share identical specifications; no automatic production release or master merge is allowed without Engineering review.

## Required functional model
1. **Inventory / Item Master** — product stage FG, SFG, IM, RM. Separate saleable/purchasable flags (not exclusive); SKU, UOM, dimensions, category, vendor, traceability and stock policy.
2. **Locations** — Chennai, Nungambakkam, Amazon (per-company); vendors and in-transit as separate tracked subcontractor locations in a later phase.
3. **Quantities** — physical on-hand by warehouse, reserved, free-to-promise, WIP, at vendor, QC hold, ordered, dispatched and scrap. Never mix units in summary totals.
4. **BOM** — versioned FG -> SFG -> IM -> RM, positive per-parent component quantity, UOM conversions, waste/yield %, make/buy/subcontract, operation, work center, approved revision, effective date and no cycles.
5. **Purchase** — sales/project order or reorder shortage -> requisition -> RFQ/comparison -> vendor approval -> PO -> receipt -> incoming QC -> accepted quantity credited to location -> invoice match.
6. **Job work** — stock transfer note (STN)/challan, vendor, issued quantity, expected processing and due date; capture good output, wastage, scrap, returned unprocessed, rejection/rework, vendor outstanding and job service charge.
7. **Production** — material reservation -> issue -> intermediate receipt -> SFG receipt -> FG completion -> quality checks -> dispatch approval.
8. **Traceability** — batch/expiry for microbial inputs; serial number for qualifying FG, lot, vendor, purchase order, QC and dispatch customer links.

## Example quantity reconciliation
Issue 50 kg RM to a vendor. If 10 kg is processed, producing 8 kg accepted output and 2 kg process wastage, the outstanding unprocessed material is **40 kg** at the vendor.
Represent:
- issued 50 kg
- processed 10 kg = accepted 8 kg + process waste 2 kg
- unprocessed at vendor 40 kg
- separate any unprocessed goods physically returned, before reducing vendor outstanding.
Do not subtract the 2 kg of wastage again if 10 kg already represents *gross processed input*. Use documented semantics for `used` to avoid double counting.
For other jobs, calculate outstanding as issued less good-consumed less wastage less unprocessed returned (subject to same UOM).

## Existing application capabilities (verified)
- Operations & Production already exposes Material Master, Raw Materials, Job Work, Purchase Orders and QC.
- `gr_production_action` controls live production ledger via server transaction. Do not replace or duplicate the ledger.
- `gr_ops_records` already stores a draft FG-001 BOM/material/vendor mapping (31 material records; 30 BOM mapping records at inspection).
- The old Stock & Products page is the saleable products editor; it must remain accessible.

## Delivered as Inventory Foundation
- Sidebar Stock & Products is renamed Inventory.
- Inventory has Product & Material Master; Warehouse Stock; Vendor / Job Work Stock; Multi-level BOM; Purchase Shortages; Stock Movement Audit.
- Keep existing editable Saleable Product view and existing Operations & Production module.
- Three warehouses are seeded **per company**, with no speculative stock split.
- New verified-location stock ledger supports physical counts and same-company transfers.
- All physical counts and movements require role permissions and are atomic/idempotent.
- Draft BOM line capture and draft purchase requisitions reuse existing company-scoped `gr_ops_records` security.
- Existing vendor job-work ledger supplies issued/used/waste/return/outstanding metrics; existing purchase order ledger supplies PO list.

## CRITICAL: Not yet full ERP-wide synchronization
Phase 1 warehouse location stock is a separate, audited physical count / location movement ledger. **Do not treat it as the live Sales available stock until stock reconciliation and transactional integration is completed.** Existing sales approval, PO receipt, RM consumption, job work, FG receipt and dispatch still use their existing stock ledgers. Avoid double deductions.
Full rollout must follow reconciliation and UAT.

## Phase 2 — Warehouse stock reconciliation & allocation
- Approve the product/SKU master crosswalk between `gr_crm_records` and `gr_ops_records`.
- For every SKU and UOM, complete physical count per warehouse and reconcile:
  CRM/production aggregate on-hand = Chennai + Nungambakkam + Amazon + in-transit + vendor/WIP/QC ledger as appropriate.
- Move existing stock actions to a shared PostgreSQL transactional stock posting service, with reservation and free-to-promise. Do not overwrite sales snapshot without idempotency/migration guards.
- Add lot/batch/expiry and serial tracking.

## Phase 3 — Full multi-level manufacturing BOM, production, and subcontract posting
- Engineering BOM revision approval, traceability, unique SKU, operation routes and proper UOM conversions.
- Explode SO demand across levels with make/buy/outsourcing decisions; generate shortages and planned POs/work orders.
- Planned vs actual material usage, accepted yield, waste, scrap, returned unprocessed, rework and vendor outstandings by STN.
- Simultaneous-user race tests; production stock posts and purchase receiving must be atomic.
- QC release and invoicing/dispatch integration.

## Phase 4 — Reports, notifications & rollout
- Purchase/production alerts; ageing vendor balances; warehouse reorder; shortages by job and SO.
- Role-based approvals for PO, stock adjustment, wastage and dispatch.
- Reports: stock by warehouse/stage/UOM, material at vendor, WIP, BOM cost/yield, PO due, scrap and GRN exceptions.
- Operations sign-off on product BOM; Stores opening stock by warehouse; Accounts GST/challan validation; QA/UAT with real orders and 50 kg seed test.
- Pilot with a single FG SKU before enabling global posting.

## Open decisions from source document page 13
- Approval limits and invoice milestones; physical warehouses and Amazon ownership; serial vs batch tracking; FG/SFG/IM/RM UOMs and quantities; outside job-work challan/tax; and third-party integrations.
