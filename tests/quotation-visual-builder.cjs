'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const file of ['greenrich-quotation-designer.js','greenrich-quotations.js','greenrich-pdf-workbench.js','greenrich-one.js'])
 assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}),'Parse '+file);
const dom=new JSDOM('<!doctype html><html><body></body></html>');
const context={
 window:dom.window,document:dom.window.document,crypto:require('node:crypto').webcrypto,
 console,Intl,Date,URL,Promise
};
dom.window.DOMPurify={sanitize:s=>String(s).replace(/<script[\s\S]*?<\/script>/gi,'')};
vm.runInNewContext(read('greenrich-quotation-designer.js'),context);
const api=dom.window.GreenRichQuotationDesigner;
assert.equal(typeof api.mount,'function');
assert.equal(typeof api.renderHtml,'function');
const pieces=api.sample();
assert.equal((pieces.match(/class="grq-print-page"/g)||[]).length,6,'MGB sample needs six pages');
const quote={
 quotation_no:'Q-TEST-001',quotation_date:'2026-11-16',valid_until:'2026-12-16',
 lines:[{description:'MGB 50 Community Composter',qty:1,rate:250000,tax:5,inclusive:false}],
 discount:0,freight:0
};
const cfg={designerVersion:1,designerHtml:pieces,designerCss:'h2{font-weight:bold}'};
const lh={header:{html:'<div>Left logo | {{company_name}} | Right logo</div>',css:''},
footer:{html:'<div>{{company_address}} · {{company_contact}} | Page {{page}} / {{pages}}</div>',css:''}};
const seller={legal_name:'GREENRICH GROW INDIA PRIVATE LIMITED',address:'Chennai',phone:'9500090619'};
const buyer={name:'Test Customer',mobile:'9000000000',address1:'Sample Road',city:'Chennai'};
const output=api.renderHtml(cfg,lh,quote,seller,buyer);
assert.equal((output.match(/class="paper grqd-export-page grq-print-page"/g)||[]).length,6);
assert.equal((output.match(/Left logo/g)||[]).length,6,'header repeat on each page');
assert.equal((output.match(/Sample Road/g)||[]).length>=1,true,'customer address interpolation');
assert.match(output,/₹2,50,000/);
assert.match(output,/₹2,62,500/);
assert.match(output,/Page 6 \/ 6/);
assert.match(read('greenrich-quotations.js'),/designerVersion/);
assert.match(read('greenrich-quotations.js'),/selectedTemplate/);
assert.match(read('greenrich-quotations.js'),/template_snapshot/);
assert.match(read('greenrich-pdf-workbench.js'),/querySelectorAll\('\.grqd-export-page'\)/);
assert.match(read('secure.html'),/greenrich-quotation-designer\.js/);
const sql=read('supabase/migrations/20261116143000_quotation_visual_letterheads.sql');
assert.match(sql,/row level security/);
assert.match(sql,/gr_field_is_admin/);
console.log('Visual quotation designer six-page sample, dynamic quote rendering, shared letterhead, PDF pagination and security contracts passed');
