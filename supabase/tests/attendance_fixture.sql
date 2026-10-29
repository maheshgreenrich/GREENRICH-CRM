-- Minimal PostgreSQL fixture for CI, not to be run on the live Supabase project.
create schema if not exists auth;
create table auth.users(id uuid primary key,email text unique);
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
do $$
begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin;end if;
end $$;
create table public.gr_roles(id uuid primary key default gen_random_uuid(),name text unique not null);
create table public.gr_profiles(
 id uuid primary key references auth.users(id),
 full_name text not null,username text unique not null,
 role_id uuid not null references public.gr_roles(id),
 active boolean not null default true,
 joining_date date,
 manager_id uuid references public.gr_profiles(id)
);
insert into auth.users values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin@example.test'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','office@example.test'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','employee@example.test'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','employee2@example.test');
insert into public.gr_roles(name) values('Admin'),('Office Admin'),('Sales');
insert into public.gr_profiles(id,full_name,username,role_id,joining_date)
select u.id,split_part(u.email,'@',1),split_part(u.email,'@',1),r.id,'2026-01-01'
from auth.users u join public.gr_roles r on r.name=case
 when u.email='admin@example.test' then 'Admin'
 when u.email='office@example.test' then 'Office Admin'
 else 'Sales' end;
