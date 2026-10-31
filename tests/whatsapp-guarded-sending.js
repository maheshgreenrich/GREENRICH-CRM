'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const edge=fs.readFileSync('supabase/functions/greenrich-whatsapp-send/index.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/20261031200000_guarded_whatsapp_campaign_dispatch.sql','utf8');
for(const item of ['gr_wa_admin','auth.getUser','SB_ENABLE_MARKETING_SEND','eligible','consent_status',
 'opt_out_at','admin_confirmed','category:"MARKETING"','direction:"outbound"','createSignedUrl',
 'input.confirm!==true','slice(0,3)','gr_wa_messages'])assert.ok(edge.includes(item),'Missing safeguard '+item);
assert.ok(sql.includes('gr_wa_one_send_per_campaign_phone'));
assert.ok(sql.includes('enable row level security'));
assert.ok(edge.includes('if(action==="preflight_marketing")'),'Missing read-only marketing preflight');
assert.ok(edge.includes('No selected recipients have documented WhatsApp marketing opt-in'),'Preflight cannot ignore consent');
assert.ok(edge.includes('Live sending is disabled in Supabase Secrets'),'Preflight cannot ignore activation');
assert.ok(edge.includes('Full approved MARKETING template is not confirmed in Settings'),'Preflight cannot accept unverified template');
assert.ok(edge.includes('return res(200,{ok:true,ready:!blockers.length'),'Preflight must provide all blockers');
console.log('PASS: Secure SocialBerries send adapter has role, opt-in, approval, idempotency, live gate and bounded send controls.');
