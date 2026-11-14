# Phase 1A — Lead Management Security Audit (read-only)

Status: audit findings and non-destructive repository contract tests only. No production SQL changes. Reviewed 2026-11-14.

## Verified production metadata
- RLS enabled: public.gr_lead_pipeline, public.gr_lead_stage_history, public.gr_crm_records, public.gr_crm_customers.
- gr_lead_pipeline SELECT policy: gr_lead_can(company_id, assigned_to, 'view').
- gr_lead_stage_history SELECT policy: existence of a lead visible through gr_lead_can.
- No direct INSERT/UPDATE/DELETE policies observed for the two lead tables; mutations use SECURITY DEFINER RPCs.
- 12 lead-related helper/pipeline functions inspected. All are SECURITY DEFINER with empty search_path; authenticated EXECUTE is granted on 11, not on gr_pipeline_move_with_interests; anon EXECUTE was false on all inspected functions.
- Current code paths: greenrich-lead-pipeline.js, greenrich-lead-profile.js, greenrich-followup-alarm.js, greenrich-crm-cloud.js.

## Findings requiring staging reproduction
**HIGH — Cross-company customer references.** gr_pipeline_create and gr_pipeline_link_customer check customer existence by id only, without an explicit company-membership predicate. gr_pipeline_win_with_order also loads the customer by id only. Verify customer membership model and reject cross-company references where applicable.

**HIGH — Tag ownership.** gr_pipeline_move_with_interests validates tags by tag ID without an explicit company predicate. Confirm whether tags are intentionally global; otherwise enforce company scope.

**MEDIUM — Authorization semantics for unassigned leads.** gr_lead_can permits Sales/Telecaller access to unassigned leads with matching action permission; verify expected create/edit/view semantics.

**MEDIUM — Role assignment.** gr_pipeline_create permits assignment through gr_lead_can_manage or own-create authorization; gr_pipeline_assign checks manager access to the current assignee. Test that neither route permits unauthorized cross-team reassignment.

**MEDIUM — Follow-up stage semantics.** gr_pipeline_followup_respond blocks Won but not Lost. Confirm expected behavior for Lost leads.

**MEDIUM — Follow-up timestamp synchronization.** gr_pipeline_move changes next_followup date but does not visibly clear next_followup_at for terminal stages; verify use of gr_pipeline_advance in all current workflows.

**REVIEW — SECURITY DEFINER grants.** Authenticated callers can invoke most pipeline RPCs; validate authorization within each function. No anon EXECUTE privileges observed for inspected functions.

**REVIEW — Source of truth.** Pipeline and gr_crm_records JSON payload are both updated by RPCs. Check for divergence during migration and concurrent writes.

## Staging authorization test matrix (NOT executed)
1. Unauthenticated API client: every pipeline RPC denied.
2. Inactive employee: read and write denied.
3. Sales user own lead: allowed according to permissions.
4. Sales user other employee lead: denied unless team/all scope.
5. Manager team lead: allowed only when team permission permits.
6. Cross-company lead ID and customer ID: denied.
7. Cross-company product and tag references: denied unless global by design.
8. Unassigned lead: allowed only under approved Common lead policy.
9. Direct table INSERT/UPDATE/DELETE from browser role: denied.
10. Unauthorized reassignment and Won conversion: denied.
11. SQL injection-like strings in all text arguments: handled as data.
12. Concurrent updates: consistent history and pipeline state.

## Tests added
- tests/lead-security-contract.test.cjs: node:test, reads local source only; no network, credentials, DB mutations, or external packages.
- Run: node --test tests/lead-security-contract.test.cjs

## Release gate
Do not deploy RLS changes, function changes, or frontend updates until the staging matrix is executed with distinct test identities, the authorization model is approved, and a rollback is prepared. The tests here are static smoke checks, not proof of security.
