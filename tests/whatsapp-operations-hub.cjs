'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const ui=read('greenrich-whatsapp-crm-workflows.js');
const inbound=read('supabase/functions/greenrich-wa-inbound/index.ts');
const schema=read('supabase/migrations/20261117124000_whatsapp_product_guidance_draft_library.sql');
const schemaEvent=read('supabase/migrations/20261117131500_whatsapp_trusted_inbound_otp.sql');
const html=read('secure.html');
assert.doesNotThrow(()=>new vm.Script(ui));
for(const token of ['Audience & Campaign','Campaign History','WhatsApp Inbox','Lead Assignment','Product Guidance',
 'function inboxView()','function guidanceView()','function guidanceDialog(','gr_wa_guidance_steps',
 'gr_wa_inbound_events','data-inbound-rule-status','website_whatsapp_otp',
 'data-select-all-matching','data-grwc-selected-count','maximum 500','SocialBerries provider campaign batches',
 'Delivered (confirmed)','Read (confirmed)','Not reported by available API',
 'Draft — not sent','data-advanced-whatsapp','Connected WhatsApp account']) {
 assert.ok(ui.includes(token),'Missing WhatsApp operations feature: '+token);
}
assert.ok(schema.includes('enable row level security')&&schema.includes("status='draft'"),'Product guidance must be protected drafts');
assert.ok(schemaEvent.includes('gr_wa_accept_trusted_event')&&schemaEvent.includes('to service_role'),
 'Inbound SQL processing must require service role');
for(const token of ['x-gr-signature','x-gr-timestamp','GREENRICH_INBOUND_WEBHOOK_SECRET',
 'HMAC','safeEqual','gr_wa_accept_trusted_event','!safeEqual(expected,signature)']) {
 assert.ok(inbound.includes(token),'Missing signed inbound gateway protection: '+token);
}
assert.ok(!ui.includes('fetch("https://whatsapp.socialberries.in'),'Do not directly send from browser');
assert.ok(html.includes('greenrich-whatsapp-crm-workflows.js?v=20261117-inbox-grid-v4'),'Ops hub bundle must be cache refreshed');
console.log('PASS: WhatsApp operations tabs, draft guidance, truthful provider stats and signed lead webhook are present');
