-- Expand admin designer to live CRM and Operations/ERP record forms.
-- CRUD remains company-scoped and protected by existing permissions/RLS.
alter table public.gr_form_schemas drop constraint if exists gr_form_schemas_form_key_check;
alter table public.gr_form_answers drop constraint if exists gr_form_answers_form_key_check;
alter table public.gr_form_schemas add constraint gr_form_schemas_form_key_check
check(form_key in ('lead_create','lead_stage','customer','sales_order',
'ops_material','ops_vendor','ops_bom','ops_requisition','ops_purchase_order',
'ops_goods_receipt','ops_job_work','ops_work_order','ops_qc','ops_dispatch_check',
'ops_receivable','ops_service'));
alter table public.gr_form_answers add constraint gr_form_answers_form_key_check
check(form_key in ('lead_create','lead_stage','customer','sales_order',
'ops_material','ops_vendor','ops_bom','ops_requisition','ops_purchase_order',
'ops_goods_receipt','ops_job_work','ops_work_order','ops_qc','ops_dispatch_check',
'ops_receivable','ops_service'));
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
  when p_form in ('ops_material','ops_bom','ops_work_order','ops_qc') then
   exists(select 1 from public.gr_profiles p join public.gr_role_permissions rp on rp.role_id=p.role_id
    where p.id=auth.uid() and p.active and rp.module='stock' and rp.action in ('create','edit') and rp.allowed)
  when p_form in ('ops_vendor','ops_requisition','ops_purchase_order','ops_goods_receipt','ops_job_work') then
   exists(select 1 from public.gr_profiles p join public.gr_role_permissions rp on rp.role_id=p.role_id
    where p.id=auth.uid() and p.active and rp.module='purchase' and rp.action in ('create','edit') and rp.allowed)
  when p_form='ops_dispatch_check' then
   exists(select 1 from public.gr_profiles p join public.gr_role_permissions rp on rp.role_id=p.role_id
    where p.id=auth.uid() and p.active and rp.module='dispatch' and rp.action in ('create','edit') and rp.allowed)
  when p_form='ops_receivable' then
   exists(select 1 from public.gr_profiles p join public.gr_role_permissions rp on rp.role_id=p.role_id
    where p.id=auth.uid() and p.active and rp.module='accounts' and rp.action in ('create','edit') and rp.allowed)
  when p_form='ops_service' then
   exists(select 1 from public.gr_profiles p join public.gr_role_permissions rp on rp.role_id=p.role_id
    where p.id=auth.uid() and p.active and rp.module='customers' and rp.action in ('create','edit') and rp.allowed)
  else false end)
$$;
revoke all on function public.gr_form_can_use(text,text) from public,anon;
grant execute on function public.gr_form_can_use(text,text) to authenticated;
