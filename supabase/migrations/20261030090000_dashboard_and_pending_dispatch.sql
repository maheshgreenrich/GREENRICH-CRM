-- Dashboard chart visibility is assigned by Admin per employee, restricted through RLS.
-- Dispatch handoff starts in Pending, then Packed -> Shipped -> Delivered.
-- Completed Attendance module remains unchanged.
create table if not exists public.gr_dashboard_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,
 widgets text[] not null default array['attendance','sales','day_sales','channel_sales','company_sales','leads','order_status','dispatch','stock','telecaller']::text[],
 updated_at timestamptz not null default now()
);
alter table public.gr_dashboard_preferences enable row level security;
create policy "employee views own dashboard" on public.gr_dashboard_preferences for select to authenticated
 using (user_id=(select auth.uid()) or (select public.gr_is_admin()));
create policy "admin sets employee dashboard" on public.gr_dashboard_preferences for insert to authenticated
 with check ((select public.gr_is_admin()));
create policy "admin edits employee dashboard" on public.gr_dashboard_preferences for update to authenticated
 using ((select public.gr_is_admin())) with check ((select public.gr_is_admin()));
grant select,insert,update on public.gr_dashboard_preferences to authenticated;
alter table public.gr_dispatch_orders drop constraint gr_dispatch_orders_status_check;
alter table public.gr_dispatch_orders add constraint gr_dispatch_orders_status_check
 check (status in ('Pending','Approved','Packed','Shipped','Delivered'));
update public.gr_dispatch_orders set status='Pending' where status='Approved';
alter table public.gr_dispatch_orders alter column status set default 'Pending';
drop policy if exists "approver moves orders to dispatch" on public.gr_dispatch_orders;
create policy "approver moves orders to dispatch" on public.gr_dispatch_orders
 for insert to authenticated with check (
 public.gr_dispatch_allowed(company_id,'approve') and approved_by=(select auth.uid())
 and status='Pending' and dispatched_at is null and tracking_number is null
);
