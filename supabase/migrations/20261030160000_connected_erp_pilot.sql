-- GreenRich ONE: auditable connected ERP PILOT, isolated from commercial sales and financial stock.
-- All illustrative orders and quantities are marked PILOT; never create statutory documents.
create table if not exists public.gr_pilot_products(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 crm_product_id text not null,
 sku text not null,
 name text not null,
 parts jsonb not null default '[]'::jsonb check(jsonb_typeof(parts)='array'),
 steps text[] not null,
 created_by uuid references public.gr_profiles(id),
 created_at timestamptz not null default now(),
 unique(company_id,sku),unique(company_id,crm_product_id),unique(id,company_id)
);
create table if not exists public.gr_pilot_orders(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 product_id uuid not null,
 customer_name text not null,
 qty int not null check(qty between 1 and 100),
 cursor int not null default 0,
 status text not null default 'IN_PROGRESS' check(status in('IN_PROGRESS','COMPLETED')),
 created_by uuid references public.gr_profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,company_id),
 foreign key(product_id,company_id) references public.gr_pilot_products(id,company_id)
);
create table if not exists public.gr_pilot_events(
 id bigint generated always as identity primary key,
 company_id text not null,
 order_id uuid not null,
 step text not null,
 note text not null,
 details jsonb not null default '{}'::jsonb,
 actor uuid references public.gr_profiles(id),
 at timestamptz not null default now(),
 foreign key(order_id,company_id) references public.gr_pilot_orders(id,company_id)
);
create table if not exists public.gr_pilot_pos(
 id uuid primary key default gen_random_uuid(),
 company_id text not null,
 order_id uuid not null unique,
 vendor_id text not null,
 number text not null unique,
 status text not null default 'ISSUED',
 issued_at timestamptz not null default now(),
 created_by uuid references public.gr_profiles(id),
 foreign key(order_id,company_id) references public.gr_pilot_orders(id,company_id) -- vendor kind/company validated in server RPC
);
create table if not exists public.gr_pilot_stock_events(
 id bigint generated always as identity primary key,
 company_id text not null,
 product_id uuid not null,
 order_id uuid not null,
 movement text not null check(movement in('QC_ACCEPTED','PILOT_DISPATCH')),
 qty_change int not null check(qty_change<>0),
 created_at timestamptz not null default now(),
 unique(order_id,movement),
 foreign key(product_id,company_id) references public.gr_pilot_products(id,company_id),
 foreign key(order_id,company_id) references public.gr_pilot_orders(id,company_id)
);
create table if not exists public.gr_pilot_service(
 id uuid primary key default gen_random_uuid(),
 company_id text not null,
 order_id uuid not null unique,
 ticket text not null,
 details text not null,
 status text not null default 'OPEN',
 created_at timestamptz not null default now(),
 foreign key(order_id,company_id) references public.gr_pilot_orders(id,company_id)
);
create table if not exists public.gr_pilot_vendor_history(
 id bigint generated always as identity primary key,
 company_id text not null,
 vendor_id text not null,
 actor uuid references public.gr_profiles(id),
 old_payload jsonb not null,
 new_payload jsonb not null,
 at timestamptz not null default now()
);
create index if not exists gr_pilot_vendor_po_lookup on public.gr_pilot_pos(company_id,vendor_id,issued_at desc);
create index if not exists gr_pilot_events_lookup on public.gr_pilot_events(company_id,order_id,id desc);
create index if not exists gr_pilot_inventory_lookup on public.gr_pilot_stock_events(company_id,product_id);

