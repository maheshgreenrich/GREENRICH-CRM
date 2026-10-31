'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const v2=fs.readFileSync('greenrich-dashboard-v2.js','utf8');
const core=fs.readFileSync('greenrich-dashboard.js','utf8');
const shell=fs.readFileSync('greenrich-one.js','utf8');
new vm.Script(v2);new vm.Script(core);new vm.Script(shell);

assert.ok(shell.includes("if(page!=='dashboard')window.GreenRichDashboardV2?.stop?.()"),
 'Navigating from Dashboard must cancel polling (including cached CRM navigation).');
assert.ok(shell.includes("$('#logout').onclick=async()=>{window.GreenRichDashboardV2?.stop?.()"),
 'Logging out must cancel dashboard refreshes');
assert.ok(v2.includes('viewRoot=host.querySelector(\'.gr2\')'), 'Track dashboard view element, not persistent #content');
assert.ok(v2.includes('token!==epoch||!isActive()'), 'Discard old in-flight responses');
assert.ok(v2.includes('if(!isActive())return;'), 'Do not reschedule timer when navigation happened during initial load');
assert.ok(core.includes("viewRoot=host.querySelector('.gr-exec')"), 'Protect old dashboard fallback');

function testDOM(){
 let html='',root=null,timers=new Map(),next=1,dbCalls=0,toasts=[];
 const fields=new Map();
 const host={
   isConnected:true,
   get innerHTML(){return html},
   set innerHTML(str){if(root)root.isConnected=false;html=str;root=str.includes('class="gr2"')?{isConnected:true}:null;fields.clear()},
   contains(node){return !!node&&node===root&&node.isConnected},
   addEventListener(){},
   querySelector(sel){
    if(sel==='.gr2')return root;
    if(!root||!root.isConnected||!html.includes('id="'+sel.slice(1)+'"'))return null;
    if(!fields.has(sel)){
      const field={id:sel.slice(1),value:sel==='#gr2-period'?'month':'all',disabled:false,isConnected:true,
        textContent:'',hidden:false,options:[{value:'all'}],onclick:null,onchange:null,
        set innerHTML(value){this.markup=value;const matches=[...String(value).matchAll(/<option value="([^"]*)"/g)];this.options=matches.map(m=>({value:m[1]}))},
        get innerHTML(){return this.markup||''}
      };
      fields.set(sel,field);
    }
    return fields.get(sel);
   }
 };
 const chain=new Proxy({}, {get(_,key){
   if(key==='then')return resolve=>{dbCalls++;return Promise.resolve({data:[],error:null}).then(resolve)};
   return ()=>chain;
 }});
 const db={from:()=>chain,rpc:()=>Promise.resolve({data:[],error:null})};
 const document={visibilityState:'visible',addEventListener:()=>{}};
 const window={GreenRichExecutiveDashboard:{widgets:[
   ['attendance','Attendance'],['sales','Sales'],['day_sales','Day sales'],['channel_sales','Channels'],
   ['company_sales','Company'],['leads','Leads'],['order_status','Approvals'],['dispatch','Dispatch'],
   ['stock','Stock'],['telecaller','Telecaller'],['customers','Customers'],['followups','Followups'],
   ['conversion','Conversion'],['salespeople','Salespeople'],['recent','Recent'],['accounts','Accounts']
 ],preferences:()=>{}} ,GreenRichNotify:(...args)=>toasts.push(args)};
 const context={window,document,console,Date,Math,Intl,Number,Object,Array,Set,Map,String,Error,
   setInterval:(fn)=>{const id=next++;timers.set(id,fn);return id},
   clearInterval:id=>timers.delete(id),
   setTimeout:(fn)=>{const id=next++;timers.set(id,fn);return id},
   clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(v2,context);
 return {host,window,timers,toasts,db,dbCalls:()=>dbCalls};
}
(async()=>{
 const {host,window,timers,toasts,db,dbCalls}=testDOM();
 const cfg={db,companyIds:['grow-india'],selectedCompany:'grow-india',userId:'test',admin:true,canExport:false};
 await window.GreenRichExecutiveDashboard.mount(host,cfg);
 assert.equal(window.GreenRichDashboardV2.isActive(),true);
 assert.ok(timers.size>=1,'Dashboard timer was set');
 const outstanding=[...timers.values()];
 const callsBefore=dbCalls();
 // #content stays connected while its children are replaced by Marketing.
 host.innerHTML='<section class="grwa">Marketing workspace</section>';
 assert.equal(host.isConnected,true,'Persistent CRM content container should stay mounted');
 assert.equal(window.GreenRichDashboardV2.isActive(),false);
 for(const tick of outstanding)tick();
 await Promise.resolve();await Promise.resolve();
 assert.equal(dbCalls(),callsBefore,'Timer must not query Supabase after leaving dashboard');
 assert.equal(toasts.length,0,'No null innerHTML error toast should appear');
 window.GreenRichDashboardV2.stop();
 assert.equal(timers.size,0,'Stopping dashboard must release all scheduled timers');

 // Simulate navigating away while the asynchronous dashboard first load is pending.
 const delayed=testDOM(),realFrom=delayed.db.from.bind(delayed.db);
 let unlock;
 const gate=new Promise(resolve=>unlock=resolve);
 delayed.db.from=(name)=>name==='gr_dashboard_preferences'?{
   select:()=>({eq:()=>({maybeSingle:()=>gate.then(()=>({data:null,error:null}))})})
 }:realFrom(name);
 const mounting=delayed.window.GreenRichExecutiveDashboard.mount(delayed.host,{...cfg,db:delayed.db});
 delayed.host.innerHTML='<section class="grwa">Marketing</section>';
 delayed.window.GreenRichDashboardV2.stop();unlock();
 await mounting;
 assert.equal(delayed.timers.size,0,'Do not restart the 45-second timer after a delayed fetch');
 assert.equal(delayed.toasts.length,0,'Discard old dashboard results without showing an error');
 console.log('PASS: persistent #content navigation does not crash stale dashboard refreshes; timers, requests and retries are stopped.');
})().catch(error=>{console.error(error);process.exitCode=1});
