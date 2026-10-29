-- GreenRich ONE Attendance V3: isolated from legacy gr_attendance tables.
-- Run after phase1/schema.sql. Existing employee login identities remain in auth.users/gr_profiles.
begin;
create extension if not exists pgcrypto;
create table if not exists public.grm_departments(
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(trim(name))>=2));
create table if not exists public.grm_shifts(
 id uuid primary key default gen_random_uuid(), name text not null unique,
 start_time time not null, end_time time not null,
 grace_minutes integer not null default 10 check(grace_minutes between 0 and 240),
 half_day_hours numeric(5,2) not null default 4 check(half_day_hours>0 and half_day_hours<=24),
 working_days integer[] not null default array[1,2,3,4,5,6],
 constraint grm_working_days_valid check(working_days <@ array[1,2,3,4,5,6,7]::integer[])
);
insert into public.grm_shifts(name,start_time,end_time,grace_minutes,half_day_hours)
values ('Standard Office','09:30','18:00',10,4) on conflict(name) do nothing;
alter table public.gr_profiles add column if not exists department_id uuid references public.grm_departments(id);
alter table public.gr_profiles add column if not exists shift_id uuid references public.grm_shifts(id);
create table if not exists public.grm_settings (
 id integer primary key default 1 check(id=1),
 office_timezone text not null default 'Asia/Kolkata',
 updated_at timestamptz not null default now()
);
insert into public.grm_settings(id) values(1) on conflict(id) do nothing;
create table if not exists public.grm_attendance (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.gr_profiles(id),
 date date not null,
 check_in timestamptz,
 check_out timestamptz,
 total_hours numeric(7,2),
 status text not null check(status in ('PRESENT','ABSENT','LATE','HALF_DAY','ON_LEAVE','HOLIDAY','WEEKEND')),
 source text not null default 'SELF' check(source in ('SELF','ADMIN','SYSTEM')),
 marked_by uuid references auth.users(id),
 remarks text not null default '',
 deleted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint grm_attendance_unique unique(user_id,date),
 constraint grm_checkout_after_checkin check(check_out is null or (check_in is not null and check_out>check_in)),
 constraint grm_hours_nonnegative check(total_hours is null or total_hours>=0)
);
create index if not exists grm_att_user_date on public.grm_attendance(user_id,date desc);
create index if not exists grm_att_date_status on public.grm_attendance(date,status) where deleted_at is null;
create table if not exists public.grm_corrections(
 id uuid primary key default gen_random_uuid(),
 attendance_id uuid references public.grm_attendance(id),
 user_id uuid not null references public.gr_profiles(id),
 date date not null,
 requested_check_in timestamptz,
 requested_check_out timestamptz,
 reason text not null check(length(trim(reason))>=3),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz, review_note text,
 created_at timestamptz not null default now(),
 constraint grm_correction_hours check(requested_check_out is null or (requested_check_in is not null and requested_check_out>requested_check_in))
);
create unique index if not exists grm_one_pending_correction on public.grm_corrections(user_id,date) where status='PENDING';
create index if not exists grm_corr_user_created on public.grm_corrections(user_id,created_at desc);
create index if not exists grm_corr_status_created on public.grm_corrections(status,created_at desc);
create table if not exists public.grm_leaves(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.gr_profiles(id),
 type text not null check(length(trim(type)) between 2 and 40),
 from_date date not null, to_date date not null,
 reason text not null check(length(trim(reason))>=3),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz, review_note text,
 created_at timestamptz not null default now(),
 constraint grm_leave_range check(to_date>=from_date)
);
create index if not exists grm_leaves_user_range on public.grm_leaves(user_id,from_date,to_date);
create index if not exists grm_leaves_pending on public.grm_leaves(status,created_at desc);
create table if not exists public.grm_holidays(
 id uuid primary key default gen_random_uuid(), date date not null unique, name text not null check(length(trim(name))>=2),
 created_at timestamptz not null default now()
);
create table if not exists public.grm_audit_logs(
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id), action text not null, entity text not null,
 entity_id text, old_value jsonb, new_value jsonb, ip_address inet,
 created_at timestamptz not null default now()
);
create index if not exists grm_audit_entity_time on public.grm_audit_logs(entity,created_at desc);

