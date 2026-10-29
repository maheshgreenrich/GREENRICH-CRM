'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const shell=read('secure.html'),app=read('greenrich-one.js'),settings=read('greenrich-company-admin.js');
const crm=read('greenrich-crm-inline.js'),base=read('greenrich-one.css'),css=read('greenrich-crm-inline.css');
new vm.Script(settings);new vm.Script(app);new vm.Script(crm);
assert.match(shell,/class="gr-brand-mark"/);
assert.match(shell,/class="gr-brand-name"/);
assert.doesNotMatch(shell,/GREENRICH ONE · SUPABASE/);
assert.match(shell,/greenrich-company-admin\.js/);
assert.match(app,/m==='settings'\?roleName\(\)==='Admin'/);
assert.match(app,/GreenRichCompanies\.mount/);
assert.match(app,/adminTools\?\['channels','reports','dashboard'\]/);
assert.doesNotMatch(app,/const modules=\[[^\]]*'channels'/);
assert.doesNotMatch(app,/const modules=\[[^\]]*'reports'/);
assert.match(settings,/GreenRich Grow India Pvt Ltd/);
assert.match(settings,/GreenRich Enviro Solutions Pvt Ltd/);
assert.match(settings,/gr_companies/);
assert.match(settings,/\.update\(\{name:companyName/);
assert.match(settings,/data-settings-tab/);
assert.match(settings,/Work With This Company/);
assert.match(crm,/legacyKey='greenrich-crm-v2'/);
assert.match(crm,/legacyKey\+'::'\+activeCompany/);
assert.match(css,/table td strong/);
assert.match(css,/font-size:14px !important/);
assert.match(base,/\.gr-brand-name/);

const crmTemplate=shell.match(/<template id="grCrmTemplate">([\\s\\S]*?)<\\/template>/)?.[1]||'';
for(const section of ['sales','customers','leads','tasks','products']){
 const markup=crmTemplate.match(new RegExp('<section id="'+section+'" class="page"[\\\\s\\\\S]*?<\\\\/section>'))?.[0]||'';
 assert.ok(markup,'Missing CRM section '+section);
 assert.doesNotMatch(markup,/data-export=|id="export-sales"/,'Exports must be located in Admin Settings');
}
assert.match(app,/if\\(adminTools&&roleName\\(\\)!=='Admin'\\)/);
assert.match(crm,/adminMode=adminTools===true/);
assert.match(css,/#grCrmWorkspace #sales-table td:nth-child\\(9\\) strong/);
console.log('PASS: two-company Admin management, protected navigation, Sales tools moved, local record separation and compact brand typography');
