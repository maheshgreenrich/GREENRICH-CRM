-- Service/sales field visits use fresh GPS proof without requiring a second shift check-in.
-- Assigned employee + current GPS + company authorization still required.
create or replace function public.gr_field_arrive(
 p_visit uuid,p_lat double precision,p_lng double precision,p_accuracy double precision
) returns void language plpgsql security definer set search_path='' as $$
declare v public.gr_field_visits%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in to your employee account';end if;
 select * into v from public.gr_field_visits
  where id=p_visit and assigned_to=auth.uid() for update;
 if not found or v.status not in ('planned','traveling') or v.arrival_at is not null
 then raise exception 'Visit must be assigned to you and not yet arrived';end if;
 if not public.gr_field_member(v.company_id) then raise exception 'No access to this company';end if;
 if p_lat is null or p_lng is null or p_accuracy is null
  or p_lat not between -90 and 90 or p_lng not between -180 and 180
  or p_accuracy not between 0 and 3000
 then raise exception 'Current GPS location is required';end if;
 update public.gr_field_visits
  set arrival_at=now(),arrival_lat=p_lat,arrival_lng=p_lng,arrival_accuracy_m=p_accuracy,
      status='on_site',updated_at=now()
  where id=p_visit;
end $$;
revoke all on function public.gr_field_arrive(uuid,double precision,double precision,double precision) from public,anon;
grant execute on function public.gr_field_arrive(uuid,double precision,double precision,double precision) to authenticated;
