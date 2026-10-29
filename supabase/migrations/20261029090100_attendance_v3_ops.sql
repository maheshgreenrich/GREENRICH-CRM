-- Attendance V3 follow-up: atomic bulk actions and audited office configuration.
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
 if array_length(p_user_ids,1)<>(
   select count(distinct u) from unnest(p_user_ids) u
 ) then raise exception 'Duplicate employee IDs in bulk request';end if;
 foreach target in array p_user_ids loop
   perform public.grm_admin_attendance(p_actor,target,p_day,p_status,null,null,p_reason,false,p_ip);
   count_done:=count_done+1;
 end loop;
 return count_done;
end;
$$;
create or replace function public.grm_admin_config(
 p_actor uuid,p_entity text,p_operation text,p_id uuid,p_data jsonb,p_reason text,p_ip inet default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare previous jsonb; changed jsonb; role_ok boolean; v_id uuid;
begin
 select exists(select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
 where p.id=p_actor and p.active and r.name in ('Admin','Office Admin')) into role_ok;
 if not role_ok then raise exception 'Office Admin access required';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Reason required for configuration changes';end if;
 if p_entity not in ('departments','shifts','holidays') then raise exception 'Invalid configuration entity';end if;
 if p_operation not in ('create','update','delete') then raise exception 'Invalid configuration action';end if;
 if p_operation<>'create' and p_id is null then raise exception 'Configuration ID required';end if;
 if p_entity='departments' then
   if p_operation='create' then
     insert into public.grm_departments(name) values(trim(p_data->>'name'))
     returning to_jsonb(grm_departments.*) into changed;
   else
     select to_jsonb(d) into previous from public.grm_departments d where d.id=p_id for update;
     if previous is null then raise exception 'Department not found';end if;
     if p_operation='delete' then
       delete from public.grm_departments where id=p_id;
     else
       update public.grm_departments set name=trim(p_data->>'name') where id=p_id
       returning to_jsonb(grm_departments.*) into changed;
     end if;
   end if;
 elsif p_entity='shifts' then
   if p_operation='create' then
     insert into public.grm_shifts(name,start_time,end_time,grace_minutes,half_day_hours,working_days)
     values(trim(p_data->>'name'),(p_data->>'start_time')::time,(p_data->>'end_time')::time,
        (p_data->>'grace_minutes')::integer,(p_data->>'half_day_hours')::numeric,
        (select array_agg(n::integer) from jsonb_array_elements_text(p_data->'working_days') n))
     returning to_jsonb(grm_shifts.*) into changed;
   else
     select to_jsonb(s) into previous from public.grm_shifts s where s.id=p_id for update;
     if previous is null then raise exception 'Shift not found';end if;
     if p_operation='delete' then
       delete from public.grm_shifts where id=p_id;
     else
       update public.grm_shifts set
         name=trim(p_data->>'name'),start_time=(p_data->>'start_time')::time,
         end_time=(p_data->>'end_time')::time,
         grace_minutes=(p_data->>'grace_minutes')::integer,
         half_day_hours=(p_data->>'half_day_hours')::numeric,
         working_days=(select array_agg(n::integer) from jsonb_array_elements_text(p_data->'working_days') n)
       where id=p_id returning to_jsonb(grm_shifts.*) into changed;
     end if;
   end if;
 else
   if p_operation='create' then
     insert into public.grm_holidays(date,name) values((p_data->>'date')::date,trim(p_data->>'name'))
     returning to_jsonb(grm_holidays.*) into changed;
   else
     select to_jsonb(h) into previous from public.grm_holidays h where h.id=p_id for update;
     if previous is null then raise exception 'Holiday not found';end if;
     if p_operation='delete' then
       delete from public.grm_holidays where id=p_id;
     else
       update public.grm_holidays set date=(p_data->>'date')::date,name=trim(p_data->>'name')
       where id=p_id returning to_jsonb(grm_holidays.*) into changed;
     end if;
   end if;
 end if;
 if p_operation='create' then v_id=(changed->>'id')::uuid;else v_id=p_id;end if;
 insert into public.grm_audit_logs(actor_id,action,entity,entity_id,old_value,new_value,ip_address)
 values(p_actor,upper(p_operation),p_entity,v_id::text,previous,
 jsonb_build_object('data',changed,'reason',p_reason),p_ip);
 return coalesce(changed,jsonb_build_object('deleted',true,'id',v_id));
end;
$$;
revoke all on function public.grm_admin_bulk(uuid,uuid[],date,text,text,inet) from public,anon,authenticated;
revoke all on function public.grm_admin_config(uuid,text,text,uuid,jsonb,text,inet) from public,anon,authenticated;
grant execute on function public.grm_admin_bulk(uuid,uuid[],date,text,text,inet) to service_role;
grant execute on function public.grm_admin_config(uuid,text,text,uuid,jsonb,text,inet) to service_role;
commit;
