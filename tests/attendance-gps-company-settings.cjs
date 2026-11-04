'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const server=read('supabase/migrations/20261104113000_resolve_attendance_gps_company_from_admin_policy.sql');
const js=read('greenrich-field-gps.js');
const settings=read('greenrich-field-settings.js');
const shell=read('greenrich-one.js');
for(const [path,source] of [['greenrich-field-gps.js',js],['greenrich-field-settings.js',settings],['greenrich-one.js',shell]])
 new vm.Script(source,{filename:path});
assert.ok(server.includes('order by case when a.company_id=p_company then 0 else 1 end'));
assert.ok(server.includes('a.company_id=any(p.company_ids)'),'GPS must only use currently assigned company');
assert.ok(server.includes('and a.enabled'),'GPS must use Admin-enabled policy');
assert.ok(server.includes('resolved_company:=shift_row.company_id'),'Check-out must stay with original shift company');
assert.ok(server.includes("if tracked and (p_lat is null"),'GPS cannot be skipped for tracked employees');
assert.ok(server.includes('p_accuracy not between 0 and 3000'),'GPS accuracy requirement must stay enabled');
assert.ok(server.includes('from public,anon,authenticated'),'Attendance backend cannot allow client to impersonate other employee');
assert.ok(!settings.includes('id="gr-gps-company"'),'Top company selector must be removed');
assert.ok(settings.includes('data-gps-company'),'Independent company group sections must remain');
assert.ok(shell.includes('const controller=new AbortController()'),'Mobile attendance should timeout instead of staying Loading');
assert.ok(shell.includes("actionText.textContent='Retry'"),'Mobile attendance must have retry action');
const context={
 console,window:{isSecureContext:true,GreenRichCompanies:{selected:()=>undefined}},
 document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
 navigator:{geolocation:{getCurrentPosition(s){s({coords:{latitude:11.0123,longitude:76.9567,accuracy:9}})}}},
 setInterval,clearInterval
};
vm.createContext(context);
vm.runInContext(js,context);
const api=context.window.GreenRichFieldGPS;
const db=companies=>({rpc:async name=>{assert.equal(name,'gr_field_my_enabled_companies');return {data:companies,error:null}},
 auth:{getUser:async()=>({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}})}});
(async()=>{
 // New page may be switched to a non-GPS company. Still use the Admin-enabled assignment.
 context.window.GreenRichCompanies.selected=()=> 'enviro-solutions';
 const a=await api.attendanceBody(db(['grow-india']));
 assert.equal(a.companyId,'grow-india');
 assert.equal(a.latitude,11.0123);
 assert.equal(a.accuracy,9);
 // When both companies are enabled, respect the selected company.
 const b=await api.attendanceBody(db(['grow-india','enviro-solutions']));
 assert.equal(b.companyId,'enviro-solutions');
 // Office staff never turn on GPS.
 context.navigator.geolocation.getCurrentPosition=()=>{throw Error('Must not request GPS for office staff')};
 const c=await api.attendanceBody(db([]));
 assert.equal(Object.keys(c).length,0);
 console.log('PASS: attendance GPS company resolved, office time-only, multi-company switch safe, retry UI and no company dropdowns.');
})().catch(e=>{console.error(e);process.exitCode=1});
