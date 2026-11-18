-- Non-destructive customer removal: retain links and history, hide from directory.
alter table public.gr_crm_customers add column if not exists deleted_at timestamptz;
alter table public.gr_crm_customers add column if not exists deleted_by uuid;
create or replace function public.gr_contact_can(p_module text,p_action text,p_owner uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from public.gr_profiles me join public.gr_roles r on r.id=me.role_id
 where me.id=(select auth.uid()) and me.active and (
 r.name='Admin' or exists (
 select 1 from public.gr_role_permissions perm where perm.role_id=me.role_id
 and perm.module=p_module and perm.action=p_action and perm.allowed
 and (perm.data_scope='all' or
      (perm.data_scope='own' and p_owner=me.id) or
      (perm.data_scope='team' and (p_owner=me.id or exists (
       select 1 from public.gr_profiles p where p.id=p_owner and p.manager_id=me.id and p.active
      ))))
 ))) $$;
revoke all on function public.gr_contact_can(text,text,uuid) from public,anon;
grant execute on function public.gr_contact_can(text,text,uuid) to authenticated;
-- Admin or role-granted customer delete. Foreign keys remain valid.
create or replace function public.gr_contact_delete_customer(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 select created_by into owner_id from public.gr_crm_customers where id=p_id and deleted_at is null for update;
 if not found then raise exception 'Customer not found or already removed'; end if;
 if not public.gr_contact_can('customers','delete',owner_id) then raise exception 'Customer delete permission required' using errcode='42501'; end if;
 update public.gr_crm_customers set deleted_at=clock_timestamp(),deleted_by=auth.uid(),updated_at=clock_timestamp() where id=p_id;
 return true;
end $$;
revoke all on function public.gr_contact_delete_customer(uuid) from public,anon;
grant execute on function public.gr_contact_delete_customer(uuid) to authenticated;
-- Atomic lead removal: pipeline history must be removed before the pipeline row.
create or replace function public.gr_contact_delete_lead(p_company text,p_lead text)
returns boolean language plpgsql security definer set search_path='' as $$
declare assignee uuid;
begin
 select assigned_to into assignee from public.gr_lead_pipeline
 where company_id=p_company and lead_id=p_lead for update;
 if not found then raise exception 'Lead not found'; end if;
 if not public.gr_lead_can(p_company,assignee,'delete') then
  raise exception 'Lead delete permission required' using errcode='42501';
 end if;
 delete from public.gr_lead_stage_history where company_id=p_company and lead_id=p_lead;
 delete from public.gr_crm_records where company_id=p_company and kind='leads' and record_id=p_lead;
 delete from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead;
 return true;
end $$;
revoke all on function public.gr_contact_delete_lead(text,text) from public,anon;
grant execute on function public.gr_contact_delete_lead(text,text) to authenticated;
-- Read and edit permissions follow the assigned role; deleted customers remain
-- available to relational history but not to ordinary CRM directory queries.
drop policy if exists "active employees read all customers" on public.gr_crm_customers;
create policy "role can view active customers" on public.gr_crm_customers for select to authenticated
 using (deleted_at is null and public.gr_contact_can('customers','view',created_by));
drop policy if exists "customer editors update contacts" on public.gr_crm_customers;
create policy "role can edit active customers" on public.gr_crm_customers for update to authenticated
 using (deleted_at is null and public.gr_contact_can('customers','edit',created_by))
 with check (deleted_at is null and public.gr_contact_can('customers','edit',created_by));
