-- One layout per form across GreenRich companies. Legacy company layouts remain as backups.
create table public.gr_shared_form_schemas (
 form_key text primary key check(form_key in ('lead_create','lead_stage','customer','sales_order',
  'ops_material','ops_vendor','ops_bom','ops_requisition','ops_purchase_order',
  'ops_goods_receipt','ops_job_work','ops_work_order','ops_qc','ops_dispatch_check','ops_receivable','ops_service')),
 fields jsonb not null default '[]'::jsonb check(jsonb_typeof(fields)='array' and pg_column_size(fields)<=50000),
 version bigint not null default 1 check(version>0),
 updated_by uuid references public.gr_profiles(id),
 updated_at timestamptz not null default now()
);
insert into public.gr_shared_form_schemas(form_key,fields,version,updated_by,updated_at)
 select distinct on(form_key) form_key,fields,version,updated_by,updated_at
 from public.gr_form_schemas order by form_key,updated_at desc,version desc,company_id;
alter table public.gr_shared_form_schemas enable row level security;
create policy "shared form readers" on public.gr_shared_form_schemas for select to authenticated
 using(public.gr_crm_active_employee());
create policy "shared form admin insert" on public.gr_shared_form_schemas for insert to authenticated
 with check(public.gr_is_admin() and updated_by=auth.uid());
create policy "shared form admin update" on public.gr_shared_form_schemas for update to authenticated
 using(public.gr_is_admin()) with check(public.gr_is_admin() and updated_by=auth.uid());
revoke all on public.gr_shared_form_schemas from public,anon,authenticated;
grant select,insert,update on public.gr_shared_form_schemas to authenticated;
-- Customer identities and their extra answers are common to both companies.
-- Transaction and lead answer visibility remains governed by the existing policies.
create policy "shared customer form answers reader" on public.gr_form_answers for select to authenticated
 using(form_key='customer' and public.gr_crm_active_employee());
