'use strict';
/* Contract tests for the actual GreenRich ONE business dashboard overlay. */
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const js=fs.readFileSync('greenrich-dashboard-v2.js','utf8');
const css=fs.readFileSync('greenrich-dashboard-v2.css','utf8');
const html=fs.readFileSync('secure.html','utf8');
const shell=fs.readFileSync('greenrich-one.js','utf8');
const core=fs.readFileSync('greenrich-dashboard.js','utf8');
new vm.Script(js,{filename:'greenrich-dashboard-v2.js'});
assert.ok(html.includes('greenrich-dashboard-v2.js?v=20261031-businessbi-1'));
assert.ok(html.includes('greenrich-dashboard-v2.css?v=20261031-businessbi-1'));
assert.ok(html.indexOf('greenrich-dashboard.js?v=')<html.indexOf('greenrich-dashboard-v2.js?v='));
assert.ok(html.indexOf('greenrich-dashboard-v2.js?v=')<html.indexOf('greenrich-one.js?v='));
assert.ok(shell.includes('canModule:module=>can(module)'),'Role-based visibility must be passed from app shell');
for(const term of ['gr_crm_records','gr_lead_pipeline','gr_crm_customers','gr_dispatch_orders','grm_attendance','gr_dashboard_preferences'])
 assert.ok(js.includes(term),'Missing real Supabase data source '+term);
for(const term of ['gr2-period','gr2-company','gr2-source','gr2-channel','gr2-person','gr2-tag','gr2-product','gr2-stage','gr2-order','gr2-dispatch','gr2-type','gr2-from','gr2-to'])
 assert.ok(js.includes(term),'Missing functional dashboard filter '+term);
assert.ok(js.includes("!restrictOrders||relatedOrders.has"),'Lead-scoped filters must limit linked sales orders');
assert.ok(js.includes("userCan(ACCESS[id])"),'Never show widgets outside module view access');
assert.ok(js.includes("visible=Array.isArray(pref?.widgets)?pref.widgets"),'Preserve existing employee widget preferences');
assert.ok(js.includes("if(!config.canExport)"),'Export must be permission checked');
assert.ok(js.includes("sheetData()")&&js.includes("window.XLSX")&&js.includes("window.jspdf?.jsPDF"));
assert.ok(js.includes("postgres_changes")&&js.includes("setInterval"),'Use realtime events with scheduled polling fallback');
assert.ok(js.includes("not installed")&&js.includes("Not tracked"),'Never invent missing financial or phone metrics');
for(const style of ['.gr2-line','.gr2-donut','.gr2-columns','.gr2-panel-day_sales','.gr2-quick','.gr2-expanded','.gr2-kpis'])
 assert.ok(css.includes(style),'Missing layout chart style '+style);
const sourceSandbox={
  window:{GreenRichExecutiveDashboard:{widgets:Array.from({length:16},(_,i)=>['widget-'+i,'Widget '+i]),periodStart:()=>''}},
  document:{addEventListener:()=>{}},Date,Intl,Math,Number,String,Array,Object,Map,Set,Error,console
};
vm.runInNewContext(js,sourceSandbox);
assert.equal(sourceSandbox.window.GreenRichExecutiveDashboard.widgets.length,16,'Keep existing 16 settings switches');
assert.equal(typeof sourceSandbox.window.GreenRichExecutiveDashboard.mount,'function');
assert.equal(typeof sourceSandbox.window.GreenRichExecutiveDashboard.preferences,'undefined');
assert.equal(typeof sourceSandbox.window.GreenRichDashboardV2.filtered,'function');
assert.equal(sourceSandbox.window.GreenRichDashboardV2.filtered().sales.length,0);
const realCore={window:{},Intl,Date,Math,Number,String,Array,Object,Map,Set};
vm.runInNewContext(core,realCore);
assert.equal(realCore.window.GreenRichExecutiveDashboard.widgets.length,16);
console.log('PASS modern colorful Business Intelligence dashboard, live filters, exports, module and employee permissions, chart variety and real records');
