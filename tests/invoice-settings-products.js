'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const inv=fs.readFileSync('greenrich-invoices.js','utf8');
const html=fs.readFileSync('secure.html','utf8'),css=fs.readFileSync('greenrich-invoices.css','utf8');
new vm.Script(inv,{filename:'greenrich-invoices.js'});
const window={};
vm.runInNewContext(inv,{window,Intl,Date,Number,Math,String,Object,Array,Error});
const app=window.GreenRichInvoices;
assert.ok(app,'Invoice module must be available');
for(const key of ['legal_name','address','city_state_pincode','gstin','state_name','state_code']){
 assert.ok(inv.includes("'"+key+"'"),'Seller invoice field missing '+key);
}
assert.ok(inv.includes('Company Invoice &amp; Tax Details'),'Company seller settings need a prominent section');
assert.ok(inv.includes('Seller GST &amp; Address Details'),'Registered seller address section missing');
assert.ok(inv.includes('Product HSN / SAC Codes'),'Product HSN/SAC section missing');
assert.ok(inv.includes('gr-invoice-company'),'Settings must allow selecting both companies');
assert.ok(inv.includes('getProducts(company)'),'HSN product editor must load company-scoped records');
assert.ok(inv.includes("keyFor=id=>id==='grow-india'?'greenrich-crm-v2':'greenrich-crm-v2::enviro-solutions'"),'Product master must remain separated by company');
assert.ok(inv.includes("select.value"),'Changing company must update the form');
assert.ok(inv.includes("client.from('gr_invoice_profiles').upsert"),'Seller fields must save to the shared database');
assert.ok(inv.includes("values.gstin.slice(0,2)!==values.state_code"),'Seller state code must match GSTIN prefix');
assert.ok(inv.includes('GreenRichCRMCloud.externalSave(company,before,existing,db)'),'Product HSN values must save to shared CRM cloud');
assert.ok(inv.includes('localStorage.setItem(keyFor(company),JSON.stringify(existing))'),'Keep a browser recovery copy');
assert.ok(inv.includes('invoice_status'), 'Issued invoices must not be touched');
assert.ok(html.includes('greenrich-invoices.js?v=20261029-company-tax-2'));
assert.ok(css.includes('.gr-tax-company-picker')&&css.includes('.gr-hsn-table'),'Settings needs responsive styling');
const store={products:[{id:'p1',hsn:''},{id:'p2',hsn:'31010010'}],sales:[
 {id:'a',product_id:'p1',invoice_status:'Draft',hsn:''},
 {id:'b',product_id:'p1',invoice_status:'Issued',hsn:'OLD',invoice_snapshot:{hsn:'OLD'}},
 {id:'c',product_id:'p2',invoice_status:'Draft',hsn:'31010010'}
]};
const changed=app.applyProductCodes(store,new Map([['p1','39249090'],['p2','31010010']]));
assert.equal(changed.length,1);
assert.equal(changed[0],'p1');
assert.equal(store.products[0].hsn,'39249090');
assert.equal(store.sales[0].hsn,'39249090');
assert.equal(store.sales[1].hsn,'OLD','Issued sale must be immutable');
assert.equal(store.sales[1].invoice_snapshot.hsn,'OLD','Issued invoice snapshot must be immutable');
assert.equal(store.sales[2].hsn,'31010010');
assert.throws(()=>app.applyProductCodes(store,new Map([['p1','123']])),/4, 6 or 8 digits/);
console.log('PASS Invoice Settings: company-specific seller fields, HSN/SAC product management, validation, draft updates and issued invoice immutability');
