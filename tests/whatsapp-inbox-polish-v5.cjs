'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('greenrich-whatsapp-inbox.js','utf8');
const css=fs.readFileSync('greenrich-whatsapp-inbox.css','utf8');
const html=fs.readFileSync('secure.html','utf8');
const gateway=fs.readFileSync('supabase/functions/greenrich-socialberries/index.ts','utf8');
assert.doesNotThrow(()=>new vm.Script(js));
for(const t of ['grwx-contact-phone','data-grwx-action="attach-image"','data-grwx-action="attach-video"','data-grwx-action="attach-document"','data-grwx-action="attach-audio"','messageCard(m,active)','grwx-template-buttons','grwx-template-image','grwx-media-missing','grwx-composer-layout','id="grwx-compose"','data-grwx-action="template-draft"','data-grwx-action="send-draft"','template_buttons:x.template_buttons||[]'])
 assert.ok(js.includes(t),'Missing WhatsApp UI functionality '+t);
for(const t of ['grwx-contact-phone','grwx-user-copy .grwx-last-message','justify-content:flex-start!important',
 'grwx-chat-footer','grwx-template-buttons','grwx-template-image','#grwx-inbox-host #grwx-compose'])
 assert.ok(css.includes(t),'Missing compact Inbox styling '+t);
assert.ok(css.includes('grid-template-rows:56px auto minmax(0,1fr) auto'),'Composer must remain separate row from messages');
for(const t of ['template_buttons:templateButtons','template_image_expected:', 'media_url:mediaURL||templateImage','const publicMedia=','allowed?u.href:""'])
 assert.ok(gateway.includes(t),'Missing safe provider message media contract '+t);
for(const p of ['greenrich-whatsapp-inbox.js','greenrich-whatsapp-inbox.css'])
 assert.ok(html.includes(p+'?v=20261117-inbox-inline-templates-v8'),'New frontend cache bust missing '+p);
console.log('PASS: full mobile numbers, compact message spacing, professional composer, guarded real media/button preview');
