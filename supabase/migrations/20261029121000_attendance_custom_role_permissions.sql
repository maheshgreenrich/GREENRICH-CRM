begin;
-- Attendance administrator actions can be delegated only with explicit ALL-scope capability grants.
-- Own and Team scopes never unlock company-wide admin controls.
create or replace function public.grm_attendance_access(p_actor uuid,p_target uuid,p_action text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
  where p.id=p_actor and p.active
   and (
    r.name in ('Admin','Office Admin')
    or exists(
     select 1 from public.gr_role_permissions rp
     where rp.role_id=p.role_id and rp.module='attendance'
       and rp.action=p_action and rp.allowed and rp.data_scope='all'
    )
   )
 );
$$;
revoke all on function public.grm_attendance_access(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.grm_attendance_access(uuid,uuid,text) to service_role;
create or replace function public.grm_is_manager() returns boolean
language sql stable security definer set search_path=''
as $$ select public.grm_attendance_access((select auth.uid()),null,'view') $$;
revoke all on function public.grm_is_manager() from public,anon;
grant execute on function public.grm_is_manager() to authenticated;

create or replace function public.grm_admin_attendance(
 p_actor uuid,p_user uuid,p_day date,p_status text,p_check_in timestamptz,
 p_check_out timestamptz,p_reason text,p_delete boolean default false,p_ip inet default null)
returns public.grm_attendance language plpgsql security definer set search_path=''
as $$
declare rec public.grm_attendance; previous jsonb; changed public.grm_attendance;
 shift_info public.grm_shifts; tz text; computed_status text:=p_status;
begin
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Reason is required (at least 3 characters)';end if;
 if not exists(select 1 from public.gr_profiles where id=p_user and active) then raise exception 'Target employee unavailable';end if;
 if p_day is null then raise exception 'Date required';end if;
 if not p_delete and p_status not in ('PRESENT','ABSENT','LATE','HALF_DAY','ON_LEAVE','HOLIDAY','WEEKEND') then
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
  update public.grm_attendance set deleted_at=clock_timestamp(),remarks=p_reason,updated_at=clock_timestamp()
    where id=rec.id returning * into changed;
 else
  insert into public.grm_attendance(user_id,date,status,check_in,check_out,total_hours,source,marked_by,remarks)
  values(p_user,p_day,computed_status,p_check_in,p_check_out,
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
 if not public.grm_attendance_access(p_actor,null,'approve') then raise exception 'Attendance approval access required';end if;
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
declare req public.grm_leaves; updated public.grm_leaves; day_value date;
 working_days int[]; day_is_working boolean;
begin
 if not public.grm_attendance_access(p_actor,null,'approve') then raise exception 'Attendance approval access required';end if;
 if p_decision not in ('APPROVED','REJECTED') then raise exception 'Invalid decision';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'Review note required';end if;
 select * into req from public.grm_leaves where id=p_id for update;
 if not found or req.status<>'PENDING' then raise exception 'Leave request is not pending';end if;
 if p_decision='APPROVED' then
  if exists(select 1 from public.grm_leaves l where l.user_id=req.user_id and l.id<>p_id
     and l.status='APPROVED' and l.from_date<=req.to_date and l.to_date>=req.from_date)
  then raise exception 'Leave overlaps an already approved request';end if;
  if exists(select 1 from public.grm_attendance a where a.user_id=req.user_id
     and a.date between req.from_date and req.to_date and a.deleted_at is null
     and (a.check_in is not null or a.check_out is not null
       or a.status not in ('ABSENT','ON_LEAVE')))
  then raise exception 'An attendance entry conflicts with these leave dates';end if;
  select coalesce(shift.working_days, array[1,2,3,4,5,6])
  into working_days from public.gr_profiles p
  left join public.grm_shifts shift on shift.id=p.shift_id where p.id=req.user_id;
  for day_value in select generate_series(req.from_date,req.to_date,'1 day'::interval)::date loop
   day_is_working=extract(isodow from day_value)::integer=any(working_days);
   if day_is_working and not exists(select 1 from public.grm_holidays h where h.date=day_value) then
    insert into public.grm_attendance(user_id,date,status,source,marked_by,remarks)
    values(req.user_id,day_value,'ON_LEAVE','ADMIN',p_actor,'Approved leave')
    on conflict(user_id,date) do update set
      status='ON_LEAVE',source='ADMIN',marked_by=p_actor,
      remarks='Approved leave',updated_at=clock_timestamp()
    where grm_attendance.deleted_at is null and grm_attendance.status in ('ABSENT','ON_LEAVE')
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
create or replace function public.grm_admin_config(
 p_actor uuid,p_entity text,p_operation text,p_id uuid,p_data jsonb,p_reason text,p_ip inet default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare previous jsonb; changed jsonb; role_ok boolean; v_id uuid;
begin
 select public.grm_attendance_access(p_actor,null,'edit') into role_ok;
 if not role_ok then raise exception 'Office Admin access required';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Reason required for configuration changes';end if;
 if p_entity not in ('departments','shifts','holidays') then raise exception 'Invalid configuration entity';end if;
 if p_operation not in ('create','update','delete') then raise exception 'Invalid configuration action';end if;
 if p_operation<>'create' and p_id is null then raise exception 'Configuration ID required';end if;
 if p_entity='departments' then
   if p_operation='create' then
     insert into public.grm_departments(name) values(trim(p_data->>'name'))
     returning to_jsonb(grm_departments.*) into changed;
   else
     select to_jsonb(d) into previous from public.grm_departments d where d.id=p_id for update;
     if previous is null then raise exception 'Department not found';end if;
     if p_operation='delete' then
       delete from public.grm_departments where id=p_id;
     else
       update public.grm_departments set name=trim(p_data->>'name') where id=p_id
       returning to_jsonb(grm_departments.*) into changed;
     end if;
   end if;
 elsif p_entity='shifts' then
   if p_operation='create' then
     insert into public.grm_shifts(name,start_time,end_time,grace_minutes,half_day_hours,working_days)
     values(trim(p_data->>'name'),(p_data->>'start_time')::time,(p_data->>'end_time')::time,
        (p_data->>'grace_minutes')::integer,(p_data->>'half_day_hours')::numeric,
        (select array_agg(n::integer) from jsonb_array_elements_text(p_data->'working_days') n))
     returning to_jsonb(grm_shifts.*) into changed;
   else
     select to_jsonb(s) into previous from public.grm_shifts s where s.id=p_id for update;
     if previous is null then raise exception 'Shift not found';end if;
     if p_operation='delete' then
       delete from public.grm_shifts where id=p_id;
     else
       update public.grm_shifts set
         name=trim(p_data->>'name'),start_time=(p_data->>'start_time')::time,
         end_time=(p_data->>'end_time')::time,
         grace_minutes=(p_data->>'grace_minutes')::integer,
         half_day_hours=(p_data->>'half_day_hours')::numeric,
         working_days=(select array_agg(n::integer) from jsonb_array_elements_text(p_data->'working_days') n)
       where id=p_id returning to_jsonb(grm_shifts.*) into changed;
     end if;
   end if;
 else
   if p_operation='create' then
     insert into public.grm_holidays(date,name) values((p_data->>'date')::date,trim(p_data->>'name'))
     returning to_jsonb(grm_holidays.*) into changed;
   else
     select to_jsonb(h) into previous from public.grm_holidays h where h.id=p_id for update;
     if previous is null then raise exception 'Holiday not found';end if;
     if p_operation='delete' then
       delete from public.grm_holidays where id=p_id;
     else
       update public.grm_holidays set date=(p_data->>'date')::date,name=trim(p_data->>'name')
       where id=p_id returning to_jsonb(grm_holidays.*) into changed;
     end if;
   end if;
 end if;
 if p_operation='create' then v_id=(changed->>'id')::uuid;else v_id=p_id;end if;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value,ip_address)
 values(p_actor,upper(p_operation),p_entity,v_id::text,previous,
 jsonb_build_object('data',changed,'reason',p_reason),p_ip);
 return coalesce(changed,jsonb_build_object('deleted',true,'id',v_id));
end;
$$;
create or replace function public.grm_assign_employee(
 p_actor uuid,p_target uuid,p_department uuid,p_shift uuid,p_reason text,p_ip inet default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare oldrow jsonb; updated jsonb;
begin
 if not public.grm_attendance_access(p_actor,p_target,'edit') then raise exception 'Attendance edit permission required';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Assignment reason required';end if;
 if p_department is not null and not exists(select 1 from public.grm_departments where id=p_department) then
  raise exception 'Department does not exist';
 end if;
 if p_shift is not null and not exists(select 1 from public.grm_shifts where id=p_shift) then
  raise exception 'Shift does not exist';
 end if;
 select to_jsonb(p) into oldrow from public.gr_profiles p where id=p_target and active for update;
 if oldrow is null then raise exception 'Employee not active';end if;
 update public.gr_profiles set department_id=p_department,shift_id=p_shift
 where id=p_target returning jsonb_build_object('id',id,'department_id',department_id,'shift_id',shift_id) into updated;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value,ip_address)
 values(p_actor,'ASSIGN','employee',p_target::text,
 jsonb_build_object('department_id',oldrow->'department_id','shift_id',oldrow->'shift_id'),
 jsonb_build_object('assignment',updated,'reason',p_reason),p_ip);
 return updated;
end;
$$;
commit;
