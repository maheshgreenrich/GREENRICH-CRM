'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const ui=read('greenrich-whatsapp-crm-workflows.js'),api=read('supabase/functions/greenrich-whatsapp-send/index.ts');
assert.doesNotThrow(()=>new vm.Script(ui));
for(const t of ['data-dialog-error','Saving and checking approved template','header_format_observed','needs the exact full approved HTTPS URL','Manual Sync — Existing Meta-Approved Template','Exact approved template ID','Exact approved message BODY','button1_kind','approval evidence','sync_approved_templates','Sync Approved Templates','data-sync-approved-templates',
 'syncApprovedTemplates(company,container','Manual Sync Approved Template',
 'No reapproval in Meta is needed','Manual sync is the primary path','data-wa-custom',
 'Customer name','Customer mobile','Customer email','Enter my own text / order number'])
 assert.ok(ui.includes(t),'Missing no-JSON template UX '+t);
for(const t of ['if(action==="sync_approved_templates")','_META_WABA_ID','_META_ACCESS_TOKEN',
 'message_templates','fields=id,name,language,status,category,components','graph.facebook.com',
 'provider_source:"verified_provider"','status:"APPROVED"','insert({...payload',
 'update(payload)','total_approved:items.length','No messages sent',
 'body:'+String(),'"@crm:name":person.name','"@crm:mobile":person.phone','"@crm:email":person.email'])
 assert.ok(api.includes(t),'Missing trusted Meta catalog sync feature '+t);
const block=api.slice(api.indexOf('if(action==="sync_approved_templates")'),api.indexOf('if(action==="sync_meta_template")'));
assert.ok(block.includes('method:"GET"'),'Catalog fetch must be read-only');
assert.ok(!block.includes('send_campaign')&&!block.includes('whatsapp/messages/'),'Catalog sync must not send');
assert.ok(block.includes('if(t?.status!=="APPROVED"'),'Only Meta-approved templates may be synced');
assert.ok(block.includes('parsed.hostname!=="graph.facebook.com"'),'Never follow untrusted pagination URLs');
assert.ok(block.includes('if(duplicate)continue'),'Do not silently remap existing template metadata');
assert.ok(!ui.includes('Auto-sync Templates (provider endpoint needed)'),'Old disabled placeholder must disappear');
assert.ok(read('secure.html').includes('greenrich-whatsapp-crm-workflows.js?v=20261117-whatsapp-ops-hub-5'));
console.log('PASS: optional Meta catalog sync, no JSON, manual-first company Settings sync, read-only API and dynamic CRM variables');
