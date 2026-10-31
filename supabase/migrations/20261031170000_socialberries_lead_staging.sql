-- One-way read-only provider sync to a quarantined staging area.
-- Nothing is sent on WhatsApp; nothing enters the CRM lead pipeline without Admin review.
create table if not exists public.gr_wa_provider_leads(
 id uuid primary key default gen_random_uuid(),
 company_id text not null,
 connection_id uuid not null,
 provider_lead_id text not null check(length(provider_lead_id) between 1 and 150),
 provider_client_id text not null default '',
 name text not null default '',
 mobile text not null default '',
 email text not null default '',
 source text not null default '',
 provider_status text not null default '',
 received_at timestamptz not null default now(),
 imported_lead_id text,
 imported_at timestamptz,
 unique(company_id,connection_id,provider_lead_id),
 foreign key(company_id,connection_id) references public.gr_wa_connections(company_id,id)
);
create index if not exists gr_wa_provider_leads_company_recent on public.gr_wa_provider_leads(company_id,received_at desc);
alter table public.gr_wa_provider_leads enable row level security;
revoke all on public.gr_wa_provider_leads from public,anon;
grant select on public.gr_wa_provider_leads to authenticated;
create policy gr_wa_provider_leads_admin_read
 on public.gr_wa_provider_leads for select to authenticated
 using(public.gr_wa_admin(company_id));

-- Ensure the configured secret slot is also represented in CRM. No API
-- connection is assumed successful, and no credentials are persisted here.
insert into public.gr_wa_connections(company_id,slot,provider,display_name,sender_phone,setup_state,enabled)
values('grow-india',1,'socialberries','SocialBerries','','not_configured',false)
on conflict(company_id,slot) do nothing;

-- Review-before-import step, idempotent on provider lead ID.
create or replace function public.gr_wa_import_provider_lead(
 p_staged_id uuid,p_assignee uuid default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare r public.gr_wa_provider_leads%rowtype;v_id text;v_digits text;v_duplicate text;
begin
 select * into r from public.gr_wa_provider_leads where id=p_staged_id for update;
 if not found then raise exception 'Provider lead not found';end if;
 if not public.gr_wa_admin(r.company_id) then raise exception 'Only company Admin can import provider leads';end if;
 if r.imported_lead_id is not null then return jsonb_build_object('status','already_imported','lead_id',r.imported_lead_id);end if;
 v_digits:=regexp_replace(coalesce(r.mobile,''),'[^0-9]','','g');
 if v_digits ~ '^[6-9][0-9]{9}$' then v_digits:='91'||v_digits;end if;
 if v_digits !~ '^91[6-9][0-9]{9}$' then raise exception 'Valid Indian mobile number required to import';end if;
 select lead_id into v_duplicate from public.gr_lead_pipeline l
 where l.company_id=r.company_id
  and regexp_replace(l.mobile,'[^0-9]','','g') in (v_digits,substring(v_digits from 3))
 limit 1;
 if v_duplicate is not null then
  return jsonb_build_object('status','existing_lead','lead_id',v_duplicate);
 end if;
 if exists(select 1 from public.gr_crm_customers c
   where regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g') in (v_digits,substring(v_digits from 3))
    or regexp_replace(coalesce(c.mobile2,''),'[^0-9]','','g') in (v_digits,substring(v_digits from 3))) then
    return jsonb_build_object('status','existing_customer');
 end if;
 v_id:=public.gr_pipeline_create(
   p_company=>r.company_id,
   p_title=>coalesce(nullif(btrim(r.name),''),'WhatsApp enquiry'),
   p_contact=>r.name,
   p_assignee=>p_assignee,
   p_source=>coalesce(nullif(r.source,''),'SocialBerries'),
   p_mobile=>'+'||v_digits,
   p_email=>coalesce(r.email,''),
   p_note=>'Imported from SocialBerries lead reference '||r.provider_lead_id);
 update public.gr_wa_provider_leads
 set imported_lead_id=v_id, imported_at=now()
 where id=r.id;
 return jsonb_build_object('status','imported','lead_id',v_id);
end $$;
revoke all on function public.gr_wa_import_provider_lead(uuid,uuid) from public,anon;
grant execute on function public.gr_wa_import_provider_lead(uuid,uuid) to authenticated;
