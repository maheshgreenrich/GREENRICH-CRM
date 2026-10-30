'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const get=p=>fs.readFileSync(p,'utf8');
const app=get('greenrich-one.js'),crm=get('greenrich-crm-inline.js'),operations=get('greenrich-sales-ops.js'),
 ui=get('secure.html'),dash=get('greenrich-dashboard.js'),menu=get('greenrich-actions.js'),settings=get('greenrich-company-admin.js'),
 migration=get('supabase/migrations/20261030090000_dashboard_and_pending_dispatch.sql'),style=get('greenrich-dashboard.css');
for(const [name,src] of [['shell',app],['CRM',crm],['Dispatch',operations],['Dashboard',dash],['Actions',menu],['Settings',settings]])
 new vm.Script(src,{filename:name});
assert.ok(app.includes('crmCache.host')&&app.includes('window.GreenRichCRM.switchPage'),'CRM navigation should reuse mounted DOM');
assert.ok(crm.includes('navigate(allowedTabs.includes(view)?view:allowedTabs[0])'),'First paint must navigate to actual requested CRM page');
assert.ok(crm.indexOf('navigate(allowedTabs.includes(view)?view:allowedTabs[0])')<crm.indexOf('await window.GreenRichSharedCustomers.ready'),'Show page before any network requests');
assert.ok(crm.includes('const operationsReady=window.GreenRichSalesOps.mount'),'Dispatch retrieval must not delay first paint');
assert.ok(crm.includes('switchPage:view=>'),'Public in-workspace navigation required');
assert.ok(ui.includes('greenrich-dashboard.js?v=20261030-fast-1'),'Dashboard asset should load');
assert.ok(ui.includes('greenrich-actions.js?v=20261030-fast-1'),'Action menu should load');
assert.ok(ui.includes('<option>Pending</option><option>Packed</option>'),'Dispatch must start pending');
assert.ok(operations.includes("const sequence=['Pending','Packed','Shipped','Delivered']"),'Courier workflow stages must be ordered');
assert.ok(operations.includes("['Pending',count('Pending')+count('Approved')]"),'Legacy approved orders should display pending');
assert.ok(operations.includes('GreenRichActionMenu.wrap'),'Dispatch and sales should use three-dot actions');
assert.ok(crm.includes('const act=(k,id)=>window.GreenRichActionMenu.wrap'),'CRM table actions should use three dots');
assert.ok(menu.includes('source')&&menu.includes('role'),'Action popup should be accessible and preserve existing handlers');
for(const key of ['attendance','sales','day_sales','channel_sales','company_sales','leads','order_status','dispatch','stock','telecaller'])
 assert.ok(dash.includes("'"+key+"'"),'Missing dashboard widget '+key);
for(const field of ['gr-exec-period','gr-exec-company','gr-exec-source','gr-exec-channel','gr-exec-from','gr-exec-to'])
 assert.ok(dash.includes(field),'Dashboard filter '+field);
assert.ok(dash.includes('gr_crm_records')&&dash.includes('gr_dispatch_orders')&&dash.includes('gr_attendance'));
assert.ok(dash.includes('gr_dashboard_preferences'),'Per-employee visibility must load server settings');
assert.ok(dash.includes('Not tracked')&&dash.includes('until a call-log'),'Calls cannot be invented');
assert.ok(settings.includes("['dashboard','Dashboard Access']"),'Settings must offer dashboard access tab');
assert.ok(app.includes('openDashboardAccess:host=>'),'Settings must open per-employee editor');
assert.ok(migration.includes('enable row level security')&&migration.includes('gr_is_admin()'),'Dashboard preferences must enforce admin-only edits');
assert.ok(migration.includes("status='Pending'"),'New dispatch orders must start pending');
assert.ok(!migration.includes('alter table public.gr_attendance'),'Attendance module must remain untouched');
assert.ok(style.includes('.gr-exec-grid')&&style.includes('.gr-exec-ring'));
const fake={window:{},Intl,Date,Number,String,Math,Object,Array,Map,Set};
vm.runInNewContext(dash,fake);
const dashboard=fake.window.GreenRichExecutiveDashboard;
assert.equal(dashboard.widgets.length,10);
assert.equal(dashboard.periodStart('all'),'');
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(dashboard.periodStart('month')));
console.log('PASS: immediate CRM navigation, pending dispatch, three-dot actions, interactive chart dashboard and per-user visibility');
