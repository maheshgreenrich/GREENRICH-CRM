-- Trusted inbound WhatsApp/website OTP relay. Only the verified service-role RPC can write events.
create table if not exists public.gr_wa_inbound_events (
 id uuid primary key default gen_random_uuid(),
 company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 event_key text not null check(length(event_key) between 5 and 120),
 event_type text not null check(event_type in ('whatsapp_enquiry','website_enquiry','website_whatsapp_otp')),
 connection_id uuid,
 mobile text not null check(mobile ~ '^91[6-9][0-9]{9}$'),
 contact_name text not null default '',
 source_name text not null default '',
 lead_id text,
 customer_id uuid,
 status text not null default 'pending_rule' check(status in ('pending_rule','created_lead','linked_lead','linked_customer')),
 event_at timestamptz not null default now(),created_at timestamptz not null default now(),
 unique(company_id,event_key),
 foreign key(company_id,connection_id) references public.gr_wa_connections(company_id,id)
);
create index if not exists gr_wa_inbound_events_company_time on public.gr_wa_inbound_events(company_id,created_at desc);
alter table public.gr_wa_inbound_events enable row level security;
revoke all on public.gr_wa_inbound_events from public,anon,authenticated;
grant select on public.gr_wa_inbound_events to authenticated;
drop policy if exists gr_wa_inbound_events_read on public.gr_wa_inbound_events;
create policy gr_wa_inbound_events_read on public.gr_wa_inbound_events for select to authenticated using(public.gr_wa_allowed(company_id,'view'));
alter table public.gr_wa_inbound_rules drop constraint if exists gr_wa_inbound_rules_status_check;
alter table public.gr_wa_inbound_rules add constraint gr_wa_inbound_rules_status_check check(status in ('draft','paused','active'));
drop policy if exists gr_wa_inbound_update on public.gr_wa_inbound_rules;
create policy gr_wa_inbound_update on public.gr_wa_inbound_rules for update to authenticated
 using(public.gr_wa_admin(company_id)) with check(public.gr_wa_admin(company_id) and status in ('draft','paused','active'));

CREATE OR REPLACE FUNCTION public.gr_wa_accept_trusted_event(p_company text, p_key text, p_type text, p_phone text, p_name text, p_connection uuid DEFAULT NULL::uuid, p_message text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_mobile text;v_rule public.gr_wa_inbound_rules%rowtype;
 v_event public.gr_wa_inbound_events%rowtype;v_event_new boolean:=false;
 v_customer uuid;v_lead text;v_owner uuid;v_status text;
begin
 if p_company not in ('grow-india','enviro-solutions')
    or p_type not in ('whatsapp_enquiry','website_enquiry','website_whatsapp_otp')
    or p_key !~ '^[A-Za-z0-9:_-]{5,120}$' then
   raise exception 'Invalid incoming event identifiers';
 end if;
 v_mobile:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 if v_mobile ~ '^[6-9][0-9]{9}$' then v_mobile:='91'||v_mobile; end if;
 if v_mobile !~ '^91[6-9][0-9]{9}$' then raise exception 'Invalid WhatsApp mobile';end if;
 if p_connection is not null and not exists(select 1 from public.gr_wa_connections c where c.company_id=p_company and c.id=p_connection)
 then raise exception 'Provider does not belong to this company';end if;
 insert into public.gr_wa_inbound_events(company_id,event_key,event_type,connection_id,mobile,contact_name)
 values(p_company,p_key,p_type,p_connection,v_mobile,left(btrim(coalesce(p_name,'')),180))
 on conflict(company_id,event_key) do nothing returning * into v_event;
 if found then v_event_new:=true;
 else
  select * into v_event from public.gr_wa_inbound_events where company_id=p_company and event_key=p_key for update;
  if v_event.event_type<>p_type or v_event.mobile<>v_mobile
    then raise exception 'Event ID already belongs to different data';end if;
  if v_event.status<>'pending_rule' then
   return jsonb_build_object('status',v_event.status,'lead_id',v_event.lead_id,'existing',true);
  end if;
 end if;
 if v_event_new and p_type='whatsapp_enquiry' and length(btrim(coalesce(p_message,'')))>0 then
  insert into public.gr_wa_messages(company_id,connection_id,direction,phone,body,provider_message_id,delivery_status)
  values(p_company,p_connection,'inbound',v_mobile,left(p_message,4000),p_key,'received');
 end if;
 select * into v_rule from public.gr_wa_inbound_rules
 where company_id=p_company and event_type=p_type and status='active'
   and (connection_id=p_connection or p_connection is null)
 order by created_at desc limit 1;
 if not found then return jsonb_build_object('status','pending_rule','existing',not v_event_new);end if;
 select l.lead_id,l.assigned_to into v_lead,v_owner from public.gr_lead_pipeline l
 where l.company_id=p_company and right(regexp_replace(l.mobile,'[^0-9]','','g'),10)=right(v_mobile,10)
 order by l.created_at desc limit 1;
 if v_lead is not null then
  if v_owner is null and v_rule.assigned_to is not null then
   update public.gr_lead_pipeline set assigned_to=v_rule.assigned_to,updated_at=now()
   where company_id=p_company and lead_id=v_lead and assigned_to is null;
  end if;
  v_status:='linked_lead';
 else
  select c.id into v_customer from public.gr_crm_customers c
  where right(regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g'),10)=right(v_mobile,10)
  or right(regexp_replace(coalesce(c.mobile2,''),'[^0-9]','','g'),10)=right(v_mobile,10)
  order by c.created_at desc limit 1;
  if v_customer is not null then v_status:='linked_customer';
  else
   v_lead:='WA-'||gen_random_uuid()::text;
   insert into public.gr_lead_pipeline(company_id,lead_id,title,contact,mobile,source,tag_ids,assigned_to,stage,notes)
   values(p_company,v_lead,left('WhatsApp enquiry · '||coalesce(nullif(btrim(p_name),''),v_mobile),180),
     left(coalesce(nullif(btrim(p_name),''),'WhatsApp customer'),180),
     right(v_mobile,10),v_rule.source_name,v_rule.tag_ids,v_rule.assigned_to,'New',
     'Captured from trusted '||p_type||' event, no marketing opt-in inferred');
   v_status:='created_lead';
  end if;
 end if;
 update public.gr_wa_inbound_events set status=v_status,lead_id=v_lead,customer_id=v_customer,source_name=v_rule.source_name
 where id=v_event.id;
 return jsonb_build_object('status',v_status,'lead_id',v_lead,'customer_id',v_customer,'assigned_to',v_rule.assigned_to,'existing',not v_event_new);
end $function$

revoke all on function public.gr_wa_accept_trusted_event(text,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.gr_wa_accept_trusted_event(text,text,text,text,text,uuid,text) to service_role;
