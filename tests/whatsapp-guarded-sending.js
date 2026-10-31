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
assert.ok(edge.includes('norm(x.mobile)||norm(x.mobile2)'),'Send gateway must use valid secondary customer mobile');
assert.ok(edge.includes('norm(row?.mobile)||norm(row?.mobile2)'),'Consent gateway must support secondary customer mobile');
assert.ok(!edge.includes('if(checked.no_phone)blockers.push'),'Skipped invalid contacts must not block eligible senders');
assert.ok(edge.includes('if(action==="sync_meta_template")'),'Missing Meta WABA approved-template verification');
assert.ok(edge.includes('prefix+"_META_WABA_ID"')&&edge.includes('prefix+"_META_ACCESS_TOKEN"'),'Missing per-company Meta secret names');
assert.ok(edge.includes('https://graph.facebook.com/')&&edge.includes('message_templates'),'Meta must use official fixed endpoint');
assert.ok(edge.includes('t.status!=="APPROVED"')&&edge.includes('String(t.category).toUpperCase()!=="MARKETING"'),'Meta template status/category must be strict');
assert.ok(edge.includes('String(x?.id)===String(template.provider_template_id)'),'Verification must match exact Meta template ID');
assert.ok(edge.includes('provider_source:"verified_provider"'),'Only actual Meta verification may set verified_provider');
assert.ok(edge.includes('category:"MARKETING"},components:parts'),'SocialBerries preview uses documented metadata and runtime components are separate');
assert.ok(edge.includes('provider_error_message:outcome.reason||null'),'Provider errors must be saved');
assert.ok(edge.includes('if(!response.ok)return {id:null,code:"HTTP_"'),'HTTP errors must be diagnosed');
console.log('PASS: Secure SocialBerries send adapter has role, opt-in, approval, idempotency, live gate and bounded send controls.');
