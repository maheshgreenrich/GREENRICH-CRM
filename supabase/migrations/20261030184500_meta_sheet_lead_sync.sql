-- GreenRich ONE | Meta Lead Ads -> Google Sheets -> assigned CRM lead
-- No source is enabled until an authenticated Admin configures an assignee and generates a token.
create table if not exists public.gr_meta_sheet_sources (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.gr_companies(id),
  sheet_id text not null,
  tab_name text not null,
  assigned_to uuid not null references public.gr_profiles(id),
  created_by uuid not null references public.gr_profiles(id),
  token_sha256 text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_import_at timestamptz,
  unique(company_id,sheet_id,tab_name)
);
create table if not exists public.gr_meta_sheet_imports (
 id bigint generated always as identity primary key,
 source_id uuid not null references public.gr_meta_sheet_sources(id),
 company_id text not null references public.gr_companies(id),
 external_id text not null,
 row_number int not null,
 lead_id text not null,
 imported_at timestamptz not null default now(),
 unique(source_id,external_id),
 unique(company_id,lead_id)
);
create index if not exists gr_meta_import_by_source on public.gr_meta_sheet_imports(source_id,imported_at desc);
alter table public.gr_meta_sheet_sources enable row level security;
alter table public.gr_meta_sheet_imports enable row level security;
revoke all on public.gr_meta_sheet_sources,public.gr_meta_sheet_imports from public,anon,authenticated;

create or replace function public.gr_meta_sheet_is_admin(p_company text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.gr_profiles p
  join public.gr_roles r on r.id=p.role_id
  where p.id=(select auth.uid()) and p.active and r.name='Admin'
    and p_company=any(p.company_ids))
$$;

