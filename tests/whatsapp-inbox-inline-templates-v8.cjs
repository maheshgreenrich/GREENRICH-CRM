'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const js=fs.readFileSync('greenrich-whatsapp-inbox.js','utf8');
const server=fs.readFileSync('supabase/functions/greenrich-whatsapp-reply/index.ts','utf8');
const css=fs.readFileSync('greenrich-whatsapp-inbox.css','utf8');
const html=fs.readFileSync('secure.html','utf8');
const dom=new JSDOM('<!doctype html><div id="grwx-inbox-host"></div>',{
 runScripts:'outside-only',url:'https://maheshgreenrich.github.io/GREENRICH-CRM/secure.html'
});
const w=dom.window;w.eval(js);
const selectedConnection='d659481e-63c6-4ce1-85fd-51029dd72b4e';
const t={id:'bff0a251-d34b-4397-8a70-f9557320a3c7',company_id:'grow-india',
 connection_id:selectedConnection,name:'compost_bin',language:'en_US',category:'marketing',
 provider_approval:'approved',provider_source:'admin_confirmed',
 provider_template_id:'2246803270052788',body:'Hello 🌱',
 provider_preview:{components:[{type:'HEADER',format:'IMAGE'},{type:'BODY',text:'Hello 🌱'},
   {type:'BUTTONS',buttons:[{text:'Buy Now',type:'URL',url:'https://mygreenbin.in'}]}]}};
const rows={connections:[{id:selectedConnection,company_id:'grow-india',provider:'socialberries',enabled:true,setup_state:'verified'}],
 templates:[t],messages:[],profiles:[],tags:[]};
const element=w.document.getElementById('grwx-inbox-host');
const settings={admin:true,companies:['grow-india'],companyName:()=> 'GreenRich Grow India Pvt Ltd',
 getRows:()=>rows,getTargets:()=>[{id:'L:grow-india:lead_1',company_id:'grow-india',
 name:'Customer',mobile:'9150014040',type:'Lead'}],
 notify:()=>{},refresh:async()=>{},app:{db:{functions:{invoke:async()=>({data:{ok:true,shape_known:true,messages:[],count:0}})}}}};
w.GreenRichInbox.mount(element,settings);
assert.equal(element.querySelectorAll('[data-grwx-action="copy-draft"]').length,0,'No Copy action in live composer');
assert.ok(element.querySelector('[data-grwx-action="send-draft"]'),'Normal text Send arrow missing');
assert.ok(element.querySelector('[data-grwx-action="template-draft"]'),'Template button missing');
element.querySelector('[data-grwx-action="template-draft"]').click();
assert.ok(element.querySelector('.grwx-template-picker'),'Template picker must stay in the chat');
const pick=element.querySelector('[data-grwx-template="'+t.id+'"]');
assert.ok(pick&&!pick.disabled,'Approved template must be selectable for this sender');
pick.click();
assert.ok(element.textContent.includes('Hello 🌱'),'Approved template preview should appear');
assert.ok(element.querySelector('#grwx-template-image'),'IMAGE header requires image chooser');
assert.ok(element.querySelector('[data-grwx-action="send-template"]'),'Send selected template action missing');
assert.ok(element.textContent.includes('Buy Now'),'Existing CTA button label must be visible');
assert.ok(js.includes("if(action==='send-draft'||action==='send-attachment')"),'Text and media actions must be separate');
assert.ok(js.includes("const media=attachments.get(selected)||null"),'Send arrow must attach the explicitly selected file');
assert.ok(js.includes("if(!draft&&!media)"),'Text or attachment required for sending');
assert.ok(server.includes('if(kind==="template")'),'Approved template send branch missing');
assert.ok(server.includes('gr_wa_template_media'),'Template IMAGE header must be hosted for SocialBerries');
assert.ok(server.includes('Recipient has no recorded marketing opt-in'),'Marketing consent check missing');
assert.ok(html.includes('greenrich-whatsapp-inbox.js?v=20261117-inbox-media-unread-v9'));
assert.ok(css.includes('grwx-conversation.grwx-with-template'));
w.GreenRichInbox.unmount();w.close();
console.log('PASS: normal Send distinct from media, no Copy, same-chat approved template chooser, preview and guarded template send');