alter table public.gr_pilot_products enable row level security;
alter table public.gr_pilot_orders enable row level security;
alter table public.gr_pilot_events enable row level security;
alter table public.gr_pilot_pos enable row level security;
alter table public.gr_pilot_stock_events enable row level security;
alter table public.gr_pilot_service enable row level security;
alter table public.gr_pilot_vendor_history enable row level security;
create policy "pilot read products" on public.gr_pilot_products for select to authenticated using(public.gr_ops_allowed(company_id,'work_order','view'));
create policy "pilot read orders" on public.gr_pilot_orders for select to authenticated using(public.gr_ops_allowed(company_id,'work_order','view'));
create policy "pilot read events" on public.gr_pilot_events for select to authenticated using(public.gr_ops_allowed(company_id,'work_order','view'));
create policy "pilot read pos" on public.gr_pilot_pos for select to authenticated using(public.gr_ops_allowed(company_id,'work_order','view'));
create policy "pilot read stock" on public.gr_pilot_stock_events for select to authenticated using(public.gr_ops_allowed(company_id,'work_order','view'));
create policy "pilot read service" on public.gr_pilot_service for select to authenticated using(public.gr_ops_allowed(company_id,'work_order','view'));
create policy "pilot vendor audit read" on public.gr_pilot_vendor_history for select to authenticated using(public.gr_ops_allowed(company_id,'vendor','view'));
grant select on public.gr_pilot_products,public.gr_pilot_orders,public.gr_pilot_events,public.gr_pilot_pos,public.gr_pilot_stock_events,public.gr_pilot_service,public.gr_pilot_vendor_history to authenticated;
revoke all on public.gr_pilot_products,public.gr_pilot_orders,public.gr_pilot_events,public.gr_pilot_pos,public.gr_pilot_stock_events,public.gr_pilot_service,public.gr_pilot_vendor_history from anon;
revoke insert,update,delete on public.gr_pilot_products,public.gr_pilot_orders,public.gr_pilot_events,public.gr_pilot_pos,public.gr_pilot_stock_events,public.gr_pilot_service,public.gr_pilot_vendor_history from authenticated;

-- A database trigger forbids entering manual stock on pilot SKUs.
-- Only the transactional stage posting RPC can set the scoped posting flag.
create or replace function public.gr_pilot_stock_guard() returns trigger language plpgsql set search_path=''
as $$
begin
 if old.kind='products' and exists(
  select 1 from public.gr_pilot_products p where p.company_id=old.company_id and p.crm_product_id=old.record_id
 ) then
  if (new.payload->>'stock') is distinct from (old.payload->>'stock')
  and current_setting('gr.pilot_stock_post',true) <> 'posting' then
   raise exception 'PILOT stock is calculated from QC receipt and dispatch, not manually editable';
  end if;
  if (new.payload->>'active') is distinct from (old.payload->>'active') and new.payload->>'active'='true'
  then raise exception 'PILOT product cannot be activated as a sellable SKU'; end if;
 end if;
 return new;
end $$;
drop trigger if exists gr_pilot_stock_guard_trigger on public.gr_crm_records;
create trigger gr_pilot_stock_guard_trigger before update on public.gr_crm_records
for each row execute function public.gr_pilot_stock_guard();

