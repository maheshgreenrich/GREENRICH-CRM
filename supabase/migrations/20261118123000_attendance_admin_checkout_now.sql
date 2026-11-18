-- Admin-only manual completion of a checked-in attendance record.
-- Uses trusted database time, not the admin's device clock.
create or replace function public.grm_admin_checkout_now(p_record uuid,p_reason text default 'Checked out by administrator')
returns public.grm_attendance language plpgsql security definer set search_path = ''
as $$
declare
 actor uuid := (select auth.uid());
 rec public.grm_attendance;
 finalized public.grm_attendance;
 actual_checkout timestamptz;
begin
 if actor is null or not exists (
  select 1 from public.gr_profiles p
  join public.gr_roles r on r.id=p.role_id
  where p.id=actor and p.active and r.name in ('Admin','Office Admin')
 ) then raise exception 'Admin access required'; end if;
 if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Checkout reason is required'; end if;
 select * into rec from public.grm_attendance
  where id=p_record and deleted_at is null for update;
 if not found then raise exception 'Attendance record not found'; end if;
 if rec.check_in is null then raise exception 'Check-in is required'; end if;
 if rec.check_out is not null then raise exception 'Already checked out'; end if;
 actual_checkout:=least(clock_timestamp(),((rec.date+1)::timestamp at time zone 'Asia/Kolkata'));
 if actual_checkout<=rec.check_in then raise exception 'Checkout must be after check-in'; end if;
 update public.grm_attendance
  set check_out=actual_checkout,
      total_hours=round((extract(epoch from(actual_checkout-rec.check_in))/3600)::numeric,2),
      remarks=concat_ws(' | ',nullif(remarks,''),trim(p_reason)),
      updated_at=clock_timestamp()
  where id=rec.id returning * into finalized;
 update public.gr_field_sessions s
  set checkout_at=actual_checkout,auto_checkout=true
  where s.user_id=rec.user_id and s.checkout_at is null
   and s.checkin_at<=actual_checkout;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value)
 values(actor,'ADMIN_CHECK_OUT','attendance',rec.id::text,to_jsonb(rec),
   jsonb_build_object('record',to_jsonb(finalized),'reason',p_reason));
 return finalized;
end;
$$;
revoke all on function public.grm_admin_checkout_now(uuid,text) from public,anon;
grant execute on function public.grm_admin_checkout_now(uuid,text) to authenticated;