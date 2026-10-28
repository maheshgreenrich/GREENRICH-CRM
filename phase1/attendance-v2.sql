-- GreenRich ONE attendance v2; run AFTER phase1/schema.sql in a Supabase SQL editor.
-- This file DOES NOT connect the existing browser-only demo to Supabase.
-- Existing attendance rows are preserved.
begin;
create table if not exists public.gr_attendance_settings (
 id int primary key default 1 check(id=1),
 timezone text not null default 'Asia/Kolkata',
 cutoff_time time not null default '23:59:00',
 half_day_value numeric(3,2) not null default 0.50 check (half_day_value between 0 and 1),
 working_weekdays int[] not null default array[1,2,3,4,5,6],
 allow_location boolean not null default true,
 require_location_consent boolean not null default true,
 enable_leave boolean not null default false,
 enable_holiday boolean not null default false,
 enable_week_off boolean not null default false,
 month_lock_through date,
 updated_at timestamptz default now()
);
insert into public.gr_attendance_settings(id) values(1) on conflict(id) do nothing;
create table if not exists public.gr_attendance_holidays (
 id uuid primary key default gen_random_uuid(), day date unique not null,
 label text not null, deleted_at timestamptz
);
alter table public.gr_attendance add column if not exists source text default 'Admin';
alter table public.gr_attendance add column if not exists locked boolean not null default false;
alter table public.gr_attendance add column if not exists deleted_at timestamptz;
alter table public.gr_attendance add column if not exists location jsonb;
alter table public.gr_attendance add column if not exists updated_at timestamptz default now();
create table if not exists public.gr_attendance_audit (
 id bigint generated always as identity primary key,
 attendance_id uuid not null references public.gr_attendance(id),
 user_id uuid not null,
 attendance_date date not null,
 old_status text,
 new_status text,
 changed_by uuid not null,
 changed_at timestamptz not null default now(),
 reason text not null,
 operation text not null,
 source text not null
);
create table if not exists public.gr_attendance_export_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 filters jsonb not null,
 row_count integer not null
);
create index if not exists gr_attendance_date_user_idx on public.gr_attendance(attendance_date,user_id);
create index if not exists gr_attendance_audit_user_date_idx on public.gr_attendance_audit(user_id,attendance_date);
create or replace function public.gr_attendance_is_admin() returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
 where p.id=auth.uid() and p.active and r.name='Admin')
