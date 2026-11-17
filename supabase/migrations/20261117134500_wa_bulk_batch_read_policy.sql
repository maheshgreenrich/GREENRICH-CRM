-- Read-only campaign batch reporting for authorized company Marketing users.
-- Never allow browser writes to provider statistics.
alter table public.gr_wa_bulk_batches enable row level security;
revoke all on public.gr_wa_bulk_batches from public,anon,authenticated;
grant select on public.gr_wa_bulk_batches to authenticated;
drop policy if exists gr_wa_bulk_batches_company_read on public.gr_wa_bulk_batches;
create policy gr_wa_bulk_batches_company_read on public.gr_wa_bulk_batches
 for select to authenticated using(public.gr_wa_allowed(company_id,'view'));