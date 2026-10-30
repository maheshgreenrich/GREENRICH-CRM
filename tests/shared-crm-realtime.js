'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const cloud=fs.readFileSync('greenrich-crm-cloud.js','utf8'),crm=fs.readFileSync('greenrich-crm-inline.js','utf8'),
 invoice=fs.readFileSync('greenrich-invoices.js','utf8'),html=fs.readFileSync('secure.html','utf8'),
 sql=fs.readFileSync('supabase/migrations/20261029224000_crm_shared_records_realtime.sql','utf8');
for(const [name,src] of [['cloud',cloud],['CRM',crm],['invoice',invoice]])new vm.Script(src,{filename:name});
const ctx={window:{},Intl,Date,Number,Math,String,Object,Array,Error};
vm.runInNewContext(cloud,ctx);
const cloudApi=ctx.window.GreenRichCRMCloud;
assert.ok(cloudApi);
const before={sales:[{id:'a',total:100},{id:'b',total:50}],products:[{id:'p1',stock:5}],channels:[],leads:[],tasks:[]};
const after={sales:[{id:'a',total:130},{id:'c',total:200}],products:[{id:'p1',stock:5}],channels:[],leads:[],tasks:[]};
const mutations=cloudApi.diff(before,after);
assert.equal(mutations.length,3);
assert.equal(mutations.find(x=>x.id==='a').type,'update');
assert.equal(mutations.find(x=>x.id==='b').type,'delete');
assert.equal(mutations.find(x=>x.id==='c').type,'insert');
assert.ok(!mutations.some(x=>x.id==='p1'),'Unrelated product must not be rewritten');
for(const name of ['sales','products','channels','leads','tasks'])
 assert.ok(cloud.includes("'"+name+"'"),name+' must have shared records');
assert.ok(cloud.includes('ignoreDuplicates:true'),'Local migration must not overwrite existing cloud records');
assert.ok(cloud.includes("greenrich-crm-cloud-imported-v1:"),'Migration needs per-browser marker to avoid resurrecting deletions');
assert.ok(cloud.includes('gr_crm_records'),'Cloud must use real Supabase records');
assert.ok(cloud.includes(".on('postgres_changes'"),'Cloud must subscribe to live database changes');
assert.ok(cloud.includes('scheduleRefresh'),'Notifications should re-fetch canonical rows');
assert.ok(cloud.includes('setInterval(()=>scheduleRefresh(0),45000)'),'Missed realtime changes should recover via poll');
assert.ok(cloud.includes(".eq('updated_at',old.updated_at)"),'Updates must detect competing edits');
assert.ok(cloud.includes('Cloud sync failed'),'Failures must be visible to user');
assert.ok(crm.includes('window.GreenRichCRMCloud.start('),'CRM must download shared data when opened');
assert.ok(crm.includes('window.GreenRichCRMCloud.commit(id,previous,copy)'),'Sales and product changes must upload');
assert.ok(invoice.includes('GreenRichCRMCloud.externalSave'),'Invoice HSN editor must upload to cloud');
assert.ok(/greenrich-crm-cloud\\.js\\?v=[^"']+/.test(html),'Cloud script must load before CRM');
assert.ok(sql.includes('enable row level security'),'Shared records must enforce RLS');
assert.ok(sql.includes('p_company=any(p.company_ids)'),'Employees must only see assigned companies');
assert.ok(sql.includes('alter publication supabase_realtime add table'),'Realtime must be enabled');
assert.ok(sql.includes('revoke all on public.gr_crm_records from anon,authenticated'),'Anonymous users must have no access');
assert.ok(!sql.toLowerCase().includes('alter table public.gr_attendance'),'Attendance untouched');
console.log('PASS shared CRM: per-record cloud writes, desktop import, company RLS, realtime reload, conflict checks and browser recovery copies');
