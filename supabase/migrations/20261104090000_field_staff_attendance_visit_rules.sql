-- GreenRich ONE: opt-in field staff GPS, visit completion rules, and follow-up assignments.
-- Additive migration. Employee GPS requires explicit location permission and an Admin assignment.
create table if not exists public.gr_field_staff_policies(
 company_id text not null references public.gr_companies(id),
 user_id uuid not null references public.gr_profiles(id),
 enabled boolean not null default false,
 updated_by uuid references public.gr_profiles(id),
 updated_at timestamptz not null default now(),
 primary key(company_id,user_id)
);
create table if not exists public.gr_field_visit_rules(
 company_id text not null references public.gr_companies(id),
 visit_type text not null check(visit_type in ('sales','service','site','installation')),
 photo_required boolean not null default true,
 min_notes integer not null default 10 check(min_notes between 10 and 500),
 updated_by uuid references public.gr_profiles(id),
 updated_at timestamptz not null default now(),
 primary key(company_id,visit_type)
);
create table if not exists public.gr_field_visit_followups(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 visit_id uuid not null references public.gr_field_visits(id),
 assigned_to uuid not null references public.gr_profiles(id),
 created_by uuid not null references public.gr_profiles(id),
 due_at timestamptz not null,
 notes text not null check(length(btrim(notes))>=5),
 status text not null default 'pending' check(status in ('pending','done','cancelled')),
 created_at timestamptz not null default now()
);
create index if not exists gr_field_visit_followups_staff on public.gr_field_visit_followups(assigned_to,due_at);
alter table public.gr_field_staff_policies enable row level security;
alter table public.gr_field_visit_rules enable row level security;
alter table public.gr_field_visit_followups enable row level security;
revoke all on public.gr_field_staff_policies,public.gr_field_visit_rules,public.gr_field_visit_followups from public,anon,authenticated;
grant select on public.gr_field_visit_followups to authenticated;
create policy field_visit_followups_read on public.gr_field_visit_followups
 for select to authenticated using(
   assigned_to=(select auth.uid()) or public.gr_field_supervisor(company_id)
   or exists(select 1 from public.gr_field_visits v where v.id=visit_id and v.assigned_to=(select auth.uid()))
 );
-- Preserve old records. Installation is a separate visit type and still requires GPS + notes.
alter table public.gr_field_visits drop constraint if exists gr_field_visits_visit_type_check;
alter table public.gr_field_visits add constraint gr_field_visits_visit_type_check
 check(visit_type in ('sales','service','site','installation'));
alter table public.gr_field_visits add column if not exists sales_outcome text;
alter table public.gr_field_visits add constraint gr_field_sales_outcome_valid
 check(sales_outcome is null or sales_outcome in ('converted','follow_up','not_interested','pending'));
alter table public.grm_attendance add column if not exists check_in_lat double precision;
alter table public.grm_attendance add column if not exists check_in_lng double precision;
alter table public.grm_attendance add column if not exists check_in_accuracy_m double precision;
alter table public.grm_attendance add column if not exists check_out_lat double precision;
alter table public.grm_attendance add column if not exists check_out_lng double precision;
alter table public.grm_attendance add column if not exists check_out_accuracy_m double precision;
alter table public.grm_attendance add column if not exists gps_company_id text;
-- Only an Admin can select which users are tracked; not their other CRM role.
create or replace function public.gr_field_admin_config(p_company text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.gr_field_is_admin(p_company) then raise exception 'Admin access required';end if;
 return jsonb_build_object(
  'staff',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'enabled',coalesce(a.enabled,false)) order by p.full_name)
    from public.gr_profiles p left join public.gr_field_staff_policies a
    on a.company_id=p_company and a.user_id=p.id
    where p.active and p_company=any(p.company_ids)),'[]'::jsonb),
  'rules',coalesce((select jsonb_agg(jsonb_build_object('type',r.visit_type,'photos',r.photo_required,'min_notes',r.min_notes))
    from public.gr_field_visit_rules r where r.company_id=p_company),'[]'::jsonb)
 );
