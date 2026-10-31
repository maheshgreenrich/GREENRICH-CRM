-- GreenRich ONE: two WhatsApp marketing provider slots per company.
-- No messages are sent by this migration. API credentials must stay in Edge Function secrets.
create or replace function public.gr_wa_allowed(p_company text,p_action text)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
    where p.id=(select auth.uid()) and p.active and p_company=any(p.company_ids)
      and (r.name='Admin' or exists (
        select 1 from public.gr_role_permissions perm
        where perm.role_id=p.role_id and perm.module='marketing'
          and perm.action=p_action and perm.allowed))
  )
$$;
revoke all on function public.gr_wa_allowed(text,text) from public,anon;
grant execute on function public.gr_wa_allowed(text,text) to authenticated;

create or replace function public.gr_wa_admin(p_company text)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
    where p.id=(select auth.uid()) and p.active and p_company=any(p.company_ids) and r.name='Admin'
  )
$$;
revoke all on function public.gr_wa_admin(text) from public,anon;
grant execute on function public.gr_wa_admin(text) to authenticated;

create table if not exists public.gr_wa_connections (
 id uuid primary key default gen_random_uuid(),
 company_id text not null check (company_id in ('grow-india','enviro-solutions')),
 slot integer not null check(slot between 1 and 2),
 provider text not null default 'other' check(length(provider) between 2 and 80),
 display_name text not null check(length(display_name) between 2 and 120),
 sender_phone text not null default '',
 enabled boolean not null default false,
 setup_state text not null default 'not_configured' check(setup_state in ('not_configured','awaiting_provider','verified')),
 notes text not null default '',
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,slot),
 unique(company_id,id)
);
create table if not exists public.gr_wa_contacts (
 id uuid primary key default gen_random_uuid(),
 company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 customer_id uuid,
 lead_id text,
 name text not null check(length(name) between 1 and 200),
 mobile text not null check(length(mobile) between 10 and 20),
 email text not null default '',
 tags text[] not null default '{}',
 source text not null default '',
 consent_status text not null default 'unknown' check(consent_status in ('unknown','opted_in','opted_out')),
 consent_source text not null default '',
 consent_at timestamptz,
 opt_out_at timestamptz,
 notes text not null default '',
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,mobile),
 constraint gr_wa_consent_evidence check(consent_status<>'opted_in' or (length(btrim(consent_source))>=3 and consent_at is not null))
);
create table if not exists public.gr_wa_templates (
 id uuid primary key default gen_random_uuid(),
 company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 connection_id uuid,
 name text not null check(length(name) between 1 and 120),
 category text not null default 'marketing' check(category in ('marketing','utility','authentication')),
 language text not null default 'en',
 body text not null check(length(body) between 1 and 4000),
 buttons jsonb not null default '[]',
 provider_template_id text,
 provider_approval text not null default 'not_verified' check(provider_approval in ('not_verified','pending','approved','rejected')),
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,connection_id) references public.gr_wa_connections(company_id,id)
);
create table if not exists public.gr_wa_campaigns (
 id uuid primary key default gen_random_uuid(),
 company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 connection_id uuid,
 template_id uuid,
 name text not null check(length(name) between 1 and 180),
 audience jsonb not null default '{}',
 status text not null default 'draft' check(status in ('draft','paused','archived')),
 scheduled_at timestamptz,
 notes text not null default '',
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(company_id,connection_id) references public.gr_wa_connections(company_id,id)
);
create table if not exists public.gr_wa_automations (
 id uuid primary key default gen_random_uuid(),
 company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 name text not null check(length(name) between 1 and 160),
 trigger_name text not null check(trigger_name in ('new_lead','followup_due','order_created','order_approved','customer_birthday','manual')),
 connection_id uuid,
 template_id uuid,
 delay_minutes integer not null default 0 check(delay_minutes between 0 and 43200),
 status text not null default 'draft' check(status in ('draft','paused')),
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid(),
 foreign key(company_id,connection_id) references public.gr_wa_connections(company_id,id)
);
create table if not exists public.gr_wa_messages (
 id uuid primary key default gen_random_uuid(),
 company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 connection_id uuid,
 campaign_id uuid,
 contact_id uuid,
 direction text not null check(direction in ('inbound','outbound')),
 phone text not null,
 body text not null default '',
 provider_message_id text,
 delivery_status text not null default 'received'
  check(delivery_status in ('received','queued','sent','delivered','read','failed')),
 event_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 foreign key(company_id,connection_id) references public.gr_wa_connections(company_id,id)
);
create index if not exists gr_wa_message_company_created on public.gr_wa_messages(company_id,event_at desc);
create index if not exists gr_wa_contact_company_consent on public.gr_wa_contacts(company_id,consent_status);
create index if not exists gr_wa_campaign_company_created on public.gr_wa_campaigns(company_id,created_at desc);

