-- GreenRich Field Tracking PILOT (isolated from production attendance/payroll).
-- Explicit per-shift foreground tracking; private photos; own/team/company RLS.
-- No scheduled jobs, silent GPS collection, or live main-CRM menu changes.

create table if not exists public.gr_field_supervisors (
  company_id text not null references public.gr_companies(id),
  user_id uuid not null references public.gr_profiles(id),
  granted_by uuid not null references public.gr_profiles(id),
  created_at timestamptz not null default now(),
  primary key(company_id,user_id)
);

create or replace function public.gr_field_member(p_company text,p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and p_user=(select auth.uid()) and exists(
  select 1 from public.gr_profiles p
  where p.id=p_user and p.active and p_company=any(p.company_ids)
 );
$$;

create or replace function public.gr_field_supervisor(p_company text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.gr_field_member(p_company) and exists (
  select 1 from public.gr_profiles p
  left join public.gr_roles r on r.id=p.role_id
  where p.id=(select auth.uid()) and (
   r.name in ('Admin','Director','Sales Head')
   or exists(select 1 from public.gr_field_supervisors s
             where s.company_id=p_company and s.user_id=p.id)
   or exists(select 1 from public.gr_profiles t where t.manager_id=p.id and t.active and p_company=any(t.company_ids))
  )
 );
$$;

create or replace function public.gr_field_can_see(p_company text,p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.gr_field_member(p_company) and exists(
  select 1 from public.gr_profiles employee where employee.id=p_employee
   and employee.active and p_company=any(employee.company_ids)
 ) and ((select auth.uid())=p_employee or public.gr_field_supervisor(p_company));
$$;

create or replace function public.gr_field_can_assign(p_company text,p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.gr_field_member(p_company) and exists(
  select 1 from public.gr_profiles employee
  where employee.id=p_employee and employee.active and p_company=any(employee.company_ids)
 ) and ((select auth.uid())=p_employee or public.gr_field_supervisor(p_company));
$$;

create or replace function public.gr_field_is_admin(p_company text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.gr_field_member(p_company) and exists(
  select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
  where p.id=auth.uid() and r.name in ('Admin','Director')
 );
$$;

revoke all on function public.gr_field_member(text,uuid),public.gr_field_supervisor(text),
 public.gr_field_can_see(text,uuid),public.gr_field_can_assign(text,uuid),
 public.gr_field_is_admin(text) from public,anon;
grant execute on function public.gr_field_member(text,uuid),public.gr_field_supervisor(text),
 public.gr_field_can_see(text,uuid),public.gr_field_can_assign(text,uuid),
 public.gr_field_is_admin(text) to authenticated;

create table if not exists public.gr_field_sessions(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 user_id uuid not null references public.gr_profiles(id),
 checkin_at timestamptz not null default now(),
 checkin_lat double precision not null check(checkin_lat between -90 and 90),
 checkin_lng double precision not null check(checkin_lng between -180 and 180),
 checkin_accuracy_m double precision not null check(checkin_accuracy_m between 0 and 3000),
 checkout_at timestamptz,
 checkout_lat double precision check(checkout_lat between -90 and 90),
 checkout_lng double precision check(checkout_lng between -180 and 180),
 checkout_accuracy_m double precision check(checkout_accuracy_m between 0 and 3000),
 created_at timestamptz not null default now(),
 constraint gr_field_session_close_complete check (
  (checkout_at is null and checkout_lat is null and checkout_lng is null and checkout_accuracy_m is null)
  or (checkout_at is not null and checkout_lat is not null and checkout_lng is not null and checkout_accuracy_m is not null and checkout_at>=checkin_at))
);
create unique index if not exists gr_field_one_open_session on public.gr_field_sessions(user_id) where checkout_at is null;
create index if not exists gr_field_sessions_company_time on public.gr_field_sessions(company_id,checkin_at desc);

create table if not exists public.gr_field_points (
 id bigint generated always as identity primary key,
 session_id uuid not null references public.gr_field_sessions(id) on delete cascade,
 company_id text not null references public.gr_companies(id),
 user_id uuid not null references public.gr_profiles(id),
 lat double precision not null check(lat between -90 and 90),
 lng double precision not null check(lng between -180 and 180),
 accuracy_m double precision not null check(accuracy_m between 0 and 3000),
 recorded_at timestamptz not null default now()
);
create index if not exists gr_field_points_session_time on public.gr_field_points(session_id,recorded_at desc);
create index if not exists gr_field_points_company_time on public.gr_field_points(company_id,recorded_at desc);

create table if not exists public.gr_field_visits(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 visit_type text not null check(visit_type in ('service','sales','site')),
 title text not null check(length(btrim(title)) between 3 and 160),
 customer_id uuid references public.gr_crm_customers(id),
 lead_id text,
 contact_name text not null default '',
 contact_phone text not null default '',
 address text not null default '',
 assigned_to uuid not null references public.gr_profiles(id),
 created_by uuid not null references public.gr_profiles(id),
 due_at timestamptz not null,
 status text not null default 'planned' check(status in ('planned','traveling','on_site','completed','cancelled')),
 arrival_at timestamptz,
 arrival_lat double precision check(arrival_lat between -90 and 90),
 arrival_lng double precision check(arrival_lng between -180 and 180),
 arrival_accuracy_m double precision check(arrival_accuracy_m between 0 and 3000),
 completed_at timestamptz,
 completed_lat double precision check(completed_lat between -90 and 90),
 completed_lng double precision check(completed_lng between -180 and 180),
 completed_accuracy_m double precision check(completed_accuracy_m between 0 and 3000),
 notes text not null default '',
 completion_notes text not null default '',
 lead_heat text check(lead_heat in ('Hot','Warm','Cold')),
 recurrence_every integer check(recurrence_every between 1 and 365),
 recurrence_unit text check(recurrence_unit in ('days','weeks','months')),
 recurrence_end date,
 previous_visit_id uuid unique references public.gr_field_visits(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint gr_field_recurrence_pair check ((recurrence_every is null)=(recurrence_unit is null)),
 constraint gr_field_visit_arrival_pair check ((arrival_at is null)=(arrival_lat is null) and (arrival_at is null)=(arrival_lng is null)),
 constraint gr_field_visit_finish_pair check ((completed_at is null)=(completed_lat is null) and (completed_at is null)=(completed_lng is null)),
 constraint gr_field_visit_lead_key check(lead_id is null or length(lead_id) between 1 and 160)
);
create index if not exists gr_field_visits_staff_due on public.gr_field_visits(assigned_to,status,due_at);
create index if not exists gr_field_visits_company_due on public.gr_field_visits(company_id,due_at desc);

create table if not exists public.gr_field_photos(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 visit_id uuid not null references public.gr_field_visits(id),
 uploaded_by uuid not null references public.gr_profiles(id),
 object_path text not null unique,
 notes text not null default '',
 lat double precision not null check(lat between -90 and 90),
 lng double precision not null check(lng between -180 and 180),
 accuracy_m double precision not null check(accuracy_m between 0 and 3000),
 captured_at timestamptz not null default now()
);
create index if not exists gr_field_photos_visit on public.gr_field_photos(visit_id,captured_at desc);

alter table public.gr_field_supervisors enable row level security;
alter table public.gr_field_sessions enable row level security;
alter table public.gr_field_points enable row level security;
alter table public.gr_field_visits enable row level security;
alter table public.gr_field_photos enable row level security;

drop policy if exists field_supervisors_view on public.gr_field_supervisors;
create policy field_supervisors_view on public.gr_field_supervisors for select to authenticated
 using (public.gr_field_is_admin(company_id) or (user_id=auth.uid() and public.gr_field_member(company_id)));
drop policy if exists field_sessions_view on public.gr_field_sessions;
create policy field_sessions_view on public.gr_field_sessions for select to authenticated
 using(public.gr_field_can_see(company_id,user_id));
drop policy if exists field_points_view on public.gr_field_points;
create policy field_points_view on public.gr_field_points for select to authenticated
 using(public.gr_field_can_see(company_id,user_id));
drop policy if exists field_visits_view on public.gr_field_visits;
create policy field_visits_view on public.gr_field_visits for select to authenticated
 using(public.gr_field_can_see(company_id,assigned_to) or (created_by=auth.uid() and public.gr_field_member(company_id)));
drop policy if exists field_photos_view on public.gr_field_photos;
create policy field_photos_view on public.gr_field_photos for select to authenticated
 using(exists(select 1 from public.gr_field_visits v where v.id=visit_id
       and (public.gr_field_can_see(v.company_id,v.assigned_to) or
        (v.created_by=auth.uid() and public.gr_field_member(v.company_id)))));

-- All field inserts/updates go through server-side checked RPCs, not arbitrary browser writes.
revoke all on public.gr_field_supervisors,public.gr_field_sessions,
 public.gr_field_points,public.gr_field_visits,public.gr_field_photos from public,anon,authenticated;
grant select on public.gr_field_supervisors,public.gr_field_sessions,
 public.gr_field_points,public.gr_field_visits,public.gr_field_photos to authenticated;
grant usage,select on sequence public.gr_field_points_id_seq to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('gr-field-visit-proofs','gr-field-visit-proofs',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,
 allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists field_visit_proof_upload on storage.objects;
create policy field_visit_proof_upload on storage.objects for insert to authenticated
 with check (bucket_id='gr-field-visit-proofs'
 and split_part(name,'/',3)=auth.uid()::text
 and exists (select 1 from public.gr_field_visits v
  where v.company_id=split_part(name,'/',1)
    and v.id::text=split_part(name,'/',2)
    and v.assigned_to=auth.uid() and v.status='on_site'
    and public.gr_field_member(v.company_id))
 and lower(substring(name from '\.[^.]+$')) in ('.jpg','.jpeg','.png','.webp'));
drop policy if exists field_visit_proof_view on storage.objects;
create policy field_visit_proof_view on storage.objects for select to authenticated
 using (bucket_id='gr-field-visit-proofs' and exists (
  select 1 from public.gr_field_photos f join public.gr_field_visits v on v.id=f.visit_id
  where f.object_path=name and (public.gr_field_can_see(v.company_id,v.assigned_to)
    or (v.created_by=auth.uid() and public.gr_field_member(v.company_id)))) );

-- Staff check-in/check-out timestamps always generated by PostgreSQL server.
create or replace function public.gr_field_clock_in(p_company text,p_lat double precision,p_lng double precision,p_accuracy double precision)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.gr_field_member(p_company) then raise exception 'Not assigned to this company';end if;
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

create or replace function public.gr_field_clock_out(p_session uuid,p_lat double precision,p_lng double precision,p_accuracy double precision)
returns void language plpgsql security definer set search_path='' as $$
declare v public.gr_field_sessions%rowtype;
begin
 select * into v from public.gr_field_sessions where id=p_session and user_id=auth.uid() and checkout_at is null for update;
 if not found then raise exception 'No active shift belonging to you';end if;
 if not public.gr_field_member(v.company_id) then raise exception 'Company access revoked';end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 3000
 then raise exception 'Current GPS location required for check out';end if;
 update public.gr_field_sessions set checkout_at=now(),checkout_lat=p_lat,checkout_lng=p_lng,checkout_accuracy_m=p_accuracy where id=v.id;
 insert into public.gr_field_points(session_id,company_id,user_id,lat,lng,accuracy_m)
 values(v.id,v.company_id,auth.uid(),p_lat,p_lng,p_accuracy);
end $$;

create or replace function public.gr_field_record_point(p_session uuid,p_lat double precision,p_lng double precision,p_accuracy double precision)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.gr_field_sessions%rowtype;
begin
 select * into v from public.gr_field_sessions where id=p_session and user_id=auth.uid() and checkout_at is null;
 if not found or not public.gr_field_member(v.company_id) then raise exception 'Active shift required';end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 3000
 then return false;end if;
 if exists(select 1 from public.gr_field_points where session_id=p_session and recorded_at>now()-interval '45 seconds') then return false;end if;
 insert into public.gr_field_points(session_id,company_id,user_id,lat,lng,accuracy_m)
 values(p_session,v.company_id,auth.uid(),p_lat,p_lng,p_accuracy);
 return true;
end $$;

create or replace function public.gr_field_create_visit(
 p_company text,p_type text,p_title text,p_contact text,p_phone text,p_address text,
 p_assignee uuid,p_due timestamptz,p_customer uuid default null,p_lead text default null,
 p_repeat_every integer default null,p_repeat_unit text default null,p_repeat_end date default null,
 p_notes text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_assignee uuid:=coalesce(p_assignee,auth.uid());
begin
 if not public.gr_field_can_assign(p_company,v_assignee) then raise exception 'Cannot assign a field visit to this employee';end if;
 if p_type not in ('service','sales','site') or length(btrim(coalesce(p_title,''))) not between 3 and 160
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

create or replace function public.gr_field_arrive(p_visit uuid,p_lat double precision,p_lng double precision,p_accuracy double precision)
returns void language plpgsql security definer set search_path='' as $$
declare v public.gr_field_visits%rowtype;
begin
 select * into v from public.gr_field_visits where id=p_visit and assigned_to=auth.uid() for update;
 if not found or v.status not in ('planned','traveling') or v.arrival_at is not null then raise exception 'Visit must be assigned and not yet arrived';end if;
 if not public.gr_field_member(v.company_id) or not exists(
 select 1 from public.gr_field_sessions where user_id=auth.uid() and company_id=v.company_id and checkout_at is null)
 then raise exception 'Check in to this company field shift before arriving';end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 3000
 then raise exception 'Current GPS location required';end if;
 update public.gr_field_visits set arrival_at=now(),arrival_lat=p_lat,arrival_lng=p_lng,arrival_accuracy_m=p_accuracy,
 status='on_site',updated_at=now() where id=p_visit;
end $$;

create or replace function public.gr_field_add_photo(p_visit uuid,p_path text,p_note text,p_lat double precision,p_lng double precision,p_accuracy double precision)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.gr_field_visits%rowtype;v_id uuid;
begin
 select * into v from public.gr_field_visits where id=p_visit and assigned_to=auth.uid() and status='on_site';
 if not found or not public.gr_field_member(v.company_id) then raise exception 'Active on-site visit required';end if;
 if p_path is null or p_path not like v.company_id||'/'||v.id::text||'/'||auth.uid()::text||'/%'
  or length(p_path)>400 or not exists(select 1 from storage.objects where bucket_id='gr-field-visit-proofs' and name=p_path)
 then raise exception 'Private uploaded service photo not found';end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 3000
 then raise exception 'Photo GPS proof is required';end if;
 if (select count(*) from public.gr_field_photos where visit_id=p_visit)>=10 then raise exception 'Limit 10 photos per visit';end if;
 insert into public.gr_field_photos(company_id,visit_id,uploaded_by,object_path,notes,lat,lng,accuracy_m)
 values(v.company_id,v.id,auth.uid(),p_path,left(coalesce(p_note,''),1000),p_lat,p_lng,p_accuracy) returning id into v_id;
 return v_id;
end $$;

create or replace function public.gr_field_finish_visit(
 p_visit uuid,p_notes text,p_heat text,p_lat double precision,p_lng double precision,p_accuracy double precision)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.gr_field_visits%rowtype;v_due timestamptz;v_next uuid:=null;
begin
 select * into v from public.gr_field_visits where id=p_visit and assigned_to=auth.uid() for update;
 if not found or v.status<>'on_site' or v.completed_at is not null
 then raise exception 'Arrive at your assigned visit before completing it';end if;
 if not public.gr_field_member(v.company_id) then raise exception 'Company access revoked';end if;
 if length(btrim(coalesce(p_notes,'')))<10 then raise exception 'Write at least 10 characters of visit report';end if;
 if not exists(select 1 from public.gr_field_photos where visit_id=v.id)
 then raise exception 'Upload at least one GPS-stamped proof photo before completing';end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 3000
 then raise exception 'Current completion GPS location required';end if;
 if p_heat is not null and (v.visit_type='service' or v.lead_id is null or p_heat not in ('Hot','Warm','Cold'))
 then raise exception 'Hot/Warm/Cold requires a sales or site visit linked to a lead';end if;
 update public.gr_field_visits set status='completed',completed_at=now(),completed_lat=p_lat,
 completed_lng=p_lng,completed_accuracy_m=p_accuracy,completion_notes=left(btrim(p_notes),4000),lead_heat=p_heat,
 updated_at=now() where id=v.id;
 if p_heat is not null then
  update public.gr_lead_pipeline set lead_heat=p_heat,updated_at=now()
  where company_id=v.company_id and lead_id=v.lead_id;
  if not found then raise exception 'Associated CRM lead could not be updated';end if;
 end if;
 if v.visit_type='service' and v.recurrence_every is not null then
  v_due:=greatest(v.due_at,now())+
   case v.recurrence_unit when 'days' then make_interval(days=>v.recurrence_every)
    when 'weeks' then make_interval(weeks=>v.recurrence_every)
    else make_interval(months=>v.recurrence_every) end;
  if v.recurrence_end is null or (v_due at time zone 'Asia/Kolkata')::date <= v.recurrence_end then
   insert into public.gr_field_visits(company_id,visit_type,title,customer_id,lead_id,contact_name,contact_phone,address,
     assigned_to,created_by,due_at,notes,recurrence_every,recurrence_unit,recurrence_end,previous_visit_id)
   values(v.company_id,v.visit_type,v.title,v.customer_id,v.lead_id,v.contact_name,v.contact_phone,v.address,
     v.assigned_to,v.created_by,v_due,v.notes,v.recurrence_every,v.recurrence_unit,v.recurrence_end,v.id)
   on conflict(previous_visit_id) do nothing returning id into v_next;
  end if;
 end if;
 return v_next;
end $$;

create or replace function public.gr_field_assign_supervisor(p_company text,p_user uuid,p_enable boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.gr_field_is_admin(p_company) then raise exception 'Only company Admin/Director may grant tracking dashboard access';end if;
 if not exists(select 1 from public.gr_profiles where id=p_user and active and p_company=any(company_ids))
 then raise exception 'Employee not assigned to company';end if;
 if p_enable then
  insert into public.gr_field_supervisors(company_id,user_id,granted_by)
  values(p_company,p_user,auth.uid())
  on conflict(company_id,user_id) do nothing;
 else
  delete from public.gr_field_supervisors where company_id=p_company and user_id=p_user;
 end if;
end $$;

revoke all on function public.gr_field_clock_in(text,double precision,double precision,double precision),
 public.gr_field_clock_out(uuid,double precision,double precision,double precision),
 public.gr_field_record_point(uuid,double precision,double precision,double precision),
 public.gr_field_create_visit(text,text,text,text,text,text,uuid,timestamptz,uuid,text,integer,text,date,text),
 public.gr_field_arrive(uuid,double precision,double precision,double precision),
 public.gr_field_add_photo(uuid,text,text,double precision,double precision,double precision),
 public.gr_field_finish_visit(uuid,text,text,double precision,double precision,double precision),
 public.gr_field_assign_supervisor(text,uuid,boolean) from public,anon;
grant execute on function public.gr_field_clock_in(text,double precision,double precision,double precision),
 public.gr_field_clock_out(uuid,double precision,double precision,double precision),
 public.gr_field_record_point(uuid,double precision,double precision,double precision),
 public.gr_field_create_visit(text,text,text,text,text,text,uuid,timestamptz,uuid,text,integer,text,date,text),
 public.gr_field_arrive(uuid,double precision,double precision,double precision),
 public.gr_field_add_photo(uuid,text,text,double precision,double precision,double precision),
 public.gr_field_finish_visit(uuid,text,text,double precision,double precision,double precision),
 public.gr_field_assign_supervisor(text,uuid,boolean) to authenticated;
