'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');
const migration=read('supabase/migrations/20261104090000_field_staff_attendance_visit_rules.sql');
const client=read('greenrich-field-gps.js'),settings=read('greenrich-field-settings.js');
const tracker=read('field-tracker.js'),shell=read('greenrich-one.js'),page=read('secure.html');
const api=read('supabase/functions/attendance-api/controllers/attendance.controller.ts');
const service=read('supabase/functions/attendance-api/services/attendance.service.ts');
for(const f of ['greenrich-field-gps.js','greenrich-field-settings.js','field-tracker.js','greenrich-one.js','greenrich-company-admin.js'])
 new vm.Script(read(f),{filename:f});
for(const table of ['gr_field_staff_policies','gr_field_visit_rules','gr_field_visit_followups'])
 assert.match(migration,new RegExp('create table if not exists public\\.'+table));
assert.equal((migration.match(/enable row level security;/g)||[]).length>=3,true,'GPS and follow-up tables must use RLS');
for(const action of ['gr_field_admin_config','gr_field_assign_staff','gr_field_update_visit_rule','gr_field_my_enabled_companies','gr_field_finish_visit_v2','gr_field_followup_directory'])
 assert.ok(migration.includes('function public.'+action),'Server function missing: '+action);
assert.ok(migration.includes('if not public.gr_field_is_admin(p_company)'),'Admin policy required');
assert.ok(migration.includes("revoke all on function public.grm_clock_with_location"),'Browser must not call privileged clock');
assert.match(migration,/if v_required and not exists\(select 1 from public\.gr_field_photos/);
assert.match(migration,/if length\(btrim\(coalesce\(p_notes,''\)\)\)<v_min/);
assert.match(migration,/Current completion GPS location required/);
assert.match(migration,/gr_field_visit_followups\(company_id,visit_id,assigned_to,created_by,due_at,notes\)/);
assert.ok(settings.includes("service:false")&&settings.includes("installation:false"),'Service photo optional by default');
assert.ok(settings.includes("sales:true"),'Sales photos mandatory by default');
assert.ok(shell.includes("window.GreenRichFieldGPS.attendanceBody(db)"),'Header attendance location missing');
assert.ok(page.includes('greenrich-field-gps.js')&&page.includes('greenrich-field-settings.js'),'Modules must be loaded');
assert.ok(api.includes('await bodyJSON(req)')&&service.includes("grm_clock_with_location"),'Official attendance must save GPS atomically');
assert.ok(client.includes("document.visibilityState!=='visible'"),'Never promise hidden/background tracking');
assert.ok(client.includes("gr_field_record_point"),'GPS updates must persist through scoped RPC');
assert.ok(tracker.includes("gr_field_finish_visit_v2")&&tracker.includes("policy.photo_required"),'Visit completion must use configurable rules');
assert.ok(tracker.includes('followupTo')&&tracker.includes('sales_outcome'),'Follow-up and sales outcomes required');
assert.ok(tracker.includes('Customer site:'),'Map should show known site GPS markers');
console.log('PASS: field GPS attendance, Admin rules, visit closure, follow-up and map static contract');
