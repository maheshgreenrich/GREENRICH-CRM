'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(p,'utf8');
for(const path of ['greenrich-document-designer.js','greenrich-sales-ops.js','greenrich-invoices.js','greenrich-one.js','greenrich-company-admin.js'])
 new vm.Script(read(path),{filename:path});
const sales=read('greenrich-sales-ops.js'),invoice=read('greenrich-invoices.js');
const shell=read('secure.html'),settings=read('greenrich-company-admin.js'),sql=read('supabase/migrations/20261104101000_dispatch_service_document_templates.sql');
assert.ok(sales.includes("data-packing-slip"),'Packing Slip PDF action must appear on dispatch rows');
assert.ok(sales.includes('gr_dispatch_deliver_with_service'),'Delivery must be an atomic server operation');
assert.ok(sales.includes("service_followup==='yes'"),'Only explicit Yes schedules service');
assert.ok(sales.includes("window.GreenRichShell?.openPage?.('service')"),'Dispatch should open Service & Installation');
assert.ok(sales.includes("gr_field_followup_directory"),'Dispatch must load authorized service employees');
assert.ok(sales.includes("serviceLinks"),'Dispatch must read linked service visits');
assert.ok(invoice.includes("window.GreenRichDocuments.invoiceHtml"),'Invoice preview and PDF must respect saved layout');
assert.ok(invoice.includes('current.document_config='),'New issued invoices must freeze template settings');
assert.ok(invoice.includes('savePaper:savePdf'),"Packing slip reuses invoice A4 PDF generation");
assert.ok(settings.includes("['documents','Document Designer']"),'Admin Settings must show independent document designer');
assert.ok(shell.includes('gr-dispatch-service-choice')&&shell.includes('value="no" selected'),'No service is the default');
assert.ok(shell.includes('greenrich-document-designer.js')&&shell.includes('greenrich-document-designer.css'),'Designer assets must be bundled');
for(const term of ['gr_document_templates','gr_dispatch_service_followups','gr_dispatch_deliver_with_service','gr_dispatch_allowed','gr_field_visits','for update','needs_service'])
 assert.ok(sql.includes(term),'DB migration missing '+term);
assert.ok(sql.includes('enable row level security'),'Both new tables must have RLS');
assert.ok(sql.includes('if p_service is null then p_service:=false'),'Default must be no service');
assert.ok(sql.includes("d.status not in ('Shipped','Delivered')"),'No premature delivery');
assert.ok(sql.includes('Service decision already recorded'),'Retry must not duplicate service visits');
const dom=new JSDOM('<main id="root"></main>',{url:'https://example.org/secure.html',runScripts:'outside-only'});
const w=dom.window;
w.eval(read('greenrich-document-designer.js'));
const api=w.GreenRichDocuments;
const minimal={company_id:'grow-india',order_id:'ORD-101',order_date:'2026-11-04',status:'Packed',customer_name:'Test & Client',
 product_name:'Composter <tag>',quantity:2,shipping_address:'123 Street',order_total:15000,sku:'SKU1'};
const pack=api.packingHtml(minimal,{legal_name:'GreenRich Grow India Pvt Ltd'});
assert.ok(pack.includes('PACKING SLIP')&&pack.includes('ORD-101'));
assert.ok(pack.includes('Test &amp; Client')&&!pack.includes('Composter <tag>'),'Customer and product must be escaped');
assert.ok(!pack.includes('₹15,000'),'Default packing slip must not expose order value');
const exposed=api.normalize('packing',{visible:{price:true},title:'Custom Pack'});
const priced=api.packingHtml(minimal,{legal_name:'GreenRich'},exposed);
assert.ok(priced.includes('Custom Pack')&&priced.includes('₹15,000'));
const issue='<article class="gr-invoice-paper"><header class="gr-invoice-heading">INVOICE</header><div class="gr-invoice-top"></div>'+
 '<table class="gr-invoice-lines"><tr><td>Tax amount</td></tr></table><div class="gr-invoice-footer"><div><strong>Remarks</strong><p>Notes</p></div></div>'+
 '<p class="gr-invoice-computer">Original</p></article>';
assert.equal(api.invoiceHtml(issue,'grow-india','Issued',{}),issue,'Old issued invoice must retain original design');
const fresh=api.invoiceHtml(issue,'grow-india','Draft',{document_config:{title:'CUSTOM INVOICE',accent:'#123456'}});
assert.ok(fresh.includes('CUSTOM INVOICE')&&fresh.includes('--gr-doc-accent:#123456'));
assert.ok(fresh.includes('Tax amount'),'Invoice mandatory tax row must remain unchanged');
let saves=[];
const db={auth:{getUser:async()=>({data:{user:{id:'10000000-0000-4000-8000-000000000099'}}})},
 from:()=>({
  select:()=>({in:async()=>({data:[],error:null})}),
  upsert:async data=>{saves.push(data);return {error:null}}
 })};
(async()=>{
 const host=w.document.getElementById('root');
 await api.settings(host,{db,companies:['grow-india'],notify:()=>{}});
 assert.ok(host.textContent.includes('Document Designer · Invoice & Packing Slip'));
 const type=host.querySelector('#gr-doc-type');
 type.value='packing';type.dispatchEvent(new w.Event('change'));
 assert.ok(host.querySelector('#gr-doc-preview').textContent.includes('PACKING SLIP'));
 host.querySelector('[name="title"]').value='PACKING CHECKLIST';
 host.querySelector('#gr-doc-edit').dispatchEvent(new w.Event('submit',{cancelable:true}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(saves.length,1);
 assert.equal(saves[0].document_type,'packing');
 assert.equal(saves[0].config.title,'PACKING CHECKLIST');
 assert.ok(saves[0].company_id==='grow-india');
 console.log('PASS: packing PDF UI, invoice snapshot, customization preview/save, no-service default and atomic service handoff static contracts.');
})().catch(error=>{console.error(error);process.exitCode=1});
