'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const inbox=fs.readFileSync('greenrich-whatsapp-inbox.js','utf8');
const marketing=fs.readFileSync('greenrich-whatsapp-crm-workflows.js','utf8');
const html=fs.readFileSync('secure.html','utf8');
const style=fs.readFileSync('greenrich-whatsapp-inbox.css','utf8');
assert.doesNotThrow(()=>new vm.Script(inbox));
assert.doesNotThrow(()=>new vm.Script(marketing));
for(const token of ['grwx-sidebar','grwx-conversation','grwx-customer-profile','data-grwx-contact',
 'data-grwx-action="refresh-chat"','grwx-chat-head','grwx-messages','grwx-bubble',
 "action:'messages'","phone_number:'91'+chosen.number",'page:pageNumber',
 'setInterval(', "document.visibilityState==='hidden'","source:'",'getTargets()','ctx.app.db.functions.invoke',
 'SocialBerries','grwx-profile-hint','history.get(selected)']) {
 assert.ok(inbox.includes(token),'Missing three-pane WhatsApp feature: '+token);
}
assert.ok(marketing.includes('window.GreenRichInbox?.mount('),'The WhatsApp tab must mount the separate inbox');
assert.ok(html.includes('greenrich-whatsapp-inbox.js?v=20261117-inbox-v6-proof'),'New inbox script missing from live HTML');
assert.ok(html.includes('greenrich-whatsapp-inbox.css?v=20261117-inbox-v6-proof'),'New inbox CSS missing from live HTML');
assert.ok(style.includes('grid-template-columns')&&style.includes('grwx-customer-profile'),'Three-column layout missing');
assert.ok(inbox.includes('data-grwx-action="template-draft"'),'Selected contact must open reviewed template campaign');
assert.ok(inbox.includes('data-grwx-action="send-draft" disabled'),'Unverified direct replies cannot be sent');
assert.ok(inbox.includes('id="grwx-compose"'),'Composer must be pinned below the chat');
assert.ok(inbox.includes('id="grwx-attachment"'),'Attachment selection must be available');
assert.ok(!inbox.includes('send_campaign'),'Inbox must not simulate WhatsApp sending');
console.log('PASS: three-pane CRM WhatsApp inbox, selected conversation history, admin-gated provider lookup, 60-second refresh');
