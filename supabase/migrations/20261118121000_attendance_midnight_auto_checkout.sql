-- Auto-close unclosed shifts at 00:00 Asia/Kolkata of the following calendar day.
-- Stored check-out coordinates remain NULL because no real GPS was taken at midnight.
create or replace function public.grm_auto_checkout_midnight()
returns integer
language plpgsql security definer set search_path = ''
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
     where a.date < office_day
       and a.check_in is not null and a.check_out is null
       and a.deleted_at is null
       and a.check_in < ((a.date + 1)::timestamp at time zone 'Asia/Kolkata')
    returning a.id, a.user_id, a.check_out, a.check_in
  ), closed_sessions as (
    update public.gr_field_sessions s
       set checkout_at = c.check_out
      from closed c
     where s.user_id = c.user_id and s.checkout_at is null
       and s.checkin_at <= c.check_out
    returning s.id
  )
  select count(*) into affected from closed;
  return affected;
end;
$$;
revoke all on function public.grm_auto_checkout_midnight() from public, anon, authenticated;
grant execute on function public.grm_auto_checkout_midnight() to service_role;
-- pg_cron runs in UTC: 18:30 UTC = 00:00 IST next calendar day.
select cron.schedule('greenrich-attendance-midnight-checkout','30 18 * * *','select public.grm_auto_checkout_midnight();');
