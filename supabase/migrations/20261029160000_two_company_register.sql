-- GreenRich ONE two-company register. RLS protects editing and restricts reads to signed-in active employees.
create table if not exists public.gr_companies (
 id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{2,48}$'),
 name text not null check (char_length(trim(name)) between 4 and 130),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
insert into public.gr_companies(id,name,active) values
 ('grow-india','GreenRich Grow India Pvt Ltd',true),
 ('enviro-solutions','GreenRich Enviro Solutions Pvt Ltd',true)
on conflict (id) do nothing;
alter table public.gr_companies enable row level security;
drop policy if exists "company register employee read" on public.gr_companies;
create policy "company register employee read" on public.gr_companies for select to authenticated
 using (exists (select 1 from public.gr_profiles p where p.id=(select auth.uid()) and p.active));
drop policy if exists "company register admin update" on public.gr_companies;
create policy "company register admin update" on public.gr_companies for update to authenticated
 using (public.gr_is_admin()) with check (public.gr_is_admin());
grant select on public.gr_companies to authenticated;
grant update(name,active,updated_at) on public.gr_companies to authenticated;
revoke all on public.gr_companies from anon;
