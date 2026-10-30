CREATE OR REPLACE FUNCTION public.gr_pipeline_move(p_company text, p_lead text, p_stage text, p_note text, p_order text DEFAULT NULL::text, p_due date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 elsif v.stage='New' and p_stage in ('Contacted','Qualified','Quotation') then null;
 elsif array_position(array['New','Contacted','Qualified','Quotation']::text[],p_stage)
      =array_position(array['New','Contacted','Qualified','Quotation']::text[],v.stage)+1 then null;
 else raise exception 'Move one stage at a time; Lost can return to Contacted'; end if;
 update public.gr_lead_pipeline
 set stage=p_stage,won_order_id=case when p_stage='Won' then p_order else null end,
 won_at=case when p_stage='Won' then now() else null end,
 next_followup=case when p_stage='Quotation' then p_due when v.stage='Quotation' then null else next_followup end,
 updated_at=now()
 where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records set payload=jsonb_set(jsonb_set(payload,'{stage}',to_jsonb(p_stage)),'{won_order_id}',coalesce(to_jsonb(p_order),'null'::jsonb)),
 updated_at=now() where company_id=p_company and kind='leads' and record_id=p_lead;
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,old_stage,new_stage,note)
 values(p_company,p_lead,auth.uid(),'STAGE_CHANGED',v.stage,p_stage,btrim(p_note));
end $function$


create or replace function public.gr_pipeline_move_with_interests(
 p_company text,p_lead text,p_stage text,p_note text,
 p_products text[] default '{}'::text[],p_tags text[] default '{}'::text[],
 p_order text default null,p_due date default null
) returns void language plpgsql security definer set search_path=''
as $rpc$
declare v public.gr_lead_pipeline%rowtype; product text;tag text; interests text[];
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found then raise exception 'Lead not found';end if;
 if v.stage<>'New' and (cardinality(p_products)>0 or cardinality(p_tags)>0)
 then raise exception 'Product and tags can only be chosen during first stage move';end if;
 if v.stage='New' then
  if cardinality(p_products)>30 or cardinality(p_tags)>30 then raise exception 'Too many selections';end if;
  foreach product in array p_products loop
   if not exists(select 1 from public.gr_crm_records r where r.company_id=p_company
    and r.kind='products' and r.record_id=product and coalesce(r.payload->>'active','true')<>'false')
   then raise exception 'Selected product not available for company';end if;
  end loop;
  foreach tag in array p_tags loop
   if not exists(select 1 from public.gr_crm_tags t where t.id::text=tag)
   then raise exception 'Selected tag is not approved in Settings';end if;
  end loop;
 end if;
 perform public.gr_pipeline_move(p_company,p_lead,p_stage,p_note,p_order,p_due);
 if v.stage='New' then
  interests:=array(select distinct x from unnest(coalesce(p_products,'{}'::text[])) x where x is not null and x<>'' order by x);
  update public.gr_lead_pipeline set
    product_id=coalesce(interests[1],product_id),
    tag_ids=case when cardinality(p_tags)>0 then (select array_agg(distinct x) from unnest(p_tags) x) else tag_ids end,
    updated_at=now()
   where company_id=p_company and lead_id=p_lead;
  update public.gr_crm_records r set payload=
   jsonb_set(
    jsonb_set(r.payload,'{product_interest_ids}',to_jsonb(interests),true),
    '{tag_ids}',coalesce(to_jsonb((select tag_ids from public.gr_lead_pipeline l
      where l.company_id=p_company and l.lead_id=p_lead)),'[]'::jsonb),true
   ) || jsonb_build_object('product_id',
      (select product_id from public.gr_lead_pipeline l where l.company_id=p_company and l.lead_id=p_lead)),
   updated_at=now()
   where r.company_id=p_company and r.kind='leads' and r.record_id=p_lead;
 end if;
end $rpc$;
revoke all on function public.gr_pipeline_move_with_interests(text,text,text,text,text[],text[],text,date) from public,anon,authenticated;
grant execute on function public.gr_pipeline_move_with_interests(text,text,text,text,text[],text[],text,date) to authenticated;
