-- Additional attendance V3 deployment patch: audited employee shift/department assignment.
begin;
create or replace function public.grm_assign_employee(
 p_actor uuid,p_target uuid,p_department uuid,p_shift uuid,p_reason text,p_ip inet default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare oldrow jsonb; updated jsonb;
begin
 if not exists(select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
  where p.id=p_actor and p.active and r.name in ('Office Admin','Admin')) then
  raise exception 'Office Admin access required';
 end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Assignment reason required';end if;
 if p_department is not null and not exists(select 1 from public.grm_departments where id=p_department) then
  raise exception 'Department does not exist';
 end if;
 if p_shift is not null and not exists(select 1 from public.grm_shifts where id=p_shift) then
  raise exception 'Shift does not exist';
 end if;
 select to_jsonb(p) into oldrow from public.gr_profiles p where id=p_target and active for update;
 if oldrow is null then raise exception 'Employee not active';end if;
 update public.gr_profiles set department_id=p_department,shift_id=p_shift
 where id=p_target returning jsonb_build_object('id',id,'department_id',department_id,'shift_id',shift_id) into updated;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value,ip_address)
 values(p_actor,'ASSIGN','employee',p_target::text,
 jsonb_build_object('department_id',oldrow->'department_id','shift_id',oldrow->'shift_id'),
 jsonb_build_object('assignment',updated,'reason',p_reason),p_ip);
 return updated;
end;
$$;
revoke all on function public.grm_assign_employee(uuid,uuid,uuid,uuid,text,inet) from public,anon,authenticated;
grant execute on function public.grm_assign_employee(uuid,uuid,uuid,uuid,text,inet) to service_role;
commit;
