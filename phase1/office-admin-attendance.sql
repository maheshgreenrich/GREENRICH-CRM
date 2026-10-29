-- GreenRich ONE: Office Admin and other delegated-role attendance access.
-- Run ONCE in Supabase SQL Editor, after phase1/schema.sql.
-- Does not delete existing attendance or employee records.
begin;

alter table public.gr_attendance add column if not exists deleted_at timestamptz;
create index if not exists gr_attendance_user_date_idx on public.gr_attendance(user_id,attendance_date);

-- One authorization decision for each attendance action.
-- "own" = only the actor, "team" = actor plus employees reporting to them,
-- "all" = any employee. Role configuration is read live from the database.
create or replace function public.gr_attendance_action_allowed(p_target uuid,p_action text)
returns boolean language sql stable security definer set search_path = ''
as $$
 select auth.uid() is not null and (
   public.gr_is_admin()
   or exists (
     select 1 from public.gr_profiles actor
     join public.gr_role_permissions permission on permission.role_id=actor.role_id
     where actor.id=auth.uid() and actor.active
       and permission.module='attendance'
       and permission.action=p_action
       and permission.allowed
       and (
         p_target=actor.id
         or (permission.data_scope='team' and exists (
           select 1 from public.gr_profiles employee
           where employee.id=p_target and employee.manager_id=actor.id
         ))
         or permission.data_scope='all'
       )
   )
 );
$$;

