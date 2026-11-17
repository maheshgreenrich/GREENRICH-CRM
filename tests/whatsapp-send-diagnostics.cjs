'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const ui=read('greenrich-whatsapp-crm-workflows.js'),backend=read('supabase/functions/greenrich-whatsapp-send/index.ts');
assert.doesNotThrow(()=>new vm.Script(ui));
assert.ok(ui.includes('Check Sending Setup'));
assert.ok(ui.includes('data-diagnose-provider'));
assert.ok(ui.includes('async function diagnoseProvider(id)'));
assert.ok(ui.includes("secureSend('diagnose_connection'"));
assert.ok(ui.includes('Provider configured in CRM'));
assert.ok(ui.includes('Latest recorded send failures'));
for(const item of ['if(action==="diagnose_connection")','credentials_present','provider_enabled','connection_state',
  'sender_recorded','verified_templates','admin_confirmed_templates','opted_in_contacts','recent_failures','sending_enabled'])
 assert.ok(backend.includes(item),'Missing diagnostic field '+item);
assert.ok(backend.indexOf('if(action==="diagnose_connection")')>backend.indexOf('adminAuth.data!==true'),'Diagnostics must be admin authorised');
const before=backend.slice(backend.indexOf('if(action==="diagnose_connection")'),backend.indexOf('if(action==="preflight_marketing")'));
assert.ok(!/await send\(|send_campaign|action==="record_consent"/.test(before),'Diagnostics must not send or mutate');
assert.ok(!before.includes('BASIC_PASSWORD')&&!before.includes('BASIC_USERNAME'),'Never reveal credentials');
const html=read('secure.html');
assert.ok(html.includes('greenrich-whatsapp-crm-workflows.js?v=20261117-whatsapp-ops-hub-5'));
console.log('PASS: read-only, admin-scoped WhatsApp sending diagnosis, safe blockers, failed-send detail and UI wiring');
