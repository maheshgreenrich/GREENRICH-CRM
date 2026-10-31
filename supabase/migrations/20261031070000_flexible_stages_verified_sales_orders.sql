-- GreenRich ONE: flexible lead transitions with verified Sales Order conversion.
-- Preserve authenticated lead-scoped access, immutable Won conversion, and customer/order matching.
create or replace function public.gr_pipeline_move(
 p_company text,p_lead text,p_stage text,p_note text,p_order text default null,p_due date default null
) returns void language plpgsql security definer set search_path to '' as $function$
declare v public.gr_lead_pipeline%rowtype;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found or not public.gr_lead_can(p_company,v.assigned_to,'edit')
 then raise exception 'Lead not found or permission denied';end if;
 if p_stage not in ('New','Contacted','Qualified','Quotation','Won','Lost')
 then raise exception 'Choose a valid lead stage';end if;
 if v.stage='Won' then raise exception 'Won leads are completed and cannot be moved';end if;
 if v.stage=p_stage then raise exception 'Choose a different stage';end if;
 if nullif(btrim(coalesce(p_note,'')),'') is null or length(p_note)>4000
 then raise exception 'Enter conversation details (maximum 4000 characters)';end if;
 if p_stage='Won' then
   if v.customer_id is null then raise exception 'Verify the Sales Order customer before converting the lead';end if;
   if nullif(btrim(coalesce(p_order,'')),'') is null or not exists(
     select 1 from public.gr_crm_records r
     where r.company_id=p_company and r.kind='sales' and r.record_id=p_order
       and r.payload->>'customer_id'=v.customer_id::text
       and coalesce(r.payload->>'status','') in ('Issued','Confirmed','Approved','Completed','Dispatched')
   ) then raise exception 'Select a valid confirmed Sales Order for this customer';end if;
 end if;
 update public.gr_lead_pipeline
 set stage=p_stage,
   won_order_id=case when p_stage='Won' then p_order else null end,
   won_at=case when p_stage='Won' then now() else null end,
   next_followup=case when p_stage in ('Won','Lost') then null when p_due is not null then p_due else next_followup end,
   updated_at=now()
 where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records
 set payload=jsonb_set(
   jsonb_set(payload,'{stage}',to_jsonb(p_stage)),
   '{won_order_id}',coalesce(to_jsonb(p_order),'null'::jsonb)
 ),updated_at=now()
 where company_id=p_company and kind='leads' and record_id=p_lead;
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,old_stage,new_stage,note)
 values(p_company,p_lead,auth.uid(),'STAGE_CHANGED',v.stage,p_stage,btrim(p_note));
end $function$;

create or replace function public.gr_pipeline_advance(
 p_company text,p_lead text,p_stage text,p_note text,
 p_products text[] default '{}'::text[],p_tags text[] default '{}'::text[],
 p_order text default null,p_due_at timestamp with time zone default null,p_heat text default 'Warm'
) returns void language plpgsql security definer set search_path to '' as $function$
declare v public.gr_lead_pipeline%rowtype;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found or not public.gr_lead_can(p_company,v.assigned_to,'edit')
 then raise exception 'Lead not found or permission denied';end if;
 if v.stage='Won' then raise exception 'Won leads cannot be moved';end if;
 if p_stage not in ('New','Contacted','Qualified','Quotation','Won','Lost')
 then raise exception 'Invalid lead stage';end if;
 if p_heat not in ('Cold','Warm','Hot') then raise exception 'Choose Hot, Warm or Cold';end if;
 -- Interests are optional; where selected, gr_pipeline_move_with_interests verifies products and tags.
 if p_stage not in ('Won','Lost') and (p_due_at is null or p_due_at<=now())
 then raise exception 'Choose a future follow-up date and time';end if;
 if p_stage='Won' then
   if nullif(btrim(coalesce(p_order,'')),'') is null then
    raise exception 'Select an issued Sales Order before marking Won';end if;
   if not exists(select 1 from public.gr_crm_records so
     where so.company_id=p_company and so.kind='sales' and so.record_id=p_order
       and so.payload->>'customer_id'=v.customer_id::text
       and coalesce(so.payload->>'status','') in ('Issued','Confirmed','Approved','Completed','Dispatched'))
   then raise exception 'The Sales Order must belong to this lead customer and be confirmed';end if;
 end if;
 perform public.gr_pipeline_move_with_interests(p_company,p_lead,p_stage,p_note,
   coalesce(p_products,'{}'::text[]),coalesce(p_tags,'{}'::text[]),p_order,
   case when p_due_at is null then null else (p_due_at at time zone 'Asia/Kolkata')::date end);
 update public.gr_lead_pipeline set
    lead_heat=p_heat,
    next_followup_at=case when p_stage in ('Won','Lost') then null else p_due_at end,
    next_followup=case when p_stage in ('Won','Lost') then null else (p_due_at at time zone 'Asia/Kolkata')::date end,
    updated_at=now()
 where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records set
   payload=payload||jsonb_build_object('lead_heat',p_heat,
    'next_followup_at',case when p_stage in ('Won','Lost') then null else p_due_at end),
   updated_at=now()
 where company_id=p_company and kind='leads' and record_id=p_lead;
