-- CRM-led WhatsApp settings; no external messaging is sent by this migration.
-- Every visible record is protected by company/employee permissions.
create table if not exists public.gr_wa_lead_welcome (
 company_id text not null,
 lead_id text not null,
 template_id uuid not null references public.gr_wa_templates(id) on delete restrict,
 created_by uuid default auth.uid(),
 created_at timestamptz default now(),
 status text not null default 'awaiting_provider'
   check(status in ('awaiting_provider','not_requested')),
 primary key(company_id,lead_id),
 foreign key(company_id,lead_id) references public.gr_lead_pipeline(company_id,lead_id) on delete cascade
);
create table if not exists public.gr_wa_recurring_rules (
 id uuid primary key default gen_random_uuid(),
 company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 customer_id uuid not null references public.gr_crm_customers(id) on delete cascade,
 connection_id uuid not null,
 template_id uuid not null references public.gr_wa_templates(id),
 interval_days integer not null check(interval_days between 1 and 365),
 next_due date not null,
 status text not null default 'draft' check(status in ('draft','paused')),
 notes text not null default '',
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,connection_id) references public.gr_wa_connections(company_id,id)
);
create table if not exists public.gr_wa_inbound_rules (
 id uuid primary key default gen_random_uuid(),
 company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 connection_id uuid not null,
 event_type text not null check(event_type in ('whatsapp_enquiry','website_enquiry')),
 source_name text not null check(length(source_name) between 2 and 100),
 tag_ids text[] not null default '{}',
 assigned_to uuid references public.gr_profiles(id),
 status text not null default 'draft' check(status in ('draft','paused')),
 created_at timestamptz not null default now(),
 foreign key(company_id,connection_id) references public.gr_wa_connections(company_id,id)
);
alter table public.gr_sheet_connections add column if not exists welcome_template_id uuid references public.gr_wa_templates(id);
alter table public.gr_wa_lead_welcome enable row level security;
alter table public.gr_wa_recurring_rules enable row level security;
alter table public.gr_wa_inbound_rules enable row level security;
revoke all on public.gr_wa_lead_welcome,public.gr_wa_recurring_rules,public.gr_wa_inbound_rules from public,anon;
grant select,insert,update,delete on public.gr_wa_lead_welcome,public.gr_wa_recurring_rules,public.gr_wa_inbound_rules to authenticated;
create policy gr_wa_lead_welcome_read on public.gr_wa_lead_welcome for select to authenticated
 using (exists(select 1 from public.gr_lead_pipeline l
   where l.company_id=gr_wa_lead_welcome.company_id and l.lead_id=gr_wa_lead_welcome.lead_id
     and public.gr_lead_can(l.company_id,l.assigned_to,'view')));
create policy gr_wa_lead_welcome_insert on public.gr_wa_lead_welcome for insert to authenticated
 with check(
 exists(select 1 from public.gr_lead_pipeline l where l.company_id=gr_wa_lead_welcome.company_id
   and l.lead_id=gr_wa_lead_welcome.lead_id
   and public.gr_lead_can(l.company_id,l.assigned_to,'edit'))
 and exists(select 1 from public.gr_wa_templates t where t.id=template_id
   and t.company_id=gr_wa_lead_welcome.company_id)
 and status='awaiting_provider'
);
create policy gr_wa_lead_welcome_update on public.gr_wa_lead_welcome for update to authenticated
 using(public.gr_wa_admin(company_id))
 with check(public.gr_wa_admin(company_id) and status='awaiting_provider');
create policy gr_wa_lead_welcome_delete on public.gr_wa_lead_welcome for delete to authenticated
 using(public.gr_wa_admin(company_id));

-- Customer edit permissions are sufficient for service follow-up drafts.
create or replace function public.gr_wa_customer_edit(p_company text,p_action text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists (
 select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
 where p.id=(select auth.uid()) and p.active and p_company=any(p.company_ids)
 and (r.name='Admin' or exists(
 select 1 from public.gr_role_permissions z
 where z.role_id=p.role_id and z.module='customers' and z.action=p_action and z.allowed))
 ) $$;
revoke all on function public.gr_wa_customer_edit(text,text) from public,anon;
grant execute on function public.gr_wa_customer_edit(text,text) to authenticated;
create policy gr_wa_recurring_read on public.gr_wa_recurring_rules for select to authenticated
 using(public.gr_wa_customer_edit(company_id,'view') or public.gr_wa_allowed(company_id,'view'));
create policy gr_wa_recurring_insert on public.gr_wa_recurring_rules for insert to authenticated
 with check(
  (public.gr_wa_customer_edit(company_id,'edit') or public.gr_wa_allowed(company_id,'create'))
  and status='draft'
  and exists(select 1 from public.gr_wa_templates t where t.id=gr_wa_recurring_rules.template_id and t.company_id=gr_wa_recurring_rules.company_id
     and t.connection_id=gr_wa_recurring_rules.connection_id)
 );
create policy gr_wa_recurring_update on public.gr_wa_recurring_rules for update to authenticated
 using(public.gr_wa_customer_edit(company_id,'edit') or public.gr_wa_allowed(company_id,'edit'))
 with check((public.gr_wa_customer_edit(company_id,'edit') or public.gr_wa_allowed(company_id,'edit'))
  and status in ('draft','paused'));
create policy gr_wa_recurring_delete on public.gr_wa_recurring_rules for delete to authenticated
 using(public.gr_wa_customer_edit(company_id,'edit') or public.gr_wa_allowed(company_id,'delete'));
create policy gr_wa_inbound_read on public.gr_wa_inbound_rules for select to authenticated
 using(public.gr_wa_allowed(company_id,'view'));
create policy gr_wa_inbound_insert on public.gr_wa_inbound_rules for insert to authenticated
 with check(public.gr_wa_admin(company_id) and status='draft');
create policy gr_wa_inbound_update on public.gr_wa_inbound_rules for update to authenticated
 using(public.gr_wa_admin(company_id))
 with check(public.gr_wa_admin(company_id) and status in ('draft','paused'));
create policy gr_wa_inbound_delete on public.gr_wa_inbound_rules for delete to authenticated
 using(public.gr_wa_admin(company_id));

-- Add customer-specific rules only after a provider is connected and verified.
-- Edit sheet default through an existing company Admin permission path, never client-side unrestricted UPDATE.
create or replace function public.gr_wa_set_sheet_welcome(p_sheet uuid,p_template uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_company text;
begin
 select company_id into v_company from public.gr_sheet_connections where id=p_sheet for update;
 if v_company is null or not public.gr_wa_admin(v_company) then raise exception 'Admin or sheet not found'; end if;
 if p_template is not null and not exists(select 1 from public.gr_wa_templates t
    where t.id=p_template and t.company_id=v_company) then raise exception 'Template is from another company';end if;
 update public.gr_sheet_connections set welcome_template_id=p_template where id=p_sheet;
end $$;
revoke all on function public.gr_wa_set_sheet_welcome(uuid,uuid) from public,anon;
grant execute on function public.gr_wa_set_sheet_welcome(uuid,uuid) to authenticated;
