-- Ten-minute opt-in foreground GPS samples and authorized supervisor timeline.
-- GreenRich: opt-in field GPS recording, at most about one snapshot per 10 minutes.
-- GPS is saved only for the assigned company during an active field attendance session.
create or replace function public.gr_field_record_point(
 p_session uuid,p_lat double precision,p_lng double precision,p_accuracy double precision
) returns boolean language plpgsql security definer set search_path='' as $$
declare v public.gr_field_sessions%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required';end if;
 select * into v from public.gr_field_sessions
  where id=p_session and user_id=(select auth.uid()) and checkout_at is null
  for update;
 if not found or not public.gr_field_member(v.company_id)
 then raise exception 'Active assigned field attendance is required';end if;
 if not exists(select 1 from public.gr_field_staff_policies a join public.gr_profiles p on p.id=a.user_id
    where a.company_id=v.company_id and a.user_id=(select auth.uid())
      and a.enabled and p.active and v.company_id=any(p.company_ids))
 then raise exception 'Admin has not enabled GPS tracking for this employee';end if;
 if p_lat is null or p_lng is null or p_accuracy is null
  or p_lat not between -90 and 90 or p_lng not between -180 and 180
  or p_accuracy not between 0 and 3000
 then return false;end if;
 if exists(select 1 from public.gr_field_points where session_id=p_session
   and recorded_at>now()-interval '9 minutes') then return false;end if;
 insert into public.gr_field_points(session_id,company_id,user_id,lat,lng,accuracy_m)
 values(v.id,v.company_id,(select auth.uid()),p_lat,p_lng,p_accuracy);
 return true;
end $$;
revoke all on function public.gr_field_record_point(uuid,double precision,double precision,double precision) from public,anon;
grant execute on function public.gr_field_record_point(uuid,double precision,double precision,double precision) to authenticated;

-- Company-scoped field movement summary for authorized supervisors only.
-- Summarizes historical 1-minute data and new 10-minute samples into one GPS point
-- per employee per 10-minute slot (India office date). No inferred/interpolated paths.
create index if not exists gr_field_points_company_time_user
 on public.gr_field_points(company_id,recorded_at desc,user_id);
create or replace function public.gr_field_monitor_day(
 p_company text,p_day date
) returns table(
 user_id uuid,
 lat double precision,
 lng double precision,
 accuracy_m double precision,
 recorded_at timestamptz
) language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not public.gr_field_supervisor(p_company)
 then raise exception 'Authorized field supervisor access required';end if;
 if p_day is null then raise exception 'Choose a valid date';end if;
 return query
  select x.user_id,x.lat,x.lng,x.accuracy_m,x.recorded_at
  from (
    select distinct on (p.user_id,date_bin('10 minutes',p.recorded_at,'2000-01-01 00:00:00+00'::timestamptz))
      p.user_id,p.lat,p.lng,p.accuracy_m,p.recorded_at
    from public.gr_field_points p
    where p.company_id=p_company
      and p.recorded_at >= (p_day::timestamp at time zone 'Asia/Kolkata')
      and p.recorded_at < ((p_day+1)::timestamp at time zone 'Asia/Kolkata')
    order by p.user_id,date_bin('10 minutes',p.recorded_at,'2000-01-01 00:00:00+00'::timestamptz),p.recorded_at desc
  ) x
  order by x.user_id,x.recorded_at;
end $$;
revoke all on function public.gr_field_monitor_day(text,date) from public,anon;
grant execute on function public.gr_field_monitor_day(text,date) to authenticated;
