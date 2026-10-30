-- Supabase default privileges may grant EXECUTE directly to anon even after
-- REVOKE FROM PUBLIC. Explicitly revoke anonymous access to lead pipeline RPCs.
revoke execute on function public.gr_lead_can(text,uuid,text) from anon;
revoke execute on function public.gr_lead_can_manage(text,uuid) from anon;
revoke execute on function public.gr_pipeline_staff(text) from anon;
revoke execute on function public.gr_pipeline_create(text,text,text,uuid,text,text,numeric,text,text,text[],uuid,text,text) from anon;
revoke execute on function public.gr_pipeline_assign(text,text,uuid,text) from anon;
revoke execute on function public.gr_pipeline_move(text,text,text,text,text,date) from anon;
revoke execute on function public.gr_pipeline_link_customer(text,text,uuid,text) from anon;
