# GreenRich ONE — Operations and Manufacturing Configuration

**Source documents**

- Greenrich End-to-End ERP Process Flowcharts(2).docx, pages 2–13
- flow chart of material and vendor mapping(2).xlsx, Sheet1 A1:I94
- Source workbook relates to **FG-001**, the composter described as MGB100 / FRP / 2,000 litres.

## A simple explanation for management

The ERP flow is: **Enquiry → Quotation → Sales Order → Check materials → Purchase / external job work → Manufacturing → Quality Check → Packing / Dispatch → Payment → Installation / Service.**

The new sidebar **Operations & Production** records the master data and evidence for each step. It does not automatically change your existing Stock, Sales Orders, Invoice, or Dispatch database. This separation avoids moving stock or dispatching material before GreenRich signs off on the production rules.

| Operations menu | What it means | Reference |
|---|---|---|
| Materials / RM | FG, SFG, IM, and RM item register, unit, operation, source | Page 5; Excel |
| Vendors | Outside suppliers and processors | Excel and page 6 |
| BOM & routing | Which materials are needed to manufacture one product | Page 5 |
| Production | Work orders and operation progress | Page 8 |
| Purchase requests | Material shortages requested by Operations | Page 5 |
| Purchase orders | What purchasing authorizes and orders | Page 6 |
| Material receipts | Goods received, accepted, rejected and inspected | Page 6 |
| Job work | Material sent outside for cutting, folding, welding, etc. | Page 7 |
| Quality control | Product inspection, pass/reject and NCR evidence | Page 8 |
| Dispatch release | QC, Accounts and packing-slip checklist | Page 9 |
| Collections | Invoice collection tracking and adjustments notes | Page 10 |
| Service | Installation, warranty and service records | Page 11 |

## Example workbook import

An administrator working with Grow India can press **Import FG-001 draft** from Operations → Process overview. The imported workbook has **31 material rows (1 FG, 7 SFG, 5 IM, 18 RM), 8 named vendors and 30 proposed BOM links**. All are stored as *Draft*. Existing records are not overwritten.

**Not specified in the workbook:** quantities for RM-002, RM-003, RM-004 and RM-009. The spreadsheet is a visual flow rather than a validated exploded BOM, so *all* proposed parent-child links are subject to confirmation; no draft automatically reserves stock or raises orders. Source row numbers are retained. One source component has a 400-litre description while the finished product is 2,000 litres; operations must verify whether that component belongs in FG-001.

## Before enabling real ERP automation (page 13)

GreenRich management and Operations should confirm:
1. Approval amounts/roles for discounts, credit, purchase orders, stock adjustments and payments.
2. When an invoice is actually issued: advance, dispatch, delivery, installation, or a milestone.
3. The real warehouse and storage locations — do not add imaginary physical handling steps.
4. Products needing serial numbers, and microbial products needing batch/expiry records.
5. Correct FG/SFG/IM/RM numbers, units, quantities, routing and vendor classifications.
6. Job-work challan, e-way bill, and tax handling with Accounts.
7. Third-party integrations and systems of record for website/e-commerce, WhatsApp, GST, bank and payroll.

## Current scope / limitations

Phase 1 supports **real-time, company-restricted operations records** and editable tracking forms. Supplier quotation comparison, automated multi-level MRP, true warehouse stock reservations/movements, production costing, accounting ledger entries, official invoice/e-way-bill generation, approvals at prescribed limits, and automatic Dispatch blocking still require confirmed workflows and dedicated transactional implementation.

**Attendance remains unchanged.** Current Sales & CRM, Dispatch, Customers and invoices keep their existing behavior.