-- Only an Admin sees the one-time token. Regeneration invalidates the previous token.
create or replace function public.gr_meta_sheet_configure(
 p_company text,p_assignee uuid,p_enabled boolean default true
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_token text; v_id uuid; v_sheet constant text:='1oyrt_jUpmOCoHDJYecdvipyHGL0BKeeG00jVOqs3GdI';
begin
 if not public.gr_meta_sheet_is_admin(p_company) then raise exception 'Admin role required'; end if;
 if not exists(select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
   where p.id=p_assignee and p.active and p_company=any(p.company_ids)
     and (r.name in ('Sales','Telecaller') or exists(select 1 from public.gr_role_permissions q
       where q.role_id=p.role_id and q.module='leads' and q.action='edit' and q.allowed)))
 then raise exception 'Select an active sales employee in the selected company'; end if;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.gr_meta_sheet_sources(company_id,sheet_id,tab_name,assigned_to,created_by,token_sha256,enabled)
 values(p_company,v_sheet,'Sheet1',p_assignee,auth.uid(),encode(extensions.digest(v_token,'sha256'),'hex'),p_enabled)
 on conflict(company_id,sheet_id,tab_name) do update
 set assigned_to=excluded.assigned_to,created_by=excluded.created_by,
 token_sha256=excluded.token_sha256,enabled=excluded.enabled,updated_at=now()
 returning id into v_id;
 return jsonb_build_object('source_id',v_id,'token',v_token,'enabled',p_enabled,
   'company_id',p_company,'sheet_id',v_sheet,'tab_name','Sheet1');
end $$;

create or replace function public.gr_meta_sheet_status(p_company text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare x public.gr_meta_sheet_sources%rowtype; v_count bigint;
begin
 if not public.gr_meta_sheet_is_admin(p_company) then raise exception 'Admin role required';end if;
 select * into x from public.gr_meta_sheet_sources where company_id=p_company
 and sheet_id='1oyrt_jUpmOCoHDJYecdvipyHGL0BKeeG00jVOqs3GdI' and tab_name='Sheet1';
 if not found then return jsonb_build_object('configured',false);end if;
 select count(*) into v_count from public.gr_meta_sheet_imports where source_id=x.id;
 return jsonb_build_object('configured',true,'enabled',x.enabled,'assigned_to',x.assigned_to,
  'last_import_at',x.last_import_at,'total_imported',v_count,'sheet_id',x.sheet_id,
  'tab_name',x.tab_name,'company_id',x.company_id);
end $$;

-- Explicitly token-protected anon ingress. A 256-bit token is hashed in the DB,
-- and never put in the public website's config or GitHub code.
create or replace function public.gr_meta_sheet_ingest(
 p_token text,p_sheet_id text,p_tab_name text,p_rows jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare s public.gr_meta_sheet_sources%rowtype; r jsonb; v_id text; v_row int;
v_title text;v_contact text;v_mobile text;v_email text;v_product text;v_campaign text;
v_form text;v_created text;v_external text;v_note text;v_key text;v_new int:=0;v_dup int:=0;
v_profile public.gr_profiles%rowtype; v_author public.gr_profiles%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid integration token';end if;
 if p_sheet_id <> '1oyrt_jUpmOCoHDJYecdvipyHGL0BKeeG00jVOqs3GdI' or p_tab_name <> 'Sheet1'
 then raise exception 'Unexpected sheet identity';end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>40
 then raise exception 'Expected a batch of up to 40 rows';end if;
 select * into s from public.gr_meta_sheet_sources
  where sheet_id=p_sheet_id and tab_name=p_tab_name and enabled
    and token_sha256=encode(extensions.digest(p_token,'sha256'),'hex')
 for update;
 if not found then raise exception 'Integration not configured or token revoked';end if;
 select * into v_profile from public.gr_profiles where id=s.assigned_to and active and s.company_id=any(company_ids);
 if not found then raise exception 'Assigned employee is no longer active';end if;
 select * into v_author from public.gr_profiles where id=s.created_by and active;
 if not found then raise exception 'Integration owner is no longer active';end if;
 if not exists(select 1 from public.gr_roles role where role.id=v_profile.role_id
    and (role.name in ('Sales','Telecaller') or exists(select 1 from public.gr_role_permissions rp where
      rp.role_id=role.id and rp.module='leads' and rp.action='edit' and rp.allowed)))
 then raise exception 'Assigned employee no longer has lead permissions';end if;
 for r in select value from jsonb_array_elements(p_rows)
 loop
  if jsonb_typeof(r)<>'object' then raise exception 'Invalid lead row';end if;
  v_row:=nullif(r->>'rowNumber','')::integer;
  if v_row is null or v_row<2 or v_row>2000000 then raise exception 'Invalid Google Sheets row number';end if;
  v_external:=left(btrim(coalesce(r->>'leadId','')),120);
  if v_external='' then v_external:='sheet-row-'||v_row::text;end if;
  if exists(select 1 from public.gr_meta_sheet_imports where source_id=s.id and external_id=v_external)
  then v_dup:=v_dup+1;continue;end if;
  v_contact:=left(btrim(coalesce(r->>'name','')),180);
  v_mobile:=regexp_replace(coalesce(r->>'phone',''),'[^0-9]','','g');
  if length(v_mobile)=11 and left(v_mobile,1)='0' then v_mobile:=right(v_mobile,10);end if;
  if length(v_mobile)=10 then v_mobile:='+91'||v_mobile;
  elsif length(v_mobile)=12 and left(v_mobile,2)='91' then v_mobile:='+'||v_mobile;
  elsif length(v_mobile) between 10 and 15 then v_mobile:='+'||v_mobile;
  else v_mobile:='';end if;
  v_email:=left(btrim(coalesce(r->>'email','')),240);
  if length(v_contact)<2 then raise exception 'Missing lead name on row %',v_row;end if;
  if v_mobile='' and position('@' in v_email)=0 then raise exception 'Missing contact on row %',v_row;end if;
  v_product:=left(btrim(coalesce(r->>'product','')),180);
  v_campaign:=left(btrim(coalesce(r->>'campaign','')),180);
  v_form:=left(btrim(coalesce(r->>'form','')),180);
  v_created:=left(btrim(coalesce(r->>'createdTime','')),100);
  v_title:=left(v_contact||case when v_product<>'' then ' — '||v_product else '' end,250);
  v_note:='Google Sheets Meta lead. Sheet row '||v_row||'. Lead reference: '||v_external||
   '. Product interest: '||v_product||'. Campaign: '||v_campaign||
   '. Form: '||v_form||'. Submitted at: '||v_created;
  v_id:=gen_random_uuid()::text;
  insert into public.gr_lead_pipeline(company_id,lead_id,title,contact,mobile,email,source,
    assigned_to,expected_value,notes,created_by)
  values(s.company_id,v_id,v_title,v_contact,v_mobile,v_email,'Meta Ads',s.assigned_to,0,v_note,s.created_by);
  insert into public.gr_crm_records(company_id,kind,record_id,payload,created_by)
  values(s.company_id,'leads',v_id,jsonb_build_object(
   'id',v_id,'company_id',s.company_id,'title',v_title,'contact',v_contact,
   'mobile',v_mobile,'email',v_email,'source','Meta Ads','product_id',null,
   'tag_ids','[]'::jsonb,'customer_id',null,'owner',v_profile.full_name,
   'assigned_to',s.assigned_to,'stage','New','value',0,'notes',v_note,'created_at',now()),s.created_by);
  insert into public.gr_lead_stage_history(company_id,lead_id,actor_id,event_type,new_stage,new_assignee,note)
  values(s.company_id,v_id,s.created_by,'CREATED','New',s.assigned_to,
   'Imported from Meta Ads Google Sheet, row '||v_row||'; assigned to '||v_profile.full_name);
  insert into public.gr_meta_sheet_imports(source_id,company_id,external_id,row_number,lead_id)
  values(s.id,s.company_id,v_external,v_row,v_id);
  v_new:=v_new+1;
 end loop;
 update public.gr_meta_sheet_sources set last_import_at=now(),updated_at=now() where id=s.id;
 return jsonb_build_object('created',v_new,'duplicates',v_dup,'received',jsonb_array_length(p_rows));
end $$;

revoke all on function public.gr_meta_sheet_is_admin(text) from public,anon,authenticated;
revoke all on function public.gr_meta_sheet_configure(text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.gr_meta_sheet_status(text) from public,anon,authenticated;
revoke all on function public.gr_meta_sheet_ingest(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.gr_meta_sheet_configure(text,uuid,boolean) to authenticated;
grant execute on function public.gr_meta_sheet_status(text) to authenticated;
-- Deliberately anonymous for a headless Google Apps Script, protected by a 256-bit token.
grant execute on function public.gr_meta_sheet_ingest(text,text,text,jsonb) to anon,authenticated;
