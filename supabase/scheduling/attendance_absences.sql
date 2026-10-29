-- GreenRich Attendance V3 guarded daily absence schedule.
-- grm_settings.enabled_from is NULL until Admin activates attendance.
-- 19:30 UTC = 01:00 IST next day. Scheduled function marks previous office date.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule(
 'greenrich-v3-daily-absence',
 '30 19 * * *',
 $$select public.grm_mark_absences((now() at time zone 'Asia/Kolkata')::date-1);$$
);
-- Disable: select cron.unschedule('greenrich-v3-daily-absence');
