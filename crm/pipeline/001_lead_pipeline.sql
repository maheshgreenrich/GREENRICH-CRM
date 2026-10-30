-- GreenRich ONE lead pipeline. Existing customer, user, role, products and order tables are reused.
-- Apply after gr_companies, gr_profiles, gr_roles, gr_role_permissions, gr_crm_records.
create table if not exists public.gr_lead_pipeline (
 company_id text not null references public.gr_companies(id),
 lead_id text not null,
 title text not null,
 contact text not null default '',
 mobile text not null default '',
 email text not null default '',
 source text not null default '',
 product_id text,
 tag_ids text[] not null default '{}',
 customer_id uuid references public.gr_crm_customers(id),
 assigned_to uuid references public.gr_profiles(id),
 stage text not null default 'New' check(stage in ('New','Contacted','Qualified','Quotation','Won','Lost')),
 expected_value numeric(18,2) not null default 0 check(expected_value>=0),
 notes text not null default '',
 next_followup date,
 won_order_id text,
 won_at timestamptz,
 created_by uuid references public.gr_profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(company_id,lead_id),
 check ((stage='Won' and won_order_id is not null) or stage <> 'Won')
);
create index if not exists gr_lead_pipeline_staff on public.gr_lead_pipeline(assigned_to,stage,created_at desc);
create index if not exists gr_lead_pipeline_company on public.gr_lead_pipeline(company_id,stage,created_at desc);
create table if not exists public.gr_lead_stage_history (
 id bigint generated always as identity primary key,
 company_id text not null,
 lead_id text not null,
 actor_id uuid not null references public.gr_profiles(id),
 event_type text not null check(event_type in ('CREATED','ASSIGNED','STAGE_CHANGED','CUSTOMER_LINKED')),
 old_stage text,
 new_stage text,
 old_assignee uuid,
 new_assignee uuid,
 note text not null check(length(btrim(note))>0),
 created_at timestamptz not null default now(),
 foreign key(company_id,lead_id) references public.gr_lead_pipeline(company_id,lead_id)
);
create index if not exists gr_lead_history_key on public.gr_lead_stage_history(company_id,lead_id,created_at desc);

-- "Own" means assigned to the logged-in employee; Team = direct manager's staff.
-- "All" requires the explicit leads/view permission with data_scope=all.
create or replace function public.gr_lead_can(p_company text,p_assignee uuid,p_action text)
returns boolean language sql stable security definer set search_path = ''
as $$
select exists (
 select 1 from public.gr_profiles me
 join public.gr_roles role on role.id=me.role_id
 where me.id=(select auth.uid()) and me.active and p_company=any(me.company_ids)
 and (
   role.name='Admin'
   or exists(
     select 1 from public.gr_role_permissions perm
     where perm.role_id=me.role_id and perm.module='leads'
       and perm.allowed and perm.action=p_action
       and (
         (perm.data_scope='all')
         or (perm.data_scope='own' and p_assignee=me.id)
         or (perm.data_scope='team' and
              (p_assignee=me.id or exists (
                select 1 from public.gr_profiles staff
                where staff.id=p_assignee and staff.active and staff.manager_id=me.id
              )))
       )
   )
 )
) $$;
revoke all on function public.gr_lead_can(text,uuid,text) from public;
grant execute on function public.gr_lead_can(text,uuid,text) to authenticated;