end $function$;

create or replace function public.gr_pipeline_win_with_order(
 p_company text,p_lead text,p_order text,p_note text
) returns void language plpgsql security definer set search_path to '' as $function$
declare v public.gr_lead_pipeline%rowtype; so jsonb; cid uuid;
 c public.gr_crm_customers%rowtype; phone1 text;phone2 text;emailmatch boolean;phonematch boolean;explicitlink boolean;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found or not public.gr_lead_can(p_company,v.assigned_to,'edit')
 then raise exception 'Lead not found or permission denied';end if;
 if v.stage='Won' then raise exception 'Lead has already been converted';end if;
 if nullif(btrim(coalesce(p_note,'')),'') is null then
  raise exception 'Enter Sales Order confirmation or conversation details';end if;
 select payload into so from public.gr_crm_records
 where company_id=p_company and kind='sales' and record_id=p_order;
 if so is null or coalesce(so->>'status','') not in ('Issued','Confirmed','Approved','Completed','Dispatched')
 then raise exception 'Select an issued or confirmed Sales Order';end if;
 if nullif(so->>'customer_id','') is null then raise exception 'Sales Order has no valid customer';end if;
 begin cid:=(so->>'customer_id')::uuid;
 exception when invalid_text_representation then raise exception 'Sales Order customer reference is invalid';end;
 select * into c from public.gr_crm_customers where id=cid;
 if not found then raise exception 'Sales Order customer no longer exists';end if;
 if v.customer_id is not null and v.customer_id<>cid then
  raise exception 'This Sales Order belongs to another customer. Select the matching order';end if;
 if v.customer_id is null then
  phone1:=regexp_replace(coalesce(v.mobile,''),'[^0-9]','','g');
  phone2:=regexp_replace(coalesce(c.mobile,''),'[^0-9]','','g');
  phonematch:=length(phone1)>=10 and length(phone2)>=10 and right(phone1,10)=right(phone2,10);
  emailmatch:=nullif(btrim(v.email),'') is not null and lower(btrim(v.email))=lower(btrim(c.email));
  explicitlink:=so->>'lead_id'=p_lead and so->>'company_id'=p_company;
  if not (phonematch or emailmatch or explicitlink) then
   raise exception 'Sales Order customer differs from this lead. Use a linked lead order or verify contact details';end if;
  perform public.gr_pipeline_link_customer(p_company,p_lead,cid,'Customer verified from matching Sales Order');
 end if;
 perform public.gr_pipeline_advance(p_company,p_lead,'Won',btrim(p_note),
  '{}'::text[],'{}'::text[],p_order,null,coalesce(v.lead_heat,'Warm'));
end $function$;
