'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const html=read('secure.html'),editorJs=read('greenrich-contact-email.js'),historyJs=read('greenrich-quotation-history.js');
assert.doesNotThrow(()=>new vm.Script(editorJs));
assert.doesNotThrow(()=>new vm.Script(historyJs));
assert.match(html,/emoji-picker-element@1\.29\.1\/index\.js/);
assert.match(html,/greenrich-contact-email\.js\?v=20261116-email-editor-history-2/);
assert.match(html,/greenrich-quotation-history\.js\?v=20261116-email-editor-history-2/);
for(const item of ['rememberSelection','restoreSelection','getSelection','createLink','foreColor','grce-inline-file','grce-full-emoji','emoji-click','grce-highlight','fontName'])
 assert.ok(editorJs.includes(item),'Editor feature missing '+item);
const backend=read('supabase/functions/greenrich-quotation-gmail/index.ts');
for(const item of ['allowedSchemesByTag:{img:[\'cid\']}','grinline-','Inline image is not attached',
 'cid:a.cid','contact_attachment_url','payload.download','attachment_manifest','safeRichHtml',
 'font-family','background-color','encrypt','gr_gmail_sender_accounts'])
 assert.ok(backend.includes(item),'Backend contract missing '+item);
for(const item of ['gr_contact_email_history','gr_lead_pipeline','grce-history-detail',
 'contact_attachment_url','iframe.srcdoc','data-grqh-contact','grce-attachment-preview','Customer','download'])
 assert.ok(historyJs.includes(item),'History contract missing '+item);

const dom=new JSDOM('<html><body></body></html>',{url:'https://maheshgreenrich.github.io/GREENRICH-CRM/secure.html'});
const win=dom.window;
win.HTMLDialogElement.prototype.showModal=function(){this.open=true};
win.HTMLDialogElement.prototype.close=function(){this.open=false;this.remove()};
win.prompt=()=> 'https://example.org/quotation';
const commands=[];
dom.window.document.execCommand=(name,_show,value)=>{commands.push({name,value});return true};
const sandbox={window:win,document:win.document,console,crypto:require('node:crypto').webcrypto,
 FormData:win.FormData,Blob:win.Blob,Intl,Set,Promise,URL:win.URL,CustomEvent:win.CustomEvent};
vm.runInNewContext(editorJs,sandbox);
const query=()=>new Proxy({},{get(_target,key){
 if(key==='then')return resolve=>Promise.resolve({data:[],error:null}).then(resolve);
 return ()=>query();
}});
const db={functions:{invoke:async()=>({data:{ready:true,transport:'gmail',
 connection:{sender_email:'sales@company.example'},
 gmail_accounts:[{id:'primary',sender_email:'sales@company.example',status:'connected'}]},error:null})},from:()=>query()};
(async()=>{
 await win.GreenRichContactEmail.open({db,company:'grow-india',contactType:'customer',
 contactId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',name:'Demo',email:'customer@example.org'});
 await new Promise(resolve=>setImmediate(resolve));
 const modal=win.document.querySelector('dialog'),body=modal.querySelector('#grce-editor');
 body.textContent='GreenRich email link sample';
 const selection=win.getSelection(),range=win.document.createRange();
 range.setStart(body.firstChild,0);range.setEnd(body.firstChild,9);
 selection.removeAllRanges();selection.addRange(range);
 body.dispatchEvent(new win.MouseEvent('mouseup',{bubbles:true}));
 modal.querySelector('#grce-link').click();
 assert.ok(commands.some(c=>c.name==='createLink'&&c.value==='https://example.org/quotation'),'Selected text becomes hyperlink');
 modal.querySelector('#grce-color').value='#cc2200';
 modal.querySelector('#grce-color').dispatchEvent(new win.Event('change',{bubbles:true}));
 assert.ok(commands.some(c=>c.name==='foreColor'&&c.value==='#cc2200'),'Color picker applies selected text colour');
 modal.querySelector('#grce-highlight').value='#fff2a8';
 modal.querySelector('#grce-highlight').dispatchEvent(new win.Event('change',{bubbles:true}));
 assert.ok(commands.some(c=>c.name==='hiliteColor'),'Text highlighting works');
 assert.ok(modal.querySelectorAll('[data-emoji]').length>=250,'Broad offline emoji fallback');
 assert.ok(modal.querySelector('#grce-full-emoji'),'Full Unicode emoji picker available');
 assert.ok(modal.querySelector('#grce-inline-file'),'Inline photo upload available');
 assert.ok(historyJs.includes('Accepted by provider (delivery unconfirmed)'),'Delivery not falsely asserted');
 console.log('PASS: link insertion and text colours preserve selection, highlight, full emoji picker, image attachment and history contracts');
})().catch(e=>{console.error(e);process.exitCode=1});