create or replace function public.gr_lead_can_manage(p_company text,p_assignee uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
select exists (
 select 1 from public.gr_profiles me join public.gr_roles role on role.id=me.role_id
 where me.id=(select auth.uid()) and me.active and p_company=any(me.company_ids)
 and (role.name='Admin' or exists(
   select 1 from public.gr_role_permissions perm where perm.role_id=me.role_id
   and perm.module='leads' and perm.action='edit' and perm.allowed
   and perm.data_scope in ('team','all')
   and (perm.data_scope='all' or p_assignee=me.id or exists(
       select 1 from public.gr_profiles staff where staff.id=p_assignee and staff.manager_id=me.id))
 ))
) $$;
revoke all on function public.gr_lead_can_manage(text,uuid) from public;
grant execute on function public.gr_lead_can_manage(text,uuid) to authenticated;

-- Legacy leads remain in their original table. Seed once without destroying existing
-- records. Free-text legacy owners are matched ONLY on exact employee username/full name.
insert into public.gr_lead_pipeline
(company_id,lead_id,title,contact,mobile,email,source,product_id,tag_ids,customer_id,assigned_to,stage,expected_value,notes,next_followup,created_at,created_by)
select r.company_id,r.record_id,
 coalesce(nullif(r.payload->>'title',''),'Lead enquiry'),
 coalesce(r.payload->>'contact',''),
 coalesce(r.payload->>'mobile',''),
 coalesce(r.payload->>'email',''),
 coalesce(r.payload->>'source',''),
 nullif(r.payload->>'product_id',''),
 case when jsonb_typeof(r.payload->'tag_ids')='array'
      then array(select jsonb_array_elements_text(r.payload->'tag_ids')) else '{}'::text[] end,
 case when (r.payload->>'customer_id') ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
      and exists(select 1 from public.gr_crm_customers c where c.id=(r.payload->>'customer_id')::uuid)
      then (r.payload->>'customer_id')::uuid else null end,
 (select p.id from public.gr_profiles p where p.active and r.company_id=any(p.company_ids)
  and lower(trim(coalesce(r.payload->>'owner',''))) in (lower(p.username),lower(p.full_name))
  order by p.id limit 1),
 case when r.payload->>'stage' in ('New','Contacted','Qualified','Quotation','Lost') then r.payload->>'stage'
      else 'New' end,
 case when coalesce(r.payload->>'value','')~'^[0-9]+(\.[0-9]{1,2})?$'
      then (r.payload->>'value')::numeric(18,2) else 0 end,
 coalesce(r.payload->>'notes',''),
 case when (r.payload->>'followup')~'^\d{4}-\d{2}-\d{2}$' then (r.payload->>'followup')::date else null end,
 coalesce(case when (r.payload->>'created_at') ~ '^\\d{4}-\\d{2}-\\d{2}' then (r.payload->>'created_at')::timestamptz end, r.updated_at,now()),r.created_by
from public.gr_crm_records r
where r.kind='leads'
on conflict(company_id,lead_id) do nothing;

-- Existing Won leads must be linked to a valid order before they can become Won here.
-- They are migrated as New and can be reassigned by an Admin.
alter table public.gr_lead_pipeline enable row level security;
alter table public.gr_lead_stage_history enable row level security;
drop policy if exists "pipeline scoped read" on public.gr_lead_pipeline;
create policy "pipeline scoped read" on public.gr_lead_pipeline for select to authenticated
using (public.gr_lead_can(company_id,assigned_to,'view'));
drop policy if exists "pipeline history read" on public.gr_lead_stage_history;
create policy "pipeline history read" on public.gr_lead_stage_history for select to authenticated
using(exists (select 1 from public.gr_lead_pipeline p
 where p.company_id=gr_lead_stage_history.company_id and p.lead_id=gr_lead_stage_history.lead_id
 and public.gr_lead_can(p.company_id,p.assigned_to,'view')));
grant select on public.gr_lead_pipeline,public.gr_lead_stage_history to authenticated;
revoke insert,update,delete on public.gr_lead_pipeline,public.gr_lead_stage_history from anon,authenticated;

-- Only active sales-capable staff with access to the company can be assigned.
-- Exposes limited employee directory fields, not personal emails or passwords.
create or replace function public.gr_pipeline_staff(p_company text)
returns table(id uuid,full_name text,manager_id uuid) language sql stable security definer set search_path=''
as $$
select p.id,p.full_name,p.manager_id
from public.gr_profiles p join public.gr_roles r on p.role_id=r.id
where p.active and p_company=any(p.company_ids)
and (
  r.name in ('Sales','Telecaller')
  or exists(select 1 from public.gr_role_permissions x where x.role_id=p.role_id and x.module='leads' and x.action='view' and x.allowed)
)
and exists (select 1 from public.gr_profiles me where me.id=(select auth.uid()) and me.active and p_company=any(me.company_ids))
and (
  p.id=auth.uid() or public.gr_lead_can_manage(p_company,p.id)
  or exists(select 1 from public.gr_lead_pipeline l where l.company_id=p_company and l.assigned_to=p.id and public.gr_lead_can(p_company,p.id,'view'))
)
order by p.full_name
$$;
revoke all on function public.gr_pipeline_staff(text) from public;
grant execute on function public.gr_pipeline_staff(text) to authenticated;

-- A transactional server-controlled create, never a client side insert.
create or replace function public.gr_pipeline_create(
 p_company text,p_title text,p_contact text,p_assignee uuid,p_source text default '',
 p_product text default null,p_value numeric default 0,p_mobile text default '',
 p_email text default '',p_tags text[] default '{}',p_customer uuid default null,p_note text default '',
 p_legacy_id text default null
) returns text language plpgsql security definer set search_path=''
as $$
declare v_id text; v_staff public.gr_profiles%rowtype; v_me public.gr_profiles%rowtype;
begin
 select * into v_me from public.gr_profiles where id=(select auth.uid()) and active;
 if not found or not p_company=any(v_me.company_ids) then raise exception 'Company access denied'; end if;
 if btrim(coalesce(p_title,''))='' or length(p_title)>250 then raise exception 'Lead title required (maximum 250 chars)'; end if;
 if p_assignee is null then raise exception 'Select an employee before importing or creating a lead'; end if;
 select * into v_staff from public.gr_profiles where id=p_assignee and active and p_company=any(company_ids);
 if not found then raise exception 'Assigned employee is inactive or outside this company'; end if;
 if not exists(select 1 from public.gr_pipeline_staff(p_company) where id=p_assignee) then raise exception 'Not eligible to assign this employee'; end if;
 if not (public.gr_lead_can_manage(p_company,p_assignee) or (p_assignee=auth.uid() and public.gr_lead_can(p_company,p_assignee,'create')))
 then raise exception 'Permission denied to assign this lead'; end if;
 if p_value is null or p_value<0 or p_value>9999999999999999.99 then raise exception 'Invalid lead value'; end if;
 if p_customer is not null and not exists(select 1 from public.gr_crm_customers where id=p_customer) then raise exception 'Customer not found'; end if;
 if p_product is not null and not exists(select 1 from public.gr_crm_records where company_id=p_company and kind='products' and record_id=p_product) then raise exception 'Product not found'; end if;
 if p_legacy_id is not null and p_legacy_id !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
   raise exception 'Invalid legacy lead ID'; end if;
 v_id=coalesce(p_legacy_id,gen_random_uuid()::text);
 if exists(select 1 from public.gr_crm_records where company_id=p_company and kind='leads' and record_id=v_id) then
   raise exception 'This lead is already stored in CRM'; end if;
 insert into public.gr_lead_pipeline(company_id,lead_id,title,contact,mobile,email,source,product_id,tag_ids,customer_id,assigned_to,expected_value,notes,created_by)
 values(p_company,v_id,btrim(p_title),coalesce(p_contact,''),coalesce(p_mobile,''),coalesce(p_email,''),coalesce(p_source,''),p_product,coalesce(p_tags,'{}'),p_customer,p_assignee,p_value,coalesce(p_note,''),auth.uid());
 insert into public.gr_crm_records(company_id,kind,record_id,payload,created_by)
 values(p_company,'leads',v_id,jsonb_build_object('id',v_id,'company_id',p_company,'title',btrim(p_title),'contact',coalesce(p_contact,''),
 'mobile',coalesce(p_mobile,''),'email',coalesce(p_email,''),'source',coalesce(p_source,''),'product_id',p_product,
 'tag_ids',to_jsonb(coalesce(p_tags,'{}')),'customer_id',p_customer,'owner',v_staff.full_name,'assigned_to',p_assignee,
 'stage','New','value',p_value,'notes',coalesce(p_note,''),'created_at',now()),auth.uid());
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,new_stage,new_assignee,note)
 values(p_company,v_id,auth.uid(),'CREATED','New',p_assignee,'Lead assigned to '||v_staff.full_name);
 return v_id;
