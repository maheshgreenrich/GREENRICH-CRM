'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="settingsHost"></div>',{url:'https://example.com/secure.html',runScripts:'outside-only'});
const w=dom.window;
w.eval(fs.readFileSync('greenrich-company-admin.js','utf8'));
w.eval(fs.readFileSync('greenrich-field-settings.js','utf8'));
const changes=[];
const entries=[
 {id:'10000000-0000-4000-8000-000000000001',name:'Sales Employee',enabled:false},
 {id:'10000000-0000-4000-8000-000000000002',name:'Office Employee',enabled:false}
];
const db={
 rpc:async(name,args)=>{
  if(name==='gr_field_admin_config')return {data:{staff:entries.map(p=>({...p})),rules:[]},error:null};
  if(name==='gr_field_assign_staff'){
   changes.push(args);
   const p=entries.find(x=>x.id===args.p_user);
   if(!p)return {error:{message:'Unknown employee'}};
   p.enabled=args.p_enabled;
   return {data:null,error:null};
  }
  if(name==='gr_field_update_visit_rule')return {data:null,error:null};
  throw Error('Unexpected RPC '+name);
 },
 from:table=>({
  select:()=>({
   order:async()=>({data:[{id:'grow-india',name:'GreenRich Grow India Pvt Ltd',active:true},{id:'enviro-solutions',name:'GreenRich Enviro Solutions Pvt Ltd',active:true}],error:null})
  })
 })
};
const notifications=[];
const opts={db,companies:['grow-india','enviro-solutions'],notify:s=>notifications.push(s)};
(async()=>{
 const host=w.document.getElementById('settingsHost');
 await w.GreenRichCompanies.mount(host,{
  role:'Admin',user:{id:'10000000-0000-4000-8000-000000000099'},db,initialTab:'fieldaccess',
  openFieldAccess:root=>w.GreenRichFieldSettings.mountAccess(root,opts),
  openFieldSettings:root=>w.GreenRichFieldSettings.mountRules(root,opts)
 });
 const tabs=[...host.querySelectorAll('[data-settings-tab]')];
 assert.equal(tabs[0].dataset.settingsTab,'fieldaccess','GPS access tab must appear first');
 assert.equal(tabs[0].textContent,'Field Location Access');
 assert.equal(host.querySelector('#gr-gps-panel h2'),null,'Main panel header belongs above settings content');
 assert.match(host.textContent,/Field Location Access Panel/);
 assert.match(host.textContent,/Open Live Staff & GPS Map/);
 const switches=[...host.querySelectorAll('[data-staff-id]')];
 assert.equal(switches.length,2,'Every company employee must have a GPS toggle');
 assert.equal(switches[0].checked,false,'Office and field staff must default to GPS OFF');
 switches[0].checked=true;
 switches[0].dispatchEvent(new w.Event('change',{bubbles:true}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(changes.length,1,'Turning GPS on must immediately save to Supabase');
 assert.equal(changes[0].p_user,entries[0].id);
 assert.equal(changes[0].p_company,'grow-india');
 assert.equal(changes[0].p_enabled,true);
 assert.match(host.querySelector('#gr-gps-counter').textContent,/1 \/ 2 GPS enabled/);
 switches[0].checked=false;
 switches[0].dispatchEvent(new w.Event('change',{bubbles:true}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(changes[1].p_enabled,false,'Turning GPS off must persist too');
 assert.match(host.querySelector('#gr-gps-counter').textContent,/0 \/ 2 GPS enabled/);
 const rules=host.querySelector('[data-settings-tab="field"]');
 rules.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(host.textContent,/Visit Completion Rules/);
 assert.ok(host.querySelector('[data-save-rule="service"]'),'Visit rules must remain a separate Settings tab');
 assert.ok(notifications.length>=2,'Successful toggles should provide feedback');
 console.log('PASS actual Settings DOM: Field Access tab visible first, company-specific per-person ON/OFF toggle persisted, Visit Rules separate.');
})().catch(e=>{console.error(e);process.exitCode=1});
