'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
for(const file of ['greenrich-contact-email.js','greenrich-gmail-settings.js','greenrich-crm-inline.js','greenrich-one.js']){
 assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}),file+' must parse');
}
const code=read('supabase/functions/greenrich-quotation-gmail/index.ts');
for(const term of ['gr_gmail_sender_accounts','connect_account','disconnect_account',
 'gmail_accounts:await gmailSenders','state.sender_account_id','getAccessToken(db,company,account?.id',
 'safeRichHtml','sanitizeHtml(html','allowedTags:',"bcc:opts.bcc||[]",
 'incomingAttachments','attachment_manifest','gr-mail-attachments',"contact_attachment_url",
 'gr_contact_email_history','to_recipients:to','html_body:html','sender_account_id:selection',
 'smtp.sendMail','streamTransport:true','api.resend.com/emails',
 'Provider outcome may be uncertain','getUser(bearer.slice(7))']){
 assert.ok(code.includes(term),'Missing secure server feature '+term);
}
const ddl=read('supabase/migrations/20261116203000_rich_email_multi_sender.sql');
for(const term of ['gr_gmail_sender_accounts enable row level security',
 'revoke all on public.gr_gmail_sender_accounts from public,anon,authenticated',
 'to_recipients','cc text[]','bcc text[]','html_body','attachment_manifest',
 'sender_account_id','gr-mail-attachments'])
 assert.ok(ddl.includes(term),'Missing migration '+term);
assert.ok(ddl.includes('public=false'),'Mail file archive must be private');
const settings=read('greenrich-gmail-settings.js');
assert.match(settings,/Connect another Gmail/);
assert.match(settings,/data-grgmail-remove-account/);
assert.match(settings,/action:'connect_account'/);
assert.match(settings,/action:'disconnect_account'/);
const context=new JSDOM('<html><body></body></html>',{url:'https://maheshgreenrich.github.io/GREENRICH-CRM/secure.html'});
context.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
context.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.remove()};
const sandbox={window:context.window,document:context.window.document,console,crypto:require('node:crypto').webcrypto,
 FormData:context.window.FormData,Blob:context.window.Blob,Intl,Set,Promise};
vm.runInNewContext(read('greenrich-contact-email.js'),sandbox);
assert.equal(typeof sandbox.window.GreenRichContactEmail.open,'function');
const query=()=>new Proxy({},{get(_target,key){
 if(key==='then')return resolve=>Promise.resolve({data:[],error:null}).then(resolve);
 return ()=>query();
}});
const db={functions:{invoke:async()=>({data:{
 ready:true,transport:'gmail',connection:{sender_email:'primary@example.com'},
 gmail_accounts:[{id:'primary',sender_email:'primary@example.com',status:'connected'},
 {id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',sender_email:'other@example.com',status:'connected'}]
 },error:null})},from:()=>query()};
(async()=>{
 await sandbox.window.GreenRichContactEmail.open({db,company:'grow-india',companies:['grow-india','enviro-solutions'],
 contactType:'customer',contactId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',name:'Test Customer',email:'customer@example.com'});
 await new Promise(resolve=>setImmediate(resolve));
 const modal=context.window.document.querySelector('dialog');
 assert.ok(modal,'composer opens');
 for(const selector of ['[name="to"]','[name="cc"]','[name="bcc"]','[name="subject"]','#grce-editor',
 '#grce-color','#grce-font','#grce-emoji-toggle','#grce-file','#grce-archive',
 '#grce-company','#grce-from','#grce-send'])assert.ok(modal.querySelector(selector),'Missing control '+selector);
 assert.equal(modal.querySelectorAll('#grce-from option').length,2,'Display both connected Gmail senders');
 assert.equal(modal.querySelectorAll('#grce-company option').length,2,'Company selection');
 assert.ok(modal.querySelectorAll('[data-format]').length>=9,'Rich editing toolbar');
 assert.equal(modal.querySelector('[name="to"]').readOnly,false,'To field is editable');
 assert.ok(!modal.querySelector('#grce-send').disabled,'Sending enabled when company sender is connected');
 assert.ok(read('secure.html').includes('greenrich-contact-email.js?v=20261116-email-editor-history-2'));
 console.log('PASS: two Gmail senders, company dropdown, rich editor, To/CC/BCC, file attachments, private archive and server security');
})().catch(e=>{console.error(e);process.exitCode=1});
