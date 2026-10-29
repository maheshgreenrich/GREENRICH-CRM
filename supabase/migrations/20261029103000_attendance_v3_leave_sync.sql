-- Attendance V3: approved leave populates ON_LEAVE attendance only on working days.
-- Safe additive replacement of the V3 leave-review function.
begin;
create or replace function public.grm_review_leave(
 p_actor uuid,p_id uuid,p_decision text,p_note text,p_ip inet default null)
returns public.grm_leaves language plpgsql security definer set search_path=''
as $$
declare req public.grm_leaves; updated public.grm_leaves; day_value date;
 working_days int[]; day_is_working boolean;
begin
 if not exists(select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
 where p.id=p_actor and p.active and r.name in ('Admin','Office Admin')) then
  raise exception 'Office Admin access required';
 end if;
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
revoke all on function public.grm_review_leave(uuid,uuid,text,text,inet) from public,anon,authenticated;
grant execute on function public.grm_review_leave(uuid,uuid,text,text,inet) to service_role;
commit;