do $$
declare t text;
begin
 foreach t in array array['gr_wa_connections','gr_wa_contacts','gr_wa_templates','gr_wa_campaigns','gr_wa_automations','gr_wa_messages'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
grant insert,update,delete on public.gr_wa_connections,public.gr_wa_contacts,public.gr_wa_templates,public.gr_wa_campaigns,public.gr_wa_automations to authenticated;
-- Message data is read-only to browser clients; future authenticated webhooks will use a server-side validated writer.

create policy gr_wa_connections_read on public.gr_wa_connections for select to authenticated
 using(public.gr_wa_allowed(company_id,'view'));
create policy gr_wa_connections_insert on public.gr_wa_connections for insert to authenticated
 with check(public.gr_wa_admin(company_id) and setup_state='not_configured' and enabled=false);
create policy gr_wa_connections_update on public.gr_wa_connections for update to authenticated
 using(public.gr_wa_admin(company_id))
 with check(public.gr_wa_admin(company_id) and setup_state='not_configured' and enabled=false);
create policy gr_wa_connections_delete on public.gr_wa_connections for delete to authenticated
 using(public.gr_wa_admin(company_id));

create policy gr_wa_contacts_read on public.gr_wa_contacts for select to authenticated
 using(public.gr_wa_allowed(company_id,'view'));
create policy gr_wa_contacts_insert on public.gr_wa_contacts for insert to authenticated
 with check(public.gr_wa_allowed(company_id,'create'));
create policy gr_wa_contacts_update on public.gr_wa_contacts for update to authenticated
 using(public.gr_wa_allowed(company_id,'edit'))
 with check(public.gr_wa_allowed(company_id,'edit'));
create policy gr_wa_contacts_delete on public.gr_wa_contacts for delete to authenticated
 using(public.gr_wa_allowed(company_id,'delete'));
create policy gr_wa_templates_read on public.gr_wa_templates for select to authenticated
 using(public.gr_wa_allowed(company_id,'view'));
create policy gr_wa_templates_insert on public.gr_wa_templates for insert to authenticated
 with check(public.gr_wa_allowed(company_id,'create') and provider_approval='not_verified');
create policy gr_wa_templates_update on public.gr_wa_templates for update to authenticated
 using(public.gr_wa_allowed(company_id,'edit'))
 with check(public.gr_wa_allowed(company_id,'edit') and provider_approval='not_verified');
create policy gr_wa_templates_delete on public.gr_wa_templates for delete to authenticated
 using(public.gr_wa_allowed(company_id,'delete'));
create policy gr_wa_campaigns_read on public.gr_wa_campaigns for select to authenticated
 using(public.gr_wa_allowed(company_id,'view'));
create policy gr_wa_campaigns_insert on public.gr_wa_campaigns for insert to authenticated
 with check(public.gr_wa_allowed(company_id,'create') and status='draft');
create policy gr_wa_campaigns_update on public.gr_wa_campaigns for update to authenticated
 using(public.gr_wa_allowed(company_id,'edit'))
 with check(public.gr_wa_allowed(company_id,'edit') and status in ('draft','paused','archived'));
create policy gr_wa_campaigns_delete on public.gr_wa_campaigns for delete to authenticated
 using(public.gr_wa_allowed(company_id,'delete'));
create policy gr_wa_automations_read on public.gr_wa_automations for select to authenticated
 using(public.gr_wa_allowed(company_id,'view'));
create policy gr_wa_automations_insert on public.gr_wa_automations for insert to authenticated
 with check(public.gr_wa_allowed(company_id,'create') and status='draft');
create policy gr_wa_automations_update on public.gr_wa_automations for update to authenticated
 using(public.gr_wa_allowed(company_id,'edit'))
 with check(public.gr_wa_allowed(company_id,'edit') and status in ('draft','paused'));
create policy gr_wa_automations_delete on public.gr_wa_automations for delete to authenticated
 using(public.gr_wa_allowed(company_id,'delete'));
create policy gr_wa_messages_read on public.gr_wa_messages for select to authenticated
 using(public.gr_wa_allowed(company_id,'view'));
