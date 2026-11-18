alter table public.gr_field_sessions
 add column if not exists auto_checkout boolean not null default false;
alter table public.gr_field_sessions
 drop constraint if exists gr_field_session_close_complete;
alter table public.gr_field_sessions
 add constraint gr_field_session_close_complete check(
  (checkout_at is null and checkout_lat is null and checkout_lng is null and checkout_accuracy_m is null and not auto_checkout)
  or
  (checkout_at is not null and checkout_at >= checkin_at and (
    (auto_checkout and checkout_lat is null and checkout_lng is null and checkout_accuracy_m is null)
    or
    (not auto_checkout and checkout_lat is not null and checkout_lng is not null and checkout_accuracy_m is not null)
  ))
 );
create or replace function public.grm_auto_checkout_midnight()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
 office_day date := (clock_timestamp() at time zone 'Asia/Kolkata')::date;
 affected integer;
begin
 with closed as (
  update public.grm_attendance a
   set check_out = ((a.date + 1)::timestamp at time zone 'Asia/Kolkata'),
       total_hours = round((extract(epoch from (((a.date + 1)::timestamp at time zone 'Asia/Kolkata') - a.check_in)) / 3600)::numeric, 2),
       remarks = concat_ws(' | ', nullif(a.remarks, ''), 'Automatic checkout at 12:00 AM IST (forgotten checkout)'),
       updated_at = clock_timestamp()
   where a.date < office_day and a.check_in is not null and a.check_out is null
     and a.deleted_at is null and a.check_in < ((a.date + 1)::timestamp at time zone 'Asia/Kolkata')
  returning a.id,a.user_id,a.check_out
 ), closed_sessions as (
  update public.gr_field_sessions s
   set checkout_at=c.check_out,auto_checkout=true
   from closed c
   where s.user_id=c.user_id and s.checkout_at is null and s.checkin_at<=c.check_out
  returning s.id
 )
 select count(*) into affected from closed;
 return affected;
end;
$$;