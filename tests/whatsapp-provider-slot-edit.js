'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('greenrich-whatsapp-crm-workflows.js','utf8');
new vm.Script(source,{filename:'greenrich-whatsapp-crm-workflows.js'});
assert.ok(source.includes("onConflict:'company_id,slot'"),'Provider saves must use unique company+slot key');
assert.ok(!source.includes("dialog('Configure WhatsApp Tool '+slot,companyFieldWith(c)"),'Company must never be editable in existing Tool dialog');
assert.ok(source.includes("Company (fixed for Tool "), 'Company scope must be clearly labeled in dialog');
assert.ok(source.includes("ctx.companies.includes('grow-india')?'grow-india':ctx.companies[0]"), 'Both Companies must not silently default to Enviro');
assert.ok(source.includes("if(!app.admin||!app.companies.includes(c)||![1,2].includes(slot))"), 'Provider edit must require Admin/company and valid slot');
const start=source.indexOf(' function editProvider(c,slot,container){');
const end=source.indexOf(' function inboundDialog(c,container){',start);
assert.ok(start>=0&&end>start,'Provider editor must be defined');
const providerFunctionSource=source.slice(start,end);
const dbRows=[
 {id:'enviro-uuid',company_id:'enviro-solutions',slot:1,provider:'socialberries',display_name:'SocialBerries',sender_phone:'+919100000000',notes:'original-enviro'},
 {id:'grow-uuid',company_id:'grow-india',slot:1,provider:'socialberries',display_name:'SocialBerries',sender_phone:'+919200000000',notes:'original-grow'}
];
let form=null,draws=0,writeCount=0,notifications=[];
const ctx={
 app:{admin:true,companies:['enviro-solutions','grow-india'],db:{from(table){
  assert.equal(table,'gr_wa_connections');
  return {upsert(payload,opts){
   assert.equal(opts.onConflict,'company_id,slot');
   assert.equal(opts.ignoreDuplicates,false);
   assert.equal(payload.setup_state,'not_configured');
   assert.equal(payload.enabled,false);
   assert.ok(!Object.hasOwn(payload,'id'),'Do not overwrite UUID and its foreign keys');
   assert.ok(payload.company_id==='enviro-solutions'||payload.company_id==='grow-india');
   return {select(){return {async single(){
    writeCount++;
    const existing=dbRows.find(x=>x.company_id===payload.company_id&&x.slot===payload.slot);
    if(existing)Object.assign(existing,payload);
    else dbRows.push({id:'slot-new-'+writeCount,...payload});
    const saved=dbRows.find(x=>x.company_id===payload.company_id&&x.slot===payload.slot);
    return {data:{id:saved.id,company_id:saved.company_id,slot:saved.slot},error:null};
   }}}};
  }};
 }}},
 rows:{connections:dbRows},
 dialog:(title,body,submit)=>{form={title,body,submit}},
 alert:(msg,type)=>notifications.push([msg,type]),
 esc:x=>String(x),
 name:x=>x,
 input:(name,key,value)=>'<input name="'+key+'" value="'+String(value||'')+'">',
 note:(name,key,value)=>'<textarea name="'+key+'">'+String(value||'')+'</textarea>',
 fetchAll:async()=>{},
 settingsDraw:()=>{draws++},
 scope:'enviro-solutions'
};
const editProvider=vm.runInNewContext(providerFunctionSource+'; editProvider',ctx);
const container={isConnected:true};
const fd=x=>({get:key=>x[key]??null});
(async()=>{
 editProvider('enviro-solutions',1,container);
 assert.ok(form.body.includes('enviro-solutions'));
 assert.ok(!form.body.includes('name="company_id"'),'Form must not carry a changeable company field');
 await form.submit(fd({company_id:'grow-india',display_name:'Enviro Provider Edit',provider:'socialberries',
    sender_phone:'+919555555555',notes:'new-enviro-notes'}));
 assert.equal(dbRows.length,2,'No duplicate records');
 assert.equal(dbRows.find(x=>x.company_id==='enviro-solutions').id,'enviro-uuid');
 assert.equal(dbRows.find(x=>x.company_id==='enviro-solutions').display_name,'Enviro Provider Edit');
 assert.equal(dbRows.find(x=>x.company_id==='grow-india').display_name,'SocialBerries','Do not overwrite Grow India company');
 assert.equal(dbRows.find(x=>x.company_id==='grow-india').notes,'original-grow');
 editProvider('grow-india',1,container);
 assert.ok(form.body.includes('grow-india'));
 await form.submit(fd({company_id:'enviro-solutions',display_name:'Grow India Updated',provider:'socialberries',
    sender_phone:'9888888888',notes:'grow-only'}));
 assert.equal(dbRows.length,2);
 assert.equal(dbRows.find(x=>x.company_id==='grow-india').id,'grow-uuid');
 assert.equal(dbRows.find(x=>x.company_id==='grow-india').display_name,'Grow India Updated');
 assert.equal(dbRows.find(x=>x.company_id==='grow-india').sender_phone,'+919888888888','10-digit sender normalized to E.164');
 assert.equal(dbRows.find(x=>x.company_id==='enviro-solutions').display_name,'Enviro Provider Edit');
 const count=writeCount;
 editProvider('grow-india',1,container);
 await assert.rejects(
  form.submit(fd({display_name:'Incorrect sender',provider:'socialberries',
   sender_phone:'+9198000000000',notes:'must reject extra digit'})),
  /exact registered 10-digit Indian WhatsApp business sender/);
 assert.equal(writeCount,count,'Invalid 13-digit sender never reaches database');
 editProvider('fake-company',1,container);
 assert.equal(writeCount,count,'Unknown company must not be written');
 ctx.app.admin=false;
 editProvider('grow-india',1,container);
 assert.equal(writeCount,count,'Non-admin must not save provider changes');
 assert.equal(draws,2,'Reload settings after a save');
 console.log('PASS: WhatsApp provider saves keep the company fixed, update existing company+slot records, preserve IDs and never overwrite the other company');
})().catch(e=>{console.error(e);process.exitCode=1});
