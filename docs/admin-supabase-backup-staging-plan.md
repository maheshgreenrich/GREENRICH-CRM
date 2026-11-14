# GREENRICH CRM — Admin / Supabase-only / Backup staging plan

## Current branch status
The feature branch contains a **candidate** Admin Edge Function source and frontend password-reset UI. They are not deployed. Production still runs the existing email-link reset. This repository change is not yet an end-to-end release.

## Admin access
- Default delete action: deactivate profile and ban Supabase Auth login; preserve linked historical records and identity.
- Admin-only direct password reset via Supabase Auth Admin API, with server-held service-role key; no password in audit log.
- Before deployment, test privileged role checks, self-service password change separately, password policy, stale sessions, deactivation failures and recovery.
- The current frontend password prompt is a temporary implementation; replace with a masked password/confirmation dialog before deployment.
- Existing profile edit, create, view, enable/disable need staging regression tests.
- Deactivation and ban are two API calls and are not atomic; staging must exercise partial failure and administrator recovery.
- A reset may not immediately revoke existing sessions; review Supabase session revocation and JWT expiry before launch.

## Supabase-only business data: mandatory migration gate
- Inventory all browser storage keys in every JS module; distinguish Auth/session/config from business records.
- Current greenrich-crm-cloud.js writes synchronized CRM snapshots and legacy backup to localStorage.
- Never remove legacy data until verified server migration, row counts, checksums, ownership, attachments and rollback.
- Replace persistent browser business-data snapshots with in-memory state and server pagination; validate offline/reconnect behavior.
- All module writes must go through Supabase with RLS; audit unprotected client writes.

## Backup and restore design (not yet implemented)
- Admin-only server-side export job, schema-versioned manifest, company scoping, selected module list, row counts, checksums, attachments inventory.
- Export as encrypted, short-lived signed download of JSON/NDJSON and storage objects. Never export Auth passwords, service-role keys or secrets.
- Restore only to a compatible isolated staging project first. Preview schema differences, conflicts, references, file attachments, IDs and tenant mappings.
- Import in dependency order with idempotent batches, mapping old user IDs to destination identities; no silent overwrite.
- Offer full CRM and per-module export; restore supports dry-run and explicit confirmation.
- Test multi-company isolation, large exports, pagination, deleted/disabled users, time zones, file permissions, partial failure and repeat imports.
- A single-click export is not the same as a guaranteed portable disaster-recovery backup; Supabase platform backup and Auth/Storage configuration require separate recovery procedures.

## Release gates
1. Verify branch code with node --test tests/admin-user-policy.test.cjs.
2. Set up isolated Supabase staging; deploy candidate function there only.
3. Test with at least two admin and employee identities, no production credentials.
4. Complete browser-storage migration and backup/restore implementation, then run end-to-end restore rehearsal.
5. Security review, production backup, approval, and controlled deployment; no automatic merge to main.
