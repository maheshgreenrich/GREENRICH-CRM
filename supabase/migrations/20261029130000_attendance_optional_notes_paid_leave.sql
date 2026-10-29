-- Optional notes and distinct paid leave, while preserving server-side audit trails.
begin;
alter table public.grm_attendance drop constraint if exists grm_attendance_status_check;
alter table public.grm_attendance add constraint grm_attendance_status_check check(status in ('PRESENT','ABSENT','LATE','HALF_DAY','ON_LEAVE','PAID_LEAVE','HOLIDAY','WEEKEND'));
alter table public.grm_corrections drop constraint if exists grm_corrections_reason_check;
alter table public.grm_leaves drop constraint if exists grm_leaves_reason_check;
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
 if not p_delete and p_status not in ('PRESENT','ABSENT','LATE','HALF_DAY','ON_LEAVE','PAID_LEAVE','HOLIDAY','WEEKEND') then
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
create or replace function public.grm_review_correction(
 p_actor uuid,p_id uuid,p_decision text,p_note text,p_ip inet default null)
returns public.grm_corrections language plpgsql security definer set search_path=''
as $$
declare req public.grm_corrections; updated public.grm_corrections; tz text;
begin
 if not public.grm_attendance_access(p_actor,null,'approve') then raise exception 'Attendance approval access required';end if;
 if p_decision not in ('APPROVED','REJECTED') then raise exception 'Invalid review decision';end if;

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
declare req public.grm_leaves; updated public.grm_leaves; day_value date;
 working_days int[]; day_is_working boolean;
begin
 if not public.grm_attendance_access(p_actor,null,'approve') then raise exception 'Attendance approval access required';end if;
 if p_decision not in ('APPROVED','REJECTED') then raise exception 'Invalid decision';end if;

 select * into req from public.grm_leaves where id=p_id for update;
 if not found or req.status<>'PENDING' then raise exception 'Leave request is not pending';end if;
 if p_decision='APPROVED' then
  if exists(select 1 from public.grm_leaves l where l.user_id=req.user_id and l.id<>p_id
     and l.status='APPROVED' and l.from_date<=req.to_date and l.to_date>=req.from_date)
  then raise exception 'Leave overlaps an already approved request';end if;
  if exists(select 1 from public.grm_attendance a where a.user_id=req.user_id
     and a.date between req.from_date and req.to_date and a.deleted_at is null
     and (a.check_in is not null or a.check_out is not null
       or a.status not in ('ABSENT','ON_LEAVE','PAID_LEAVE')))
  then raise exception 'An attendance entry conflicts with these leave dates';end if;
  select coalesce(shift.working_days, array[1,2,3,4,5,6])
  into working_days from public.gr_profiles p
  left join public.grm_shifts shift on shift.id=p.shift_id where p.id=req.user_id;
  for day_value in select generate_series(req.from_date,req.to_date,'1 day'::interval)::date loop
   day_is_working=extract(isodow from day_value)::integer=any(working_days);
   if day_is_working and not exists(select 1 from public.grm_holidays h where h.date=day_value) then
    insert into public.grm_attendance(user_id,date,status,source,marked_by,remarks)
    values(req.user_id,day_value,case when lower(req.type) like '%unpaid%' then 'ON_LEAVE' else 'PAID_LEAVE' end,'ADMIN',p_actor,'Approved leave')
    on conflict(user_id,date) do update set
      status=case when lower(req.type) like '%unpaid%' then 'ON_LEAVE' else 'PAID_LEAVE' end,source='ADMIN',marked_by=p_actor,
      remarks='Approved leave',updated_at=clock_timestamp()
    where grm_attendance.deleted_at is null and grm_attendance.status in ('ABSENT','ON_LEAVE','PAID_LEAVE')
      and grm_attendance.check_in is null and grm_attendance.check_out is null;
   end if;
  end loop;
 end if;
 update public.grm_leaves set status=p_decision,review_note=p_note,
    reviewed_by=p_actor,reviewed_at=clock_timestamp()
 where id=p_id returning * into updated;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value,ip_address)
 values(p_actor,'REVIEW','leave',p_id::text,jsonb_build_object('status','PENDING'),
   jsonb_build_object('status',p_decision,'note',p_note,'from',req.from_date,'to',req.to_date),p_ip);
 return updated;
end;
$$;
create or replace function public.grm_admin_bulk(
 p_actor uuid,p_user_ids uuid[],p_day date,p_status text,p_reason text,p_ip inet default null)
returns integer language plpgsql security definer set search_path=''
as $$
declare target uuid; count_done integer:=0;
begin
 if array_length(p_user_ids,1) is null or array_length(p_user_ids,1)>200 then
  raise exception 'Choose 1 to 200 employee accounts';
 end if;
 if array_length(p_user_ids,1)<>(select count(distinct u) from unnest(p_user_ids) u) then
  raise exception 'Duplicate employee IDs in bulk request';
 end if;
 foreach target in array p_user_ids loop
  if exists(select 1 from public.grm_attendance a
    where a.user_id=target and a.date=p_day and a.deleted_at is null
      and a.source='SELF' and a.check_in is not null) then
   continue;
  end if;
  perform public.grm_admin_attendance(p_actor,target,p_day,p_status,null,null,p_reason,false,p_ip);
  count_done:=count_done+1;
 end loop;
 return count_done;
end;
$$;
-- Record reason remains optional, actor/timestamp/old/new values remain audited.
commit;
