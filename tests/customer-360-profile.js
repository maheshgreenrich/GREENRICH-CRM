'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('secure.html'),css=read('greenrich-customer-profile.css'),js=read('greenrich-customer-profile.js'),
crm=read('greenrich-crm-inline.js'),ops=read('greenrich-sales-ops.js'),shell=read('greenrich-one.js'),oneCss=read('greenrich-one.css'),
invoices=read('greenrich-invoices.js');
for(const [name,code] of [['profile',js],['CRM',crm],['salesOps',ops],['shell',shell],['invoice',invoices]])new vm.Script(code,{filename:name});
const ctx={window:{},Intl,Date,Number,String,Math,Object,Array,URL,Error};
vm.runInNewContext(js,ctx);
const api=ctx.window.GreenRichCustomerProfile;
assert.ok(api,'Customer 360 must expose render API');
const customer={id:'c1',name:'Customer Demo',mobile:'9876543210',mobile2:'9123456780',email:'customer@example.com',state:'Tamil Nadu',pincode:'600095',tag_ids:['tag1']};
const sales=[
 {id:'s1',_companyId:'grow-india',customer_id:'c1',date:'2026-10-10',qty:2,total:1000,product_id:'p1',product_name:'Compost bin',status:'Completed',internal_order_id:'GRG-1'},
 {id:'s2',_companyId:'grow-india',customer_id:'c1',date:'2026-10-19',qty:1,total:650,product_id:'p1',product_name:'Compost bin',status:'Completed',internal_order_id:'GRG-2'},
 {id:'s3',_companyId:'enviro-solutions',customer_id:'c1',date:'2026-10-21',qty:3,total:2200,product_id:'p3',product_name:'Sanitary napkin',status:'Completed',internal_order_id:'GRE-3'},
 {id:'s4',_companyId:'grow-india',customer_id:'c1',date:'2026-10-23',qty:1,total:1200,product_id:'p4',product_name:'Cancelled product',status:'Cancelled',internal_order_id:'GRG-4'},
 {id:'s5',_companyId:'grow-india',customer_id:'other',date:'2026-10-24',qty:99,total:20000,product_id:'p2',status:'Completed'}
];
const m=api.dataFor({customer,sales,leads:[{id:'l1',customer_id:'c1',stage:'Quotation',title:'Quotation A',value:700}],tasks:[{id:'t1',customer_id:'c1',title:'Call customer'}],
 dispatch:[{id:'d1',customer_id:'c1',status:'Shipped',source_sale_id:'s1',tracking_number:'AWB123'}],
 tags:[{id:'tag1',name:'Wholesale'}],companyLabel:id=>id});
assert.equal(m.orderIds.length,4,'Order count must only include this customer');
assert.equal(m.total,3850,'Customer spend must exclude cancelled orders');
assert.equal(m.units,6,'Customer purchased units across companies');
assert.equal(m.repeatProducts,1,'Repeat product must count distinct orders');
assert.equal(m.quotations.length,1);assert.equal(m.deliveries.length,1);assert.equal(m.followups.length,1);
assert.equal(m.knownTags[0],'Wholesale');
assert.equal(api.phoneValue('9876543210'),'919876543210');
for(const section of ['Sales performance','Most purchased products','Complete sales order history','Courier & tracking timeline',
 'Quotation & enquiry history','Follow-ups & actions','Primary phone','Second phone','PIN code','GSTIN','Share details','Email customer','WhatsApp'])
 assert.ok(js.includes(section),'Customer 360 section missing: '+section);
assert.ok(js.includes('wa.me/')&&js.includes('mailto:'),'Messaging actions must link to WhatsApp/email');
assert.ok(js.includes('encodeURIComponent(message)'),'Do not insert unencoded messages into share links');
assert.ok(js.includes('No quotation-stage enquiries'),'Do not invent historical quotations');
assert.ok(js.includes('No approved dispatch'),'Do not invent shipping activity');
assert.ok(js.includes('cancelled/returned orders excluded'),'Charts must not count cancelled sales');
assert.ok(js.includes("['Cancelled','Returned'].includes(s.status)"),'Spend must ignore cancelled/returned');
assert.ok(js.includes("data-gr360"),'Customer actions must be functional');
assert.ok(crm.includes('function openCustomerProfile(')&&crm.includes("data-customer-profile"),'Customer list names must open full profile');
assert.ok(crm.includes('window.GreenRichCustomerProfile.render'),'CRM must render Customer 360');
assert.ok(ops.includes('adapter.showCustomerProfile(id,sourceSaleId)'),'Sales order customer links must open full profile');
assert.ok(ops.includes('getDispatchRows:()=>dispatchRows.slice()'),'Customer must have shared delivery history');
assert.ok(shell.includes('window.GreenRichShell='),'Sidebar must sync with internal customer navigation');
assert.ok(html.includes('id="gr-customer-directory"')&&html.includes('id="gr-customer-profile"'));
assert.ok(html.includes('greenrich-customer-profile.js?v=20261030-actions-1'));
assert.ok(html.includes('greenrich-customer-profile.css?v=20261030-modernbi-1'));
assert.ok(html.includes('class="gr-app-header"'));
assert.ok(css.includes('.gr360-hero')&&css.includes('.gr360-chart')&&css.includes('.gr360-main-grid'),'Premium responsive customer layout');
assert.ok(oneCss.includes('.gr-header-controls'),'Professional header styling required');
assert.ok(invoices.includes("id=\"gr-invoice-share\""),'Invoice dialog must support native PDF file sharing');
assert.ok(invoices.includes('navigator.share({files:[file]'),'Mobile native share must include actual PDF file');
console.log('PASS: Customer 360 profile, messaging, actual order/quote/delivery history, sidebar and responsive header');
