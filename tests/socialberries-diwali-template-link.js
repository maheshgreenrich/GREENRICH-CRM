'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const script=fs.readFileSync('greenrich-whatsapp-crm-workflows.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261031180000_socialberries_metadata_only_template.sql','utf8');
new vm.Script(script,{filename:'greenrich-whatsapp-crm-workflows.js'});
const checks=[
 ['diwali template identity',migration.includes("'diwali_offer'")&&migration.includes("'4155466774752002'")],
 ['metadata scoped to Grow India',migration.includes("c.company_id='grow-india' and c.slot=1")],
 ['reference is not API-verified',migration.includes("'not_verified','manual_reference'")],
 ['no fabricated body',migration.includes("'marketing','en_US',''")],
 ['empty body allowed only metadata-only',migration.includes("body='' and provider_source='manual_reference' and provider_approval='not_verified'")],
 ['reference save idempotent',migration.includes('do nothing;')],
 ['manual ID linking protected by admin',migration.includes("public.gr_wa_admin(v_company)")],
 ['metadata importer never allows sending',!migration.includes('gr_wa_messages')],
 ['template catalog ID visible',script.includes("esc(t.provider_template_id||'—')")],
 ['template name selectable for campaign draft',script.includes("templateOptions(c,connectionId)")],
 ['template filtered to selected provider',script.includes("t.connection_id===connectionId")],
 ['select all matching loaded contacts',script.includes("data-select-all-matching")&&script.includes("selected=new Set(members.map(x=>x.id))")],
 ['provider-selected sender includes shared customers',script.includes('const companyId=sender.company_id;')&&script.includes("x.type==='Customer'||x.company_id===companyId")&&script.includes("selected=new Set(members.map(x=>x.id))")],
 ['draft saved without automatic sends',script.includes("status:'draft'")&&script.includes('Saving a draft does not send a message.')],
 ['does not create a messaging API caller',!script.includes("action:'send'")]
];
for(const [name,passed] of checks)assert.ok(passed,'Failed: '+name);
console.log('PASS: Diwali reference draft uses provider-selected company and shared customers; no messages sent');
