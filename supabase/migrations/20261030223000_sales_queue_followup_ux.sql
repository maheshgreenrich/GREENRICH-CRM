alter table public.gr_lead_pipeline add column if not exists lead_heat text not null default 'Warm' check(lead_heat in ('Cold','Warm','Hot'));

alter table public.gr_lead_pipeline add column if not exists next_followup_at timestamptz;

CREATE OR REPLACE FUNCTION public.gr_lead_can(p_company text, p_assignee uuid, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select exists (
 select 1 from public.gr_profiles me
 join public.gr_roles role on role.id=me.role_id
 where me.id=(select auth.uid()) and me.active and p_company=any(me.company_ids)
 and (
   role.name='Admin'
   or (p_assignee is null and role.name in ('Sales','Telecaller') and exists(select 1 from public.gr_role_permissions perm where perm.role_id=me.role_id and perm.module='leads' and perm.action=p_action and perm.allowed))
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
) $function$;

CREATE OR REPLACE FUNCTION public.gr_pipeline_assign(p_company text, p_lead text, p_employee uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.gr_lead_pipeline%rowtype; staff public.gr_profiles%rowtype;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found then raise exception 'Lead not found'; end if;
 if not public.gr_lead_can_manage(p_company,v.assigned_to) then raise exception 'Only Admin or permitted manager can reassign'; end if;
 if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Assignment reason is required'; end if;
 if p_employee is not null then
  select * into staff from public.gr_profiles where id=p_employee and active and p_company=any(company_ids);
  if not found or not exists(select 1 from public.gr_pipeline_staff(p_company) where id=p_employee) then raise exception 'Employee is not available for this company'; end if;
 end if;
 update public.gr_lead_pipeline set assigned_to=p_employee,updated_at=now() where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records set payload=jsonb_set(jsonb_set(payload,'{owner}',to_jsonb(case when p_employee is null then 'Common' else staff.full_name end)),'{assigned_to}',to_jsonb(p_employee)),
 updated_at=now() where company_id=p_company and kind='leads' and record_id=p_lead;
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,old_assignee,new_assignee,note)
 values(p_company,p_lead,auth.uid(),'ASSIGNED',v.assigned_to,p_employee,btrim(p_note));
end $function$;

CREATE OR REPLACE FUNCTION public.gr_pipeline_create(p_company text, p_title text, p_contact text, p_assignee uuid, p_source text DEFAULT ''::text, p_product text DEFAULT NULL::text, p_value numeric DEFAULT 0, p_mobile text DEFAULT ''::text, p_email text DEFAULT ''::text, p_tags text[] DEFAULT '{}'::text[], p_customer uuid DEFAULT NULL::uuid, p_note text DEFAULT ''::text, p_legacy_id text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id text; v_staff public.gr_profiles%rowtype; v_me public.gr_profiles%rowtype;
begin
 select * into v_me from public.gr_profiles where id=(select auth.uid()) and active;
 if not found or not p_company=any(v_me.company_ids) then raise exception 'Company access denied'; end if;
 if btrim(coalesce(p_title,''))='' or length(p_title)>250 then raise exception 'Lead title required (maximum 250 chars)'; end if;
 if p_assignee is null then
   if not public.gr_meta_sheet_is_admin(p_company) then raise exception 'Only company Admin can create Common leads';end if;
 else
   select * into v_staff from public.gr_profiles where id=p_assignee and active and p_company=any(company_ids);
   if not found then raise exception 'Assigned employee is inactive or outside this company';end if;
   if not exists(select 1 from public.gr_pipeline_staff(p_company) where id=p_assignee) then raise exception 'Not eligible to assign this employee';end if;
   if not (public.gr_lead_can_manage(p_company,p_assignee) or (p_assignee=auth.uid() and public.gr_lead_can(p_company,p_assignee,'create')))
   then raise exception 'Permission denied to assign this lead';end if;
 end if;
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
 'tag_ids',to_jsonb(coalesce(p_tags,'{}')),'customer_id',p_customer,'owner',case when p_assignee is null then 'Common' else v_staff.full_name end,'assigned_to',p_assignee,
 'stage','New','value',p_value,'notes',coalesce(p_note,''),'created_at',now()),auth.uid());
 insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,new_stage,new_assignee,note)
 values(p_company,v_id,auth.uid(),'CREATED','New',p_assignee,'Lead assigned to '||(case when p_assignee is null then 'Common' else v_staff.full_name end));
 return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.gr_sheet_admin_upsert(p_id uuid, p_company text, p_sheet_url text, p_tab text, p_source text, p_brand text, p_product_interest text, p_product_id text, p_assignee uuid, p_mapping jsonb, p_header_row integer, p_first_row integer, p_import_mode text, p_enabled boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;v_sheet text;v_key text;v_col text;v_allowed text[]:=array[
 'name','phone','email','city','requirement','product_interest','household_size',
 'composting_status','buying_timeline','remarks','external_id','campaign','form_name','created_time'];
begin
 if not public.gr_meta_sheet_is_admin(p_company) then raise exception 'Company Admin required';end if;
 v_sheet:=substring(p_sheet_url from '/spreadsheets/d/([A-Za-z0-9_-]+)');
 if v_sheet is null and p_sheet_url ~ '^[A-Za-z0-9_-]{20,120}$' then v_sheet:=p_sheet_url;end if;
 if v_sheet is null or length(v_sheet)>120 then raise exception 'Enter a valid Google Sheets URL or spreadsheet ID';end if;
 if length(trim(coalesce(p_tab,''))) not between 1 and 120 then raise exception 'Sheet tab name required';end if;
 if length(trim(coalesce(p_source,''))) not between 2 and 100 then raise exception 'Source label required';end if;
 if p_import_mode not in ('new_only','historical') or p_import_mode is null then raise exception 'Invalid import mode';end if;
 if p_header_row not between 1 and 2000000 or p_first_row not between 1 and 2000000 or p_first_row<=p_header_row
 then raise exception 'Data starts after the header row';end if;
 if p_mapping is null or jsonb_typeof(p_mapping)<>'object' then raise exception 'Invalid column mapping';end if;
 if not (p_mapping ? 'name' and p_mapping ? 'phone') then raise exception 'Map Name and Phone columns';end if;
 for v_key,v_col in select key,value from jsonb_each_text(p_mapping) loop
  if not (v_key=any(v_allowed)) then raise exception 'Unrecognized CRM field: %',v_key;end if;
  if upper(v_col) !~ '^[A-Z]{1,2}$' or length(upper(v_col))=2 and upper(v_col)>'AZ'
  then raise exception 'Invalid column letter for %',v_key;end if;
 end loop;
 if p_assignee is not null and not exists(select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
   where p.id=p_assignee and p.active and p_company=any(p.company_ids) and
   (r.name in('Sales','Telecaller') or exists(select 1 from public.gr_role_permissions z where
     z.role_id=r.id and z.module='leads' and z.action='edit' and z.allowed)))
 then raise exception 'Choose an authorized active salesperson';end if;
 if nullif(p_product_id,'') is not null and not exists(
   select 1 from public.gr_crm_records where company_id=p_company and kind='products' and record_id=p_product_id
 ) then raise exception 'Product SKU must belong to the chosen company';end if;
 if p_id is null then
  insert into public.gr_sheet_connections(company_id,sheet_id,tab_name,source_name,brand,product_interest,
    product_id,assigned_to,created_by,mapping,header_row,first_data_row,import_mode,enabled)
  values(p_company,v_sheet,trim(p_tab),trim(p_source),left(trim(coalesce(p_brand,'')),140),
    left(trim(coalesce(p_product_interest,'')),220),nullif(p_product_id,''),p_assignee,auth.uid(),
    p_mapping,p_header_row,p_first_row,p_import_mode,p_enabled)
  returning id into v_id;
 else
  update public.gr_sheet_connections set sheet_id=v_sheet,tab_name=trim(p_tab),source_name=trim(p_source),
    brand=left(trim(coalesce(p_brand,'')),140),product_interest=left(trim(coalesce(p_product_interest,'')),220),
    product_id=nullif(p_product_id,''),assigned_to=p_assignee,mapping=p_mapping,
    header_row=p_header_row,first_data_row=p_first_row,enabled=p_enabled,updated_at=now(),
    import_mode=p_import_mode
  where id=p_id and company_id=p_company returning id into v_id;
  if v_id is null then raise exception 'Sheet connection not found';end if;
 end if;
 return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.gr_sheet_sync_batch(p_token text, p_connection uuid, p_rows jsonb, p_headers jsonb, p_initial_cursor integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_admin uuid; c public.gr_sheet_connections%rowtype;r jsonb;v_values jsonb;v_headers jsonb;
 v_row int;v_name text;v_phone text;v_digits text;v_email text;v_city text;v_product text;
 v_req text;v_house text;v_compost text;v_timeline text;v_remarks text;v_external text;
 v_campaign text;v_form text;v_created text;v_lead text;v_title text;v_notes text;v_answers jsonb;
 v_dup_leads jsonb;v_dup_contacts jsonb;v_dup_external boolean;v_dtype text;v_review text;
 v_new int:=0;v_replayed int:=0;v_invalid int:=0;v_dup_cnt int:=0;v_max int;
 v_editor public.gr_profiles%rowtype;v_key text;v_allowed text[];
begin
 v_admin:=public.gr_sheet_token_admin(p_token);
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>40
 then raise exception 'Maximum 40 rows per request';end if;
 if p_headers is null or jsonb_typeof(p_headers)<>'array' or jsonb_array_length(p_headers)>80
 then raise exception 'Headers must be an array of at most 80 values';end if;
 select * into c from public.gr_sheet_connections where id=p_connection and enabled for update;
 if not found or c.created_by<>v_admin or not exists(
  select 1 from public.gr_profiles p where p.id=v_admin and c.company_id=any(p.company_ids))
 then raise exception 'Sheet connection not authorized';end if;
 if c.assigned_to is not null then
  select * into v_editor from public.gr_profiles p where p.id=c.assigned_to and p.active
    and c.company_id=any(p.company_ids);
  if not found then raise exception 'Assigned employee inactive or no company access';end if;
 end if;
 if p_initial_cursor is not null then
  if c.cursor_row=0 and c.import_mode='new_only' and p_initial_cursor>=c.first_data_row-1
     and p_initial_cursor<=2000000 and jsonb_array_length(p_rows)=0 then
    update public.gr_sheet_connections set cursor_row=p_initial_cursor,detected_headers=p_headers,
      last_sync_at=now(),last_error=null where id=c.id;
    return jsonb_build_object('created',0,'replayed',0,'invalid',0,'duplicate',0,'cursor',p_initial_cursor,'bootstrapped',true);
  else raise exception 'Source already initialized or invalid bootstrap';end if;
 end if;
 v_max:=greatest(c.cursor_row,c.first_data_row-1);
 for r in select value from jsonb_array_elements(p_rows) loop
  v_row:=(r->>'rowNumber')::int;v_values:=r->'values';
  if v_row is null or v_row<c.first_data_row or v_row>2000000 or jsonb_typeof(v_values)<>'array'
     or jsonb_array_length(v_values)>80 then raise exception 'Invalid source row';end if;
  if v_row<=c.cursor_row or exists(select 1 from public.gr_sheet_import_rows where connection_id=c.id and row_number=v_row)
  then v_replayed:=v_replayed+1;continue;end if;
  v_max:=greatest(v_max,v_row);
  v_name:=public.gr_sheet_col(v_values,c.mapping,'name');
  v_phone:=public.gr_sheet_col(v_values,c.mapping,'phone');
  v_email:=lower(public.gr_sheet_col(v_values,c.mapping,'email'));
  v_city:=public.gr_sheet_col(v_values,c.mapping,'city');
  v_req:=public.gr_sheet_col(v_values,c.mapping,'requirement');
  v_house:=public.gr_sheet_col(v_values,c.mapping,'household_size');
  v_compost:=public.gr_sheet_col(v_values,c.mapping,'composting_status');
  v_timeline:=public.gr_sheet_col(v_values,c.mapping,'buying_timeline');
  v_remarks:=public.gr_sheet_col(v_values,c.mapping,'remarks');
  v_product:=coalesce(nullif(public.gr_sheet_col(v_values,c.mapping,'product_interest'),''),c.product_interest);
  v_external:=public.gr_sheet_col(v_values,c.mapping,'external_id');
  v_campaign:=public.gr_sheet_col(v_values,c.mapping,'campaign');
  v_form:=public.gr_sheet_col(v_values,c.mapping,'form_name');
  v_created:=public.gr_sheet_col(v_values,c.mapping,'created_time');
  v_digits:=regexp_replace(v_phone,'[^0-9]','','g');
  if length(v_digits)=11 and left(v_digits,1)='0' then v_digits:=right(v_digits,10);end if;
  if length(v_digits)=10 then v_phone:='+91'||v_digits;
  elsif length(v_digits)=12 and left(v_digits,2)='91' then v_phone:='+'||v_digits;
  elsif length(v_digits) between 11 and 15 then v_phone:='+'||v_digits;
  else v_phone:='';end if;
  v_answers:='{}'::jsonb;
  for v_key in select key from jsonb_each_text(c.mapping) loop
    v_answers:=v_answers||jsonb_build_object(v_key,public.gr_sheet_col(v_values,c.mapping,v_key));
  end loop;
  -- Skip headings, empty rows, repeated report headings and invalid contacts, but retain raw row for review.
  if length(v_name)<2 or lower(v_name) in ('full name','name','customer name','printing date','lead gen date','lead name')
    or (v_phone='' and position('@' in v_email)=0) then
    insert into public.gr_sheet_import_rows(connection_id,company_id,row_number,external_id,
     raw_values,raw_answers,normalized_answers,import_error)
    values(c.id,c.company_id,v_row,v_external,v_values,
      jsonb_build_object('headers',p_headers,'values',v_values),v_answers,
      'Skipped invalid or repeated heading row; verify name and phone/email')
    on conflict(connection_id,row_number) do nothing;
    v_invalid:=v_invalid+1;continue;
  end if;
  select coalesce(jsonb_agg(q.lead_id),'[]'::jsonb) into v_dup_leads from (
   select l.lead_id from public.gr_lead_pipeline l where l.company_id=c.company_id
   and ((v_phone<>'' and right(regexp_replace(l.mobile,'[^0-9]','','g'),10)=right(v_digits,10))
       or (v_email<>'' and lower(l.email)=v_email)
       or (v_external<>'' and exists(select 1 from public.gr_sheet_import_rows i
           where i.company_id=c.company_id and i.external_id=v_external and i.lead_id=l.lead_id)))
    order by l.created_at desc limit 20
  )q;
  select coalesce(jsonb_agg(q.id),'[]'::jsonb) into v_dup_contacts from (
    select z.id from public.gr_crm_customers z where
     (v_phone<>'' and (right(regexp_replace(z.mobile,'[^0-9]','','g'),10)=right(v_digits,10)
        or right(regexp_replace(z.mobile2,'[^0-9]','','g'),10)=right(v_digits,10)))
     or (v_email<>'' and lower(z.email)=v_email)
    limit 20
  )q;
  v_dtype:=case when jsonb_array_length(v_dup_leads)>0 and jsonb_array_length(v_dup_contacts)>0 then 'both'
    when jsonb_array_length(v_dup_leads)>0 then 'lead'
    when jsonb_array_length(v_dup_contacts)>0 then 'contact' else 'none' end;
  v_review:=case when v_dtype='none' then 'clean' else 'pending' end;
  if v_dtype<>'none' then v_dup_cnt:=v_dup_cnt+1;end if;
  v_lead:=gen_random_uuid()::text;
  v_title:=left(v_name||case when v_product<>'' then ' — '||v_product else '' end,240);
  v_notes:=left('Auto imported from '||c.source_name||'. Sheet: '||c.tab_name||
    '. Brand: '||c.brand||'. Interest: '||v_product||'. Requirement: '||v_req||
    '. Buying timeline: '||v_timeline||'. City: '||v_city||
    '. Existing composting: '||v_compost||'. Household: '||v_house||
    '. Campaign: '||v_campaign||'. Form: '||v_form||
    '. Original remarks: '||v_remarks,3500);
  insert into public.gr_lead_pipeline(company_id,lead_id,title,contact,mobile,email,source,product_id,assigned_to,notes,created_by)
  values(c.company_id,v_lead,v_title,v_name,v_phone,v_email,c.source_name,c.product_id,c.assigned_to,v_notes,v_admin);
  insert into public.gr_crm_records(company_id,kind,record_id,payload,created_by)
  values(c.company_id,'leads',v_lead,jsonb_build_object(
   'id',v_lead,'company_id',c.company_id,'title',v_title,'name',v_name,'contact',v_name,
   'mobile',v_phone,'email',v_email,'city',v_city,'source',c.source_name,
   'product_id',c.product_id,'brand',c.brand,'product_interest',v_product,
   'assigned_to',c.assigned_to,'owner',coalesce(v_editor.full_name,'Common'),'stage','New','value',0,
   'duplicate_type',v_dtype,'duplicate_review',v_review,
   'enquiry_details',v_answers,'notes',v_notes,'created_at',now()),v_admin);
  insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,new_stage,new_assignee,note)
  values(c.company_id,v_lead,v_admin,'CREATED','New',c.assigned_to,
   'Imported from '||c.source_name||' sheet '||c.tab_name||', row '||v_row||
   '. Duplicate: '||v_dtype||'. No existing lead or contact merged.');
  insert into public.gr_sheet_import_rows(connection_id,company_id,row_number,external_id,lead_id,
   raw_values,raw_answers,normalized_answers,duplicate_lead_ids,duplicate_contact_ids,duplicate_type,review_status)
  values(c.id,c.company_id,v_row,v_external,v_lead,v_values,
   jsonb_build_object('headers',p_headers,'values',v_values,'sheet_id',c.sheet_id,'tab',c.tab_name),
   v_answers,v_dup_leads,v_dup_contacts,v_dtype,v_review);
  v_new:=v_new+1;
 end loop;
 update public.gr_sheet_connections set cursor_row=v_max,detected_headers=p_headers,
  last_sync_at=now(),last_error=null,updated_at=now() where id=c.id;
 return jsonb_build_object('created',v_new,'replayed',v_replayed,'invalid',v_invalid,
   'duplicate',v_dup_cnt,'cursor',v_max);
end $function$;


create or replace function public.gr_pipeline_advance(
 p_company text,p_lead text,p_stage text,p_note text,
 p_products text[] default '{}'::text[],p_tags text[] default '{}'::text[],
 p_order text default null,p_due_at timestamptz default null,p_heat text default 'Warm'
) returns void language plpgsql security definer set search_path=''
as $adv$
declare v public.gr_lead_pipeline%rowtype;
begin
 select * into v from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead for update;
 if not found then raise exception 'Lead not found';end if;
 if not public.gr_lead_can(p_company,v.assigned_to,'edit') then raise exception 'Permission denied';end if;
 if p_heat not in('Cold','Warm','Hot') then raise exception 'Choose Hot, Warm or Cold';end if;
 if v.stage='New' and (cardinality(coalesce(p_products,'{}'))=0 or cardinality(coalesce(p_tags,'{}'))=0)
 then raise exception 'On first movement, choose at least one approved product and tag';end if;
 if p_stage<>'Won' and (p_due_at is null or p_due_at<=now())
 then raise exception 'Choose a future follow-up date and time';end if;
 if p_stage='Won' and p_order is null then raise exception 'Select the issued Sales Order before marking Won';end if;
 perform public.gr_pipeline_move_with_interests(p_company,p_lead,p_stage,p_note,
   p_products,p_tags,p_order,case when p_stage='Quotation' then p_due_at::date else null end);
 update public.gr_lead_pipeline set lead_heat=p_heat,
   next_followup_at=case when p_stage='Won' then null else p_due_at end,
   next_followup=case when p_stage='Won' then null else (p_due_at at time zone 'Asia/Kolkata')::date end,
   updated_at=now() where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records set payload=payload||
  jsonb_build_object('lead_heat',p_heat,'next_followup_at',case when p_stage='Won' then null else p_due_at end),
  updated_at=now() where company_id=p_company and kind='leads' and record_id=p_lead;
end $adv$;
revoke all on function public.gr_pipeline_advance(text,text,text,text,text[],text[],text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.gr_pipeline_advance(text,text,text,text,text[],text[],text,timestamptz,text) to authenticated;

-- Only the currently authorized salesperson/Admin can read an imported
-- lead's form answers. The original import audit table remains Admin-only.
create or replace function public.gr_pipeline_source_answers(p_company text,p_lead text)
returns jsonb language plpgsql stable security definer set search_path=''
as $answers$
declare v_assignee uuid;
begin
 select assigned_to into v_assignee from public.gr_lead_pipeline
 where company_id=p_company and lead_id=p_lead;
 if not found or not public.gr_lead_can(p_company,v_assignee,'view')
 then raise exception 'Lead access denied';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('raw_answers',raw_answers,
  'normalized_answers',normalized_answers,'row_number',row_number) order by created_at desc)
  from (select raw_answers,normalized_answers,row_number,created_at
        from public.gr_sheet_import_rows where company_id=p_company and lead_id=p_lead
        order by created_at desc limit 5) x),'[]'::jsonb);
end $answers$;
revoke all on function public.gr_pipeline_source_answers(text,text) from public,anon,authenticated;
grant execute on function public.gr_pipeline_source_answers(text,text) to authenticated;
