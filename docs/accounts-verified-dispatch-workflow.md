# Accounts-verified dispatch workflow — implementation contract

Status: proposed, NOT deployed. Approved business rule: Accounts verifies and issues invoice before dispatch may proceed.

## Stages
1. Sales order created -> pending_approval.
2. Authorized sales approver validates line items, customer, tax, address, terms; approve -> approved_awaiting_accounts.
3. Authorized accounts reviewer verifies tax details and payment terms, issues invoice -> invoice_ready. Reject -> accounts_changes_required; no dispatch handoff.
4. Dispatch may progress pending -> packed -> shipped -> delivered only if invoice_ready and not cancelled.
5. Cancellation before shipment -> cancelled sales order; linked dispatch -> so_cancelled, with further progression blocked.
6. After shipment -> recall/return workflow, not erase shipment history.
7. After delivery -> return request -> approval -> reverse logistics -> inspection -> credit note -> refund. Preserve original sale and invoice audit trail.

## Permissions (backend enforced)
sales_order:create, sales_order:edit, sales_order:approve, sales_order:cancel, sales_order:delete
invoice:verify, invoice:issue, invoice:void, credit_note:create
dispatch:view, dispatch:update_status, dispatch:cancel, dispatch:delete
return:approve, refund:approve, refund:execute
roles:manage
Buttons must be hidden without permission AND database/API must reject unauthorized transitions. Admin role can assign permissions, not bypass statutory invoice retention or audit logs.

## Data consistency
Use a single authoritative sales order ID and linked invoice/dispatch/return records. A transition must be atomic and idempotent. Cancelled sales order value excluded from active sales KPI. Returns and credit notes adjust net sales separately. Maintain audit log for actor, timestamp, old/new state and reason.

## Acceptance tests
- Sales creator without approve permission cannot approve, even by direct API call.
- Approver can approve after validation; exactly one dispatch record created.
- Dispatch cannot be packed or shipped without accounts-verified invoice.
- Only authorized accounts user may issue invoice.
- Authorized dispatcher can update status and courier/AWB.
- Cancelling before shipment sets SO Cancelled and linked dispatch SO Cancelled.
- Delivered return uses credit note/refund flow, not retroactive deletion.
- Admin role permission changes immediately enforced server-side.
- Existing historical orders and invoices remain unchanged by migration.
- Duplicate click/retry does not duplicate invoice or dispatch.

## Deployment safety
Implement on feature branch, inspect existing JS and Supabase RLS/policies, add schema migration and integration tests, back up production data, stage and verify with test records before merging. No production data deletion or irreversible invoice mutation without a separate confirmation.