end $$;
revoke all on function public.gr_pipeline_create(text,text,text,uuid,text,text,numeric,text,text,text[],uuid,text,text) from public;
grant execute on function public.gr_pipeline_create(text,text,text,uuid,text,text,numeric,text,text,text[],uuid,text,text) to authenticated;

create or replace function public.gr_pipeline_assign(p_company text,p_lead text,p_employee uuid,p_note text)
returns void language plpgsql security definer set search_path=''
as $$
declare v public.gr_lead_pipeline%rowtype; staff public.gr_profiles%rowtype;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found then raise exception 'Lead not found'; end if;
 if not public.gr_lead_can_manage(p_company,v.assigned_to) then raise exception 'Only Admin or permitted manager can reassign'; end if;
 if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Assignment reason is required'; end if;
 select * into staff from public.gr_profiles where id=p_employee and active and p_company=any(company_ids);
 if not found or not exists(select 1 from public.gr_pipeline_staff(p_company) where id=p_employee) then raise exception 'Employee is not available for this company'; end if;
 update public.gr_lead_pipeline set assigned_to=p_employee,updated_at=now() where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records set payload=jsonb_set(jsonb_set(payload,'{owner}',to_jsonb(staff.full_name)),'{assigned_to}',to_jsonb(p_employee)),
 updated_at=now() where company_id=p_company and kind='leads' and record_id=p_lead;
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,old_assignee,new_assignee,note)
 values(p_company,p_lead,auth.uid(),'ASSIGNED',v.assigned_to,p_employee,btrim(p_note));