-- RLS: all mutations through Edge API only, using service_role; the browser never gets a service key.
create or replace function public.grm_is_manager() returns boolean
language sql stable security definer set search_path=''
as $$ select exists(
 select 1 from public.gr_profiles p join public.gr_roles r on p.role_id=r.id
 where p.id=(select auth.uid()) and p.active and r.name in ('Admin','Office Admin')
) $$;
revoke all on function public.grm_is_manager() from public,anon;
grant execute on function public.grm_is_manager() to authenticated;
do $$
declare tbl text;
begin
 foreach tbl in array array['grm_departments','grm_shifts','grm_settings','grm_attendance','grm_corrections','grm_leaves','grm_holidays','grm_audit_logs']
 loop execute format('alter table public.%I enable row level security',tbl);
 end loop;
end $$;
create policy grm_departments_read on public.grm_departments for select to authenticated using(true);
create policy grm_shifts_read on public.grm_shifts for select to authenticated using(true);
create policy grm_settings_read on public.grm_settings for select to authenticated using(true);
create policy grm_attendance_read on public.grm_attendance for select to authenticated
 using(user_id=(select auth.uid()) or (select public.grm_is_manager()));
create policy grm_corrections_read on public.grm_corrections for select to authenticated
 using(user_id=(select auth.uid()) or (select public.grm_is_manager()));
create policy grm_leaves_read on public.grm_leaves for select to authenticated
 using(user_id=(select auth.uid()) or (select public.grm_is_manager()));
create policy grm_holidays_read on public.grm_holidays for select to authenticated using(true);
create policy grm_audit_read on public.grm_audit_logs for select to authenticated
 using((select public.grm_is_manager()));
-- No authenticated DML grants: all writes are authenticated/authorized in the Edge Function.
revoke insert,update,delete on public.grm_departments,public.grm_shifts,public.grm_settings,
 public.grm_attendance,public.grm_corrections,public.grm_leaves,public.grm_holidays,
 public.grm_audit_logs from anon,authenticated;
grant select on public.grm_departments,public.grm_shifts,public.grm_settings,
 public.grm_attendance,public.grm_corrections,public.grm_leaves,public.grm_holidays
 to authenticated;
-- Prevent application clients from editing department/shift assignment via the profiles table.
-- Existing profiles update policy is Admin-only; Edge API must validate role and user scope.

-- Atomic self check-in/check-out, timestamps from database, NEVER user-supplied.
create or replace function public.grm_clock(p_actor uuid,p_mode text,p_ip inet default null)
returns public.grm_attendance language plpgsql security definer set search_path=''
as $$
declare rec public.grm_attendance; shift_info public.grm_shifts;
 tz text; local_date date; local_clock time; at_time timestamptz:=clock_timestamp();
begin
 if not exists(select 1 from public.gr_profiles where id=p_actor and active) then
   raise exception 'Employee account is inactive';
 end if;
 select office_timezone into tz from public.grm_settings where id=1;
 tz:=coalesce(tz,'Asia/Kolkata');
 local_date:=(at_time at time zone tz)::date;
 local_clock:=(at_time at time zone tz)::time;
 select s.* into shift_info from public.gr_profiles p left join public.grm_shifts s on s.id=p.shift_id where p.id=p_actor;
 if shift_info.id is null then select * into shift_info from public.grm_shifts where name='Standard Office';end if;
 if p_mode='in' then
  if exists(select 1 from public.grm_attendance a where a.user_id=p_actor and a.source='SELF' and a.check_in is not null and a.check_out is null and a.deleted_at is null) then
   raise exception 'Check out from the previous shift before checking in again';
  end if;
  if exists(select 1 from public.grm_holidays where date=local_date) then raise exception 'Today is a holiday';end if;
  if not extract(isodow from local_date)::integer=any(shift_info.working_days) then raise exception 'Today is not a working day';end if;
  if exists(select 1 from public.grm_leaves where user_id=p_actor and status='APPROVED' and local_date between from_date and to_date) then
   raise exception 'Approved leave covers today';
  end if;
  insert into public.grm_attendance(user_id,date,check_in,status,source,marked_by)
  values(p_actor,local_date,at_time,case when local_clock>(shift_info.start_time+make_interval(mins=>shift_info.grace_minutes))::time then 'LATE' else 'PRESENT' end,'SELF',p_actor)
  on conflict(user_id,date) do nothing returning * into rec;
  if rec.id is null then raise exception 'Already checked in or attendance recorded today';end if;
 elsif p_mode='out' then
  select * into rec from public.grm_attendance
    where user_id=p_actor and date in (local_date,local_date-1)
      and check_in is not null and check_out is null and deleted_at is null
      and source='SELF' and at_time-check_in<interval '24 hours'
    order by date desc limit 1 for update;
  if not found or rec.deleted_at is not null or rec.check_in is null or rec.source<>'SELF' then
    raise exception 'Check in first; cannot check out this entry';
  end if;
  if rec.check_out is not null then raise exception 'Already checked out today';end if;
  update public.grm_attendance
  set check_out=at_time,total_hours=round((extract(epoch from(at_time-rec.check_in))/3600)::numeric,2),
    status=case when extract(epoch from(at_time-rec.check_in))/3600 < shift_info.half_day_hours then 'HALF_DAY' else rec.status end,
    updated_at=at_time where id=rec.id returning * into rec;
 else raise exception 'Invalid clock action';end if;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,new_value,ip_address)
 values(p_actor,case when p_mode='in' then 'CHECK_IN' else 'CHECK_OUT' end,'attendance',rec.id::text,
 jsonb_build_object('date',rec.date,'check_in',rec.check_in,'check_out',rec.check_out),p_ip);
 return rec;
