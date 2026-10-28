# GreenRich ONE — Secure Phase 1 foundation

This directory is an **incremental security foundation**, not a completed ERP. The existing root app is a localStorage prototype and **is not protected** by these policies.

## Deployment
1. Create a GreenRich-owned Supabase project.
2. Execute `phase1/schema.sql` in its SQL editor **once** on a fresh project.
3. Create the initial Admin in Supabase Authentication; copy its UUID.
4. Run the commented bootstrap SQL at the bottom of schema.sql, substituting the authenticated UUID and proper email.
5. Configure a private hosting origin for any employee-facing app; add the production domain to Supabase allowed redirect origins.
6. **Do not put service_role keys, real passwords, customer information, or backups in GitHub.**
7. Do not start employee access until the login UI, admin user-provisioning backend, credential reset, audit coverage, permissions, and access tests are complete.

## Scope delivered in this commit
PostgreSQL tables for roles, profiles, role permission matrix, attendance, company settings, and audit history. Supabase Row Level Security restricts access at the database level. Starting permission matrix is conservative and editable by Admin. An employee's existing attendance cannot be modified by themselves; admin may adjust it.

## Scope not yet delivered
- Username/password web login and account provisioning backend, reset/lockout/2FA.
- Full attendance UI, monthly charts and Excel export.
- True field-level security for cost/salary data; must be implemented with restricted views/RPC.
- Approval workflows, stock ledger and dispatch state machine.
- All subsequent dashboards and ERP modules.

## Security notes
Do not migrate confidential CRM data to the root GitHub Pages app. GitHub Pages alone has no backend. For attendance and roles, rely on database RLS rather than CSS hiding. The Admin creates employees via a trusted server-side API (never the client with a service key). Additional audit triggers and tests must be added to all future tables.

## Definition of done — Phase 1
- Employee authentication and verified authorization, disabled users denied.
- Admin CRUD of user records and role matrix; server-side access tests for every role.
- Attendance topbar, own entry once/day, admin corrections, weekly/monthly charts, Excel export.
- Company logo update, full audit trail, setup and recovery documentation.
- Automated security tests and deployment verification before any production release.

## Roadmap
Phase 2 CRM/Telecaller/Sales; Phase 3 stock, BOM, orders/dispatch; Phase 4 PO/Accounts; Phase 5 Admin/Director MIS and integrations. Source business process: Greenrich ERP flowchart and requirements shared by owner.
