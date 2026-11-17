'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const js=fs.readFileSync('greenrich-whatsapp-inbox.js','utf8');
const css=fs.readFileSync('greenrich-whatsapp-inbox.css','utf8');
const html=fs.readFileSync('secure.html','utf8');
const dom=new JSDOM('<!doctype html><div id="grwx-inbox-host"></div>',{
 runScripts:'outside-only',url:'https://maheshgreenrich.github.io/GREENRICH-CRM/secure.html'
});
const w=dom.window;
w.URL.createObjectURL=()=> 'blob:https://maheshgreenrich.github.io/preview';
w.URL.revokeObjectURL=()=>{};
w.eval(js);
const id='d659481e-63c6-4ce1-85fd-51029dd72b4e';
const host=w.document.getElementById('grwx-inbox-host');
let calls=[];
const rows={messages:[],templates:[],profiles:[],tags:[],connections:[{id,company_id:'grow-india',provider:'socialberries'}]};
const targets=[
 {id:'L:grow-india:one',company_id:'grow-india',mobile:'9150014040',name:'Customer One',type:'Lead'},
 {id:'L:grow-india:two',company_id:'grow-india',mobile:'9655735712',name:'Customer Two',type:'Lead'}
];
const settings={admin:true,companies:['grow-india'],companyName:()=> 'GreenRich Grow India Pvt Ltd',
 getRows:()=>rows,getTargets:()=>targets,
 notify:()=>{},refresh:async()=>{},app:{db:{functions:{
 invoke:async(_,{body})=>{
 calls.push(body);
 return {data:{ok:true,shape_known:true,count:1,messages:body.phone_number==='919655735712'?[{
 id:'provider-incoming-1',text:'Please tell me about compost bin',direction:'Incoming',
 event_at:new Date().toISOString(),status:'received'
 }]:[]}};
 }}}}};
async function main(){
 w.GreenRichInbox.mount(host,settings);
 await new Promise(resolve=>setTimeout(resolve,75));
 assert.ok(calls.some(x=>x.phone_number==='919655735712'),'Background watcher must check other contact');
 const customer=host.querySelector('[data-grwx-contact="L:grow-india:two"]');
 assert.ok(customer,'Second contact should appear');
 assert.ok(customer.querySelector('.grwx-unread-badge'),'New inbound should create a visible unread badge');
 assert.ok(customer.textContent.includes('Please tell me about compost bin'),'Incoming reply should appear in sidebar preview');
 customer.click();
 assert.equal(host.querySelector('[data-grwx-contact="L:grow-india:two"] .grwx-unread-badge'),null,'Opening the conversation clears unread');
 // Choose a file without putting a caption into the text box.
 const input=host.querySelector('#grwx-attachment');
 assert.ok(input,'File chooser missing');
 const file=new w.File(['fake PNG'], 'sample.png',{type:'image/png'});
 Object.defineProperty(input,'files',{configurable:true,value:[file]});
 input.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.ok(host.querySelector('.grwx-media-preview img'),'Selected image must show thumbnail');
 assert.ok(host.textContent.includes('sample.png'),'Attached file name must appear');
 assert.ok(js.includes("form.set('message_text',draft||(media?'Attachment: '+media.name:''))"),
   'Media without caption must send provider-required message_text');
 assert.ok(js.includes("const media=attachments.get(selected)||null"),
   'Arrow must send selected attachment');
 host.querySelector('[data-grwx-action="remove-attachment"]').click();
 assert.ok(!host.querySelector('.grwx-media-preview'),'Removing file clears preview');
 assert.ok(host.querySelector('[data-grwx-action="send-draft"]'),'Composer arrow missing');
 assert.ok(css.includes('.grwx-unread-badge'),'Unread CSS missing');
 assert.ok(css.includes('.grwx-media-preview img'),'Media thumbnail styling missing');
 assert.ok(html.includes('greenrich-whatsapp-inbox.js?v=20261117-inbox-media-unread-v9'),'v9 asset marker missing');
 w.GreenRichInbox.unmount();w.close();
 console.log('PASS: background WhatsApp unread badge + reply snippet + opened chat read state + selected media preview and arrow sending contract');
}
main().catch(error=>{console.error(error);process.exitCode=1});
