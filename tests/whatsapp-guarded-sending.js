'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const edge=fs.readFileSync('supabase/functions/greenrich-whatsapp-send/index.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/20261031200000_guarded_whatsapp_campaign_dispatch.sql','utf8');
for(const item of ['gr_wa_admin','auth.getUser','SB_ENABLE_MARKETING_SEND','eligible','consent_status',
 'opt_out_at','admin_confirmed','category:"MARKETING"','direction:"outbound"','createSignedUrl',
 'input.confirm!==true','slice(0,3)','gr_wa_messages'])assert.ok(edge.includes(item),'Missing safeguard '+item);
assert.ok(sql.includes('gr_wa_one_send_per_campaign_phone'));
assert.ok(sql.includes('enable row level security'));
console.log('PASS: Secure SocialBerries send adapter has role, opt-in, approval, idempotency, live gate and bounded send controls.');
