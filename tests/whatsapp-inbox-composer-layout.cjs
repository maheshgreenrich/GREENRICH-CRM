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
for(const phrase of ['id="grwx-compose"','id="grwx-attachment"','data-grwx-action="send-draft"',
 'data-grwx-action="send-template"','data-grwx-action="template-draft"','drafts.set(selected',
 'grwx-template-picker','data-grwx-action="send-attachment"','file.size>8*1024*1024',
 'Text sends without attachments','24 hours']) assert.ok(inbox.includes(phrase),phrase);
assert.ok(!inbox.includes('data-grwx-action="copy-draft"'),'Copy button must be removed from inbox');
assert.ok(provider.includes('template_name:')&&provider.includes('attachment_type:'),'Show provider media/template metadata');
assert.ok(html.includes('greenrich-whatsapp-inbox.css?v=20261117-inbox-media-unread-v9'));
assert.ok(html.includes('greenrich-whatsapp-inbox.js?v=20261117-inbox-media-unread-v9'));
assert.ok(html.includes('greenrich-whatsapp-crm-workflows.js?v=20261117-inbox-grid-v4'));
console.log('PASS: inbox alignment, fixed composer, safe provider-media metadata and reviewed template handoff');
