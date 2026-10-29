-- GreenRich Attendance V3: safe attendance launch control.
-- Scheduled absence marking stays disabled until a built-in Admin enables it.
begin;
alter table public.grm_settings add column if not exists enabled_from date;
create or replace function public.grm_mark_absences(p_date date)
returns integer language plpgsql security definer set search_path=''
as $$
declare tz text; result_count integer; yesterday date; launch_date date;
begin
 select office_timezone, enabled_from into tz, launch_date
 from public.grm_settings where id=1;
 yesterday:=(clock_timestamp() at time zone coalesce(tz,'Asia/Kolkata'))::date - 1;
 if launch_date is null or p_date<launch_date then return 0;end if;
 if p_date is null or p_date>yesterday or p_date<yesterday-31 then
   raise exception 'Absence job accepts dates from the last 31 completed days';
 end if;
 with missing as (
  select p.id as user_id
  from public.gr_profiles p
  left join public.grm_shifts shift on shift.id=p.shift_id
  where p.active and (p.joining_date is null or p.joining_date<=p_date)
    and extract(isodow from p_date)::integer =
      any(coalesce(shift.working_days,array[1,2,3,4,5,6]))
    and not exists(select 1 from public.grm_holidays h where h.date=p_date)
    and not exists(select 1 from public.grm_leaves l
      where l.user_id=p.id and l.status='APPROVED'
        and p_date between l.from_date and l.to_date)
 )
 insert into public.grm_attendance(user_id,date,status,source,remarks)
 select user_id,p_date,'ABSENT','SYSTEM','Automatically marked absent after office day'
 from missing on conflict(user_id,date) do nothing;
 get diagnostics result_count=row_count;
 return result_count;
end;
$$;
create or replace function public.grm_set_launch(
 p_actor uuid,p_start date,p_reason text)
returns date language plpgsql security definer set search_path=''
as $$
declare prev_date date; office_today date; office_zone text;
begin
 if not exists(select 1 from public.gr_profiles p join public.gr_roles r on p.role_id=r.id
     where p.id=p_actor and p.active and r.name='Admin') then
   raise exception 'Only built-in Admin can change attendance launch settings';
 end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Reason required';end if;
 select enabled_from,office_timezone into prev_date,office_zone from public.grm_settings where id=1 for update;
 office_today:=(clock_timestamp() at time zone coalesce(office_zone,'Asia/Kolkata'))::date;
 if p_start is not null and p_start<office_today then
   raise exception 'Launch must be today or a future date';
 end if;
 update public.grm_settings set enabled_from=p_start,updated_at=clock_timestamp() where id=1;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value)
 values(p_actor,'LAUNCH_SETTING','attendance_settings','1',
   jsonb_build_object('enabled_from',prev_date),
   jsonb_build_object('enabled_from',p_start,'reason',p_reason));
 return p_start;
end;
$$;
revoke all on function public.grm_mark_absences(date) from public,anon,authenticated;
grant execute on function public.grm_mark_absences(date) to service_role;
revoke all on function public.grm_set_launch(uuid,date,text) from public,anon,authenticated;
grant execute on function public.grm_set_launch(uuid,date,text) to service_role;
commit;
