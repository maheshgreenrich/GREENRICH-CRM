-- Company-scoped shared CRM records, migrating from browser-local GreenRich ONE.
-- Customers/tags already use their own shared tables; Dispatch already has a cloud queue.
-- Does not touch Attendance data, policies, or functions.
create table if not exists public.gr_crm_records(
 company_id text not null check (company_id in ('grow-india','enviro-solutions')),
 kind text not null check (kind in ('sales','products','channels','leads','tasks')),
 record_id text not null check(length(record_id) between 1 and 128),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 updated_at timestamptz not null default now(),
 created_by uuid not null default auth.uid(),
 primary key(company_id,kind,record_id),
 constraint gr_crm_payload_id check(payload ->> 'id'=record_id)
);
create index if not exists gr_crm_records_kind_idx on public.gr_crm_records(company_id,kind);
create or replace function public.gr_crm_can(p_company text,p_kind text,p_action text)
 returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(
  select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
  where p.id=(select auth.uid()) and p.active and p_company=any(p.company_ids)
  and (r.name='Admin' or exists(
   select 1 from public.gr_role_permissions perms where perms.role_id=p.role_id and perms.allowed
   and perms.action=case when p_action='view' then 'view'
    when p_action='insert' then 'create' when p_action='update' then 'edit'
    when p_action='delete' then 'delete' end
   and perms.module=any(case p_kind
    when 'sales' then array['sales','orders']::text[]
    when 'products' then case when p_action in ('view','update') then array['stock','sales','orders']::text[] else array['stock']::text[] end
    when 'channels' then case when p_action='view' then array['sales','orders','settings']::text[] else array['settings']::text[] end
    when 'leads' then array['leads','crm']::text[]
    when 'tasks' then array['leads','tasks','marketing']::text[]
    else array[]::text[] end)
  ))
 );
 $$;
revoke all on function public.gr_crm_can(text,text,text) from public,anon;
grant execute on function public.gr_crm_can(text,text,text) to authenticated;
alter table public.gr_crm_records enable row level security;
drop policy if exists "authorized employees read assigned crm" on public.gr_crm_records;
drop policy if exists "authorized employees add crm" on public.gr_crm_records;
drop policy if exists "authorized employees update crm" on public.gr_crm_records;
drop policy if exists "authorized employees delete crm" on public.gr_crm_records;
create policy "authorized employees read assigned crm" on public.gr_crm_records
 for select to authenticated using (public.gr_crm_can(company_id,kind,'view'));
create policy "authorized employees add crm" on public.gr_crm_records
 for insert to authenticated with check(public.gr_crm_can(company_id,kind,'insert'));
create policy "authorized employees update crm" on public.gr_crm_records
 for update to authenticated using(public.gr_crm_can(company_id,kind,'update'))
 with check(public.gr_crm_can(company_id,kind,'update'));
create policy "authorized employees delete crm" on public.gr_crm_records
 for delete to authenticated using(public.gr_crm_can(company_id,kind,'delete'));
revoke all on public.gr_crm_records from anon,authenticated;
grant select,delete on public.gr_crm_records to authenticated;
grant insert(company_id,kind,record_id,payload) on public.gr_crm_records to authenticated;
grant update(payload,updated_at) on public.gr_crm_records to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public' and tablename='gr_crm_records') then
  alter publication supabase_realtime add table public.gr_crm_records;
 end if;
end $$;
