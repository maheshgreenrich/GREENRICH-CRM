'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const source=file=>fs.readFileSync(file,'utf8'),app=source('greenrich-one.js'),crm=source('greenrich-crm-inline.js'),
 ops=source('greenrich-sales-ops.js'),html=source('secure.html'),css=source('greenrich-crm-inline.css'),
 sql=source('supabase/migrations/20261029221000_dispatch_handoff_orders.sql');
for(const [name,js] of [['app',app],['CRM',crm],['sales ops',ops]])new vm.Script(js,{filename:name});
assert.ok(html.includes('data-page="dispatch"'),'CRM dispatch tab must exist');
assert.ok(html.includes('<section id="dispatch"'),'Dispatch page must exist');
assert.ok(app.includes("dispatch:'Dispatch'"),'Top sidebar Dispatch navigation is required');
assert.ok(app.includes("dispatch:'dispatch'"),'Top-level page should use dispatch workspace');
assert.ok(app.includes("can('dispatch','edit')"),'Courier status requires operation permission');
assert.ok(app.includes("can('orders','approve')"),'Approval requires order approval permission');
for(const id of ['orders-period','orders-company','sales-channel-filter','orders-product','orders-from','orders-to','sales-search',
 'orders-reset','orders-status-report','orders-columns-toggle','orders-columns-panel','orders-columns-choices','orders-horizontal-scroll',
 'orders-scroll-left','orders-scroll-right','orders-export','orders-table-head','sales-table','dispatch-status-filter','dispatch-company-filter',
 'dispatch-search','dispatch-refresh','dispatch-table','gr-customer-history-dialog','gr-dispatch-editor'])
 assert.ok(html.includes('id="'+id+'"'),'Sales & Dispatch control missing: '+id);
assert.ok(html.includes('Search order, customer or contact'),'Order search should support customer contact');
assert.ok(html.includes('Choose columns'),'Column chooser must be visible');
assert.ok(html.includes('Order ID')&&!html.includes('<th>Internal / Platform Order ID</th>'),'Simplify Order ID heading');
for(const needle of ["'date','Date'","'order','Order ID'","'customer','Customer'","'actions','Actions'"])
 assert.ok(ops.includes(needle),'Default column settings missing '+needle);
for(const phrase of ['Awaiting approval','Approved orders',"Today's orders",'Sales value','Cancelled / returned','Dispatched'])
 assert.ok(ops.includes(phrase),'Status report missing '+phrase);
assert.ok(ops.includes('const filterPeriod='),'Order date filtering needs live logic');
assert.ok(ops.includes('customer(s)?.name')||ops.includes('const customer=s=>'),'Search must use shared customer data');
assert.ok(ops.includes('c.mobile2,c.email,c.gstin,c.address1'),'Search must cover contact details');
assert.ok(ops.includes('const rows=filteredSales()')||ops.includes('const sales=filteredSales()'),'Reports must use filtered orders');
assert.ok(ops.includes("greenrich-sales-columns-v1"),'Custom columns should persist in browser');
assert.ok(ops.includes("root.addEventListener('click'"),'Customer/approve/dispatch actions must work');
assert.ok(ops.includes("client")&&ops.includes("gr_dispatch_orders"),'Dispatch should use shared Supabase records');
assert.ok(ops.includes("db.from('gr_dispatch_orders').insert(detail)"),'Approval must transfer order into shared queue');
assert.ok(ops.includes("if(['Shipped','Delivered'].includes(values.status)&&(!values.courier_name||!values.tracking_number))"),'Courier and tracking must be required to ship');
assert.ok(ops.includes("if(values.status==='Delivered'&&!['Shipped','Delivered'].includes(current.status))"),'Delivered must require prior shipment');
assert.ok(ops.includes('gr-customer-history-content'),'Customer drill-down content missing');
assert.ok(ops.includes('Previous quotations / leads'),'Customer quotation enquiry history missing');
assert.ok(ops.includes('Courier tracking history'),'Customer order tracking history missing');
assert.ok(ops.includes('separate quotation document archive'),'Do not invent historical quotation documents');
assert.ok(sql.includes('enable row level security')&&sql.includes('gr_dispatch_allowed'),'Secure RLS must restrict company access');
assert.ok(sql.includes('unique(company_id,source_sale_id)'),'Approvals cannot duplicate');
assert.ok(!sql.toLowerCase().includes('alter table public.gr_attendance'),'Attendance must remain untouched');
assert.ok(css.includes('.gr-order-filters')&&css.includes('.gr-dispatch-form')&&css.includes('.gr-order-customer'));
const sandbox={window:{},Intl,Date,Number,String,Object,Math};
vm.runInNewContext(ops,sandbox);
const period=sandbox.window.GreenRichSalesOps.filterPeriod;
assert.equal(period('all','','','2024-01-01'),true);
assert.equal(period('custom','2026-10-01','2026-10-29','2026-10-29'),true);
assert.equal(period('custom','2026-10-02','2026-10-29','2026-10-01'),false);
console.log('PASS: filtered Sales Orders, status metrics, column controls, customer history, role-aware approvals and shared Dispatch');
