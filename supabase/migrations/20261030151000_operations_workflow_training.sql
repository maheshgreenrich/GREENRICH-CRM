
-- GreenRich ONE / OPERATIONS TRAINING ONLY.
-- Demo catalog and runs deliberately NEVER write gr_crm_records, gr_ops_records,
-- dispatch, financial journals or real warehouse stock.
create table if not exists public.gr_erp_demo_products (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.gr_companies(id),
  sku text not null,
  name text not null,
  workflow_type text not null check(workflow_type in ('SIMPLE_ASSEMBLY','MULTILEVEL','VENDOR_MADE','DIRECT_RECEIPT','CUSTOM')),
  parts jsonb not null default '[]'::jsonb check(jsonb_typeof(parts)='array'),
  steps jsonb not null check(jsonb_typeof(steps)='array' and jsonb_array_length(steps) between 2 and 12),
  description text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references public.gr_profiles(id),
  unique(company_id,sku),
  unique(id,company_id)
);
create table if not exists public.gr_erp_demo_runs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.gr_companies(id),
  product_id uuid not null,
  qty integer not null check(qty between 1 and 100),
  step_index integer not null default 0 check(step_index >= 0),
  stock_posted boolean not null default false,
  history jsonb not null default '[]'::jsonb check(jsonb_typeof(history)='array'),
  created_by uuid not null references public.gr_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(product_id,company_id) references public.gr_erp_demo_products(id,company_id)
);
create index if not exists gr_erp_demo_runs_company on public.gr_erp_demo_runs(company_id,product_id,updated_at desc);
alter table public.gr_erp_demo_products enable row level security;
alter table public.gr_erp_demo_runs enable row level security;
drop policy if exists "demo product company read" on public.gr_erp_demo_products;
create policy "demo product company read" on public.gr_erp_demo_products for select to authenticated
 using (public.gr_ops_allowed(company_id,'work_order','view'));
drop policy if exists "demo run company read" on public.gr_erp_demo_runs;
create policy "demo run company read" on public.gr_erp_demo_runs for select to authenticated
 using (public.gr_ops_allowed(company_id,'work_order','view'));
grant select on public.gr_erp_demo_products,public.gr_erp_demo_runs to authenticated;
revoke all on public.gr_erp_demo_products,public.gr_erp_demo_runs from anon;
revoke insert,update,delete on public.gr_erp_demo_products,public.gr_erp_demo_runs from authenticated;