end;
$$;

-- Transactional manual marking/updating and soft delete. Every action needs a reason.
create or replace function public.grm_admin_attendance(
 p_actor uuid,p_user uuid,p_day date,p_status text,p_check_in timestamptz,
 p_check_out timestamptz,p_reason text,p_delete boolean default false,p_ip inet default null)
returns public.grm_attendance language plpgsql security definer set search_path=''
as $$
declare rec public.grm_attendance; previous jsonb; changed public.grm_attendance;
begin
 if not exists(select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
 where p.id=p_actor and p.active and r.name in ('Admin','Office Admin')) then
 raise exception 'Office Admin access required';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Reason is required (at least 3 characters)';end if;
 if not exists(select 1 from public.gr_profiles where id=p_user and active) then raise exception 'Target employee unavailable';end if;
 if p_day is null then raise exception 'Date required';end if;
 if not p_delete and p_status not in ('PRESENT','ABSENT','LATE','HALF_DAY','ON_LEAVE','HOLIDAY','WEEKEND') then
  raise exception 'Invalid status';end if;
 if p_check_out is not null and (p_check_in is null or p_check_out<=p_check_in) then
  raise exception 'Check-out must be later than check-in';end if;
 select * into rec from public.grm_attendance where user_id=p_user and date=p_day for update;
 previous:=case when rec.id is null then null else to_jsonb(rec) end;
 if p_delete then
  if rec.id is null or rec.deleted_at is not null then raise exception 'Attendance record not found';end if;
  update public.grm_attendance set deleted_at=clock_timestamp(),remarks=p_reason,updated_at=clock_timestamp()
    where id=rec.id returning * into changed;
 else
  insert into public.grm_attendance(user_id,date,status,check_in,check_out,total_hours,source,marked_by,remarks)
  values(p_user,p_day,p_status,p_check_in,p_check_out,
    case when p_check_in is not null and p_check_out is not null then round((extract(epoch from(p_check_out-p_check_in))/3600)::numeric,2) end,
    'ADMIN',p_actor,p_reason)
  on conflict(user_id,date) do update set
    status=excluded.status,check_in=excluded.check_in,check_out=excluded.check_out,
    total_hours=excluded.total_hours,source='ADMIN',marked_by=p_actor,
    remarks=p_reason,deleted_at=null,updated_at=clock_timestamp()
  returning * into changed;
 end if;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value,ip_address)
 values(p_actor,case when p_delete then 'DELETE' when previous is null then 'CREATE' else 'EDIT' end,
 'attendance',changed.id::text,previous,
 jsonb_build_object('record',to_jsonb(changed),'reason',p_reason),p_ip);
 return changed;
end;
$$;

create or replace function public.grm_review_correction(
 p_actor uuid,p_id uuid,p_decision text,p_note text,p_ip inet default null)
