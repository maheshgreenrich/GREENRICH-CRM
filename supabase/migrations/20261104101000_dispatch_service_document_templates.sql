-- GreenRich ONE: admin document layouts and atomic dispatch-to-service handoff.
create table if not exists public.gr_document_templates (
 company_id text not null references public.gr_companies(id),
 document_type text not null check (document_type in ('invoice','packing')),
 config jsonb not null default '{}'::jsonb,
 updated_by uuid references public.gr_profiles(id),
 updated_at timestamptz not null default now(),
 primary key(company_id, document_type),
 constraint gr_doc_template_config_object check (jsonb_typeof(config)='object')
);
alter table public.gr_document_templates enable row level security;
revoke all on public.gr_document_templates from public,anon;
grant select,insert,update on public.gr_document_templates to authenticated;
drop policy if exists gr_doc_template_company_read on public.gr_document_templates;
create policy gr_doc_template_company_read on public.gr_document_templates
 for select to authenticated using (public.gr_field_member(company_id));
drop policy if exists gr_doc_template_admin_insert on public.gr_document_templates;
create policy gr_doc_template_admin_insert on public.gr_document_templates
 for insert to authenticated with check (public.gr_field_is_admin(company_id) and updated_by=auth.uid());
drop policy if exists gr_doc_template_admin_update on public.gr_document_templates;
create policy gr_doc_template_admin_update on public.gr_document_templates
 for update to authenticated using (public.gr_field_is_admin(company_id))
 with check (public.gr_field_is_admin(company_id) and updated_by=auth.uid());

create table if not exists public.gr_dispatch_service_followups (
 dispatch_id uuid primary key references public.gr_dispatch_orders(id) on delete cascade,
 company_id text not null references public.gr_companies(id),
 needs_service boolean not null default false,
 visit_id uuid unique references public.gr_field_visits(id),
 assigned_to uuid references public.gr_profiles(id),
 due_at timestamptz,
 notes text not null default '',
 created_by uuid not null references public.gr_profiles(id),
 created_at timestamptz not null default now(),
 constraint gr_dispatch_service_selection_valid check
  ((needs_service and visit_id is not null and assigned_to is not null and due_at is not null)
   or (not needs_service and visit_id is null and assigned_to is null and due_at is null))
);
create index if not exists gr_dispatch_service_by_company on public.gr_dispatch_service_followups(company_id,created_at desc);
alter table public.gr_dispatch_service_followups enable row level security;
revoke all on public.gr_dispatch_service_followups from public,anon;
grant select on public.gr_dispatch_service_followups to authenticated;
drop policy if exists gr_dispatch_service_view on public.gr_dispatch_service_followups;
create policy gr_dispatch_service_view on public.gr_dispatch_service_followups
 for select to authenticated using (public.gr_dispatch_allowed(company_id,'view'));

create or replace function public.gr_dispatch_deliver_with_service(
 p_dispatch uuid,p_courier text,p_tracking text,p_url text,p_note text,
 p_service boolean default false,p_assignee uuid default null,
 p_due timestamptz default null,p_service_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 d public.gr_dispatch_orders%rowtype;
 v_id uuid;
 existing public.gr_dispatch_service_followups%rowtype;
 actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'Sign in required';end if;
 select * into d from public.gr_dispatch_orders where id=p_dispatch for update;
 if not found then raise exception 'Dispatch order not found';end if;
 if not public.gr_dispatch_allowed(d.company_id,'dispatch')
 then raise exception 'Dispatch edit permission denied';end if;
 if d.status not in ('Shipped','Delivered')
 then raise exception 'Mark order Shipped before closing as Delivered';end if;
 if length(btrim(coalesce(p_courier,'')))<1 or length(btrim(coalesce(p_tracking,'')))<1
 then raise exception 'Courier name and tracking number required';end if;
 if p_url is not null and length(btrim(p_url))>0 and p_url !~* '^https?://[^ ]+$'
 then raise exception 'Tracking URL must begin with https:// or http://';end if;
 if p_service is null then p_service:=false;end if;
 if p_service then
   if p_assignee is null or p_due is null or p_due<now()-interval '1 minute'
   then raise exception 'Choose service employee and a valid follow-up date';end if;
   if not exists (select 1 from public.gr_profiles p
     where p.id=p_assignee and p.active and d.company_id=any(p.company_ids))
   then raise exception 'Assigned service employee is not active in this company';end if;
 else
   p_assignee:=null;p_due:=null;p_service_note:='';
 end if;
 select * into existing from public.gr_dispatch_service_followups where dispatch_id=d.id;
 if found then
   if existing.needs_service is distinct from p_service
     or existing.assigned_to is distinct from p_assignee
   then raise exception 'Service decision already recorded. Contact Admin to change a completed dispatch';end if;
   return jsonb_build_object('dispatch_id',d.id,'visit_id',existing.visit_id,
    'service_required',existing.needs_service,'already_completed',true);
 end if;
 if d.status='Delivered' then
   raise exception 'Order already delivered before service follow-up workflow was enabled; no duplicate close permitted';
 end if;
 if p_service then
   insert into public.gr_field_visits(
    company_id,visit_type,title,customer_id,contact_name,contact_phone,address,
    assigned_to,created_by,due_at,status,notes
   ) values (
    d.company_id,'service',left('Service follow-up · Order '||d.order_id,160),
    d.customer_id,coalesce(d.customer_name,''),coalesce(d.customer_mobile,''),
    coalesce(d.shipping_address,''),p_assignee,actor,p_due,'planned',
    left('From delivered Dispatch order '||d.order_id||
      case when nullif(btrim(coalesce(d.invoice_number,'')),'') is not null
        then ' · Invoice '||d.invoice_number else '' end||
      case when nullif(btrim(coalesce(p_service_note,'')),'') is not null
        then ' · '||btrim(p_service_note) else '' end,4000)
   ) returning id into v_id;
 end if;
 update public.gr_dispatch_orders set status='Delivered',courier_name=btrim(p_courier),
  tracking_number=btrim(p_tracking),tracking_url=nullif(btrim(coalesce(p_url,'')),''),
  dispatch_note=nullif(btrim(coalesce(p_note,'')),''),
  delivered_at=coalesce(d.delivered_at,now()),updated_at=now(),updated_by=actor
 where id=d.id;
 insert into public.gr_dispatch_service_followups(
  dispatch_id,company_id,needs_service,visit_id,assigned_to,due_at,notes,created_by
 ) values (d.id,d.company_id,p_service,v_id,p_assignee,p_due,left(coalesce(p_service_note,''),2000),actor);
 return jsonb_build_object('dispatch_id',d.id,'visit_id',v_id,
   'service_required',p_service,'already_completed',false);
end $$;
revoke all on function public.gr_dispatch_deliver_with_service(uuid,text,text,text,text,boolean,uuid,timestamptz,text) from public,anon;
grant execute on function public.gr_dispatch_deliver_with_service(uuid,text,text,text,text,boolean,uuid,timestamptz,text) to authenticated;
