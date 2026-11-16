-- GREENRICH inventory WMS phase 1: separate location-ledger for verified physical counts.
-- Existing CRM product stock and production aggregate ledgers are NOT silently overwritten.
create table if not exists public.gr_inventory_locations(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 code text not null,
 name text not null,
 kind text not null check(kind in ('warehouse','marketplace','vendor','production','transit')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(company_id,code)
);
create table if not exists public.gr_inventory_location_balances(
 company_id text not null references public.gr_companies(id),
 location_id uuid not null references public.gr_inventory_locations(id),
 item_kind text not null check(item_kind in ('FG','SFG','IM','RM')),
 item_id text not null,
 uom text not null,
 quantity numeric(18,6) not null default 0 check(quantity>=0),
 updated_at timestamptz not null default now(),
 primary key(company_id,location_id,item_kind,item_id)
);
create table if not exists public.gr_inventory_location_movements(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null,
 company_id text not null references public.gr_companies(id),
 item_kind text not null check(item_kind in ('FG','SFG','IM','RM')),
 item_id text not null,
 item_code text not null,
 uom text not null,
 quantity numeric(18,6) not null check(quantity>0),
 action text not null check(action in ('verified_count','transfer','adjustment_out')),
 from_location uuid references public.gr_inventory_locations(id),
 to_location uuid references public.gr_inventory_locations(id),
 reference text not null default '',
 notes text not null default '',
 actor uuid not null references public.gr_profiles(id),
 posted_at timestamptz not null default now(),
 unique(company_id,request_id)
);
create index if not exists gr_inventory_moves_item on public.gr_inventory_location_movements(company_id,item_kind,item_id,posted_at desc);
create index if not exists gr_inventory_balances_location on public.gr_inventory_location_balances(company_id,location_id);
-- No direct browser write permissions. Read scopes follow authenticated company + stock role.
alter table public.gr_inventory_locations enable row level security;
alter table public.gr_inventory_location_balances enable row level security;
alter table public.gr_inventory_location_movements enable row level security;
revoke all on public.gr_inventory_locations,public.gr_inventory_location_balances,public.gr_inventory_location_movements from public,anon,authenticated;
grant select on public.gr_inventory_locations,public.gr_inventory_location_balances,public.gr_inventory_location_movements to authenticated;
create policy gr_inv_locations_read on public.gr_inventory_locations for select to authenticated
 using(public.gr_ops_allowed(company_id,'material','view'));
create policy gr_inv_balances_read on public.gr_inventory_location_balances for select to authenticated
 using(public.gr_ops_allowed(company_id,'material','view'));
create policy gr_inv_movements_read on public.gr_inventory_location_movements for select to authenticated
 using(public.gr_ops_allowed(company_id,'material','view'));

insert into public.gr_inventory_locations(company_id,code,name,kind)
select c.id,v.code,v.name,v.kind
from public.gr_companies c
cross join (values ('CHENNAI','Chennai Warehouse','warehouse'),
 ('NUNGAMBAKKAM','Nungambakkam Warehouse','warehouse'),
 ('AMAZON','Amazon Warehouse','marketplace')) v(code,name,kind)
where c.id in ('grow-india','enviro-solutions')
on conflict(company_id,code) do nothing;

create or replace function public.gr_inventory_location_action(
 p_company text,p_action text,p_input jsonb,p_request uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := (select auth.uid());
 v_from uuid;v_to uuid;v_qty numeric(18,6);v_before numeric(18,6);
 v_kind text;v_item text;v_code text;v_uom text;v_location public.gr_inventory_locations%rowtype;
 v_request jsonb;
begin
 if v_actor is null or not public.gr_ops_allowed(p_company,'material',case when p_action='verified_count' then 'approve' else 'edit' end)
  then raise exception 'Stock permission denied';
 end if;
 if p_request is null then raise exception 'Unique request ID is required';end if;
 select jsonb_build_object('movement_id',id,'message','Already recorded') into v_request
 from public.gr_inventory_location_movements where company_id=p_company and request_id=p_request;
 if v_request is not null then return v_request;end if;
 -- Serialise all location balance mutations in the same company to avoid concurrent overdraw.
 perform pg_advisory_xact_lock(hashtext('gr_inventory_wms:'||p_company));
 select jsonb_build_object('movement_id',id,'message','Already recorded') into v_request
 from public.gr_inventory_location_movements where company_id=p_company and request_id=p_request;
 if v_request is not null then return v_request;end if;
 v_kind=p_input->>'item_kind';v_item=coalesce(nullif(btrim(p_input->>'item_id'),''),'');
 v_code=coalesce(nullif(btrim(p_input->>'item_code'),''),'');
 v_uom=coalesce(nullif(btrim(p_input->>'uom'),''),'');
 if v_kind not in ('FG','SFG','IM','RM') or length(v_item)<1 or length(v_item)>120
    or length(v_code)<1 or length(v_code)>120 or v_uom='' then raise exception 'Product and unit are required';end if;
 -- The WMS cannot create quantities for arbitrary IDs: resolve them to the actual
 -- company product master or ERP material master.
 if v_kind='FG' and exists(
   select 1 from public.gr_crm_records r
   where r.company_id=p_company and r.kind='products' and r.record_id=v_item
     and coalesce(r.payload->>'sku',r.payload->>'code',r.record_id)=v_code
 ) then null;
 elsif exists(
   select 1 from public.gr_ops_records r
   where r.company_id=p_company and r.kind='material' and r.record_id=v_item
     and coalesce(r.payload->>'code',r.record_id)=v_code
     and (r.payload->>'type'=v_kind or (v_kind='RM' and r.payload->>'type'='RW'))
     and coalesce(r.payload->>'uom','nos')=v_uom
 ) then null;
 else
  raise exception 'Inventory item not found in this company and product stage';
 end if;
 if not (p_input->>'quantity' ~ '^[0-9]{1,10}(\.[0-9]{1,6})?
 v_qty=(p_input->>'quantity')::numeric(18,6);
 if v_qty<=0 then raise exception 'Quantity must exceed zero';end if;
 if p_action='verified_count' then
  if not public.gr_ops_allowed(p_company,'material','approve') then raise exception 'Admin/stock approval required';end if;
  v_to=(p_input->>'to_location')::uuid;
  select * into v_location from public.gr_inventory_locations where id=v_to and company_id=p_company and active;
  if not found or v_location.kind not in ('warehouse','marketplace') then raise exception 'Verified counts need a physical warehouse';end if;
  -- Count sets the quantity to an observed physical count, never a silent aggregate-stock change.
  insert into public.gr_inventory_location_balances(company_id,location_id,item_kind,item_id,uom,quantity)
  values(p_company,v_to,v_kind,v_item,v_uom,0)
  on conflict(company_id,location_id,item_kind,item_id) do nothing;
  select quantity into v_before from public.gr_inventory_location_balances
   where company_id=p_company and location_id=v_to and item_kind=v_kind and item_id=v_item and uom=v_uom for update;
  if v_before is null then raise exception 'Stock unit cannot change; use matching UOM';end if;
  update public.gr_inventory_location_balances set quantity=v_qty,updated_at=now()
    where company_id=p_company and location_id=v_to and item_kind=v_kind and item_id=v_item;
 elsif p_action='transfer' then
  v_from=(p_input->>'from_location')::uuid;v_to=(p_input->>'to_location')::uuid;
  if v_from=v_to then raise exception 'Source and destination must differ';end if;
  if not exists(select 1 from public.gr_inventory_locations where id=v_from and company_id=p_company and active)
   or not exists(select 1 from public.gr_inventory_locations where id=v_to and company_id=p_company and active)
   then raise exception 'Locations must belong to the selected company';end if;
  select quantity into v_before from public.gr_inventory_location_balances
   where company_id=p_company and location_id=v_from and item_kind=v_kind and item_id=v_item and uom=v_uom for update;
  if v_before is null or v_before<v_qty then raise exception 'Insufficient verified stock at source warehouse';end if;
  insert into public.gr_inventory_location_balances(company_id,location_id,item_kind,item_id,uom,quantity)
   values(p_company,v_to,v_kind,v_item,v_uom,0)
   on conflict(company_id,location_id,item_kind,item_id) do nothing;
  if not exists(select 1 from public.gr_inventory_location_balances where company_id=p_company and location_id=v_to and item_kind=v_kind and item_id=v_item and uom=v_uom)
   then raise exception 'Destination UOM mismatch';end if;
  update public.gr_inventory_location_balances set quantity=quantity-v_qty,updated_at=now()
   where company_id=p_company and location_id=v_from and item_kind=v_kind and item_id=v_item;
  update public.gr_inventory_location_balances set quantity=quantity+v_qty,updated_at=now()
   where company_id=p_company and location_id=v_to and item_kind=v_kind and item_id=v_item;
 else raise exception 'Unsupported stock movement';end if;
 insert into public.gr_inventory_location_movements(request_id,company_id,item_kind,item_id,item_code,uom,quantity,action,from_location,to_location,reference,notes,actor)
 values(p_request,p_company,v_kind,v_item,v_code,v_uom,v_qty,p_action,v_from,v_to,
 left(coalesce(p_input->>'reference',''),100),left(coalesce(p_input->>'notes',''),500),v_actor);
 return jsonb_build_object('message',case when p_action='transfer' then 'Location transfer posted' else 'Verified physical count recorded' end);
end;$$;
revoke all on function public.gr_inventory_location_action(text,text,jsonb,uuid) from public,anon;
grant execute on function public.gr_inventory_location_action(text,text,jsonb,uuid) to authenticated;
) then raise exception 'Invalid quantity';end if;
 v_qty=(p_input->>'quantity')::numeric(18,6);
 if v_qty<=0 then raise exception 'Quantity must exceed zero';end if;
 if p_action='verified_count' then
  if not public.gr_ops_allowed(p_company,'material','approve') then raise exception 'Admin/stock approval required';end if;
  v_to=(p_input->>'to_location')::uuid;
  select * into v_location from public.gr_inventory_locations where id=v_to and company_id=p_company and active;
  if not found or v_location.kind not in ('warehouse','marketplace') then raise exception 'Verified counts need a physical warehouse';end if;
  -- Count sets the quantity to an observed physical count, never a silent aggregate-stock change.
  insert into public.gr_inventory_location_balances(company_id,location_id,item_kind,item_id,uom,quantity)
  values(p_company,v_to,v_kind,v_item,v_uom,0)
  on conflict(company_id,location_id,item_kind,item_id) do nothing;
  select quantity into v_before from public.gr_inventory_location_balances
   where company_id=p_company and location_id=v_to and item_kind=v_kind and item_id=v_item and uom=v_uom for update;
  if v_before is null then raise exception 'Stock unit cannot change; use matching UOM';end if;
  update public.gr_inventory_location_balances set quantity=v_qty,updated_at=now()
    where company_id=p_company and location_id=v_to and item_kind=v_kind and item_id=v_item;
 elsif p_action='transfer' then
  v_from=(p_input->>'from_location')::uuid;v_to=(p_input->>'to_location')::uuid;
  if v_from=v_to then raise exception 'Source and destination must differ';end if;
  if not exists(select 1 from public.gr_inventory_locations where id=v_from and company_id=p_company and active)
   or not exists(select 1 from public.gr_inventory_locations where id=v_to and company_id=p_company and active)
   then raise exception 'Locations must belong to the selected company';end if;
  select quantity into v_before from public.gr_inventory_location_balances
   where company_id=p_company and location_id=v_from and item_kind=v_kind and item_id=v_item and uom=v_uom for update;
  if v_before is null or v_before<v_qty then raise exception 'Insufficient verified stock at source warehouse';end if;
  insert into public.gr_inventory_location_balances(company_id,location_id,item_kind,item_id,uom,quantity)
   values(p_company,v_to,v_kind,v_item,v_uom,0)
   on conflict(company_id,location_id,item_kind,item_id) do nothing;
  if not exists(select 1 from public.gr_inventory_location_balances where company_id=p_company and location_id=v_to and item_kind=v_kind and item_id=v_item and uom=v_uom)
   then raise exception 'Destination UOM mismatch';end if;
  update public.gr_inventory_location_balances set quantity=quantity-v_qty,updated_at=now()
   where company_id=p_company and location_id=v_from and item_kind=v_kind and item_id=v_item;
  update public.gr_inventory_location_balances set quantity=quantity+v_qty,updated_at=now()
   where company_id=p_company and location_id=v_to and item_kind=v_kind and item_id=v_item;
 else raise exception 'Unsupported stock movement';end if;
 insert into public.gr_inventory_location_movements(request_id,company_id,item_kind,item_id,item_code,uom,quantity,action,from_location,to_location,reference,notes,actor)
 values(p_request,p_company,v_kind,v_item,v_code,v_uom,v_qty,p_action,v_from,v_to,
 left(coalesce(p_input->>'reference',''),100),left(coalesce(p_input->>'notes',''),500),v_actor);
 return jsonb_build_object('message',case when p_action='transfer' then 'Location transfer posted' else 'Verified physical count recorded' end);
end;$$;
revoke all on function public.gr_inventory_location_action(text,text,jsonb,uuid) from public,anon;
grant execute on function public.gr_inventory_location_action(text,text,jsonb,uuid) to authenticated;
