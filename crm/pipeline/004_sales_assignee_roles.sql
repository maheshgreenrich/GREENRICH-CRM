create or replace function public.gr_pipeline_staff(p_company text)
returns table(id uuid,full_name text,manager_id uuid) language sql stable security definer set search_path=''
as $$
select p.id,p.full_name,p.manager_id
from public.gr_profiles p join public.gr_roles r on p.role_id=r.id
where p.active and p_company=any(p.company_ids)
and (
  r.name in ('Sales','Telecaller')
  or (r.name not in ('Admin','Director','Marketing','Operation','Accounts','Office Admin','Developer')
      and exists(select 1 from public.gr_role_permissions x where x.role_id=p.role_id and x.module='leads' and x.action='edit' and x.allowed))
)
and exists (select 1 from public.gr_profiles me where me.id=(select auth.uid()) and me.active and p_company=any(me.company_ids))
and (
  p.id=auth.uid() or public.gr_lead_can_manage(p_company,p.id)
  or exists(select 1 from public.gr_lead_pipeline l where l.company_id=p_company and l.assigned_to=p.id and public.gr_lead_can(p_company,p.id,'view'))
)
order by p.full_name
$$;

revoke execute on function public.gr_pipeline_staff(text) from anon;
