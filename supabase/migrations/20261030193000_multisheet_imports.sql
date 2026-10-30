-- GreenRich ONE | Multiple Google Sheet source registry + non-destructive duplicate review.
-- Extends the single-sheet Meta importer. Credentials remain hashed in gr_meta_sheet_sources.
create table if not exists public.gr_sheet_connections(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 sheet_id text not null check(sheet_id ~ '^[A-Za-z0-9_-]{20,120}$'),
 tab_name text not null check(length(trim(tab_name)) between 1 and 120),
 source_name text not null check(length(trim(source_name)) between 2 and 100),
 brand text not null default '',
 product_interest text not null default '',
 product_id text,
 assigned_to uuid not null references public.gr_profiles(id),
 created_by uuid not null references public.gr_profiles(id),
 mapping jsonb not null default '{}'::jsonb check(jsonb_typeof(mapping)='object'),
 header_row int not null default 1 check(header_row between 1 and 2000000),
 first_data_row int not null default 2 check(first_data_row between 1 and 2000000),
 import_mode text not null default 'new_only' check(import_mode in ('new_only','historical')),
 cursor_row int not null default 0 check(cursor_row>=0),
 enabled boolean not null default true,
 detected_headers jsonb not null default '[]'::jsonb,
 last_sync_at timestamptz, last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,sheet_id,tab_name)
);
create table if not exists public.gr_sheet_import_rows(
 id bigint generated always as identity primary key,
 connection_id uuid not null references public.gr_sheet_connections(id),
 company_id text not null references public.gr_companies(id),
 row_number int not null check(row_number>=1),
 external_id text not null default '',
 lead_id text,
 raw_values jsonb not null check(jsonb_typeof(raw_values)='array'),
 raw_answers jsonb not null default '{}'::jsonb,
 normalized_answers jsonb not null default '{}'::jsonb,
 duplicate_lead_ids jsonb not null default '[]'::jsonb,
 duplicate_contact_ids jsonb not null default '[]'::jsonb,
 duplicate_type text not null default 'none' check(duplicate_type in ('none','lead','contact','both')),
 review_status text not null default 'clean' check(review_status in ('clean','pending','keep_separate','reviewed','not_duplicate')),
 review_note text not null default '',
 import_error text not null default '',
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references public.gr_profiles(id),
 unique(connection_id,row_number)
);
create index if not exists gr_sheet_import_review on public.gr_sheet_import_rows(company_id,duplicate_type,review_status,created_at desc);
create index if not exists gr_sheet_import_lead on public.gr_sheet_import_rows(company_id,lead_id);
create index if not exists gr_sheet_connections_company on public.gr_sheet_connections(company_id,enabled);

alter table public.gr_sheet_connections enable row level security;
alter table public.gr_sheet_import_rows enable row level security;
create policy "admin only sheet connections" on public.gr_sheet_connections for select to authenticated
 using(public.gr_meta_sheet_is_admin(company_id));
create policy "admin only sheet review" on public.gr_sheet_import_rows for select to authenticated
 using(public.gr_meta_sheet_is_admin(company_id));
revoke all on public.gr_sheet_connections,public.gr_sheet_import_rows from public,anon,authenticated;
grant select on public.gr_sheet_connections,public.gr_sheet_import_rows to authenticated;

-- Only authenticated company Admin may create/change integration configuration.
create or replace function public.gr_sheet_admin_upsert(
 p_id uuid,p_company text,p_sheet_url text,p_tab text,p_source text,p_brand text,
 p_product_interest text,p_product_id text,p_assignee uuid,p_mapping jsonb,
 p_header_row int,p_first_row int,p_import_mode text,p_enabled boolean
) returns uuid language plpgsql security definer set search_path=''
as $$
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
 if not exists(select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
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
end $$;

-- Existing 256-bit Google Apps Script token controls one admin's registered company sources.
-- Exact source identity is checked again by the ingestion RPC.
create or replace function public.gr_sheet_token_admin(p_token text)
returns uuid language plpgsql stable security definer set search_path=''
as $$
declare v_admin uuid;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid sync token';end if;
 select s.created_by into v_admin from public.gr_meta_sheet_sources s
 join public.gr_profiles p on p.id=s.created_by and p.active
 join public.gr_roles r on r.id=p.role_id and r.name='Admin'
 where s.enabled and s.token_sha256=encode(extensions.digest(p_token,'sha256'),'hex')
 order by s.updated_at desc limit 1;
 if v_admin is null then raise exception 'Integration token revoked or expired';end if;
 return v_admin;
end $$;

create or replace function public.gr_sheet_sync_manifest(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_admin uuid;
begin
 v_admin:=public.gr_sheet_token_admin(p_token);
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',c.id,'sheet_id',c.sheet_id,'tab_name',c.tab_name,'company',c.company_id,
  'header_row',c.header_row,'first_data_row',c.first_data_row,'cursor_row',c.cursor_row,
  'import_mode',c.import_mode,'source',c.source_name,'last_sync_at',c.last_sync_at))
 from public.gr_sheet_connections c join public.gr_profiles p on p.id=v_admin
 where c.enabled and c.created_by=v_admin and c.company_id=any(p.company_ids)),'[]'::jsonb);
