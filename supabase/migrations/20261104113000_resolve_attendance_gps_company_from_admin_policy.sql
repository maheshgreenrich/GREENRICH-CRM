-- Deployed server-side GPS attendance company resolution.
CREATE OR REPLACE FUNCTION public.grm_clock_with_location(p_actor uuid, p_mode text, p_ip inet DEFAULT NULL::inet, p_company text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision)
 RETURNS grm_attendance
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 rec public.grm_attendance;
 tracked boolean:=false;
 resolved_company text;
 shift_row public.gr_field_sessions%rowtype;
begin
 -- Use only companies where this user is active, a member, and explicitly GPS-enabled by Admin.
 select a.company_id into resolved_company
 from public.gr_field_staff_policies a
 join public.gr_profiles p on p.id=a.user_id
 where a.user_id=p_actor and a.enabled and p.active and a.company_id=any(p.company_ids)
 order by case when a.company_id=p_company then 0 else 1 end,a.company_id
 limit 1;
 tracked:=resolved_company is not null;
 if p_mode='out' then
  -- A staff member may switch the CRM company during the day.
  -- Always close the original active tracking session under its own company.
  select * into shift_row from public.gr_field_sessions
  where user_id=p_actor and checkout_at is null for update;
  if found then
   if exists(select 1 from public.gr_field_staff_policies a
     join public.gr_profiles p on p.id=a.user_id
     where a.user_id=p_actor and a.company_id=shift_row.company_id and a.enabled and p.active
       and shift_row.company_id=any(p.company_ids)) then
     resolved_company:=shift_row.company_id;tracked:=true;
   else
     -- Admin revoked GPS during the shift: stop collection; still permit a time-only check-out.
     resolved_company:=null;tracked:=false;
   end if;
  end if;
 end if;
 if tracked and (p_lat is null or p_lng is null or p_accuracy is null
  or p_lat not between -90 and 90 or p_lng not between -180 and 180
  or p_accuracy not between 0 and 3000)
 then raise exception 'GPS is required for your attendance. Allow device location and retry.';end if;
 rec:=public.grm_clock(p_actor,p_mode,p_ip);
 if tracked then
  if p_mode='in' then
   update public.grm_attendance
    set check_in_lat=p_lat,check_in_lng=p_lng,check_in_accuracy_m=p_accuracy,
     gps_company_id=resolved_company where id=rec.id returning * into rec;
   select * into shift_row from public.gr_field_sessions
    where user_id=p_actor and checkout_at is null for update;
   if found and shift_row.company_id<>resolved_company then
    raise exception 'An existing GPS shift is assigned to a different company; contact Admin';end if;
   if not found then
    insert into public.gr_field_sessions(company_id,user_id,checkin_lat,checkin_lng,checkin_accuracy_m)
    values(resolved_company,p_actor,p_lat,p_lng,p_accuracy) returning * into shift_row;
   end if;
   insert into public.gr_field_points(session_id,company_id,user_id,lat,lng,accuracy_m)
    values(shift_row.id,resolved_company,p_actor,p_lat,p_lng,p_accuracy);
  elsif p_mode='out' then
   update public.grm_attendance
    set check_out_lat=p_lat,check_out_lng=p_lng,check_out_accuracy_m=p_accuracy
    where id=rec.id returning * into rec;
   if shift_row.id is not null then
    update public.gr_field_sessions set checkout_at=now(),
      checkout_lat=p_lat,checkout_lng=p_lng,checkout_accuracy_m=p_accuracy
    where id=shift_row.id;
    insert into public.gr_field_points(session_id,company_id,user_id,lat,lng,accuracy_m)
      values(shift_row.id,shift_row.company_id,p_actor,p_lat,p_lng,p_accuracy);
   end if;
  end if;
 elsif p_mode='out' and shift_row.id is not null then
  -- An employee disabled by Admin can still finish attendance without recording GPS.
  update public.gr_field_sessions set checkout_at=now() where id=shift_row.id;
 end if;
 return rec;
end $function$

revoke all on function public.grm_clock_with_location(uuid,text,inet,text,double precision,double precision,double precision) from public,anon,authenticated;
grant execute on function public.grm_clock_with_location(uuid,text,inet,text,double precision,double precision,double precision) to service_role;
