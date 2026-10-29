-- Shared GreenRich customer directory and tags. This reflects the schema deployed to the connected project.
-- The completed Attendance subsystem is unrelated and not changed.
create table if not exists public.gr_crm_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists gr_crm_tags_name_ci on public.gr_crm_tags(lower(btrim(name)));

create table if not exists public.gr_crm_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) > 0),
  email text check(position('@' in email)>1),
  mobile text,
  mobile2 text,
  address1 text,
  address2 text not null default '',
  city text not null default '',
  state text not null default '',
  pincode text not null default '',
  country text not null default 'India',
  company text not null default '',
  type text not null default 'Individual',
  gstin text not null default '',
  source text not null default '',
  owner text not null default '',
  notes text not null default '',
  tag_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists gr_crm_customers_email_ci on public.gr_crm_customers(lower(btrim(email)));
create index if not exists gr_crm_customers_name_search on public.gr_crm_customers(lower(name));

create or replace function public.gr_crm_active_employee() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.gr_profiles where id=(select auth.uid()) and active);
$$;
create or replace function public.gr_crm_can_write_customer() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
  where p.id=(select auth.uid()) and p.active and
  (r.name='Admin' or exists(select 1 from public.gr_role_permissions perm where perm.role_id=p.role_id
     and perm.allowed and perm.action='create' and perm.module in ('sales','customers')))
 );
$$;
create or replace function public.gr_crm_can_edit_customer() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
  where p.id=(select auth.uid()) and p.active and
  (r.name='Admin' or exists(select 1 from public.gr_role_permissions perm where perm.role_id=p.role_id
      and perm.allowed and perm.action='edit' and perm.module='customers'))
 );
$$;
revoke all on function public.gr_crm_active_employee() from public,anon;
revoke all on function public.gr_crm_can_write_customer() from public,anon;
revoke all on function public.gr_crm_can_edit_customer() from public,anon;
grant execute on function public.gr_crm_active_employee() to authenticated;
grant execute on function public.gr_crm_can_write_customer() to authenticated;
grant execute on function public.gr_crm_can_edit_customer() to authenticated;

create or replace function public.gr_crm_check_customer_numbers() returns trigger
language plpgsql set search_path='' as $$
declare
 a text := right(regexp_replace(coalesce(new.mobile,''),'[^0-9]','','g'),10);
 b text := right(regexp_replace(coalesce(new.mobile2,''),'[^0-9]','','g'),10);
begin
 if (a<>'' and length(a)<>10) or (b<>'' and length(b)<>10) or (a<>'' and a=b) then
   raise exception 'Enter valid distinct 10-digit customer mobile numbers' using errcode='23514';
 end if;
 perform pg_advisory_xact_lock(4291137);
 if exists (
  select 1 from public.gr_crm_customers c where c.id<>new.id
   and (
    (a<>'' and (right(regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g'),10)=a
      or right(regexp_replace(coalesce(c.mobile2,''),'[^0-9]','','g'),10)=a))
    or (b<>'' and (right(regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g'),10)=b
      or right(regexp_replace(coalesce(c.mobile2,''),'[^0-9]','','g'),10)=b))
   )
 ) then raise exception 'Duplicate customer: mobile number already exists' using errcode='23505';
 end if;
 return new;
end;
$$;
drop trigger if exists gr_crm_check_customer_numbers on public.gr_crm_customers;
create trigger gr_crm_check_customer_numbers before insert or update of mobile,mobile2
 on public.gr_crm_customers for each row execute function public.gr_crm_check_customer_numbers();
revoke all on function public.gr_crm_check_customer_numbers() from public,anon,authenticated;

alter table public.gr_crm_customers enable row level security;
alter table public.gr_crm_tags enable row level security;
create policy "active employees read all customers" on public.gr_crm_customers
 for select to authenticated using ((select public.gr_crm_active_employee()));
create policy "CRM staff add customers" on public.gr_crm_customers
 for insert to authenticated with check ((select public.gr_crm_can_write_customer()));
create policy "customer editors update contacts" on public.gr_crm_customers
 for update to authenticated using ((select public.gr_crm_can_edit_customer()))
 with check ((select public.gr_crm_can_edit_customer()));
create policy "admin deletes customers" on public.gr_crm_customers
 for delete to authenticated using ((select public.gr_is_admin()));
create policy "active employees read tags" on public.gr_crm_tags
 for select to authenticated using ((select public.gr_crm_active_employee()));
create policy "admin adds tags" on public.gr_crm_tags
 for insert to authenticated with check ((select public.gr_is_admin()));
create policy "admin edits tags" on public.gr_crm_tags
 for update to authenticated using ((select public.gr_is_admin()))
 with check ((select public.gr_is_admin()));
create policy "admin removes tags" on public.gr_crm_tags
 for delete to authenticated using ((select public.gr_is_admin()));
grant select,insert,update,delete on public.gr_crm_customers to authenticated;
grant select,insert,update,delete on public.gr_crm_tags to authenticated;