end $$;

create or replace function public.gr_sheet_col(p_values jsonb,p_map jsonb,p_key text)
returns text language plpgsql immutable set search_path=''
as $$
declare v_col text;v_idx int;v_char int;
begin
 v_col:=upper(coalesce(p_map->>p_key,''));
 if v_col='' then return '';end if;
 v_idx:=0;
 for v_char in 1..length(v_col) loop
  v_idx:=v_idx*26+ascii(substr(v_col,v_char,1))-64;
 end loop;
 return left(btrim(coalesce(p_values->>(v_idx-1),'')),500);
end $$;

-- One batch is a transaction: all source rows are recorded once; contacts/leads are NEVER merged.
-- The same row retry is idempotent. New rows with repeated phone/email are imported separately
-- and flagged for duplicate-contacts / duplicate-leads review.
create or replace function public.gr_sheet_sync_batch(
 p_token text,p_connection uuid,p_rows jsonb,p_headers jsonb,p_initial_cursor int default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
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
 select * into v_editor from public.gr_profiles p where p.id=c.assigned_to and p.active
   and c.company_id=any(p.company_ids);
 if not found then raise exception 'Assigned employee inactive or no company access';end if;
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
   'assigned_to',c.assigned_to,'owner',v_editor.full_name,'stage','New','value',0,
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
end $$;

create or replace function public.gr_sheet_admin_review(p_import_id bigint,p_decision text,p_note text)
returns void language plpgsql security definer set search_path=''
as $$
declare x public.gr_sheet_import_rows%rowtype;
begin
 select * into x from public.gr_sheet_import_rows where id=p_import_id for update;
 if not found or not public.gr_meta_sheet_is_admin(x.company_id) then raise exception 'Admin access required';end if;
 if x.duplicate_type='none' then raise exception 'No duplicate to review';end if;
 if p_decision not in ('keep_separate','reviewed','not_duplicate') then raise exception 'Invalid review decision';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'Enter review note';end if;
 update public.gr_sheet_import_rows set review_status=p_decision,review_note=left(trim(p_note),1500),
  reviewed_by=auth.uid(),reviewed_at=now() where id=p_import_id;
 update public.gr_crm_records set payload=jsonb_set(payload,'{duplicate_review}',to_jsonb(p_decision))
 where company_id=x.company_id and kind='leads' and record_id=x.lead_id;
end $$;


-- Report source-specific Google permission errors without exposing integration secrets.
create or replace function public.gr_sheet_sync_report_error(p_token text,p_connection uuid,p_error text)
returns void language plpgsql security definer set search_path=''
as $report$
declare v_admin uuid;
begin
 v_admin:=public.gr_sheet_token_admin(p_token);
 update public.gr_sheet_connections c set last_error=left(coalesce(p_error,'Unknown sync error'),400),
   last_sync_at=now(),updated_at=now()
 where c.id=p_connection and c.created_by=v_admin and c.enabled
 and exists(select 1 from public.gr_profiles p where p.id=v_admin and c.company_id=any(p.company_ids));
 if not found then raise exception 'Source not authorized';end if;
end $report$;
revoke all on function public.gr_sheet_sync_report_error(text,uuid,text) from public,anon,authenticated;
grant execute on function public.gr_sheet_sync_report_error(text,uuid,text) to anon,authenticated;

-- Existing configured Meta spreadsheet appears automatically as first connection
-- (no backfill: old importer may already have imported row 4).
insert into public.gr_sheet_connections(company_id,sheet_id,tab_name,source_name,brand,
 product_interest,assigned_to,created_by,mapping,import_mode)
select s.company_id,s.sheet_id,s.tab_name,'Meta Ads','',
 '',s.assigned_to,s.created_by,
 '{"name":"A","phone":"B","email":"C","product_interest":"D"}'::jsonb,'new_only'
from public.gr_meta_sheet_sources s
where s.enabled
on conflict(company_id,sheet_id,tab_name) do nothing;

revoke all on function public.gr_sheet_admin_upsert(uuid,text,text,text,text,text,text,text,uuid,jsonb,integer,integer,text,boolean) from public,anon,authenticated;
revoke all on function public.gr_sheet_token_admin(text) from public,anon,authenticated;
revoke all on function public.gr_sheet_sync_manifest(text) from public,anon,authenticated;
revoke all on function public.gr_sheet_sync_batch(text,uuid,jsonb,jsonb,integer) from public,anon,authenticated;
revoke all on function public.gr_sheet_col(jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.gr_sheet_admin_review(bigint,text,text) from public,anon,authenticated;
grant execute on function public.gr_sheet_admin_upsert(uuid,text,text,text,text,text,text,text,uuid,jsonb,integer,integer,text,boolean) to authenticated;
grant execute on function public.gr_sheet_admin_review(bigint,text,text) to authenticated;
grant execute on function public.gr_sheet_sync_manifest(text) to anon,authenticated;
grant execute on function public.gr_sheet_sync_batch(text,uuid,jsonb,jsonb,integer) to anon,authenticated;
