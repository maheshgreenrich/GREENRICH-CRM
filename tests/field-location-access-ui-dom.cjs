'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="settingsHost"></div>',{url:'https://example.com/secure.html',runScripts:'outside-only'});
const w=dom.window;
w.eval(fs.readFileSync('greenrich-company-admin.js','utf8'));
w.eval(fs.readFileSync('greenrich-field-settings.js','utf8'));
const changes=[];
const rulesSaved=[];
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
  if(name==='gr_field_update_visit_rule'){rulesSaved.push(args);return {data:null,error:null}};
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
 assert.equal(host.querySelector('#gr-gps-company'),null,'No top company dropdown on GPS Settings');
 assert.equal(host.querySelectorAll('[data-gps-company]').length,2,'Both company sections must be visible');
 assert.match(host.textContent,/GreenRich Grow India Pvt Ltd/);
 assert.match(host.textContent,/GreenRich Enviro Solutions Pvt Ltd/);
 assert.match(host.textContent,/Field Location Access Panel/);
 assert.match(host.textContent,/Open Live Staff & GPS Map/);
 const switches=[...host.querySelectorAll('[data-staff-id]')];
 assert.equal(switches.length,4,'Every employee is shown separately in each assigned company');
 assert.equal(switches[0].checked,false,'Office and field staff must default to GPS OFF');
 const salesToggle=host.querySelector('[data-gps-company="grow-india"] [data-staff-id="'+entries[0].id+'"]');
 assert.ok(salesToggle,'Sales employee must have an editable GPS switch');
 salesToggle.checked=true;
 salesToggle.dispatchEvent(new w.Event('change',{bubbles:true}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(changes.length,1,'Turning GPS on must immediately save to Supabase');
 assert.equal(changes[0].p_user,entries[0].id);
 assert.equal(changes[0].p_company,'grow-india');
 assert.equal(changes[0].p_enabled,true);
 assert.match(host.querySelector('#gr-gps-counter').textContent,/1 \/ 2 GPS enabled/);
 salesToggle.checked=false;
 salesToggle.dispatchEvent(new w.Event('change',{bubbles:true}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(changes[1].p_enabled,false,'Turning GPS off must persist too');
 assert.match(host.querySelector('#gr-gps-counter').textContent,/0 \/ 2 GPS enabled/);
 const other=host.querySelector('[data-gps-company="enviro-solutions"] [data-staff-id="'+entries[1].id+'"]');
 assert.ok(other,'Second company must have independent staff switches');
 other.checked=true;
 other.dispatchEvent(new w.Event('change',{bubbles:true}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(changes.length,3);
 assert.equal(changes[2].p_company,'enviro-solutions');
 other.checked=false;
 other.dispatchEvent(new w.Event('change',{bubbles:true}));
 await new Promise(resolve=>setImmediate(resolve));
 const rules=host.querySelector('[data-settings-tab="field"]');
 rules.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(host.textContent,/Visit Completion Rules/);
 assert.ok(host.querySelector('[data-save-rule="service"]'),'Visit rules must remain a separate Settings tab');
 assert.equal(host.querySelector('#gr-gps-company'),null,'No company dropdown on Visit Completion Rules');
 assert.equal(host.querySelectorAll('[data-gps-company]').length,2,'Visit rules for both companies shown at once');
 const saveGrow=host.querySelector('[data-gps-company="grow-india"] [data-save-rule="service"]');
 saveGrow.click();
 await new Promise(resolve=>setImmediate(resolve));
 const saveEnviro=host.querySelector('[data-gps-company="enviro-solutions"] [data-save-rule="service"]');
 saveEnviro.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(rulesSaved.length,2);
 assert.equal(rulesSaved[0].p_company,'grow-india');
 assert.equal(rulesSaved[1].p_company,'enviro-solutions');
 assert.ok(notifications.length>=2,'Successful toggles should provide feedback');
 console.log('PASS actual Settings DOM: no company dropdowns, both company sections displayed, GPS ON/OFF and visit rules scoped correctly.');
})().catch(e=>{console.error(e);process.exitCode=1});