create or replace function public.gr_pilot_product_create(
 p_company text,p_sku text,p_name text,p_parts jsonb,p_steps text[]
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_product text; v_steps text[];
begin
 if not public.gr_ops_allowed(p_company,'work_order','create') then raise exception 'Permission denied';end if;
 if p_sku !~ '^PILOT-[A-Za-z0-9-]{3,35}$' then raise exception 'Pilot SKU must start PILOT-';end if;
 if length(trim(coalesce(p_name,''))) not between 3 and 140 then raise exception 'Product name required';end if;
 if p_parts is null or jsonb_typeof(p_parts)<>'array' or jsonb_array_length(p_parts)>60 then raise exception 'Invalid part list';end if;
 if array_length(p_steps,1) not between 5 and 13 or p_steps[1]<>'STOCK_CHECK'
 or p_steps[array_length(p_steps,1)]<>'SERVICE' then raise exception 'Workflow must start Stock Check and end Service';end if;
 if (select count(distinct v) from unnest(p_steps) v)<>array_length(p_steps,1) then raise exception 'Duplicate stages';end if;
 if not (p_steps @> array['QC','STOCK','DISPATCH','SERVICE']::text[]) then raise exception 'QC, Stock, Dispatch and Service are required';end if;
 if not (array_position(p_steps,'QC')<array_position(p_steps,'STOCK') and
 array_position(p_steps,'STOCK')<array_position(p_steps,'DISPATCH') and
 array_position(p_steps,'DISPATCH')<array_position(p_steps,'SERVICE')) then raise exception 'QC → Stock → Dispatch → Service ordering required';end if;
 if exists(select 1 from unnest(p_steps) v where v not in
 ('STOCK_CHECK','VENDOR_PO','ISSUE','JOBWORK','RECEIVE','ASSEMBLY','STICKER','INSPECTION','QC','STOCK','DISPATCH','SERVICE')) then raise exception 'Invalid workflow step';end if;
 if 'JOBWORK'=any(p_steps) and not (p_steps @> array['ISSUE','RECEIVE','VENDOR_PO']::text[]) then raise exception 'Job work requires vendor PO, material issue, receipt';end if;
 if 'RECEIVE'=any(p_steps) and array_position(p_steps,'RECEIVE')>array_position(p_steps,'QC') then raise exception 'Receive before QC';end if;
 v_id:=gen_random_uuid();v_product:=gen_random_uuid()::text;
 insert into public.gr_pilot_products(id,company_id,crm_product_id,sku,name,parts,steps,created_by)
 values(v_id,p_company,v_product,upper(trim(p_sku)),trim(p_name),p_parts,p_steps,auth.uid());
 insert into public.gr_crm_records(company_id,kind,record_id,payload,created_by)
 values(p_company,'products',v_product,jsonb_build_object('id',v_product,'company_id',p_company,
 'sku',upper(trim(p_sku)),'name','[PILOT] '||trim(p_name),'brand','ERP PILOT',
 'category','Training / Not for sale','tax',0,'price',0,'inclusive',false,
 'active',false,'stock',0,'is_pilot',true,'pilot_product_id',v_id,
 'description','TEST workflow product — not sellable; stock updated only by pilot QC/dispatch'),auth.uid());
 return v_id;
end $$;

create or replace function public.gr_pilot_start_order(p_product uuid,p_qty int,p_customer text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare p public.gr_pilot_products%rowtype; v_id uuid;
begin
 select * into p from public.gr_pilot_products where id=p_product;
 if not found or not public.gr_ops_allowed(p.company_id,'work_order','create') then raise exception 'Product unavailable';end if;
 if p_qty not between 1 and 100 then raise exception 'Quantity must be 1–100';end if;
 if length(trim(coalesce(p_customer,''))) not between 3 and 120 then raise exception 'Pilot customer label required';end if;
 insert into public.gr_pilot_orders(company_id,product_id,customer_name,qty,created_by)
 values(p.company_id,p.id,'[TEST] '||trim(p_customer),p_qty,auth.uid()) returning id into v_id;
 return v_id;
end $$;

create or replace function public.gr_pilot_update_vendor(p_company text,p_vendor text,p_name text,p_mobile text,p_address text,p_gstin text)
returns void language plpgsql security definer set search_path=''
as $$
declare v public.gr_ops_records%rowtype; v_new jsonb;
begin
 if not public.gr_ops_allowed(p_company,'vendor','edit') then raise exception 'Purchase vendor edit permission required';end if;
 if length(trim(coalesce(p_name,'')))<3 then raise exception 'Vendor name required';end if;
 if nullif(trim(coalesce(p_mobile,'')),'') is not null and p_mobile !~ '^\+?[0-9 ]{10,16}$'
 then raise exception 'Use a valid mobile number';end if;
 if nullif(trim(coalesce(p_gstin,'')),'') is not null and upper(trim(p_gstin)) !~ '^[0-9]{2}[A-Z0-9]{13}$'
 then raise exception 'GSTIN format invalid';end if;
 select * into v from public.gr_ops_records where company_id=p_company and kind='vendor' and record_id=p_vendor for update;
 if not found then raise exception 'Vendor not found';end if;
 v_new:=v.payload||jsonb_build_object('name',trim(p_name),'phone',trim(coalesce(p_mobile,'')),
 'location',trim(coalesce(p_address,'')),'gstin',upper(trim(coalesce(p_gstin,''))));
 update public.gr_ops_records set payload=v_new,updated_at=now()
 where company_id=p_company and kind='vendor' and record_id=p_vendor;
 insert into public.gr_pilot_vendor_history(company_id,vendor_id,actor,old_payload,new_payload)
 values(p_company,p_vendor,auth.uid(),v.payload,v_new);
end $$;

create or replace function public.gr_pilot_step(p_order uuid,p_note text,p_details jsonb default '{}'::jsonb)
returns text language plpgsql security definer set search_path=''
as $$
declare o public.gr_pilot_orders%rowtype;p public.gr_pilot_products%rowtype;
 v_step text;v_available int;v_received int;v_issued numeric(18,3);
 v_used numeric(18,3);v_scrap numeric(18,3);v_vendor numeric(18,3);v_returned numeric(18,3);
 v_vendor_id text;v_stock int;v_product_stock int; v_po text;
begin
 select * into o from public.gr_pilot_orders where id=p_order for update;
 if not found then raise exception 'Order not found';end if;
 if not public.gr_ops_allowed(o.company_id,'work_order','edit') then raise exception 'Operations edit permission required';end if;
 select * into p from public.gr_pilot_products where id=o.product_id and company_id=o.company_id;
 v_step:=p.steps[o.cursor+1];
 if v_step is null or o.status='COMPLETED' then raise exception 'Workflow already completed';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'Enter a short activity note';end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Expected a details object';end if;
 if v_step='STOCK_CHECK' then
   select coalesce(sum(qty_change),0) into v_available from public.gr_pilot_stock_events where company_id=o.company_id and product_id=o.product_id;
   if v_available>=o.qty then raise exception 'Stock is already available. This pilot follows the shortage/production path; use fulfilment instead';end if;
 elsif v_step='VENDOR_PO' then
   if not public.gr_ops_allowed(o.company_id,'purchase_order','create') then raise exception 'Purchase PO create permission required';end if;
   v_vendor_id:=trim(coalesce(p_details->>'vendor_id',''));
   if not exists(select 1 from public.gr_ops_records where company_id=o.company_id and kind='vendor' and record_id=v_vendor_id)
   then raise exception 'Choose an existing vendor in this company';end if;
   v_po:='PILOT-PO-'||left(o.id::text,8);
   insert into public.gr_pilot_pos(company_id,order_id,vendor_id,number,created_by)
   values(o.company_id,o.id,v_vendor_id,v_po,auth.uid());
 elsif v_step='ISSUE' then
   v_issued:=(p_details->>'issued')::numeric(18,3);
   if v_issued<=0 then raise exception 'Enter positive material issued kg';end if;
 elsif v_step='JOBWORK' then
   v_issued:=(p_details->>'issued')::numeric(18,3);
   v_used:=(p_details->>'net_used')::numeric(18,3);
   v_scrap:=(p_details->>'scrap')::numeric(18,3);
   v_vendor:=(p_details->>'vendor_balance')::numeric(18,3);
   v_returned:=(p_details->>'returned')::numeric(18,3);
   if least(v_issued,v_used,v_scrap,v_vendor,v_returned)<0 or
     v_issued <> v_used+v_scrap+v_vendor+v_returned
   then raise exception 'Issued must equal net consumption + scrap + vendor stock + returned stock';end if;
   if not exists(select 1 from public.gr_pilot_events e where e.order_id=o.id and e.step='ISSUE'
      and (e.details->>'issued')::numeric(18,3)=v_issued)
   then raise exception 'Job work issued quantity must match issue challan';end if;
 elsif v_step='RECEIVE' then
   v_received:=(p_details->>'accepted_qty')::int;
   if v_received<o.qty then raise exception 'Accepted goods must cover production quantity';end if;
 elsif v_step='INSPECTION' or v_step='QC' then
   if p_details->>'result'<>'PASS' then raise exception 'Inspection/QC failed: resolve NCR/rework before advancing';end if;
 elsif v_step='STOCK' then
   if not exists(select 1 from public.gr_pilot_events where order_id=o.id and step='QC' and details->>'result'='PASS')
   then raise exception 'QC PASS required before stock receipt';end if;
   -- Serialize stock posting across all orders for this product.
   perform pg_advisory_xact_lock(hashtextextended('gr-pilot:'||p.id::text,0));
   insert into public.gr_pilot_stock_events(company_id,product_id,order_id,movement,qty_change)
   values(o.company_id,p.id,o.id,'QC_ACCEPTED',o.qty);
   select coalesce(sum(qty_change),0) into v_stock from public.gr_pilot_stock_events
    where company_id=o.company_id and product_id=p.id;
   perform set_config('gr.pilot_stock_post','posting',true);
   update public.gr_crm_records set payload=jsonb_set(payload,'{stock}',to_jsonb(v_stock)),updated_at=now()
   where company_id=o.company_id and kind='products' and record_id=p.crm_product_id;
   if not found then raise exception 'CRM pilot product missing';end if;
   perform set_config('gr.pilot_stock_post','',true);
 elsif v_step='DISPATCH' then
   perform pg_advisory_xact_lock(hashtextextended('gr-pilot:'||p.id::text,0));
   select coalesce(sum(qty_change),0) into v_stock from public.gr_pilot_stock_events where company_id=o.company_id and product_id=p.id;
   if v_stock<o.qty then raise exception 'Insufficient finished stock to dispatch';end if;
   insert into public.gr_pilot_stock_events(company_id,product_id,order_id,movement,qty_change)
   values(o.company_id,p.id,o.id,'PILOT_DISPATCH',-o.qty);
   perform set_config('gr.pilot_stock_post','posting',true);
   update public.gr_crm_records set payload=jsonb_set(payload,'{stock}',to_jsonb(v_stock-o.qty)),updated_at=now()
   where company_id=o.company_id and kind='products' and record_id=p.crm_product_id;
   if not found then raise exception 'CRM pilot product missing';end if;
   perform set_config('gr.pilot_stock_post','',true);
 elsif v_step='SERVICE' then
   insert into public.gr_pilot_service(company_id,order_id,ticket,details)
   values(o.company_id,o.id,'PILOT-SVC-'||left(o.id::text,8),p_note);
 end if;
 insert into public.gr_pilot_events(company_id,order_id,step,note,details,actor)
 values(o.company_id,o.id,v_step,trim(p_note),p_details,auth.uid());
 update public.gr_pilot_orders set cursor=cursor+1,status=case when o.cursor+1=array_length(p.steps,1) then 'COMPLETED' else status end,updated_at=now() where id=o.id;
 return v_step;
end $$;
revoke all on function public.gr_pilot_product_create(text,text,text,jsonb,text[]) from public,anon;
revoke all on function public.gr_pilot_start_order(uuid,int,text) from public,anon;
revoke all on function public.gr_pilot_update_vendor(text,text,text,text,text,text) from public,anon;
revoke all on function public.gr_pilot_step(uuid,text,jsonb) from public,anon;
grant execute on function public.gr_pilot_product_create(text,text,text,jsonb,text[]) to authenticated;
grant execute on function public.gr_pilot_start_order(uuid,int,text) to authenticated;
grant execute on function public.gr_pilot_update_vendor(text,text,text,text,text,text) to authenticated;
grant execute on function public.gr_pilot_step(uuid,text,jsonb) to authenticated;

-- Seed one intentionally inactive TEST SKU with 0 stock and one test SO.
-- The sample vendor is existing *draft* Sivaji Enterprises; no fictitious GSTIN or phone.
with fresh as (
 insert into public.gr_pilot_products(company_id,crm_product_id,sku,name,parts,steps)
 values('grow-india','pilot-fg-home-40','PILOT-HOME-40','Home Composter 40L - Workflow Test',
 '[{"code":"PART-01","name":"Collection tab","qty":1,"uom":"nos"},{"code":"PART-02","name":"Lid/top cap","qty":1,"uom":"nos"},{"code":"PART-03","name":"Inner tray","qty":1,"uom":"nos"}]'::jsonb,
 array['STOCK_CHECK','VENDOR_PO','ISSUE','JOBWORK','RECEIVE','ASSEMBLY','STICKER','INSPECTION','QC','STOCK','DISPATCH','SERVICE'])
 on conflict(company_id,sku) do nothing returning id,company_id,crm_product_id
),
products as (
 insert into public.gr_crm_records(company_id,kind,record_id,payload,created_by)
 select company_id,'products',crm_product_id,
 jsonb_build_object('id',crm_product_id,'company_id',company_id,'sku','PILOT-HOME-40',
 'name','[PILOT] Home Composter 40L','brand','ERP PILOT',
 'price',0,'tax',0,'stock',0,'active',false,'inclusive',false,
 'category','Training / Not for sale','is_pilot',true,
 'description','TEST only. Stock updates from posted QC receipt and demo dispatch.'),
 (select p.id from public.gr_profiles p join public.gr_roles r on r.id=p.role_id where r.name='Admin' and p.active order by p.id limit 1)
 from fresh on conflict(company_id,kind,record_id) do nothing returning record_id
)
insert into public.gr_pilot_orders(company_id,product_id,customer_name,qty)
select p.company_id,p.id,'[TEST] Sample Customer (no real commitment)',1 from public.gr_pilot_products p
where p.company_id='grow-india' and p.sku='PILOT-HOME-40'
and not exists(select 1 from public.gr_pilot_orders o where o.product_id=p.id)
on conflict do nothing;
