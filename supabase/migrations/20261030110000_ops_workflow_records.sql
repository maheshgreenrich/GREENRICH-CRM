-- GreenRich ONE Operations Phase 1, derived from the uploaded Operations SOP and FG-001 workbook.
-- Existing Attendance, Sales, Dispatch, warehouse stock, invoices and financial ledgers are untouched.
create table if not exists public.gr_ops_records(
 company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 kind text not null check(kind in ('material','vendor','bom','requisition','purchase_order','goods_receipt','job_work','work_order','qc','dispatch_check','receivable','service')),
 record_id text not null check(length(record_id) between 1 and 100),
 payload jsonb not null check(jsonb_typeof(payload)='object' and payload->>'id'=record_id),
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid(),
 primary key(company_id,kind,record_id)
);
create index if not exists gr_ops_records_company_kind_idx on public.gr_ops_records(company_id,kind);
alter table public.gr_ops_records enable row level security;
create or replace function public.gr_ops_allowed(company text, operation_kind text, operation_action text)
 returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.gr_profiles p join public.gr_roles role on role.id=p.role_id
  where p.id=(select auth.uid()) and p.active and company=any(p.company_ids)
  and (role.name='Admin' or exists(
    select 1 from public.gr_role_permissions r where r.role_id=p.role_id and r.allowed
     and r.action=operation_action
     and r.module=case
       when operation_kind in ('material','bom','work_order','qc') then 'stock'
       when operation_kind in ('vendor','requisition','purchase_order','goods_receipt','job_work') then 'purchase'
       when operation_kind='dispatch_check' then 'dispatch'
       when operation_kind='receivable' then 'accounts'
       when operation_kind='service' then 'customers'
       else 'stock' end
  ))
 );
 $$;
revoke all on function public.gr_ops_allowed(text,text,text) from public,anon;
grant execute on function public.gr_ops_allowed(text,text,text) to authenticated;
drop policy if exists "ops read permitted" on public.gr_ops_records;
drop policy if exists "ops add permitted" on public.gr_ops_records;
drop policy if exists "ops update permitted" on public.gr_ops_records;
drop policy if exists "ops delete permitted" on public.gr_ops_records;
create policy "ops read permitted" on public.gr_ops_records for select to authenticated using(public.gr_ops_allowed(company_id,kind,'view'));
create policy "ops add permitted" on public.gr_ops_records for insert to authenticated with check(public.gr_ops_allowed(company_id,kind,'create'));
create policy "ops update permitted" on public.gr_ops_records for update to authenticated
 using(public.gr_ops_allowed(company_id,kind,'edit')) with check(public.gr_ops_allowed(company_id,kind,'edit'));
create policy "ops delete permitted" on public.gr_ops_records for delete to authenticated using(public.gr_ops_allowed(company_id,kind,'delete'));
revoke all on public.gr_ops_records from anon,authenticated;
grant select,insert,update,delete on public.gr_ops_records to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gr_ops_records') then
  alter publication supabase_realtime add table public.gr_ops_records;
 end if;
end $$;
