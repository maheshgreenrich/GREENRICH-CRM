-- Company-scoped field movement summary for authorized supervisors only.
-- Summarizes historical 1-minute data and new 30-minute samples into one GPS point
-- per employee per 30-minute slot (India office date). No inferred/interpolated paths.
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
    select distinct on (p.user_id,date_bin('30 minutes',p.recorded_at,'2000-01-01 00:00:00+00'::timestamptz))
      p.user_id,p.lat,p.lng,p.accuracy_m,p.recorded_at
    from public.gr_field_points p
    where p.company_id=p_company
      and p.recorded_at >= (p_day::timestamp at time zone 'Asia/Kolkata')
      and p.recorded_at < ((p_day+1)::timestamp at time zone 'Asia/Kolkata')
    order by p.user_id,date_bin('30 minutes',p.recorded_at,'2000-01-01 00:00:00+00'::timestamptz),p.recorded_at desc
  ) x
  order by x.user_id,x.recorded_at;
end $$;
revoke all on function public.gr_field_monitor_day(text,date) from public,anon;
grant execute on function public.gr_field_monitor_day(text,date) to authenticated;
