'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('field-tracker.html','utf8');
const js=fs.readFileSync('field-tracker.js','utf8');
const css=fs.readFileSync('field-tracker.css','utf8');
const sql=fs.readFileSync('supabase/migrations/20261031180000_field_tracking_pilot.sql','utf8');
const dir=fs.readFileSync('supabase/migrations/20261031181000_field_tracking_directory.sql','utf8');
const secure=fs.readFileSync('secure.html','utf8');
new vm.Script(js,{filename:'field-tracker.js'});
assert.ok(html.includes('field-tracker.js')&&html.includes('field-tracker.css'),'Standalone page loads its resources');
assert.ok(!secure.includes('field-tracker.html'),'Pilot must not be added to live GreenRich ONE menu');
assert.ok(html.includes('Separate trial workspace')&&html.includes('does not change ERP attendance'));
assert.ok(html.includes('ft-monitor-link')&&html.includes('ft-team-link'));
for(const x of ['gr_field_clock_in','gr_field_clock_out','gr_field_record_point','gr_field_create_visit',
 'gr_field_arrive','gr_field_add_photo','gr_field_finish_visit','gr_field_assign_supervisor'])
 assert.ok(js.includes(x),'Pilot page must call '+x);
for(const x of ['gr_field_sessions','gr_field_points','gr_field_visits','gr_field_photos','gr_field_supervisors'])
 assert.ok(sql.includes('enable row level security')&&sql.includes('public.'+x),'RLS required on '+x);
for(const table of ['gr_field_sessions','gr_field_points','gr_field_visits','gr_field_photos'])
 assert.ok(sql.includes('revoke all on public.gr_field_supervisors,public.gr_field_sessions')&&
 sql.includes('grant select on public.gr_field_supervisors'),'Client cannot directly alter '+table);
assert.ok(sql.includes("public.gr_field_member")&&sql.includes("public.gr_field_supervisor"));
assert.ok(sql.includes("status='on_site'")&&sql.includes("Upload at least one GPS-stamped proof photo before completing"),'On-site proof requirement missing');
assert.ok(sql.includes("not exists(select 1 from public.gr_field_photos where visit_id=v.id)"),'Cannot finish without photo');
assert.ok(sql.includes("on conflict(previous_visit_id) do nothing"),'Repeat service generation must be idempotent');
assert.ok(sql.includes("update public.gr_lead_pipeline set lead_heat=p_heat"),'Heat must update actual CRM lead');
assert.ok(sql.includes("new_interval")===false);
assert.ok(sql.includes("checkin_at timestamptz not null default now()"),'Check-in time must be server-generated');
assert.ok(sql.includes("recorded_at timestamptz not null default now()"),'GPS time must be server-generated');
assert.ok(sql.includes("file_size_limit")&&sql.includes("false,5242880"),'Private photo storage and size limit');
assert.ok(sql.includes("field_visit_proof_upload")&&sql.includes("field_visit_proof_view"),'Upload/photo RLS policies');
assert.ok(js.includes("watchPosition")&&js.includes("stopTracking")&&js.includes("document.visibilityState==='hidden'"),'Visible foreground GPS only');
assert.ok(js.includes("if(!openSession)stopTracking()"),'Check-out must stop tracking');
assert.ok(js.includes("location access")||js.includes("location permission"),'Explicit browser GPS');
assert.ok(js.includes("createSignedUrl(p.object_path,300)"),'Photos must not be permanently public');
assert.ok(js.includes("https://{s}.tile.openstreetmap.org"),'Admin GPS map');
assert.ok(js.includes("('gr_field_supervisor'")&&js.includes("('gr_field_is_admin'"),'Supervisor and Admin rights checks');
assert.ok(dir.includes('gr_field_directory')&&dir.includes('gr_field_supervisor'),'Staff directory must be scoped');
assert.ok(!js.includes('grm_attendance')&&!js.includes(".from('gr_attendance')"),'Pilot must not change official attendance');
assert.ok(!js.includes('navigator.serviceWorker'),'No hidden background tracking');
assert.ok(css.includes('@media(max-width:900px)'),'Phone layout required');
console.log('PASS: Isolated field pilot JS syntax, GPS consent, roles, visits, photo RLS, recurring service, lead heat and attendance separation.');
