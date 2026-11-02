# GreenRich production workflow

The Operations & Production tabs are Process Overview, Master Material, Vendor, Job Work, Raw Materials, Purchase Order and Quality Check. Existing training/pilot and IM records remain in the database; they are not live production tabs.

## Before the first transaction

- Add/edit materials in Raw Materials (RW/RM) or Master Material (SFG). Set their unit and reorder level. Enable **Has job work** only for raw materials that go to outside processing.
- Keep unit definitions consistent. Material units cannot change after stock posting.
- Existing workbook reference quantities are not physical inventory. Admin can enter a counted opening raw-material balance once, with an audit note. SFG stock is credited only by accepted SFG POs or job-work output.
- In Stock & Products, save the finished product as Multiple BOM with SFG items and quantities per unit. Existing Composter SFG lines are retained.
- Admin: Process Overview → Production settings sets the Director approval threshold and QC checklist. No prior numeric PO limit was found; the initial threshold is zero, requiring Admin/Director approval for every PO. Existing purchase approval permissions still apply below the configured limit.

## Purchase and production

1. Raw Materials → Place PO, or open an item → Issue PO. Select the company, vendor and one or more RW/SFG lines; enter quantity, rate, GST, delivery and terms. Save Draft.
2. Approve the PO. Mark Sent records the status; it does not email the vendor. Print PO provides the printable template.
3. Accept received quantities. Partial receipts are allowed; each GRN posts only quantities entered. Over-receipts are rejected. Destination comes from the material's type; direct-ready SFG goes to Master Material.
4. Raw material → Create Job Work creates an STN and deducts the issued quantity from available RW stock. The same amount is outstanding at the vendor.
5. Job Work → Accept work / return: select the SFG output and enter output quantity, actual raw material used, wastage and unused return. Partial returns/production are allowed. A job closes when its outstanding balance is zero.
6. Example: 50 kg issued, 7 kg used, 3 kg wasted and 40 kg returned. Allotted-to-work = 7 + 3 = 10 kg. The return receives a JWR number, RW stock rises by 40 kg, SFG stock rises by the separately entered output count. Kilograms are never assumed to equal SFG pieces.
7. Master Material → Product Readiness: choose finished product and build count. Required SFG = BOM quantity per unit × build count. Shortfalls are listed. Move to Quality rechecks availability server-side and removes the needed SFG from available stock; the pending batch shows it as reserved / at Quality.
8. Quality Check → Accept Quality: complete every checklist item and enter accepted/rejected quantities summing to the batch size. Accepted quantity alone is added to the same CRM product stock used by Sales. Rejected units enter Rework or Scrap. Rework done → Quality starts another QC batch without consuming the original SFG again.

## Reports and permissions

Overview shows current RW/SFG balances, outstanding vendor material, open POs, pending quality and finished stock. Unlike units are not added together. Date/vendor/material filters apply to activity; stock cards remain current balances. Excel exports current stock and filtered job work. Reorder alerts are per material.

Operation uses stock/purchase permissions. Accounts is read-only for POs and receipts in this module, even if old purchase permissions allowed editing. Sales, Telecaller and Marketing cannot read production documents or costs. Admin manages production settings; Director approval is required for totals at/above the configured threshold. Company membership is checked server-side.

## Developer notes

- Canonical release SQL: `supabase/releases/production_workflow.sql`. Applied through named Supabase migrations `production_workflow`, `production_workflow_job_payload_scope`, `production_workflow_audit_fields`, and the subsequent concurrency fix. The file contains their consolidated final definition; do not apply the create-table release twice.
- Data: `gr_production_balances`, `gr_production_documents`, `gr_production_events`, `gr_production_settings`. All have RLS and authenticated SELECT only. The private request table is intentionally inaccessible to clients.
- `gr_production_action` is an invoker RPC calling a private, authorization-checking definer function. It checks active profile, company and permissions. All mutations serialize per company. Posted records are immutable to browser table writes.
- Request UUIDs make retries idempotent. The same UUID with changed input is rejected. Material balances never go negative. Product rows are locked before production consumption/QC stock updates. Existing CRM optimistic `updated_at` guards prevent stale Sales writes from overwriting QC additions.
- STN / JWR / GRN / PO / QC series are server-generated. Every material/finished-stock posting retains actor, time and reference. Used/waste events are audit classifications; do not sum them as available-stock deltas. Balance changes are OPENING, PO_RECEIPT, JOB_ISSUE, JOB_RETURN, JOB_SFG and QUALITY_ISSUE.
- No existing stock is inferred from workbook quantities; no business sample records are inserted by this release.
- Rollback integration suite: `tests/production-workflow.sql`. It exercises real functions and direct authenticated RLS and rolls back all fixtures/profile changes. Browser logic: `npm run test:forms`. Existing JS suites remain part of Pages CI.
- Backup/export production documents, balances, events and settings together with `gr_ops_records` and CRM products. Do not restore balances independently of the ledger/documents. If rollback is needed, revert frontend assets first; retain posted database records for reconciliation rather than dropping tables.
