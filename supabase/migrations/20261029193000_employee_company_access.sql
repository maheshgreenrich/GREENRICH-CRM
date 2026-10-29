-- Apply once to connected GreenRich Supabase project. Does not modify Attendance.
-- Existing employees keep access to both companies until Admin assigns individual access.
alter table public.gr_profiles
 add column if not exists company_ids text[] not null
 default array['grow-india','enviro-solutions']::text[];
alter table public.gr_profiles drop constraint if exists gr_profiles_company_ids_valid;
alter table public.gr_profiles add constraint gr_profiles_company_ids_valid check (
 coalesce(array_length(company_ids,1),0) between 1 and 2
 and company_ids <@ array['grow-india','enviro-solutions']::text[]
 and (company_ids[2] is null or company_ids[1] <> company_ids[2])
);
