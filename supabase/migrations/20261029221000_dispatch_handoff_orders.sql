-- Sales approvals move a snapshot into a shared, company-scoped dispatch queue.
-- This deliberately leaves the completed Attendance module untouched.
create table if not exists public.gr_dispatch_orders (
 id uuid primary key default gen_random_uuid(),
 company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 source_sale_id text not null,order_id text not null,platform_order_id text,order_date date not null,
 channel text,customer_id uuid,customer_name text,customer_mobile text,customer_email text,
 shipping_address text,product_name text,sku text,quantity numeric not null check(quantity>0),
 order_total numeric not null check(order_total>=0),invoice_number text,
 source_snapshot jsonb not null default '{}'::jsonb,
 status text not null default 'Approved' check(status in ('Approved','Packed','Shipped','Delivered')),
 courier_name text,tracking_number text,tracking_url text,dispatched_at timestamptz,
 delivered_at timestamptz,dispatch_note text,
 approved_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 approved_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),unique(company_id,source_sale_id)
);
create index if not exists gr_dispatch_company_status on public.gr_dispatch_orders(company_id,status,approved_at desc);
create or replace function public.gr_dispatch_allowed(p_company text,p_action text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
  where p.id=(select auth.uid()) and p.active and p_company=any(p.company_ids)
  and (r.name='Admin' or exists(
   select 1 from public.gr_role_permissions perm where perm.role_id=p.role_id and perm.allowed
   and ((p_action='view' and perm.action='view' and perm.module in ('dispatch','orders','sales','stock'))
    or (p_action='approve' and perm.action='approve' and perm.module in ('orders','sales'))
    or (p_action='dispatch' and perm.action='edit' and perm.module in ('dispatch','orders','stock')))
  ))
 );
$$;
revoke all on function public.gr_dispatch_allowed(text,text) from public,anon;
grant execute on function public.gr_dispatch_allowed(text,text) to authenticated;
alter table public.gr_dispatch_orders enable row level security;
create policy "assigned employee sees dispatch" on public.gr_dispatch_orders
 for select to authenticated using (public.gr_dispatch_allowed(company_id,'view'));
create policy "approver moves orders to dispatch" on public.gr_dispatch_orders
 for insert to authenticated with check(public.gr_dispatch_allowed(company_id,'approve')
 and approved_by=(select auth.uid()) and status='Approved' and dispatched_at is null and tracking_number is null);
create policy "operations update dispatch tracking" on public.gr_dispatch_orders
 for update to authenticated using(public.gr_dispatch_allowed(company_id,'dispatch'))
 with check(public.gr_dispatch_allowed(company_id,'dispatch'));
revoke all on public.gr_dispatch_orders from anon,authenticated;
grant select on public.gr_dispatch_orders to authenticated;
grant insert(company_id,source_sale_id,order_id,platform_order_id,order_date,channel,customer_id,
 customer_name,customer_mobile,customer_email,shipping_address,product_name,sku,quantity,order_total,
 invoice_number,source_snapshot) on public.gr_dispatch_orders to authenticated;
grant update(status,courier_name,tracking_number,tracking_url,dispatched_at,delivered_at,dispatch_note,updated_at,updated_by)
 on public.gr_dispatch_orders to authenticated;
insert into public.gr_role_permissions(role_id,module,action,allowed,data_scope)
 select r.id,'dispatch',a.action,(r.name='Admin'),'all' from public.gr_roles r
 cross join (values('view'),('create'),('edit'),('delete'),('approve'),('export')) a(action)
 on conflict(role_id,module,action) do nothing;
