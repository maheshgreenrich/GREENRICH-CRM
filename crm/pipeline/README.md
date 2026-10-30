# GreenRich ONE — Assigned Leads Pipeline
This module stays inside the **Leads & CRM** sidebar page, with quotation follow-ups inside **Follow-ups**. Sales Orders remain the only sales-order workspace; the duplicate Sales sidebar entry is removed.

## Files
- `001_lead_pipeline.sql`: company-scoped lead records, activity history, role-scoped RLS, transactional create/assign/move/customer-link RPCs and safe legacy cloud seeding.
- `002_harden_legacy_lead_access.sql`: limit old `gr_crm_records` lead visibility to assigned/team/admin users and prohibit direct lead writes.
- `rollback_legacy_access.sql`: emergency return to former CRM record policies without dropping financial/lead data.
- `../../greenrich-lead-pipeline.js`: Kanban, stage movement modal, date/time/company/product/source/tag/employee filters, sales stats, CSV import, saved browser lead assignment, quotation follow-ups and customer history.

## Stages and movement
New → Contacted → Qualified → Quotation → Won. Lost may be reached from any non-Won active stage, and Lost → Contacted reopens.
Every stage change and re-assignment requires a note. Quotation requires a follow-up date; follow-up rows are derived from Quotation status, so Won and Lost disappear automatically.
Won requires an existing shared customer and an actual Sales Order from the same company for that customer. The button **Create Sales Order** opens the existing CRM order editor with customer/product prefilled. The user must save the order then return to the quotation lead to mark Won. No order is falsely claimed to have been created before save.

## Company and role permissions
Settings → User Roles → Leads & CRM controls View, Create, Edit and scope (Own/Team/All).
A sales employee sees assigned leads only. A manager with Team scope sees direct reports, and Admin sees all companies assigned to their profile. Backend RPC and RLS enforce this, not merely frontend controls.
Salespeople eligible for assignment are active employees authorized for the selected company.

## Legacy data preservation
Existing cloud leads are seeded with matching employee names when possible; unassigned leads remain visible to Admin for assignment.
Old browser-only leads are backed up under `greenrich-crm-pipeline-legacy-backup:<company>` before the cloud refresh replaces browser storage. Admins can assign and import them using the board's **Assign saved leads** action. Do not clear browser storage until migration is confirmed.
Lead import accepts CSV and requires an assignee before each record is created; 500 rows per batch. Non-CSV Excel conversion is not implemented in this board.

## Verification before release
The SQL migrations were validated within a rollback transaction and an authenticated Sales simulation successfully created a test lead, moved it to Contacted and generated two audit events; all test changes were rolled back.
Recommended additional tests: another salesperson must not view or move a lead they do not own; manager Team/All scopes; multi-company separation; duplicate CSV imports; stale-client errors; and customer Sales Order linkage.
This CRM module is separate from the unfinished Accounts ledger rollout.