-- Replace the earlier hard-coded Admin/Director/Accounts check.
create or replace function public.gr_attendance_scope(p_target uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.gr_attendance_action_allowed(p_target,'view') $$;

-- Return ONLY minimal employee information to authorized attendance managers.
create or replace function public.gr_attendance_people()
returns table(id uuid,full_name text,role_id uuid,active boolean,manager_id uuid)
language sql stable security definer set search_path = ''
as $$
 select p.id,p.full_name,p.role_id,p.active,p.manager_id
 from public.gr_profiles p
 where p.active and (
   public.gr_attendance_action_allowed(p.id,'view')
   or public.gr_attendance_action_allowed(p.id,'create')
   or public.gr_attendance_action_allowed(p.id,'edit')
   or public.gr_attendance_action_allowed(p.id,'delete')
 )
 order by p.full_name;
$$;

-- Older policies could bypass role scopes. Replace them with ONE read policy.
do $$
declare item record;
begin
 for item in select policyname from pg_policies
             where schemaname='public' and tablename='gr_attendance'
 loop
   execute format('drop policy if exists %I on public.gr_attendance',item.policyname);
 end loop;
end $$;
alter table public.gr_attendance enable row level security;
create policy gr_attendance_read_role_scope on public.gr_attendance
 for select to authenticated
 using (deleted_at is null and public.gr_attendance_action_allowed(user_id,'view'));
-- Only the audited RPCs below may write attendance; do not grant direct mutations.
revoke insert,update,delete on public.gr_attendance from anon,authenticated;
grant select on public.gr_attendance to authenticated;

create or replace function public.gr_attendance_save(
 p_user uuid,p_date date,p_status text,p_remark text default ''
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
 actor uuid:=auth.uid(); old_row public.gr_attendance%rowtype;
 permission_action text; result_id uuid;
 locked_through date; self_cutoff time;
 scope_value text;
begin
 if actor is null then raise exception 'Login required'; end if;
 if p_user is null or p_date is null then raise exception 'Employee and date required';end if;
 if p_status not in ('present','absent','half_day') then raise exception 'Invalid attendance status';end if;
 if p_date>(now() at time zone 'Asia/Kolkata')::date then
   raise exception 'Future attendance is not permitted';
 end if;
 if not exists(select 1 from public.gr_profiles where id=p_user and active) then
   raise exception 'Employee not active or not found';
 end if;
 select * into old_row from public.gr_attendance
   where user_id=p_user and attendance_date=p_date for update;
 permission_action:=case when not found or old_row.deleted_at is not null then 'create' else 'edit' end;
 if not public.gr_attendance_action_allowed(p_user,permission_action) then
   raise exception 'Not permitted to % attendance for this employee',permission_action;
 end if;
 if to_regclass('public.gr_attendance_settings') is not null then
   execute 'select month_lock_through,cutoff_time from public.gr_attendance_settings where id=1'
   into locked_through,self_cutoff;
   if locked_through is not null and p_date<=locked_through and not public.gr_is_admin() then
     raise exception 'This attendance month is locked';
   end if;
 end if;
 -- A regular employee with only Own access can self-mark today before cutoff.
 -- Delegated Office Admin with Team/All permission can correct authorized dates.
 if actor=p_user and not public.gr_is_admin() then
   select permission.data_scope into scope_value
     from public.gr_profiles p join public.gr_role_permissions permission
       on permission.role_id=p.role_id
    where p.id=actor and permission.module='attendance'
      and permission.action=permission_action and permission.allowed;
   if scope_value='own' then
     if p_date<>(now() at time zone 'Asia/Kolkata')::date then
       raise exception 'Self attendance is allowed only today';
     end if;
     if self_cutoff is not null
       and (now() at time zone 'Asia/Kolkata')::time>self_cutoff then
       raise exception 'Self attendance cutoff passed';
     end if;
   end if;
 end if;
 if old_row.id is null then
   insert into public.gr_attendance(user_id,attendance_date,status,remark,marked_by)
   values(p_user,p_date,p_status,coalesce(p_remark,''),actor) returning id into result_id;
 else
   update public.gr_attendance
   set status=p_status,remark=coalesce(p_remark,''),marked_by=actor,
       marked_at=now(),deleted_at=null
   where id=old_row.id returning id into result_id;
 end if;
 insert into public.gr_audit_log(actor_id,entity,entity_id,operation,old_value,new_value)
 values(actor,'attendance',result_id::text,
        case when old_row.id is null then 'CREATE' else 'EDIT' end,
        case when old_row.id is null then null
             else jsonb_build_object('status',old_row.status,'date',old_row.attendance_date) end,
        jsonb_build_object('user_id',p_user,'date',p_date,'status',p_status));
 return result_id;
end;
$$;

create or replace function public.gr_attendance_remove(p_user uuid,p_date date)
returns void language plpgsql security definer set search_path = ''
as $$
declare prior public.gr_attendance%rowtype;
begin
 if auth.uid() is null then raise exception 'Login required';end if;
 if not public.gr_attendance_action_allowed(p_user,'delete') then
   raise exception 'Not permitted to delete attendance for this employee';
 end if;
 select * into prior from public.gr_attendance
 where user_id=p_user and attendance_date=p_date and deleted_at is null for update;
 if not found then raise exception 'Attendance entry not found';end if;
 update public.gr_attendance set deleted_at=now() where id=prior.id;
 insert into public.gr_audit_log(actor_id,entity,entity_id,operation,old_value,new_value)
 values(auth.uid(),'attendance',prior.id::text,'DELETE',
        jsonb_build_object('user_id',prior.user_id,'date',prior.attendance_date,'status',prior.status),
        jsonb_build_object('deleted_at',now()));
end;
$$;

-- The old v2 function used hard-coded Admin logic and would bypass the new
-- permission model. Disable it in favor of gr_attendance_save.
do $$
begin
 if to_regprocedure('public.gr_mark_attendance(uuid,date,text,text,text,jsonb)') is not null then
   revoke execute on function public.gr_mark_attendance(uuid,date,text,text,text,jsonb)
     from public,anon,authenticated;
 end if;
end $$;

revoke all on function public.gr_attendance_action_allowed(uuid,text) from public,anon;
revoke all on function public.gr_attendance_scope(uuid) from public,anon;
revoke all on function public.gr_attendance_people() from public,anon;
revoke all on function public.gr_attendance_save(uuid,date,text,text) from public,anon;
revoke all on function public.gr_attendance_remove(uuid,date) from public,anon;
grant execute on function public.gr_attendance_action_allowed(uuid,text) to authenticated;
grant execute on function public.gr_attendance_scope(uuid) to authenticated;
grant execute on function public.gr_attendance_people() to authenticated;
grant execute on function public.gr_attendance_save(uuid,date,text,text) to authenticated;
grant execute on function public.gr_attendance_remove(uuid,date) to authenticated;
commit;