end $$;
revoke all on function public.gr_pipeline_assign(text,text,uuid,text) from public;
grant execute on function public.gr_pipeline_assign(text,text,uuid,text) to authenticated;

-- Drag/drop always asks for and persists a note. Won requires a pre-existing sales order
-- for the linked CRM customer; stage transitions NEVER pretend to have created an order.
create or replace function public.gr_pipeline_move(p_company text,p_lead text,p_stage text,p_note text,p_order text default null,p_due date default null)
returns void language plpgsql security definer set search_path=''
as $$
declare v public.gr_lead_pipeline%rowtype;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found then raise exception 'Lead not found'; end if;
 if not public.gr_lead_can(p_company,v.assigned_to,'edit') then raise exception 'Cannot change another employee''s lead'; end if;
 if p_stage not in ('New','Contacted','Qualified','Quotation','Won','Lost') then raise exception 'Invalid stage'; end if;
 if p_stage=v.stage then raise exception 'Choose a different stage'; end if;
 if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Enter the conversation details before moving'; end if;
 if length(p_note)>4000 then raise exception 'Conversation note too long'; end if;
 if p_stage='Quotation' and p_due is null then raise exception 'Set a quotation follow-up date'; end if;
 if p_stage='Won' then
   if v.stage<>'Quotation' then raise exception 'Move to Quotation before Won'; end if;
   if v.customer_id is null then raise exception 'Link an existing customer before winning'; end if;
   if p_order is null or not exists(
    select 1 from public.gr_crm_records r where r.company_id=p_company and r.kind='sales'
    and r.record_id=p_order and r.payload->>'customer_id'=v.customer_id::text
    and coalesce(r.payload->>'status','')<>'Cancelled'
   ) then raise exception 'Select an existing sales order for the same customer before winning'; end if;
 elsif p_stage='Contacted' and v.stage='Lost' then null;
 elsif p_stage='Lost' and v.stage not in ('Won','Lost') then null;
 elsif array_position(array['New','Contacted','Qualified','Quotation']::text[],p_stage)
      =array_position(array['New','Contacted','Qualified','Quotation']::text[],v.stage)+1 then null;
 else raise exception 'Move one stage at a time; Lost can return to Contacted'; end if;
 update public.gr_lead_pipeline
 set stage=p_stage,won_order_id=case when p_stage='Won' then p_order else null end,
 won_at=case when p_stage='Won' then now() else null end,
 next_followup=case when p_stage='Quotation' then p_due when v.stage='Quotation' then null else next_followup end,
 updated_at=now()
 where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records set payload=jsonb_set(jsonb_set(payload,'{stage}',to_jsonb(p_stage)),'{won_order_id}',to_jsonb(p_order)),
 updated_at=now() where company_id=p_company and kind='leads' and record_id=p_lead;
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,old_stage,new_stage,note)
 values(p_company,p_lead,auth.uid(),'STAGE_CHANGED',v.stage,p_stage,btrim(p_note));
end $$;
revoke all on function public.gr_pipeline_move(text,text,text,text,text,date) from public;
grant execute on function public.gr_pipeline_move(text,text,text,text,text,date) to authenticated;

-- Link an existing shared customer to the lead before converting it to Won.
create or replace function public.gr_pipeline_link_customer(p_company text,p_lead text,p_customer uuid,p_note text)
returns void language plpgsql security definer set search_path=''
as $$
declare v public.gr_lead_pipeline%rowtype;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found or not public.gr_lead_can(p_company,v.assigned_to,'edit') then raise exception 'Lead not found or permission denied'; end if;
 if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Enter customer linking notes'; end if;
 if not exists(select 1 from public.gr_crm_customers where id=p_customer) then raise exception 'Existing customer not found'; end if;
 if v.stage='Won' then raise exception 'Won leads cannot change linked customer'; end if;
 update public.gr_lead_pipeline set customer_id=p_customer,updated_at=now() where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records set payload=jsonb_set(payload,'{customer_id}',to_jsonb(p_customer)),updated_at=now()
 where company_id=p_company and kind='leads' and record_id=p_lead;
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,old_stage,new_stage,note)
 values(p_company,p_lead,auth.uid(),'CUSTOMER_LINKED',v.stage,v.stage,btrim(p_note));
