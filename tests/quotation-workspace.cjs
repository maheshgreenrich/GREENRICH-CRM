'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');
for(const filename of ['greenrich-quotations.js','greenrich-pdf-workbench.js','greenrich-one.js'])
 assert.doesNotThrow(()=>new vm.Script(source(filename),{filename}),filename+' must parse');
const context=vm.createContext({window:{},crypto:require('node:crypto').webcrypto,URL,Date,Intl,console});
new vm.Script(source('greenrich-pdf-workbench.js')).runInContext(context);
new vm.Script(source('greenrich-quotations.js')).runInContext(context);
assert.equal(typeof context.window.GreenRichQuotations.mount,'function');
assert.equal(typeof context.window.GreenRichPDFWorkbench.mount,'function');
const query=()=>new Proxy({}, {get(_,key){
 if(key==='then')return resolve=>Promise.resolve({data:[],error:null}).then(resolve);
 return (...args)=>query();
}});
const db={from:()=>query()};
const host={innerHTML:'',querySelector:()=>null};
(async()=>{
 await context.window.GreenRichQuotations.mount(host,{db,companies:['grow-india'],company:'grow-india',userId:'00000000-0000-4000-8000-000000000001',canEdit:true,admin:true,notify:()=>{}});
 assert.match(host.innerHTML,/Saved quotations/);
 assert.match(host.innerHTML,/Live preview/);
 assert.match(host.innerHTML,/Product-wise template/);
 assert.match(source('greenrich-one.js'),/GreenRichQuotations\.mount/);
 assert.match(source('secure.html'),/greenrich-quotations\.js/);
 assert.match(source('secure.html'),/greenrich-pdf-workbench\.js/);
 const schema=source('supabase/migrations/20261116110000_quotations_pdf_workspace.sql');
 assert.match(schema,/enable row level security/g);
 assert.match(schema,/gr_crm_can\(company_id,'sales','view'\)/);
 assert.match(schema,/gr_field_is_admin\(company_id\)/);
 console.log('Quotation module syntax, sandbox initialization, markup, navigation, and RLS contract checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
