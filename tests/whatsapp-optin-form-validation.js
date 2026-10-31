'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ui=fs.readFileSync('greenrich-whatsapp-crm-workflows.js','utf8');
const backend=fs.readFileSync('supabase/functions/greenrich-whatsapp-send/index.ts','utf8');
new vm.Script(ui,{filename:'greenrich-whatsapp-crm-workflows.js'});
assert.ok(ui.includes("field('Where did the customer give permission?'"),'Consent source should be a clear choice');
for(const src of ['WhatsApp conversation','Website opt-in checkbox','Signed consent form','Other documented opt-in'])
 assert.ok(ui.includes(src),'Missing factual source option: '+src);
assert.ok(ui.includes('name="evidence_note" rows="3" required minlength="10" maxlength="500"'),
 'Evidence field should require a meaningful explanation');
assert.ok(ui.includes('A value such as 1 is not evidence.'),'Frontend should explain invalid short entries');
assert.ok(ui.includes("if(!f.has('attested'))throw Error("),'A real consent attestation is mandatory');
assert.ok(ui.includes("if(source.length<12)throw Error("),'Source validation should match server');
assert.ok(ui.includes("if(evidence.length<10)throw Error("),'Evidence validation should match server');
assert.ok(ui.includes("new_opt_in:f.has('new_opt_in')"),'Never default re-subscription to true');
assert.ok(backend.includes('if(input.attested!==true)return res(400'),'Server must enforce explicit permission');
assert.ok(backend.includes('if(source.length<12)return res(400'),'Server must require a real source');
assert.ok(backend.includes('if(evidence.length<10)return res(400'),'Server must require a real evidence note');
assert.ok(backend.includes('if((prev.data?.opt_out_at||prev.data?.consent_status==="opted_out")'),
 'Do not override prior opt-outs without fresh permission');
console.log('PASS: WhatsApp permission form is clear and server-side consent safeguards remain active.');
