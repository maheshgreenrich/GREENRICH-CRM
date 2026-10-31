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


-- Required status is controlled by the published customer form. Format and uniqueness checks remain.
alter table public.gr_crm_customers drop constraint if exists gr_crm_customers_name_check;
alter table public.gr_crm_customers drop constraint if exists gr_crm_customers_address1_check;
revoke all on function public.gr_pipeline_move(text,text,text,text,text,date) from public,anon;
grant execute on function public.gr_pipeline_move(text,text,text,text,text,date) to authenticated;
