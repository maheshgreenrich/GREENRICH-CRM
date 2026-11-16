-- Company-specific repeating header/footer, edited in the visual quotation designer.
-- A separate table prevents product templates from overriding shared letterhead.
create table if not exists public.gr_quotation_letterheads (
 company_id text primary key references public.gr_companies(id),
 config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
 updated_by uuid not null references public.gr_profiles(id),
 updated_at timestamptz not null default now()
);
alter table public.gr_quotation_letterheads enable row level security;
revoke all on public.gr_quotation_letterheads from public,anon;
grant select,insert,update on public.gr_quotation_letterheads to authenticated;
create policy gr_quote_letterhead_read on public.gr_quotation_letterheads
 for select to authenticated using (public.gr_crm_can(company_id,'sales','view'));
create policy gr_quote_letterhead_insert on public.gr_quotation_letterheads
 for insert to authenticated with check (public.gr_field_is_admin(company_id) and updated_by=auth.uid());
create policy gr_quote_letterhead_update on public.gr_quotation_letterheads
 for update to authenticated using (public.gr_field_is_admin(company_id))
 with check (public.gr_field_is_admin(company_id) and updated_by=auth.uid());
