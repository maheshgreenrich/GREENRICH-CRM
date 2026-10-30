-- GreenRich ONE Customer & Lead source master, shared across both registered companies.
-- Only Admin can create/rename/deactivate sources; active employees can use the list.
-- Existing customers, leads, orders, stock, Attendance remain untouched.
create table if not exists public.gr_crm_sources(
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 2 and 80),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists gr_crm_sources_name_ci on public.gr_crm_sources(lower(btrim(name)));
alter table public.gr_crm_sources enable row level security;
drop policy if exists "employees view lead sources" on public.gr_crm_sources;
drop policy if exists "admin creates lead sources" on public.gr_crm_sources;
drop policy if exists "admin updates lead sources" on public.gr_crm_sources;
drop policy if exists "admin deletes lead sources" on public.gr_crm_sources;
create policy "employees view lead sources" on public.gr_crm_sources for select to authenticated
 using((select public.gr_crm_active_employee()));
create policy "admin creates lead sources" on public.gr_crm_sources for insert to authenticated
 with check((select public.gr_is_admin()));
create policy "admin updates lead sources" on public.gr_crm_sources for update to authenticated
 using((select public.gr_is_admin())) with check((select public.gr_is_admin()));
create policy "admin deletes lead sources" on public.gr_crm_sources for delete to authenticated
 using((select public.gr_is_admin()));
grant select,insert,update,delete on public.gr_crm_sources to authenticated;
insert into public.gr_crm_sources(name)
select v from unnest(array[
 'Website','Meta','Google','Direct','IndiaMART','TradeIndia','Reference','WhatsApp','Phone Call','Other'
]) as v on conflict do nothing;
do $$ begin
 if not exists(select 1 from pg_publication_tables
 where pubname='supabase_realtime' and schemaname='public' and tablename='gr_crm_sources') then
   alter publication supabase_realtime add table public.gr_crm_sources;
 end if;
end $$;