end $$;
revoke all on function public.gr_pipeline_link_customer(text,text,uuid,text) from public;
grant execute on function public.gr_pipeline_link_customer(text,text,uuid,text) to authenticated;

-- Pre-existing CRM legacy table has broader policies. Do not expose this RPC as a
-- complete replacement for those permissions until legacy lead insert/update/delete
-- paths are migrated to pipeline calls; their policies need hardening before release.
 then raise exception 'Invalid legacy lead ID'; end if;
 v_id=coalesce(p_legacy_id,gen_random_uuid()::text);
 if exists(select 1 from public.gr_crm_records where company_id=p_company and kind='leads' and record_id=v_id) then
   raise exception 'This lead is already stored in CRM'; end if;
 insert into public.gr_lead_pipeline(company_id,lead_id,title,contact,mobile,email,source,product_id,tag_ids,customer_id,assigned_to,expected_value,notes,created_by)
 values(p_company,v_id,btrim(p_title),coalesce(p_contact,''),coalesce(p_mobile,''),coalesce(p_email,''),coalesce(p_source,''),p_product,coalesce(p_tags,'{}'),p_customer,p_assignee,p_value,coalesce(p_note,''),auth.uid());
 insert into public.gr_crm_records(company_id,kind,record_id,payload,created_by)
 values(p_company,'leads',v_id,jsonb_build_object('id',v_id,'company_id',p_company,'title',btrim(p_title),'contact',coalesce(p_contact,''),
 'mobile',coalesce(p_mobile,''),'email',coalesce(p_email,''),'source',coalesce(p_source,''),'product_id',p_product,
 'tag_ids',to_jsonb(coalesce(p_tags,'{}')),'customer_id',p_customer,'owner',v_staff.full_name,'assigned_to',p_assignee,
 'stage','New','value',p_value,'notes',coalesce(p_note,''),'created_at',now()),auth.uid());
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,new_stage,new_assignee,note)
 values(p_company,v_id,auth.uid(),'CREATED','New',p_assignee,'Lead assigned to '||v_staff.full_name);
 return v_id;
end $$;
revoke all on function public.gr_pipeline_create(text,text,text,uuid,text,text,numeric,text,text,text[],uuid,text) from public;
grant execute on function public.gr_pipeline_create(text,text,text,uuid,text,text,numeric,text,text,text[],uuid,text) to authenticated;

create or replace function public.gr_pipeline_assign(p_company text,p_lead text,p_employee uuid,p_note text)
returns void language plpgsql security definer set search_path=''
as $$
declare v public.gr_lead_pipeline%rowtype; staff public.gr_profiles%rowtype;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found then raise exception 'Lead not found'; end if;
 if not public.gr_lead_can_manage(p_company,v.assigned_to) then raise exception 'Only Admin or permitted manager can reassign'; end if;
 if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Assignment reason is required'; end if;
 select * into staff from public.gr_profiles where id=p_employee and active and p_company=any(company_ids);
 if not found or not exists(select 1 from public.gr_pipeline_staff(p_company) where id=p_employee) then raise exception 'Employee is not available for this company'; end if;
 update public.gr_lead_pipeline set assigned_to=p_employee,updated_at=now() where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records set payload=jsonb_set(jsonb_set(payload,'{owner}',to_jsonb(staff.full_name)),'{assigned_to}',to_jsonb(p_employee)),
 updated_at=now() where company_id=p_company and kind='leads' and record_id=p_lead;
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,old_assignee,new_assignee,note)
 values(p_company,p_lead,auth.uid(),'ASSIGNED',v.assigned_to,p_employee,btrim(p_note));
end $$;
revoke all on function public.gr_pipeline_assign(text,text,uuid,text) from public;
grant execute on function public.gr_pipeline_assign(text,text,uuid,text) to authenticated;