create or replace function public.gr_demo_product_create(
  p_company text,p_name text,p_sku text,p_type text,p_parts jsonb,p_steps jsonb,p_description text default ''
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_keys text[]; v_key text;
begin
 if not public.gr_ops_allowed(p_company,'work_order','create') then raise exception 'Permission denied'; end if;
 if length(trim(coalesce(p_name,''))) not between 3 and 160 or length(trim(coalesce(p_sku,''))) not between 3 and 55
 then raise exception 'Product name and SKU are required'; end if;
 if p_type not in ('SIMPLE_ASSEMBLY','MULTILEVEL','VENDOR_MADE','DIRECT_RECEIPT','CUSTOM')
 then raise exception 'Invalid workflow template'; end if;
 if jsonb_typeof(p_parts)<>'array' or jsonb_array_length(p_parts)>100
 then raise exception 'Parts must be a list of up to 100 records'; end if;
 if jsonb_typeof(p_steps)<>'array' or jsonb_array_length(p_steps) not between 2 and 12
 then raise exception 'Choose 2 to 12 workflow steps'; end if;
 select array_agg(value->>'key') into v_keys from jsonb_array_elements(p_steps);
 if v_keys[array_length(v_keys,1)] <> 'STOCK' then raise exception 'Last stage must be Finished Stock'; end if;
 if exists(select 1 from jsonb_array_elements(p_steps) x
   where coalesce(x->>'key','') not in ('PARTS','SFG','RM','VENDOR_PO','JOBWORK','RECEIVE','ASSEMBLY','STICKER','QC','STOCK')
      or length(trim(coalesce(x->>'label',''))) < 3)
 then raise exception 'Invalid or unlabelled workflow step'; end if;
 if (select count(distinct k) from unnest(v_keys) k)<>array_length(v_keys,1)
 then raise exception 'Duplicate workflow stages are not allowed'; end if;
 if p_type <> 'DIRECT_RECEIPT' and (not 'QC'=any(v_keys) or not 'STICKER'=any(v_keys))
 then raise exception 'Manufactured products require Stickering and QC before stock'; end if;
 if p_type='DIRECT_RECEIPT' and not 'RECEIVE'=any(v_keys) then
 raise exception 'Ready-to-sell products must confirm physical receipt'; end if;
 if p_type<>'DIRECT_RECEIPT' and array_position(v_keys,'STICKER')>array_position(v_keys,'QC') then
 raise exception 'Stickering must come before QC'; end if;
 if p_type='VENDOR_MADE' and not 'RECEIVE'=any(v_keys) then
 raise exception 'Vendor-made goods need a physical receipt step'; end if;
 if p_type='MULTILEVEL' and not 'SFG'=any(v_keys) then raise exception 'Multilevel workflow must check SFG'; end if;
 if p_type='VENDOR_MADE' and not 'VENDOR_PO'=any(v_keys) then raise exception 'Vendor-made workflow must include a vendor PO'; end if;
 if exists(select 1 from jsonb_array_elements(p_parts) x where length(trim(coalesce(x->>'name','')))=0)
 then raise exception 'Each part needs a name'; end if;
 insert into public.gr_erp_demo_products(company_id,name,sku,workflow_type,parts,steps,description,created_by)
 values(p_company,trim(p_name),upper(trim(p_sku)),p_type,p_parts,p_steps,coalesce(p_description,''),auth.uid())
 returning id into v_id;
 return v_id;
end $$;

create or replace function public.gr_demo_run_start(p_product uuid,p_qty int default 1)
returns uuid language plpgsql security definer set search_path=''
as $$
declare p public.gr_erp_demo_products%rowtype; v_id uuid;
begin
 select * into p from public.gr_erp_demo_products where id=p_product;
 if not found or not public.gr_ops_allowed(p.company_id,'work_order','create') then
 raise exception 'Product not found or permission denied'; end if;
 if p_qty not between 1 and 100 then raise exception 'Quantity must be 1 to 100'; end if;
 insert into public.gr_erp_demo_runs(company_id,product_id,qty,created_by)
 values(p.company_id,p.id,p_qty,auth.uid()) returning id into v_id;
 return v_id;
end $$;

create or replace function public.gr_demo_run_advance(p_run uuid,p_note text,p_details jsonb default '{}'::jsonb)
returns text language plpgsql security definer set search_path=''
as $$
declare r public.gr_erp_demo_runs%rowtype; p public.gr_erp_demo_products%rowtype;
 v_step jsonb; v_key text; v_new jsonb; v_issued numeric(18,3);v_used numeric(18,3);
 v_scrap numeric(18,3);v_vendor numeric(18,3);v_returned numeric(18,3);
 v_record jsonb;
begin
 select * into r from public.gr_erp_demo_runs where id=p_run for update;
 if not found then raise exception 'Demo run not found'; end if;
 if not public.gr_ops_allowed(r.company_id,'work_order','edit') then raise exception 'Permission denied'; end if;
 select * into p from public.gr_erp_demo_products where id=r.product_id and company_id=r.company_id;
 if r.stock_posted then raise exception 'Already completed; duplicate stock is not allowed'; end if;
 if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'Enter what happened in this step'; end if;
 if length(p_note)>2000 then raise exception 'Note is too long'; end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Step details must be an object'; end if;
 v_step:=p.steps->r.step_index;v_key:=v_step->>'key';
 if v_key is null then raise exception 'Workflow completed'; end if;
 if v_key='QC' and p_details->>'result'<>'PASS'
 then raise exception 'QC must pass; failed items need rework before stock'; end if;
 if v_key='JOBWORK' then
   if not (p_details ?& array['issued','net_used','scrap','vendor_balance','returned']) then
     raise exception 'Fill all five job-work reconciliation quantities'; end if;
   v_issued:=(p_details->>'issued')::numeric(18,3);
   v_used:=(p_details->>'net_used')::numeric(18,3);
   v_scrap:=(p_details->>'scrap')::numeric(18,3);
   v_vendor:=(p_details->>'vendor_balance')::numeric(18,3);
   v_returned:=(p_details->>'returned')::numeric(18,3);
   if least(v_issued,v_used,v_scrap,v_vendor,v_returned)<0
      or v_issued<>v_used+v_scrap+v_vendor+v_returned
   then raise exception 'Job work must balance: issued = consumed + scrap + vendor balance + returned'; end if;
 end if;
 if v_key='STOCK' then
   if p.workflow_type<>'DIRECT_RECEIPT'
   and not exists(select 1 from jsonb_array_elements(r.history) x where x->>'step'='QC' and x->'details'->>'result'='PASS')
   then raise exception 'Complete QC Pass before finished stock'; end if;
   if p.workflow_type='DIRECT_RECEIPT'
   and not exists(select 1 from jsonb_array_elements(r.history) x where x->>'step'='RECEIVE')
   then raise exception 'Confirm physical receipt before stock'; end if;
 end if;
 v_record:=jsonb_build_object('step',v_key,'label',v_step->>'label','note',trim(p_note),
      'actor',auth.uid(),'at',now(),'details',p_details);
 update public.gr_erp_demo_runs set
 step_index=step_index+1,
 stock_posted=(v_key='STOCK'),
 history=history||jsonb_build_array(v_record),
 updated_at=now() where id=p_run;
 return v_key;
end $$;
revoke all on function public.gr_demo_product_create(text,text,text,text,jsonb,jsonb,text) from public,anon;
revoke all on function public.gr_demo_run_start(uuid,int) from public,anon;
revoke all on function public.gr_demo_run_advance(uuid,text,jsonb) from public,anon;
grant execute on function public.gr_demo_product_create(text,text,text,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.gr_demo_run_start(uuid,int) to authenticated;
grant execute on function public.gr_demo_run_advance(uuid,text,jsonb) to authenticated;

-- Isolated demonstration SKUs, not inserted into the live product master.
insert into public.gr_erp_demo_products(company_id,sku,name,workflow_type,description,parts,steps)
values
('grow-india','DEMO-HOME-25','DEMO · Home Composter 25L','SIMPLE_ASSEMBLY',
 'Training example. Physical parts and quantities must be verified; no actual inventory is created.',
 '[{"code":"P-01","name":"Lid / top","qty":1,"uom":"nos"},{"code":"P-02","name":"Collection tab","qty":1,"uom":"nos"},{"code":"P-03","name":"Base tray / inner piece","qty":1,"uom":"nos"}]'::jsonb,
 '[{"key":"PARTS","label":"Check 3 parts"},{"key":"ASSEMBLY","label":"Simple assembly"},{"key":"STICKER","label":"Stickering"},{"key":"QC","label":"Quality check"},{"key":"STOCK","label":"Finished Stock receipt"}]'::jsonb),
('grow-india','DEMO-COMMUNITY-2000','DEMO · Community Composter MGB100 2000L','MULTILEVEL',
 'Training-only FG-001 reference: SFG 001–007, IM 001–005, RM 001–018. Draft workbook quantities and vendors are unapproved.',
 coalesce((select jsonb_agg(jsonb_build_object(
 'code',payload->>'code','name',payload->>'name','level',payload->>'type',
 'qty',nullif(payload->>'qty',''),'uom',nullif(payload->>'uom',''),
 'vendor',payload->>'preferred_vendor','verified',false) order by payload->>'code')
 from public.gr_ops_records where company_id='grow-india' and kind='material'
 and payload->>'type' in ('SFG','IM','RM')),'[]'::jsonb),
 '[{"key":"SFG","label":"Check 7 SFGs"},{"key":"RM","label":"Check intermediate parts and 18 RMs"},{"key":"VENDOR_PO","label":"Sample vendor purchase order"},{"key":"JOBWORK","label":"Vendor job work & wastage"},{"key":"RECEIVE","label":"Receive processed SFG"},{"key":"ASSEMBLY","label":"Final assembly"},{"key":"STICKER","label":"Stickering"},{"key":"QC","label":"Quality check"},{"key":"STOCK","label":"Finished Stock receipt"}]'::jsonb),
('enviro-solutions','DEMO-COOLNSAFE','DEMO · CoolNSafe sanitary napkin','DIRECT_RECEIPT',
 'Training demonstration for ready-to-sell goods; no manufacturing BOM required.',
 '[]'::jsonb,
 '[{"key":"RECEIVE","label":"Confirm physical goods receipt"},{"key":"STOCK","label":"Finished Stock receipt"}]'::jsonb),
('grow-india','DEMO-VENDOR-MADE','DEMO · Vendor-made compost bin','VENDOR_MADE',
 'Training demonstration: vendor manufactures, GreenRich receives, stickers and approves QC.',
 '[{"code":"OUT-01","name":"Finished item from approved vendor","qty":1,"uom":"nos","vendor":"To be assigned"}]'::jsonb,
 '[{"key":"VENDOR_PO","label":"PO to approved vendor"},{"key":"RECEIVE","label":"Receive vendor product"},{"key":"STICKER","label":"Stickering"},{"key":"QC","label":"Quality check"},{"key":"STOCK","label":"Finished Stock receipt"}]'::jsonb)
on conflict(company_id,sku) do nothing;
