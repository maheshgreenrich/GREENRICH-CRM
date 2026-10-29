-- OPTIONAL production schedule. Apply only after attendance V3 schema and operations.
-- Enable Supabase Cron (pg_cron) under Dashboard > Integrations > Cron first.
-- Supabase PostgreSQL scheduling is typically UTC. 19:30 UTC = 01:00 IST next day.
-- Verify cron timezone in your own project before enabling this schedule.
-- This job marks only the PREVIOUS completed office day; holidays, weekends, and
-- approved leave are excluded. Unique(user_id,date) makes retries idempotent.
select cron.schedule(
 'greenrich-v3-daily-absence',
 '30 19 * * *',
 $$select public.grm_mark_absences((now() at time zone 'Asia/Kolkata')::date - 1);$$
);
-- To disable: select cron.unschedule('greenrich-v3-daily-absence');
