'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('greenrich-whatsapp-crm-workflows.js','utf8');
const anchor=' window.GreenRichWhatsAppWorkflows={configure,mountMarketing,mountSettings,welcomeOptions,saveLeadWelcome,openCustomerRule,openCustomerHistory};';
assert.equal(src.split(anchor).length,2,'Test hook must exist exactly once');
const hook=[
 ' window.__marketingTest={',
 "  seed:(incoming)=>{rows=incoming;app={companies:['grow-india','enviro-solutions'],admin:true};scope='all';selected=new Set();needle='';},",
 '  check:(ids)=>{selected=new Set(ids);},',
 '  search:(query)=>{needle=String(query).toLowerCase();},',
 '  setScope:(value)=>{scope=value;},',
 '  render:()=>audienceView(),',
 '  selected:()=>[...selected],',
 '  sendable:(company)=>campaignTargets(company).map(x=>x.id),',
 '  visible:()=>audience().map(x=>x.id)',
 ' };'
].join('\n');
const fixture=src.replace(anchor,hook+'\n'+anchor);
const win={};vm.runInNewContext(fixture,{window:win,console},{timeout:2000});
const t=win.__marketingTest;
const c1='C:10000000-0000-4000-8000-000000000001';
const c2='C:10000000-0000-4000-8000-000000000002';
const bad='C:10000000-0000-4000-8000-000000000003';
const l1='L:enviro-solutions:20000000-0000-4000-8000-000000000004';
t.seed({
 customers:[
  {id:c1.slice(2),name:'Alpha',mobile:'919876543210',created_at:'2026-10-31',tag_ids:[]},
  {id:c2.slice(2),name:'Beta',mobile:'9655735712',created_at:'2026-10-31',tag_ids:[]},
  {id:bad.slice(2),name:'Backup Phone Customer',mobile:'123',mobile2:'919876543211',created_at:'2026-10-31',tag_ids:[]}
 ],
 leads:[{lead_id:l1.split(':').slice(2).join(':'),company_id:'enviro-solutions',contact:'Other',mobile:'9876543210',tag_ids:[]}],
 campaigns:[],connections:[],templates:[],messages:[],tags:[],profiles:[],consents:[],dispatches:[],products:[]
});
t.check([c1,c2,bad,l1]);
assert.equal(t.sendable('grow-india').length,3,'Customer with valid second mobile is eligible for Grow India');
assert.equal(t.sendable('enviro-solutions').length,4,'Enviro keeps three shared customers and its lead');
t.search('Alpha');
t.render();
assert.equal(t.visible().length,1,'Search filters displayed audience');
assert.equal(t.selected().length,4,'Search redraw must not silently discard selections');
assert.equal(t.sendable('grow-india').length,3,'Hidden selections and second mobile fallback remain sendable');
t.setScope('grow-india');t.render();
assert.equal(t.selected().length,4,'Company filter redraw must keep selections');
assert.equal(t.sendable('grow-india').length,3,'Unassigned shared customers may use chosen sender');
assert.ok(src.includes("case 'grwc-company':scope=v;break;"),'Company dropdown must not clear selection');
assert.ok(src.includes('data-grwc-selected-count'),'Selection count available');
assert.ok(src.indexOf('if(!selected.size)')<src.indexOf("record=await save('gr_wa_campaigns'"),'Empty selection checked before draft creation');
console.log('PASS: Filter redraw retains selected contacts; sender-scoped leads, shared customers, second mobile fallback and empty-selection preflight work.');
