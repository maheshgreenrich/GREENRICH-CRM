-- GreenRich ONE Phase 1: Supabase PostgreSQL schema
-- Run in a NEW Supabase project SQL editor. Do not use localStorage as a security boundary.
create extension if not exists pgcrypto;
create table if not exists public.gr_roles (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 description text default '',
 created_at timestamptz not null default now()
);
create table if not exists public.gr_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique,
 full_name text not null,
 email text,
 mobile text,
 role_id uuid not null references public.gr_roles(id),
 manager_id uuid references public.gr_profiles(id),
 territory text,
 joining_date date,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.gr_role_permissions (
 role_id uuid not null references public.gr_roles(id) on delete cascade,
 module text not null,
 action text not null check(action in ('view','create','edit','delete','approve','export')),
 data_scope text not null default 'own' check(data_scope in ('own','team','all')),
 allowed boolean not null default false,
 primary key(role_id,module,action)
);
create table if not exists public.gr_attendance (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.gr_profiles(id),
 attendance_date date not null,
 status text not null check(status in ('present','absent','half_day')),
 remark text default '',
 marked_by uuid not null references public.gr_profiles(id),
 marked_at timestamptz not null default now(),
 unique(user_id,attendance_date)
);
create table if not exists public.gr_company_settings (
 id integer primary key default 1 check(id=1),
 company_name text not null default 'GreenRich Grow India Private Limited',
 logo_url text,
 updated_at timestamptz not null default now()
);
create table if not exists public.gr_audit_log (
 id bigint generated always as identity primary key,
 actor_id uuid,
 entity text not null,
 entity_id text,
 operation text not null,
 old_value jsonb,
 new_value jsonb,
 created_at timestamptz not null default now()
);
insert into public.gr_company_settings(id) values (1) on conflict do nothing;
insert into public.gr_roles(name,description) values
 ('Admin','System administration'),('Director','Executive oversight'),('Sales','Sales team'),
 ('Telecaller','Calling and lead follow-up'),('Marketing','Campaigns and source analysis'),
 ('Operation','Production and logistics'),('Accounts','Finance'),
 ('Developer','Configuration and development')
 on conflict(name) do nothing;
-- Default permissions are conservative; administrators may modify them in Settings.
insert into public.gr_role_permissions(role_id,module,action,data_scope,allowed)
select r.id,m.module,a.action,
 case when r.name in ('Admin','Director') then 'all' else 'own' end,
 case when r.name='Admin' then true
      when r.name='Director' then a.action in ('view','export','approve') and m.module not in ('settings','users','roles')
      when r.name in ('Sales','Telecaller') then m.module in ('leads','customers','attendance','sales') and a.action in ('view','create','edit')
      when r.name='Marketing' then m.module in ('leads','marketing','attendance') and a.action in ('view','create','edit','export')
      when r.name='Operation' then m.module in ('stock','orders','purchase','attendance') and a.action in ('view','create','edit')
      when r.name='Accounts' then m.module in ('accounts','purchase','attendance') and a.action in ('view','create','edit','export','approve')
      when r.name='Developer' then m.module in ('attendance') and a.action in ('view','create','edit')
      else false end
from public.gr_roles r cross join
 (values('dashboard'),('users'),('roles'),('settings'),('attendance'),('leads'),('customers'),
 ('sales'),('marketing'),('orders'),('stock'),('purchase'),('accounts'),('reports')) m(module)
 cross join (values('view'),('create'),('edit'),('delete'),('approve'),('export')) a(action)
on conflict(role_id,module,action) do nothing;
create or replace function public.gr_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from gr_profiles p join gr_roles r on r.id=p.role_id where p.id=auth.uid() and p.active and r.name='Admin') $$;
create or replace function public.gr_allowed(p_module text,p_action text)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from gr_profiles p join gr_role_permissions rp on rp.role_id=p.role_id
 where p.id=auth.uid() and p.active and rp.module=p_module and rp.action=p_action and rp.allowed) $$;
create or replace function public.gr_attendance_scope(p_target uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select p_target=auth.uid() or public.gr_is_admin() or exists(
 select 1 from gr_profiles p join gr_role_permissions rp on rp.role_id=p.role_id
 where p.id=auth.uid() and p.active and rp.module='attendance' and rp.action='view'
 and rp.allowed and (rp.data_scope='all' or (rp.data_scope='team' and exists
 (select 1 from gr_profiles e where e.id=p_target and e.manager_id=auth.uid())))) $$;
alter table public.gr_roles enable row level security;
alter table public.gr_profiles enable row level security;
alter table public.gr_role_permissions enable row level security;
alter table public.gr_attendance enable row level security;
alter table public.gr_company_settings enable row level security;
alter table public.gr_audit_log enable row level security;
create policy "roles read" on public.gr_roles for select to authenticated using(true);
create policy "roles admin insert" on public.gr_roles for insert to authenticated with check(public.gr_is_admin());
create policy "roles admin update" on public.gr_roles for update to authenticated using(public.gr_is_admin()) with check(public.gr_is_admin());
create policy "profiles read scoped" on public.gr_profiles for select to authenticated
 using(id=auth.uid() or public.gr_is_admin() or public.gr_allowed('users','view'));
create policy "profiles admin insert" on public.gr_profiles for insert to authenticated with check(public.gr_is_admin());
create policy "profiles admin update" on public.gr_profiles for update to authenticated using(public.gr_is_admin()) with check(public.gr_is_admin());
create policy "permissions read" on public.gr_role_permissions for select to authenticated
 using(public.gr_is_admin() or role_id=(select role_id from public.gr_profiles where id=auth.uid()));
create policy "permissions admin insert" on public.gr_role_permissions for insert to authenticated with check(public.gr_is_admin());
create policy "permissions admin update" on public.gr_role_permissions for update to authenticated using(public.gr_is_admin()) with check(public.gr_is_admin());
create policy "permissions admin delete" on public.gr_role_permissions for delete to authenticated using(public.gr_is_admin());
create policy "attendance read scoped" on public.gr_attendance for select to authenticated using(public.gr_attendance_scope(user_id));
create policy "attendance insert self/admin" on public.gr_attendance for insert to authenticated
 with check(marked_by=auth.uid() and (user_id=auth.uid() or public.gr_is_admin()) and public.gr_allowed('attendance','create'));
create policy "attendance update admin" on public.gr_attendance for update to authenticated
 using(public.gr_is_admin()) with check(public.gr_is_admin());
create policy "company read" on public.gr_company_settings for select to authenticated using(true);
create policy "company admin update" on public.gr_company_settings for update to authenticated using(public.gr_is_admin()) with check(public.gr_is_admin());
create policy "audit admin read" on public.gr_audit_log for select to authenticated using(public.gr_is_admin());
-- Attendance mutations are logged even if invoked via REST.
create or replace function public.gr_audit_attendance() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into gr_audit_log(actor_id,entity,entity_id,operation,old_value,new_value)
 values(auth.uid(),'attendance',new.id::text,tg_op,
 case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
create trigger gr_attendance_audit after insert or update on public.gr_attendance
 for each row execute function public.gr_audit_attendance();
-- Bootstrap first admin ONLY via trusted SQL editor, after creating a user in Supabase Authentication.
-- insert into public.gr_profiles(id,username,full_name,email,role_id)
-- select '<AUTH_USER_UUID>'::uuid,'admin','GreenRich Admin','admin@greenrich.example',id
-- from public.gr_roles where name='Admin';
-- IMPORTANT: add database audit triggers and field-level RLS/view controls for future modules before launch.
