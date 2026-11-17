'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const src=fs.readFileSync('greenrich-whatsapp-inbox.js','utf8');
const server=fs.readFileSync('supabase/functions/greenrich-whatsapp-reply/index.ts','utf8');
const html=fs.readFileSync('secure.html','utf8');
assert.doesNotThrow(()=>new vm.Script(src));
const docs=['"https://api.antcrm.co"','"/whatsapp/messages/"','u.searchParams.set("phone_number",phone)',
 'u.searchParams.set("page","1")','u.searchParams.set("limit","50")',
 'sender===phone','24*60*60*1000','formBody.set("attachment",file as File',
 'JSON.stringify({type:"text",message_text:text})','Content-Type','"multipart/form-data"',
 'await userDb.rpc("gr_wa_admin"','userDb.from','gr_wa_messages','request_id','connection_id',
 'if(!allowed)return out(422','provider_message_id','auth:"Basic "+btoa',
 'No verified incoming customer message in the past 24 hours'];
for(const token of docs)assert.ok(server.includes(token),'Missing server-side send requirement '+token);
const dom=new JSDOM('<div id="inbox"></div>',{runScripts:'outside-only',url:'https://maheshgreenrich.github.io'});
const w=dom.window;w.eval(src);
const connection={id:'4eda2358-29d6-4b3e-8be8-f12d3f6f43db',provider:'socialberries',company_id:'grow-india',enabled:true,setup_state:'verified'};
w.GreenRichInbox.mount(w.document.getElementById('inbox'),{
 admin:true,companies:['grow-india'],companyName:()=> 'GreenRich Grow India Pvt Ltd',
 getRows:()=>({connections:[connection],messages:[],templates:[],tags:[],profiles:[]}),
 getTargets:()=>[{id:'L:grow-india:lead-test',company_id:'grow-india',type:'Lead',name:'Test Customer',mobile:'9150014040'}],
 notify:()=>{},refresh:async()=>{},app:{db:{functions:{invoke:async()=>({data:{ok:false}})}}}
});
const button=w.document.querySelector('[data-grwx-action="send-draft"]');
assert.ok(button&&!button.disabled,'Admin with verified provider should have clickable send control');
assert.ok(w.document.querySelector('#grwx-compose'),'Text composer absent');
assert.equal(w.document.querySelectorAll('.grwx-tool-icon').length,4);
assert.ok(html.includes('greenrich-whatsapp-inbox.js?v=20261117-inbox-media-unread-v9'));
w.GreenRichInbox.unmount();w.close();
console.log('PASS: direct reply endpoint contract, explicit 24-hour customer verification, admin send composer');
