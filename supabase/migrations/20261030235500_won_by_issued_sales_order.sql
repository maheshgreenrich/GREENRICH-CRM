-- Convert Quotation → Won using a real, issued customer-linked Sales Order.
-- Auto-link only when SO customer demonstrably matches this lead's mobile/email.
create or replace function public.gr_pipeline_win_with_order(
 p_company text,p_lead text,p_order text,p_note text
) returns void language plpgsql security definer set search_path=''
as $function$
declare v public.gr_lead_pipeline%rowtype; so jsonb; cid uuid;
 c public.gr_crm_customers%rowtype; phone1 text; phone2 text;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found or not public.gr_lead_can(p_company,v.assigned_to,'edit')
 then raise exception 'Lead not found or permission denied';end if;
 if v.stage<>'Quotation' then raise exception 'Only quotation-stage leads can move to Won';end if;
 if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'Conversation or order confirmation details are required';end if;
 select payload into so from public.gr_crm_records
  where company_id=p_company and kind='sales' and record_id=p_order;
 if so is null or coalesce(so->>'status','') not in ('Issued','Confirmed','Approved','Completed','Dispatched')
 then raise exception 'Select an issued or confirmed Sales Order';end if;
 cid:=nullif(so->>'customer_id','')::uuid;
 select * into c from public.gr_crm_customers where id=cid;
 if not found then raise exception 'Sales Order does not have a valid customer';end if;
 if v.customer_id is not null and v.customer_id<>cid
 then raise exception 'This Sales Order belongs to a different customer; verify the lead';end if;
 if v.customer_id is null then
  phone1:=regexp_replace(coalesce(v.mobile,''),'\D','','g');
  phone2:=regexp_replace(coalesce(c.mobile,''),'\D','','g');
  if not ((length(phone1)>=10 and length(phone2)>=10 and right(phone1,10)=right(phone2,10))
      or (nullif(trim(v.email),'') is not null and lower(trim(v.email))=lower(trim(c.email))))
  then raise exception 'Sales Order customer does not match this lead mobile/email. Link the correct customer first';end if;
  perform public.gr_pipeline_link_customer(p_company,p_lead,cid,'Customer verified from issued Sales Order');
 end if;
 perform public.gr_pipeline_advance(p_company,p_lead,'Won',trim(p_note),
  '{}'::text[],'{}'::text[],p_order,null,v.lead_heat);
end $function$;
revoke all on function public.gr_pipeline_win_with_order(text,text,text,text) from public,anon,authenticated;
grant execute on function public.gr_pipeline_win_with_order(text,text,text,text) to authenticated;