end $$;
create or replace function public.gr_field_assign_staff(p_company text,p_user uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.gr_field_is_admin(p_company) then raise exception 'Admin access required';end if;
 if p_enabled is null or not exists(select 1 from public.gr_profiles
    where id=p_user and active and p_company=any(company_ids))
 then raise exception 'Choose an active employee in this company';end if;
 insert into public.gr_field_staff_policies(company_id,user_id,enabled,updated_by)
 values(p_company,p_user,p_enabled,(select auth.uid()))
 on conflict(company_id,user_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
end $$;
create or replace function public.gr_field_update_visit_rule(p_company text,p_type text,p_photos boolean,p_min_notes integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.gr_field_is_admin(p_company) then raise exception 'Admin access required';end if;
 if p_type not in ('sales','service','site','installation') or p_photos is null
  or p_min_notes not between 10 and 500 then raise exception 'Invalid visit rule';end if;
 insert into public.gr_field_visit_rules(company_id,visit_type,photo_required,min_notes,updated_by)
 values(p_company,p_type,p_photos,p_min_notes,(select auth.uid()))
 on conflict(company_id,visit_type) do update set photo_required=excluded.photo_required,
 min_notes=excluded.min_notes,updated_by=excluded.updated_by,updated_at=now();
end $$;
create or replace function public.gr_field_visit_rules_for_company(p_company text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.gr_field_member(p_company) then raise exception 'Company access required';end if;
 return (select coalesce(jsonb_object_agg(t, jsonb_build_object('photo_required',coalesce(r.photo_required,t in ('sales','site')),
      'min_notes',coalesce(r.min_notes,10))), '{}'::jsonb)
 from unnest(array['sales','service','site','installation']::text[]) as kinds(t)
 left join public.gr_field_visit_rules r on r.company_id=p_company and r.visit_type=t);
end $$;
create or replace function public.gr_field_my_enabled_companies()
returns text[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(a.company_id order by a.company_id),array[]::text[])
 from public.gr_field_staff_policies a join public.gr_profiles p on p.id=a.user_id
 where a.user_id=auth.uid() and a.enabled and p.active and a.company_id=any(p.company_ids)
$$;
revoke all on function public.gr_field_admin_config(text),public.gr_field_assign_staff(text,uuid,boolean),
 public.gr_field_update_visit_rule(text,text,boolean,integer),public.gr_field_visit_rules_for_company(text),
 public.gr_field_my_enabled_companies() from public,anon;
grant execute on function public.gr_field_admin_config(text),public.gr_field_assign_staff(text,uuid,boolean),
 public.gr_field_update_visit_rule(text,text,boolean,integer),public.gr_field_visit_rules_for_company(text),
 public.gr_field_my_enabled_companies() to authenticated;
-- Uses the existing transactional attendance RPC, with GPS saved in the same DB transaction.
-- Exposed only to the attendance Edge Function (service_role), never directly to browser clients.
create or replace function public.grm_clock_with_location(
 p_actor uuid,p_mode text,p_ip inet default null,
 p_company text default null,p_lat double precision default null,p_lng double precision default null,p_accuracy double precision default null)
returns public.grm_attendance language plpgsql security definer set search_path='' as $$
declare rec public.grm_attendance; tracked boolean; found_company text; shift_row public.gr_field_sessions%rowtype;
begin
 select company_id into found_company from public.gr_field_staff_policies
 where user_id=p_actor and enabled order by company_id limit 1;
 tracked:=found_company is not null;
 if tracked then
  if p_company is null or not exists(select 1 from public.gr_field_staff_policies a
     join public.gr_profiles p on p.id=a.user_id
     where a.company_id=p_company and a.user_id=p_actor and a.enabled and p.active and p_company=any(p.company_ids))
  then raise exception 'Field GPS attendance company must match your Admin assignment';end if;
  if p_lat is null or p_lng is null or p_accuracy is null
   or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 3000
  then raise exception 'Current GPS with accuracy within 3 km is required for field attendance';end if;
 end if;
 rec:=public.grm_clock(p_actor,p_mode,p_ip);
 if tracked then
  if p_mode='in' then
   update public.grm_attendance set check_in_lat=p_lat,check_in_lng=p_lng,
    check_in_accuracy_m=p_accuracy,gps_company_id=p_company where id=rec.id returning * into rec;
   select * into shift_row from public.gr_field_sessions
     where user_id=p_actor and checkout_at is null for update;
   if found and shift_row.company_id<>p_company then raise exception 'An active GPS shift belongs to another company';end if;
   if not found then
    insert into public.gr_field_sessions(company_id,user_id,checkin_lat,checkin_lng,checkin_accuracy_m)
    values(p_company,p_actor,p_lat,p_lng,p_accuracy) returning * into shift_row;
   end if;
   insert into public.gr_field_points(session_id,company_id,user_id,lat,lng,accuracy_m)
   values(shift_row.id,p_company,p_actor,p_lat,p_lng,p_accuracy);
  elsif p_mode='out' then
   update public.grm_attendance set check_out_lat=p_lat,check_out_lng=p_lng,
    check_out_accuracy_m=p_accuracy where id=rec.id returning * into rec;
   select * into shift_row from public.gr_field_sessions where user_id=p_actor and checkout_at is null for update;
   if found then
    update public.gr_field_sessions set checkout_at=now(),checkout_lat=p_lat,checkout_lng=p_lng,
     checkout_accuracy_m=p_accuracy where id=shift_row.id;
    insert into public.gr_field_points(session_id,company_id,user_id,lat,lng,accuracy_m)
    values(shift_row.id,shift_row.company_id,p_actor,p_lat,p_lng,p_accuracy);
   end if;
  end if;
 end if;
 return rec;
end $$;
revoke all on function public.grm_clock_with_location(uuid,text,inet,text,double precision,double precision,double precision) from public,anon,authenticated;
grant execute on function public.grm_clock_with_location(uuid,text,inet,text,double precision,double precision,double precision) to service_role;

-- Atomic visit close: server enforces GPS, report, configurable photos, sales result and follow-up.
create or replace function public.gr_field_finish_visit_v2(
 p_visit uuid,p_notes text,p_heat text,p_lat double precision,p_lng double precision,p_accuracy double precision,
 p_outcome text default null,p_followup_to uuid default null,p_followup_at timestamptz default null,p_followup_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.gr_field_visits%rowtype;v_due timestamptz;v_next uuid:=null;v_required boolean;v_min integer;
begin
 select * into v from public.gr_field_visits where id=p_visit and assigned_to=auth.uid() for update;
 if not found or v.status<>'on_site' or v.completed_at is not null then
  raise exception 'Arrive at your assigned visit before completing it';end if;
 if not public.gr_field_member(v.company_id) then raise exception 'Company access revoked';end if;
 select coalesce(r.photo_required,v.visit_type in ('sales','site')),coalesce(r.min_notes,10)
 into v_required,v_min from (select 1) t
 left join public.gr_field_visit_rules r on r.company_id=v.company_id and r.visit_type=v.visit_type;
 if length(btrim(coalesce(p_notes,'')))<v_min then raise exception 'Visit notes are required (minimum % characters)',v_min;end if;
 if v_required and not exists(select 1 from public.gr_field_photos where visit_id=v.id)
 then raise exception 'Upload a GPS-stamped photo before completing this visit';end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90
  or p_lng not between -180 and 180 or p_accuracy not between 0 and 3000
 then raise exception 'Current completion GPS location required';end if;
 if p_heat is not null and (v.visit_type not in ('sales','site') or v.lead_id is null or p_heat not in ('Hot','Warm','Cold'))
 then raise exception 'Hot/Warm/Cold requires a sales/site visit linked to a lead';end if;
 if p_outcome is not null and (v.visit_type not in ('sales','site') or p_outcome not in ('converted','follow_up','not_interested','pending'))
 then raise exception 'Invalid sales visit outcome';end if;
 if (p_followup_to is null)<>(p_followup_at is null)
 then raise exception 'Choose both follow-up employee and date or leave both blank';end if;
 if p_followup_to is not null then
  if p_followup_at<now()-interval '1 minute' or length(btrim(coalesce(p_followup_note,'')))<5
  then raise exception 'Enter a future follow-up date and notes (minimum 5 characters)';end if;
  if not exists(select 1 from public.gr_profiles p where p.id=p_followup_to and p.active and v.company_id=any(p.company_ids))
  then raise exception 'Follow-up assignee must be an active employee in this company';end if;
 end if;
 update public.gr_field_visits set status='completed',completed_at=now(),completed_lat=p_lat,
  completed_lng=p_lng,completed_accuracy_m=p_accuracy,completion_notes=left(btrim(p_notes),4000),
  lead_heat=p_heat,sales_outcome=p_outcome,updated_at=now() where id=v.id;
 if p_heat is not null then
  update public.gr_lead_pipeline set lead_heat=p_heat,updated_at=now() where company_id=v.company_id and lead_id=v.lead_id;
  if not found then raise exception 'Associated CRM lead could not be updated';end if;
 end if;
 if p_followup_to is not null then
  insert into public.gr_field_visit_followups(company_id,visit_id,assigned_to,created_by,due_at,notes)
  values(v.company_id,v.id,p_followup_to,auth.uid(),p_followup_at,left(btrim(p_followup_note),2000));
 end if;
 if v.visit_type='service' and v.recurrence_every is not null then
  v_due:=greatest(v.due_at,now())+case v.recurrence_unit
   when 'days' then make_interval(days=>v.recurrence_every)
   when 'weeks' then make_interval(weeks=>v.recurrence_every)
   else make_interval(months=>v.recurrence_every) end;
  if v.recurrence_end is null or (v_due at time zone 'Asia/Kolkata')::date<=v.recurrence_end then
   insert into public.gr_field_visits(company_id,visit_type,title,customer_id,lead_id,contact_name,contact_phone,address,
    assigned_to,created_by,due_at,notes,recurrence_every,recurrence_unit,recurrence_end,previous_visit_id)
   values(v.company_id,v.visit_type,v.title,v.customer_id,v.lead_id,v.contact_name,v.contact_phone,v.address,
    v.assigned_to,v.created_by,v_due,v.notes,v.recurrence_every,v.recurrence_unit,v.recurrence_end,v.id)
   on conflict(previous_visit_id) do nothing returning id into v_next;
  end if;
 end if;
 return v_next;
end $$;
revoke all on function public.gr_field_finish_visit_v2(uuid,text,text,double precision,double precision,double precision,text,uuid,timestamptz,text) from public,anon;
grant execute on function public.gr_field_finish_visit_v2(uuid,text,text,double precision,double precision,double precision,text,uuid,timestamptz,text) to authenticated;


-- Every company employee can be assigned a follow-up, without exposing private profile fields.
create or replace function public.gr_field_followup_directory(p_company text)
returns table(id uuid,full_name text) language sql stable security definer set search_path='' as $$
 select p.id,p.full_name from public.gr_profiles p
 where public.gr_field_member(p_company) and p.active and p_company=any(p.company_ids)
 order by p.full_name
$$;
revoke all on function public.gr_field_followup_directory(text) from public,anon;
grant execute on function public.gr_field_followup_directory(text) to authenticated;

-- Service and Installation are now distinct visit types.
create or replace function public.gr_field_create_visit(
 p_company text,p_type text,p_title text,p_contact text,p_phone text,p_address text,
 p_assignee uuid,p_due timestamptz,p_customer uuid default null,p_lead text default null,
 p_repeat_every integer default null,p_repeat_unit text default null,p_repeat_end date default null,
 p_notes text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_assignee uuid:=coalesce(p_assignee,auth.uid());
begin
 if not public.gr_field_can_assign(p_company,v_assignee) then raise exception 'Cannot assign a field visit to this employee';end if;
 if p_type not in ('service','sales','site','installation') or length(btrim(coalesce(p_title,''))) not between 3 and 160
  or p_due is null or p_due<now()-interval '24 hours'
 then raise exception 'Valid visit type, title and scheduled date required';end if;
 if (p_repeat_every is null) <> (p_repeat_unit is null) or
 (p_repeat_every is not null and (p_type<>'service' or p_repeat_every not between 1 and 365 or p_repeat_unit not in ('days','weeks','months')))
 then raise exception 'Repeat interval is allowed for service visits only';end if;
 if p_customer is not null and not exists(select 1 from public.gr_crm_customers where id=p_customer)
 then raise exception 'CRM customer does not exist';end if;
 if p_lead is not null and not exists(select 1 from public.gr_lead_pipeline where company_id=p_company and lead_id=p_lead)
 then raise exception 'Lead not found in selected company';end if;
 insert into public.gr_field_visits(company_id,visit_type,title,contact_name,contact_phone,address,assigned_to,created_by,
 due_at,customer_id,lead_id,recurrence_every,recurrence_unit,recurrence_end,notes)
 values(p_company,p_type,btrim(p_title),left(coalesce(p_contact,''),160),left(coalesce(p_phone,''),30),
  left(coalesce(p_address,''),650),v_assignee,auth.uid(),p_due,p_customer,p_lead,p_repeat_every,p_repeat_unit,
  p_repeat_end,left(coalesce(p_notes,''),2000)) returning id into v_id;
 return v_id;
end $$;

-- Assigned employees can complete their own follow-up task; no direct client table writes.
create or replace function public.gr_field_complete_followup(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_company text;
begin
 select company_id into v_company from public.gr_field_visit_followups
 where id=p_id and assigned_to=auth.uid() and status='pending' for update;
 if not found or not public.gr_field_member(v_company) then raise exception 'Assigned pending follow-up not found';end if;
 update public.gr_field_visit_followups set status='done' where id=p_id;
end $$;
revoke all on function public.gr_field_complete_followup(uuid) from public,anon;
grant execute on function public.gr_field_complete_followup(uuid) to authenticated;

-- Only Admin-designated field employees may start a GPS shift or send periodic points.
create or replace function public.gr_field_clock_in(p_company text,p_lat double precision,p_lng double precision,p_accuracy double precision)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.gr_field_member(p_company) then raise exception 'Not assigned to this company';end if;
 if not exists(select 1 from public.gr_field_staff_policies a where a.company_id=p_company and a.user_id=auth.uid() and a.enabled) then raise exception 'Admin has not enabled field GPS for this employee';end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 3000
 then raise exception 'Valid GPS location (accuracy within 3 km) required';end if;
 if exists(select 1 from public.gr_field_sessions where user_id=auth.uid() and checkout_at is null)
 then raise exception 'Check out of the existing field shift first';end if;
 insert into public.gr_field_sessions(company_id,user_id,checkin_lat,checkin_lng,checkin_accuracy_m)
 values(p_company,auth.uid(),p_lat,p_lng,p_accuracy) returning id into v_id;
 insert into public.gr_field_points(session_id,company_id,user_id,lat,lng,accuracy_m)
 values(v_id,p_company,auth.uid(),p_lat,p_lng,p_accuracy);
 return v_id;
end $$;
create or replace function public.gr_field_record_point(p_session uuid,p_lat double precision,p_lng double precision,p_accuracy double precision)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.gr_field_sessions%rowtype;
begin
 select * into v from public.gr_field_sessions where id=p_session and user_id=auth.uid() and checkout_at is null;
 if not found or not public.gr_field_member(v.company_id) then raise exception 'Active shift required';end if;
 if not exists(select 1 from public.gr_field_staff_policies a where a.company_id=v.company_id and a.user_id=auth.uid() and a.enabled) then raise exception 'Field GPS access has been disabled by Admin';end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 3000
 then return false;end if;
 if exists(select 1 from public.gr_field_points where session_id=p_session and recorded_at>now()-interval '45 seconds') then return false;end if;
 insert into public.gr_field_points(session_id,company_id,user_id,lat,lng,accuracy_m)
 values(p_session,v.company_id,auth.uid(),p_lat,p_lng,p_accuracy);
 return true;
end $$;
