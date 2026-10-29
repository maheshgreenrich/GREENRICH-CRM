-- Regression tests, run only after attendance_fixture.sql and all V3 migrations.
\set ON_ERROR_STOP on
select public.grm_admin_attendance(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '2026-10-20','PRESENT',null,null,'Back-office initial mark',false,null
);
do $$
begin
 if (select count(*) from public.grm_attendance where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and date='2026-10-20')<>1 then
  raise exception 'Manual attendance was not created';
 end if;
end $$;
select public.grm_admin_attendance(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '2026-10-20','LATE',null,null,'Correct attendance status',false,null
);
do $$
begin
 if (select status from public.grm_attendance where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and date='2026-10-20')<>'LATE' then
  raise exception 'Manual attendance edit failed';
 end if;
end $$;
select public.grm_admin_bulk(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 array['cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid],
 '2026-10-21','PRESENT','Bulk office mark',null
);
do $$
begin
 if (select count(*) from public.grm_attendance where date='2026-10-21')<>2 then
  raise exception 'Bulk marking failed';
 end if;
end $$;
insert into public.grm_corrections(user_id,date,requested_check_in,requested_check_out,reason)
values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-10-22',
 '2026-10-22 09:30:00+05:30','2026-10-22 18:00:00+05:30','Forgot check-in');
select public.grm_review_correction(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 (select id from public.grm_corrections where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' limit 1),
 'APPROVED','Reviewed shift records',null
);
do $$
begin
 if not exists(select 1 from public.grm_attendance where date='2026-10-22' and status='PRESENT') then
  raise exception 'Correction approval did not update attendance';
 end if;
end $$;
insert into public.grm_leaves(user_id,type,from_date,to_date,reason)
values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Casual Leave','2026-10-23','2026-10-25','Family event');
select public.grm_review_leave(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 (select id from public.grm_leaves where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' limit 1),
 'APPROVED','Leave schedule approved',null
);
select public.grm_admin_config(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','departments','create',null,
 '{"name":"Operations"}'::jsonb,'Department added',null
);
select public.grm_assign_employee(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 (select id from public.grm_departments where name='Operations'),
 (select id from public.grm_shifts where name='Standard Office'),
 'Shift assigned',null
);
do $$
begin
 if (select department_id from public.gr_profiles where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') is null then
  raise exception 'Shift assignment not persisted';
 end if;
 if (select count(*) from public.grm_audit_logs)<5 then
  raise exception 'Audit log missing';
 end if;
end $$;
select public.grm_admin_attendance(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '2026-10-20',null,null,null,'Remove incorrect record',true,null
);
do $$
begin
 if not exists(select 1 from public.grm_attendance
 where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and date='2026-10-20' and deleted_at is not null) then
  raise exception 'Attendance soft delete failed';
 end if;
end $$;
-- Ordinary authenticated users may read only their own attendance.
set role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
do $$
begin
 if exists(select 1 from public.grm_attendance where user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd') then
  raise exception 'Employee can read another employee attendance';
 end if;
end $$;
-- Explicitly deny direct attendance mutation and privileged actor-forging RPCs.
do $$
begin
 begin
  insert into public.grm_attendance(user_id,date,status) values(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-10-26','PRESENT');
  raise exception 'Direct insert unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.grm_admin_attendance(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   '2026-10-22','PRESENT',null,null,'Illegitimate request',false,null);
  raise exception 'Privileged RPC unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select 'Attendance SQL authorization tests passed' as result;
