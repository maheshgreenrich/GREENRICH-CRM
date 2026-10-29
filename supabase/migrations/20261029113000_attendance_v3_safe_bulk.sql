-- Avoid overwriting an employee's real self check-in/out during an Office Admin bulk roll call.
-- Existing check-in entries are skipped and remain unchanged; other entries can be corrected with an audit reason.
begin;
create or replace function public.grm_admin_bulk(
 p_actor uuid,p_user_ids uuid[],p_day date,p_status text,p_reason text,p_ip inet default null)
returns integer language plpgsql security definer set search_path=''
as $$
declare target uuid; count_done integer:=0;
begin
 if array_length(p_user_ids,1) is null or array_length(p_user_ids,1)>200 then
  raise exception 'Choose 1 to 200 employee accounts';
 end if;
 if array_length(p_user_ids,1)<>(select count(distinct u) from unnest(p_user_ids) u) then
  raise exception 'Duplicate employee IDs in bulk request';
 end if;
 foreach target in array p_user_ids loop
  if exists(select 1 from public.grm_attendance a
    where a.user_id=target and a.date=p_day and a.deleted_at is null
      and a.source='SELF' and a.check_in is not null) then
   continue;
  end if;
  perform public.grm_admin_attendance(p_actor,target,p_day,p_status,null,null,p_reason,false,p_ip);
  count_done:=count_done+1;
 end loop;
 return count_done;
end;
$$;
revoke all on function public.grm_admin_bulk(uuid,uuid[],date,text,text,inet) from public,anon,authenticated;
grant execute on function public.grm_admin_bulk(uuid,uuid[],date,text,text,inet) to service_role;
commit;