returns public.grm_corrections language plpgsql security definer set search_path=''
as $$
declare req public.grm_corrections; updated public.grm_corrections; tz text;
begin
 if not exists(select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
 where p.id=p_actor and p.active and r.name in ('Admin','Office Admin')) then raise exception 'Admin required';end if;
 if p_decision not in ('APPROVED','REJECTED') then raise exception 'Invalid review decision';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'Review note required';end if;
 select * into req from public.grm_corrections where id=p_id for update;
 if not found or req.status<>'PENDING' then raise exception 'Correction not pending';end if;
 if p_decision='APPROVED' then
  if req.requested_check_in is null then raise exception 'Requested check-in required for approval';end if;
  select office_timezone into tz from public.grm_settings where id=1;
  if (req.requested_check_in at time zone coalesce(tz,'Asia/Kolkata'))::date<>req.date then raise exception 'Check-in must fall on the requested office date';end if;
  perform public.grm_admin_attendance(p_actor,req.user_id,req.date,'PRESENT',req.requested_check_in,req.requested_check_out,
     'Approved correction: '||req.reason,false,p_ip);
 end if;
 update public.grm_corrections set status=p_decision,review_note=p_note,reviewed_by=p_actor,reviewed_at=clock_timestamp()
 where id=p_id returning * into updated;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value,ip_address)
 values(p_actor,'REVIEW','correction',p_id::text,jsonb_build_object('status','PENDING'),
 jsonb_build_object('status',p_decision,'note',p_note),p_ip);
 return updated;
end;
$$;

create or replace function public.grm_review_leave(
 p_actor uuid,p_id uuid,p_decision text,p_note text,p_ip inet default null)
returns public.grm_leaves language plpgsql security definer set search_path=''
as $$
declare req public.grm_leaves; updated public.grm_leaves;
begin
 if not exists(select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
 where p.id=p_actor and p.active and r.name in ('Admin','Office Admin')) then raise exception 'Admin required';end if;
 if p_decision not in ('APPROVED','REJECTED') then raise exception 'Invalid decision';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'Review note required';end if;
 select * into req from public.grm_leaves where id=p_id for update;
 if not found or req.status<>'PENDING' then raise exception 'Leave not pending';end if;
 if p_decision='APPROVED' and exists(
  select 1 from public.grm_leaves l where l.user_id=req.user_id and l.id<>p_id and l.status='APPROVED'
  and l.from_date<=req.to_date and l.to_date>=req.from_date
 ) then raise exception 'Overlaps another approved leave';end if;
 update public.grm_leaves set status=p_decision,review_note=p_note,reviewed_by=p_actor,reviewed_at=clock_timestamp()
 where id=p_id returning * into updated;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value,ip_address)
 values(p_actor,'REVIEW','leave',p_id::text,jsonb_build_object('status','PENDING'),
 jsonb_build_object('status',p_decision,'note',p_note),p_ip);
 return updated;
end;
$$;

-- Scheduled job should run AFTER local office midnight; backfill missed days safely.
create or replace function public.grm_mark_absences(p_date date)
returns integer language plpgsql security definer set search_path=''
as $$
declare tz text; result_count integer; yesterday date;
begin
 select office_timezone into tz from public.grm_settings where id=1;
 yesterday:=(clock_timestamp() at time zone coalesce(tz,'Asia/Kolkata'))::date-1;
 if p_date is null or p_date>yesterday or p_date<yesterday-31 then
   raise exception 'Absence job accepts dates from the last 31 completed days';
 end if;
 with missing as (
 select p.id as user_id from public.gr_profiles p
 left join public.grm_shifts shift on shift.id=p.shift_id
 where p.active and (p.joining_date is null or p.joining_date<=p_date)
 and extract(isodow from p_date)::integer=any(coalesce(shift.working_days,array[1,2,3,4,5,6]))
 and not exists(select 1 from public.grm_holidays h where h.date=p_date)
 and not exists(select 1 from public.grm_leaves l
  where l.user_id=p.id and l.status='APPROVED' and p_date between l.from_date and l.to_date)
 )
 insert into public.grm_attendance(user_id,date,status,source,remarks)
 select user_id,p_date,'ABSENT','SYSTEM','Scheduled absence' from missing
 on conflict(user_id,date) do nothing;
 get diagnostics result_count=row_count;
 return result_count;
end;
$$;
-- These privileged RPCs accept actor IDs and MUST NEVER be callable with an ordinary user JWT.
do $$ declare signature text;
begin
 foreach signature in array array[
 'grm_clock(uuid,text,inet)','grm_admin_attendance(uuid,uuid,date,text,timestamptz,timestamptz,text,boolean,inet)',
 'grm_review_correction(uuid,uuid,text,text,inet)','grm_review_leave(uuid,uuid,text,text,inet)',
 'grm_mark_absences(date)']
 loop
 execute format('revoke all on function public.%s from public,anon,authenticated',signature);
 execute format('grant execute on function public.%s to service_role',signature);
 end loop;
end $$;
commit;
