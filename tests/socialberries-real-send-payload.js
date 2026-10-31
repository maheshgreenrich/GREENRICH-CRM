'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('supabase/functions/greenrich-whatsapp-send/index.ts','utf8');
const start=source.indexOf('function safeProviderReason(');
const end=source.indexOf('Deno.serve(async request=>{',start);
assert.ok(start>0&&end>start,'Live provider sender must be present');
let compiled=source.slice(start,end)
 .replace('v:unknown','v')
 .replace('cfg:any,recipient:Person,template:any,parts:any[]):Promise<SendOutcome>','cfg,recipient,template,parts)')
 .replace('let doc:any=null','let doc=null');
const sandbox={URL,AbortController,setTimeout,clearTimeout,btoa,
 val:(v,max=180)=>String(v??'').slice(0,max)};
vm.runInNewContext(compiled+';this.send=send;',sandbox);
const template={name:'diwali_offer',language:'en_US',provider_template_id:'4155466774752002',
 provider_preview:{components:[{type:'HEADER',format:'IMAGE'},{type:'BODY',text:'Hi {{1}}'}]}};
const parts=[{type:'header',parameters:[{type:'image',image:{link:'https://example.org/diwali.jpg'}}]},
 {type:'body',parameters:[{type:'text',text:'Test Customer'}]}];
const person={phone:'919500024310',name:'Test Customer',email:''};
const cfg={base:'https://api.antcrm.co',user:'example-username',pass:'example-password',version:'v1'};
let request={};
sandbox.fetch=async(url,opts)=>{
 request={url:String(url),...opts};
 return {ok:true,status:200,text:async()=>JSON.stringify({data:{message_id:'wamid.example.1',status:'pending'}})};
};
(async()=>{
 const accepted=await sandbox.send(cfg,person,template,parts);
 assert.equal(accepted.id,'wamid.example.1','Pending message ID must be accepted');
 assert.equal(accepted.uncertain,false);
 const u=new URL(request.url);
 assert.equal(u.pathname,'/api/v1/whatsapp/messages/');
 assert.equal(u.searchParams.get('phone_number'),'919500024310');
 assert.equal(request.method,'POST');
 assert.ok(request.headers.Authorization.startsWith('Basic '));
 const body=JSON.parse(request.body);
 assert.equal(body.to,undefined,'Do not use Meta to field');
 assert.equal(body.type,'template');assert.equal(body.template,'diwali_offer');
 assert.equal(body.language,'en_US');assert.equal(body.template_id,'4155466774752002');
 assert.equal(body.category,'MARKETING');
 assert.deepEqual(Object.keys(body.preview_template).sort(),
   ['id','language','name','status','category'].sort(),
   'Only documented preview metadata belongs in preview_template, not full approved components');
 assert.equal(body.components.length,2);
 assert.equal(body.components[0].parameters[0].image.link,'https://example.org/diwali.jpg');
 assert.equal(body.components[1].parameters[0].text,'Test Customer');
 sandbox.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify({
   error:true,data:{error_code:'132000',error_message:'Incorrect variable count for template'}
 })});
 const rejected=await sandbox.send(cfg,person,template,parts);
 assert.equal(rejected.id,null);
 assert.equal(rejected.code,'132000');
 assert.equal(rejected.reason,'Incorrect variable count for template');
 sandbox.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify({
   data:{status:'pending'}
 })});
 const missing=await sandbox.send(cfg,person,template,parts);
 assert.equal(missing.code,'NO_PROVIDER_MESSAGE_ID');
 assert.equal(missing.uncertain,true);
 console.log('PASS: Documented SocialBerries request, image/body values, nested rejection and pending response parsing.');
})().catch(error=>{console.error(error);process.exitCode=1});
