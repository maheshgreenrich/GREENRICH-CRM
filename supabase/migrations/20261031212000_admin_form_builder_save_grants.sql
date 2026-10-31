-- Form Builder fix: front-end PostgREST upsert requires table DML grants.
-- Company/Admin RLS still exclusively determines who can publish.
grant insert, update on table public.gr_form_schemas to authenticated;
-- Keep anonymous blocked; there is deliberately no DELETE access.
revoke all on table public.gr_form_schemas from anon;
alter table public.gr_form_schemas enable row level security;
