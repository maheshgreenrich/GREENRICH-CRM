-- Scoped employee directory for separate field pilot.
-- Managers can assign staff without granting broad gr_profiles access.
create or replace function public.gr_field_directory(p_company text)
returns table(id uuid,full_name text) language sql stable security definer set search_path='' as $$
 select p.id,p.full_name from public.gr_profiles p
 where public.gr_field_member(p_company) and p.active and p_company=any(p.company_ids)
  and (p.id=auth.uid() or public.gr_field_supervisor(p_company))
 order by p.full_name
$$;
revoke all on function public.gr_field_directory(text) from public,anon;
grant execute on function public.gr_field_directory(text) to authenticated;
