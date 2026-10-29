-- Additional explicit permission attendance status so reports have meaningful Permission Days counts.
begin;
alter table public.grm_attendance drop constraint if exists grm_attendance_status_check;
alter table public.grm_attendance add constraint grm_attendance_status_check check
 (status in ('PRESENT','ABSENT','LATE','HALF_DAY','ON_LEAVE','PAID_LEAVE','PERMISSION','HOLIDAY','WEEKEND'));
create or replace function public.grm_admin_attendance(
 p_actor uuid,p_user uuid,p_day date,p_status text,p_check_in timestamptz,
 p_check_out timestamptz,p_reason text,p_delete boolean default false,p_ip inet default null)
returns public.grm_attendance language plpgsql security definer set search_path=''
as $$
declare rec public.grm_attendance; previous jsonb; changed public.grm_attendance;
 shift_info public.grm_shifts; tz text; computed_status text:=p_status;
begin

 if not exists(select 1 from public.gr_profiles where id=p_user and active) then raise exception 'Target employee unavailable';end if;
 if p_day is null then raise exception 'Date required';end if;
 if not p_delete and p_status not in ('PRESENT','ABSENT','LATE','HALF_DAY','ON_LEAVE','PAID_LEAVE','PERMISSION','HOLIDAY','WEEKEND') then
  raise exception 'Invalid status';end if;
 if p_check_out is not null and (p_check_in is null or p_check_out<=p_check_in) then
  raise exception 'Check-out must be later than check-in';end if;
 if not p_delete and p_check_in is not null and p_status in ('PRESENT','LATE','HALF_DAY') then
   select office_timezone into tz from public.grm_settings where id=1;
   tz:=coalesce(tz,'Asia/Kolkata');
   if (p_check_in at time zone tz)::date<>p_day then
     raise exception 'Check-in date must match office attendance date';
   end if;
   select shift.* into shift_info from public.gr_profiles employee
     left join public.grm_shifts shift on shift.id=employee.shift_id where employee.id=p_user;
   if shift_info.id is null then
     select * into shift_info from public.grm_shifts where name='Standard Office';
   end if;
   if p_check_out is not null and
       extract(epoch from(p_check_out-p_check_in))/3600 < shift_info.half_day_hours then
      computed_status:='HALF_DAY';
   elsif (p_check_in at time zone tz)::time>
       (shift_info.start_time+make_interval(mins=>shift_info.grace_minutes))::time then
      computed_status:='LATE';
   else computed_status:='PRESENT';
   end if;
 end if;
 select * into rec from public.grm_attendance where user_id=p_user and date=p_day for update;
 if not public.grm_attendance_access(p_actor,p_user,case when p_delete then 'delete'
    when rec.id is null or rec.deleted_at is not null then 'create' else 'edit' end) then
  raise exception 'Your role does not allow this attendance action for all employees';
 end if;
 previous:=case when rec.id is null then null else to_jsonb(rec) end;
 if p_delete then
  if rec.id is null or rec.deleted_at is not null then raise exception 'Attendance record not found';end if;
  update public.grm_attendance set deleted_at=clock_timestamp(),remarks=coalesce(p_reason,''),updated_at=clock_timestamp()
    where id=rec.id returning * into changed;
 else
  insert into public.grm_attendance(user_id,date,status,check_in,check_out,total_hours,source,marked_by,remarks)
  values(p_user,p_day,computed_status,p_check_in,p_check_out,
    case when p_check_in is not null and p_check_out is not null then round((extract(epoch from(p_check_out-p_check_in))/3600)::numeric,2) end,
    'ADMIN',p_actor,coalesce(p_reason,''))
  on conflict(user_id,date) do update set
    status=excluded.status,check_in=excluded.check_in,check_out=excluded.check_out,
    total_hours=excluded.total_hours,source='ADMIN',marked_by=p_actor,
    remarks=coalesce(p_reason,''),deleted_at=null,updated_at=clock_timestamp()
  returning * into changed;
 end if;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value,ip_address)
 values(p_actor,case when p_delete then 'DELETE' when previous is null then 'CREATE' else 'EDIT' end,
 'attendance',changed.id::text,previous,
 jsonb_build_object('record',to_jsonb(changed),'reason',p_reason),p_ip);
 return changed;
end;
$$;
revoke all on function public.grm_admin_attendance(uuid,uuid,date,text,timestamptz,timestamptz,text,boolean,inet) from public,anon,authenticated;
grant execute on function public.grm_admin_attendance(uuid,uuid,date,text,timestamptz,timestamptz,text,boolean,inet) to service_role;
commit;