$$;
create or replace function public.gr_attendance_scope(requested_user uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select requested_user=auth.uid() or public.gr_attendance_is_admin()
 or exists(
  select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
  where p.id=auth.uid() and p.active and r.name in ('Director','Accounts')
 )
$$;
alter table public.gr_attendance_settings enable row level security;
alter table public.gr_attendance_holidays enable row level security;
alter table public.gr_attendance_audit enable row level security;
alter table public.gr_attendance_export_audit enable row level security;
drop policy if exists gr_att_settings_read on public.gr_attendance_settings;
create policy gr_att_settings_read on public.gr_attendance_settings for select to authenticated using(true);
drop policy if exists gr_att_settings_admin on public.gr_attendance_settings;
create policy gr_att_settings_admin on public.gr_attendance_settings for all to authenticated using(public.gr_attendance_is_admin()) with check(public.gr_attendance_is_admin());
drop policy if exists gr_att_holidays_read on public.gr_attendance_holidays;
create policy gr_att_holidays_read on public.gr_attendance_holidays for select to authenticated using(true);
drop policy if exists gr_att_holidays_admin on public.gr_attendance_holidays;
create policy gr_att_holidays_admin on public.gr_attendance_holidays for all to authenticated using(public.gr_attendance_is_admin()) with check(public.gr_attendance_is_admin());
drop policy if exists gr_att_audit_select on public.gr_attendance_audit;
create policy gr_att_audit_select on public.gr_attendance_audit for select to authenticated using(public.gr_attendance_scope(user_id));
drop policy if exists gr_att_exports_select on public.gr_attendance_export_audit;
create policy gr_att_exports_select on public.gr_attendance_export_audit for select to authenticated using(actor_id=auth.uid() or public.gr_attendance_is_admin());
-- Revoke direct mutation, forcing attendance changes and exports through audited server RPCs.
revoke insert,update,delete on public.gr_attendance from anon,authenticated;
revoke insert,update,delete on public.gr_attendance_audit from anon,authenticated;
revoke insert,update,delete on public.gr_attendance_export_audit from anon,authenticated;
-- Remove earlier broad write policies on attendance and do not regrant direct write.
do $$ declare pol record; begin
 for pol in select policyname,cmd from pg_policies where schemaname='public' and tablename='gr_attendance' loop
  if pol.cmd <> 'SELECT' then
   execute format('drop policy if exists %I on public.gr_attendance',pol.policyname);
  end if;
 end loop;
end $$;
drop policy if exists gr_attendance_select_v2 on public.gr_attendance;
create policy gr_attendance_select_v2 on public.gr_attendance for select to authenticated using(deleted_at is null and public.gr_attendance_scope(user_id));
create or replace function public.gr_mark_attendance(p_user uuid,p_date date,p_status text,p_remark text default '',p_reason text default '',p_location jsonb default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare cfg public.gr_attendance_settings%rowtype; existing public.gr_attendance%rowtype;
 actor uuid:=auth.uid(); v_admin boolean:=public.gr_attendance_is_admin(); new_id uuid;
 local_day date:=(now() at time zone 'Asia/Kolkata')::date;
 local_time time:=(now() at time zone 'Asia/Kolkata')::time;
begin
 if actor is null then raise exception 'Login required';end if;
 select * into cfg from public.gr_attendance_settings where id=1;
 if not found then raise exception 'Attendance settings missing';end if;
 if p_status not in ('present','absent','half_day') and
    not (p_status='leave' and cfg.enable_leave) and
    not (p_status='holiday' and cfg.enable_holiday) and
    not (p_status='week_off' and cfg.enable_week_off) then raise exception 'Status disabled';end if;
 if not exists(select 1 from public.gr_profiles where id=p_user and active) then raise exception 'Inactive employee';end if;
 if p_date>local_day then raise exception 'Future attendance prohibited';end if;
 if not v_admin then
  if actor<>p_user then raise exception 'Can only mark your own attendance';end if;
  if p_date<>local_day or local_time>cfg.cutoff_time then raise exception 'Self marking closed';end if;
  if cfg.month_lock_through is not null and p_date<=cfg.month_lock_through then raise exception 'Month locked';end if;
 end if;
 if p_location is not null and (not cfg.allow_location or not coalesce((p_location->>'consent')::boolean,false)) then raise exception 'Location consent required';end if;
 select * into existing from public.gr_attendance where user_id=p_user and attendance_date=p_date for update;
 if found then
  if not v_admin then raise exception 'Already marked today; ask Admin to correct';end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Reason required for correction';end if;
  if existing.locked and cfg.month_lock_through is not null and p_date<=cfg.month_lock_through then raise exception 'Month locked; unlock first';end if;
  update public.gr_attendance set status=p_status,remark=p_remark,source='Admin',marked_by=actor,marked_at=now(),updated_at=now(),location=p_location,deleted_at=null where id=existing.id;
  new_id:=existing.id;
 else
  insert into public.gr_attendance(user_id,attendance_date,status,remark,marked_by,source,location)
  values(p_user,p_date,p_status,p_remark,actor,case when actor=p_user and not v_admin then 'Self' else 'Admin' end,p_location) returning id into new_id;
 end if;
 insert into public.gr_attendance_audit(attendance_id,user_id,attendance_date,old_status,new_status,changed_by,reason,operation,source)
 values(new_id,p_user,p_date,case when found then existing.status else null end,p_status,actor,
 case when found then p_reason else coalesce(p_remark,'Initial mark') end,case when found then 'CORRECT' else 'MARK' end,
 case when actor=p_user and not v_admin then 'Self' else 'Admin' end);
 return new_id;
end $$;
revoke all on function public.gr_mark_attendance(uuid,date,text,text,text,jsonb) from public,anon;
grant execute on function public.gr_mark_attendance(uuid,date,text,text,text,jsonb) to authenticated;
create or replace function public.gr_log_attendance_export(p_filters jsonb,p_count integer)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 insert into public.gr_attendance_export_audit(actor_id,filters,row_count) values(auth.uid(),p_filters,p_count);
end $$;
revoke all on function public.gr_log_attendance_export(jsonb,integer) from public,anon;
grant execute on function public.gr_log_attendance_export(jsonb,integer) to authenticated;
commit;
