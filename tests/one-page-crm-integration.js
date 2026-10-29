'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('secure.html'),shell=read('greenrich-one.js');
const crm=read('greenrich-crm-inline.js'),css=read('greenrich-crm-inline.css');
const demo=read('demo.js');
new vm.Script(shell);new vm.Script(crm);
const fragment=html.match(/<template id="grCrmTemplate">([\s\S]*?)<\/template>/);
assert.ok(fragment,'Single secure HTML must contain CRM DOM template');
for(const module of ['dashboard','sales','customers','leads','tasks','products','channels','reports']){
 assert.match(fragment[1],new RegExp('<section id="'+module+'" class="page'));
 assert.match(fragment[1],new RegExp('data-page="'+module+'"'));
}
for(const id of ['editor-form','upload-sales','upload-backup','download-backup','restore-backup','trend-chart','channel-chart'])
 assert.ok(fragment[1].includes('id="'+id+'"'),'Missing legacy feature '+id);
assert.match(html,/greenrich-crm-inline\.js/);
assert.match(html,/greenrich-crm-inline\.css/);
assert.match(shell,/GreenRichCRM\.mount\(container,view,allowed\)/);
assert.match(shell,/const crmMap=/);
assert.match(shell,/const canOpenPage=/);
assert.match(crm,/root\.addEventListener\('click'/,'CRM actions must remain scoped');
assert.match(crm,/const \$=s=>root\?\.querySelector/);
assert.match(crm,/key='greenrich-crm-v2'/,'Existing browser data key must remain unchanged');
assert.match(crm,/function importSales/);
assert.match(crm,/function excelDownload/);
assert.match(crm,/function doExport/);
assert.match(crm,/function saveEditor/);
assert.match(crm,/function bind\(/);
assert.match(crm,/window\.GreenRichCRM=/);
assert.doesNotMatch(html,/src="legacy\.html/);
assert.doesNotMatch(shell,/href="legacy\.html"|src="legacy\.html/);
assert.doesNotMatch(demo,/legacy\.html/);
assert.match(css,/#grCrmWorkspace/);
assert.doesNotMatch(css,/(^|\n)\s*body\s*\{/);
assert.match(html,/Local CRM records/,'Never mislabel browser-local data as synced');
console.log('PASS: One HTML CRM, permission-aware module routing, local data compatibility, import/export, no legacy iframe');
