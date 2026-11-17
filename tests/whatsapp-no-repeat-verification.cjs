'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ui=read('greenrich-whatsapp-crm-workflows.js');
assert.doesNotThrow(()=>new vm.Script(ui));
for(const fragment of ['const validMarketingTemplate=t=>','validMarketingTemplate(t)&&','Sync Approved Templates','Refresh approved templates',
'data-marketing-sync-templates','GreenRichWaMarketingLastSync','secureSend(\'sync_approved_templates\'',
'Only templates with full approved content are selectable','Missing Meta credentials are reported','validMarketingTemplate(template)']){
 assert.ok(ui.includes(fragment),'Missing safe Marketing UX '+fragment);
}
assert.ok(!ui.includes('data-verify-meta-template="'+"'"+'+esc(t.id)'), 'Repeated verification buttons should not show on catalog');
assert.ok(ui.includes('No message sent.'),'Catalog refresh should not send');
assert.ok(read('secure.html').includes('greenrich-whatsapp-crm-workflows.js?v=20261117-manual-sync-visible-2'));
console.log('PASS: only complete marketing templates selectable, no per-template reapproval and automatic refresh without sending');