-- Drag/drop always asks for and persists a note. Won requires a pre-existing sales order
-- for the linked CRM customer; stage transitions NEVER pretend to have created an order.
create or replace function public.gr_pipeline_move(p_company text,p_lead text,p_stage text,p_note text,p_order text default null,p_due date default null)
returns void language plpgsql security definer set search_path=''
as $$
declare v public.gr_lead_pipeline%rowtype;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found then raise exception 'Lead not found'; end if;
 if not public.gr_lead_can(p_company,v.assigned_to,'edit') then raise exception 'Cannot change another employee''s lead'; end if;
 if p_stage not in ('New','Contacted','Qualified','Quotation','Won','Lost') then raise exception 'Invalid stage'; end if;
 if p_stage=v.stage then raise exception 'Choose a different stage'; end if;
 if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Enter the conversation details before moving'; end if;
 if length(p_note)>4000 then raise exception 'Conversation note too long'; end if;
 if p_stage='Quotation' and p_due is null then raise exception 'Set a quotation follow-up date'; end if;
 if p_stage='Won' then
   if v.stage<>'Quotation' then raise exception 'Move to Quotation before Won'; end if;
   if v.customer_id is null then raise exception 'Link an existing customer before winning'; end if;
   if p_order is null or not exists(
    select 1 from public.gr_crm_records r where r.company_id=p_company and r.kind='sales'
    and r.record_id=p_order and r.payload->>'customer_id'=v.customer_id::text
    and coalesce(r.payload->>'status','')<>'Cancelled'
   ) then raise exception 'Select an existing sales order for the same customer before winning'; end if;
 elsif p_stage='Contacted' and v.stage='Lost' then null;
 elsif p_stage='Lost' and v.stage not in ('Won','Lost') then null;
 elsif array_position(array['New','Contacted','Qualified','Quotation']::text[],p_stage)
      =array_position(array['New','Contacted','Qualified','Quotation']::text[],v.stage)+1 then null;
 else raise exception 'Move one stage at a time; Lost can return to Contacted'; end if;
 update public.gr_lead_pipeline
 set stage=p_stage,won_order_id=case when p_stage='Won' then p_order else null end,
 won_at=case when p_stage='Won' then now() else null end,
 next_followup=case when p_stage='Quotation' then p_due when v.stage='Quotation' then null else next_followup end,
 updated_at=now()
 where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records set payload=jsonb_set(jsonb_set(payload,'{stage}',to_jsonb(p_stage)),'{won_order_id}',to_jsonb(p_order)),
 updated_at=now() where company_id=p_company and kind='leads' and record_id=p_lead;
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,old_stage,new_stage,note)
 values(p_company,p_lead,auth.uid(),'STAGE_CHANGED',v.stage,p_stage,btrim(p_note));
end $$;
revoke all on function public.gr_pipeline_move(text,text,text,text,text,date) from public;
grant execute on function public.gr_pipeline_move(text,text,text,text,text,date) to authenticated;

-- Link an existing shared customer to the lead before converting it to Won.
create or replace function public.gr_pipeline_link_customer(p_company text,p_lead text,p_customer uuid,p_note text)
returns void language plpgsql security definer set search_path=''
as $$
declare v public.gr_lead_pipeline%rowtype;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found or not public.gr_lead_can(p_company,v.assigned_to,'edit') then raise exception 'Lead not found or permission denied'; end if;
 if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Enter customer linking notes'; end if;
 if not exists(select 1 from public.gr_crm_customers where id=p_customer) then raise exception 'Existing customer not found'; end if;
 if v.stage='Won' then raise exception 'Won leads cannot change linked customer'; end if;
 update public.gr_lead_pipeline set customer_id=p_customer,updated_at=now() where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records set payload=jsonb_set(payload,'{customer_id}',to_jsonb(p_customer)),updated_at=now()
 where company_id=p_company and kind='leads' and record_id=p_lead;
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,old_stage,new_stage,note)
 values(p_company,p_lead,auth.uid(),'CUSTOMER_LINKED',v.stage,v.stage,btrim(p_note));
end $$;
revoke all on function public.gr_pipeline_link_customer(text,text,uuid,text) from public;
grant execute on function public.gr_pipeline_link_customer(text,text,uuid,text) to authenticated;

-- Pre-existing CRM legacy table has broader policies. Do not expose this RPC as a
-- complete replacement for those permissions until legacy lead insert/update/delete
-- paths are migrated to pipeline calls; their policies need hardening before release.
