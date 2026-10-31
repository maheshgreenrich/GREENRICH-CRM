-- GreenRich ONE company-scoped, Admin-controlled form schemas + extra answers.
-- Never rewrites native Lead/Customer/Sales Order data or removes server validations.
create table if not exists public.gr_form_schemas(
 company_id text not null references public.gr_companies(id),
 form_key text not null check(form_key in ('lead_create','lead_stage','customer','sales_order')),
 fields jsonb not null default '[]'::jsonb check(jsonb_typeof(fields)='array' and pg_column_size(fields)<=50000),
 version bigint not null default 1 check(version>0),
 updated_by uuid references public.gr_profiles(id),
 updated_at timestamptz not null default now(),
 primary key(company_id,form_key)
);
create table if not exists public.gr_form_answers(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 form_key text not null check(form_key in ('lead_create','lead_stage','customer','sales_order')),
 entity_id text not null check(length(entity_id) between 1 and 128),
 answers jsonb not null default '{}'::jsonb check(jsonb_typeof(answers)='object' and pg_column_size(answers)<=30000),
 created_by uuid not null default auth.uid() references public.gr_profiles(id),
 created_at timestamptz not null default now()
);
create index if not exists gr_form_answers_lookup on public.gr_form_answers(company_id,form_key,entity_id,created_at desc);
create or replace function public.gr_form_is_admin(p_company text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
  where p.id=auth.uid() and p.active and p_company=any(p.company_ids) and r.name='Admin'
 )
$$;
create or replace function public.gr_form_can_use(p_company text,p_form text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.gr_profiles p where p.id=auth.uid() and p.active and p_company=any(p.company_ids)
 ) and (public.gr_form_is_admin(p_company) or
  case when p_form in ('lead_create','lead_stage') then
   public.gr_crm_can(p_company,'leads','insert') or public.gr_crm_can(p_company,'leads','update')
  when p_form='sales_order' then
   public.gr_crm_can(p_company,'sales','insert') or public.gr_crm_can(p_company,'sales','update')
  when p_form='customer' then public.gr_crm_can_write_customer()
  else false end)
$$;
revoke all on function public.gr_form_is_admin(text),public.gr_form_can_use(text,text) from public,anon;
grant execute on function public.gr_form_is_admin(text),public.gr_form_can_use(text,text) to authenticated;
alter table public.gr_form_schemas enable row level security;
alter table public.gr_form_answers enable row level security;
drop policy if exists "form schema company readers" on public.gr_form_schemas;
drop policy if exists "form schema admin insert" on public.gr_form_schemas;
drop policy if exists "form schema admin update" on public.gr_form_schemas;
create policy "form schema company readers" on public.gr_form_schemas
 for select to authenticated using(public.gr_form_can_use(company_id,form_key));
create policy "form schema admin insert" on public.gr_form_schemas
 for insert to authenticated with check(public.gr_form_is_admin(company_id) and updated_by=auth.uid());
create policy "form schema admin update" on public.gr_form_schemas
 for update to authenticated using(public.gr_form_is_admin(company_id))
 with check(public.gr_form_is_admin(company_id) and updated_by=auth.uid());
drop policy if exists "form answers private reader" on public.gr_form_answers;
drop policy if exists "form answers employee insert" on public.gr_form_answers;
create policy "form answers private reader" on public.gr_form_answers
 for select to authenticated using(public.gr_form_is_admin(company_id) or
 (created_by=auth.uid() and public.gr_form_can_use(company_id,form_key)));
create policy "form answers employee insert" on public.gr_form_answers
 for insert to authenticated with check(created_by=auth.uid() and public.gr_form_can_use(company_id,form_key));
revoke all on public.gr_form_schemas,public.gr_form_answers from public,anon,authenticated;
grant select on public.gr_form_schemas,public.gr_form_answers to authenticated;
grant insert(company_id,form_key,fields,version,updated_by) on public.gr_form_schemas to authenticated;
grant update(fields,version,updated_by,updated_at) on public.gr_form_schemas to authenticated;
grant insert(company_id,form_key,entity_id,answers,created_by) on public.gr_form_answers to authenticated;
