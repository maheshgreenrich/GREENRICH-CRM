-- Keep user-selected attendance date authoritative when approving correction requests.
-- Convert submitted local clock times onto requested date, including legacy requests with mismatched source dates.
-- Approval persists normalized times in both correction and attendance, and audits original and final timestamps.
begin;
create or replace function public.grm_review_correction(
 p_actor uuid,p_id uuid,p_decision text,p_note text,p_ip inet default null)
returns public.grm_corrections language plpgsql security definer set search_path=''
as $$
declare req public.grm_corrections; updated public.grm_corrections; tz text;
 normalized_in timestamptz; normalized_out timestamptz; checkout_day_offset integer:=0;
 changed_calendar_date boolean:=false;
begin
 if not public.grm_attendance_access(p_actor,null,'approve') then raise exception 'Attendance approval access required';end if;
 if p_decision not in ('APPROVED','REJECTED') then raise exception 'Invalid review decision';end if;

 select * into req from public.grm_corrections where id=p_id for update;
 if not found or req.status<>'PENDING' then raise exception 'Correction not pending';end if;
 if p_decision='APPROVED' then
  if req.requested_check_in is null then raise exception 'Requested check-in required for approval';end if;
  select office_timezone into tz from public.grm_settings where id=1;
  tz:=coalesce(tz,'Asia/Kolkata');
  -- The selected attendance date is authoritative. Preserve the local clock times
  -- even for older correction requests that mistakenly used the submission date.
  changed_calendar_date:=(req.requested_check_in at time zone tz)::date<>req.date;
  normalized_in:=((req.date+(req.requested_check_in at time zone tz)::time) at time zone tz);
  if req.requested_check_out is not null then
   checkout_day_offset:=(req.requested_check_out at time zone tz)::date-
                       (req.requested_check_in at time zone tz)::date;
   if checkout_day_offset<0 or checkout_day_offset>1 then
    raise exception 'Requested check-out date must be on the check-in day or following day';
   end if;
   normalized_out:=((req.date+checkout_day_offset+
        (req.requested_check_out at time zone tz)::time) at time zone tz);
   if normalized_out<=normalized_in then
    raise exception 'Check-out time must be after check-in. Ask the employee to correct the requested hours';
   end if;
  end if;
  perform public.grm_admin_attendance(p_actor,req.user_id,req.date,'PRESENT',
     normalized_in,normalized_out,concat('Approved correction: ',coalesce(req.reason,'')),false,p_ip);
 end if;
 update public.grm_corrections set status=p_decision,review_note=p_note,reviewed_by=p_actor,
 requested_check_in=case when p_decision='APPROVED' then normalized_in else requested_check_in end,
 requested_check_out=case when p_decision='APPROVED' then normalized_out else requested_check_out end,
 reviewed_at=clock_timestamp()
 where id=p_id returning * into updated;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value,ip_address)
 values(p_actor,'REVIEW','correction',p_id::text,jsonb_build_object('status','PENDING','requested_check_in',req.requested_check_in,
   'requested_check_out',req.requested_check_out),
 jsonb_build_object('status',p_decision,'note',p_note,'attendance_date',req.date,
   'normalised_from_other_date',changed_calendar_date,'approved_check_in',normalized_in,
   'approved_check_out',normalized_out),p_ip);
 return updated;
end;
$$;
revoke all on function public.grm_review_correction(uuid,uuid,text,text,inet) from public,anon,authenticated;
grant execute on function public.grm_review_correction(uuid,uuid,text,text,inet) to service_role;
commit;
