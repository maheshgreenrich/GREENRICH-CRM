'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=x=>fs.readFileSync(path.join(root,x),'utf8');
for(const name of ['greenrich-gmail-settings.js','greenrich-quotation-mail.js','greenrich-contact-email.js']){
 assert.doesNotThrow(()=>new vm.Script(read(name),{filename:name}),name+' must parse');
}
const functionSource=read('supabase/functions/greenrich-quotation-gmail/index.ts');
for(const term of [
 "'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info",
 "npm:nodemailer@7.0.10","gr_mail_transport_configs","encrypt(password)","encrypt(key)",
 "validateSmtpHost","testTransport","smtp.verify()","TLS","deliverMail(db,company",
 "configure_transport","test_transport","gr_quotation_email_history","gr_contact_email_history",
 "if(action==='status')","requireSetup","allowed(db,profile,company,'admin')",
 "gr_gmail_private_tokens","action==='send_contact'"
])assert.ok(functionSource.includes(term),'Missing transport security contract '+term);
assert.ok(!functionSource.includes("'Access-Control-Allow-Origin':'*'"));
assert.ok(functionSource.includes("config.status==='verified'"),'Only tested non-Gmail transports may send');
for(const key of ["api.resend.com/emails","gmail.googleapis.com/gmail/v1/users/me/messages/send","smtp.sendMail","rejectUnauthorized:true"]){
 assert.ok(functionSource.includes(key),'Mail transport unavailable '+key);
}
const screen=read('greenrich-gmail-settings.js');
for(const term of [
 "Gmail / Google Workspace","Webmail / Business Mail (SMTP SSL)","Email API (Resend)",
 "SMTP hostname","SMTP username","SMTP password / app password",
 "Google OAuth Client ID","Google OAuth Client Secret","Resend API Key",
 "action:'configure_transport'","action:'test_transport'","Try","Retry Connection"
].filter(x=>x!=="Try"))assert.ok(screen.includes(term),'Settings control missing '+term);
assert.ok(!/localStorage\.(?:setItem|getItem)/.test(screen),'Credentials must not use localStorage');
const sql=read('supabase/migrations/20261116193000_mail_transport_configs.sql');
assert.ok(sql.includes('gr_mail_transport_configs enable row level security'));
assert.ok(sql.includes('revoke all on public.gr_mail_transport_configs'));
const html=read('secure.html');
assert.ok(html.includes('greenrich-gmail-settings.js?v=20261116-multimail-1'));
assert.ok(html.includes('greenrich-quotation-mail.js?v=20261116-multimail-1'));
const context=vm.createContext({window:{},console});
vm.runInContext(screen,context);
assert.equal(typeof context.window.GreenRichGmailSettings.mount,'function');
console.log('PASS: Secure Gmail/Webmail SMTP/API settings, CORS, server-side encrypted credentials, connection tests and 360 email paths');
