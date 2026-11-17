'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const inbox=fs.readFileSync('greenrich-whatsapp-inbox.js','utf8');
const css=fs.readFileSync('greenrich-whatsapp-inbox.css','utf8');
const crm=fs.readFileSync('greenrich-whatsapp-crm-workflows.js','utf8');
const provider=fs.readFileSync('supabase/functions/greenrich-socialberries/index.ts','utf8');
const html=fs.readFileSync('secure.html','utf8');
assert.doesNotThrow(()=>new vm.Script(inbox));
assert.doesNotThrow(()=>new vm.Script(crm));
for(const phrase of ['#grwx-inbox-host .grwx-grid','overflow-y:auto','min-height:0','grwx-chat-footer',
 'grwx-compose-row','grwx-customer-profile','grwx-users']) assert.ok(css.includes(phrase),phrase);
for(const phrase of ['id="grwx-compose"','id="grwx-attachment"','data-grwx-action="send-draft" disabled',
 'data-grwx-action="copy-draft"','data-grwx-action="template-draft"','drafts.set(selected',
 'navigator.clipboard.writeText','openTemplateFor?.(person)','file.size>25*1024*1024',
 'No file has been uploaded','24-hour']) assert.ok(inbox.includes(phrase),phrase);
assert.ok(crm.includes('openTemplateFor:person=>'),'Individual contact template draft should be prepared without send');
assert.ok(provider.includes('template_name:')&&provider.includes('attachment_type:'),'Show provider media/template metadata');
assert.ok(html.includes('greenrich-whatsapp-inbox.css?v=20261117-inbox-containment-3'));
assert.ok(html.includes('greenrich-whatsapp-inbox.js?v=20261117-inbox-containment-3'));
assert.ok(html.includes('greenrich-whatsapp-crm-workflows.js?v=20261117-inbox-containment-3'));
console.log('PASS: inbox alignment, fixed composer, safe provider-media metadata and reviewed template handoff');
