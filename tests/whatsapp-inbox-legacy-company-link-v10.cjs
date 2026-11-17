'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const js=fs.readFileSync('greenrich-whatsapp-inbox.js','utf8');
const d=new JSDOM('<div id="grwx-inbox-host"></div>',{url:'https://maheshgreenrich.github.io/GREENRICH-CRM/secure.html',runScripts:'outside-only'});
const w=d.window;w.eval(js);
const root=w.document.querySelector('#grwx-inbox-host');
const verified={id:'d659481e-63c6-4ce1-85fd-51029dd72b4e',company_id:'grow-india',provider:'socialberries',enabled:true,setup_state:'verified'};
const unverified={id:'ca7c7dbf-87e2-493e-83e3-adac0a5075e8',company_id:'enviro-solutions',provider:'socialberries',enabled:false,setup_state:'not_configured'};
let fetches=[];
const contact={id:'C:1bff8582-412d-4487-9f44-db1bfa6fe521',name:'mahesh',type:'Customer',mobile:'9655735712',company_id:'',email:''};
const settings={admin:true,companies:['grow-india','enviro-solutions'],companyName:x=>x==='grow-india'?'GreenRich Grow India Pvt Ltd':x,
 getTargets:()=>[contact],
 getRows:()=>({connections:[verified,unverified],messages:[],profiles:[],tags:[],templates:[]}),
 notify:()=>{},refresh:async()=>{},app:{db:{functions:{invoke:async(_,{body})=>{
  fetches.push(body);return {data:{ok:true,shape_known:true,messages:[{id:'inbound-1',direction:'Incoming',text:'hii',event_at:new Date().toISOString(),status:'received'}],count:1}}
 }}}}};
async function main(){
 w.GreenRichInbox.mount(root,settings);
 await new Promise(ok=>setTimeout(ok,90));
 const refresh=root.querySelector('[data-grwx-action="refresh-chat"]');
 const send=root.querySelector('[data-grwx-action="send-draft"]');
 assert.ok(refresh&&!refresh.disabled,'Unassigned legacy customer can refresh using the sole verified sender');
 assert.ok(send&&!send.disabled,'Unassigned legacy customer with one verified sender can select image and send');
 assert.ok(fetches.some(x=>x.phone_number==='919655735712'&&x.connection_id===verified.id),'Must fetch incoming history for the correct sender and recipient');
 assert.ok(root.textContent.includes('hii'),'Incoming test reply should show in selected conversation');
 assert.ok(root.textContent.includes('WhatsApp via GreenRich Grow India Pvt Ltd'),'Sender fallback clearly distinguishes from CRM company assignment');
 assert.ok(root.textContent.includes('Unassigned in CRM'),'Must not silently rewrite customer company');
 w.GreenRichInbox.unmount();w.close();
 // Two verified sender accounts => refuse to guess legacy sender.
 const second={...unverified,enabled:true,setup_state:'verified'};
 const settingsAmbiguous={...settings,getRows:()=>({...settings.getRows(),connections:[verified,second]})};
 w.GreenRichInbox.mount(root,settingsAmbiguous);
 assert.ok(root.querySelector('[data-grwx-action="send-draft"]').disabled,'Never guess when two sender companies are active');
 w.GreenRichInbox.unmount();w.close();
 console.log('PASS: unassigned legacy customer uses sole authorized sender; incoming message shows; ambiguous multi-sender mapping blocks sending');
}
main().catch(e=>{console.error(e);process.exitCode=1});
