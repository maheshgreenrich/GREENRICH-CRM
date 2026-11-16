'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');
for(const p of ['greenrich-quotation-mail.js','greenrich-quotation-history.js','greenrich-quotations.js','greenrich-pdf-workbench.js','greenrich-crm-inline.js']){
 assert.doesNotThrow(()=>new vm.Script(source(p),{filename:p}),p+' must parse');
}
const edge=source('supabase/functions/greenrich-quotation-gmail/index.ts');
for(const token of ['getUser(bearer.slice(7))','gr_profiles','company_ids','gr_gmail_private_tokens','AES-GCM','code_verifier','state.code_verifier','gr_quotation_email_history','gr-quotation-pdfs','request_key','pdf_sha256','gmail.googleapis.com/gmail/v1/users/me/messages/send','needs_review','pdf_url',"grant_type:'refresh_token'"])
 assert.ok(edge.includes(token),'Missing secure backend contract '+token);
assert.ok(!edge.includes("'Access-Control-Allow-Origin':'*'"),'Wildcard CORS forbidden');
assert.match(edge,/if\(action==='connect'\)/);
assert.match(edge,/if\(action==='send'\)/);
assert.match(edge,/if\(action==='disconnect'\)/);
const sql=source('supabase/migrations/20261116170000_company_gmail_quotation_send.sql');
for(const table of ['gr_gmail_connections','gr_gmail_private_tokens','gr_gmail_oauth_states','gr_quotation_email_templates','gr_quotation_email_history'])
 assert.ok(sql.includes('public.'+table),'Table missing: '+table);
assert.match(sql,/gr_gmail_private_tokens enable row level security/);
assert.match(sql,/revoke all on public.gr_gmail_private_tokens from public,anon,authenticated/);
assert.match(sql,/insert into storage.buckets/);
assert.match(sql,/public=false/);
const html=source('secure.html');
for(const file of ['greenrich-quotation-mail.js','greenrich-quotation-history.js','greenrich-quotation-mail.css'])assert.ok(html.includes(file));
const quote=source('greenrich-quotations.js');
assert.match(quote,/Gmail & Send History/);
assert.match(quote,/GreenRichQuotationMail\.mount/);
assert.match(quote,/Email quotation/);
const crm=source('greenrich-crm-inline.js');
assert.match(crm,/GreenRichQuotationHistory\.customer/);
assert.match(crm,/data-quotation-product-history/);
assert.match(crm,/GreenRichQuotationHistory\.product/);
assert.match(source('greenrich-pdf-workbench.js'),/exportForEmail/);
const ctx=vm.createContext({window:{},console,Intl,Date});
vm.runInContext(source('greenrich-quotation-mail.js'),ctx);
assert.equal(typeof ctx.window.GreenRichQuotationMail.mount,'function');
console.log('PASS: quotation Gmail syntax, OAuth PKCE, RLS, audit, PDF archive, history hooks, and frontend contracts');
