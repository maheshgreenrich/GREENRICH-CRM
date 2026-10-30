'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('secure.html','utf8'),
 ops=fs.readFileSync('greenrich-operations.js','utf8'),
 ui=fs.readFileSync('greenrich-erp-pilot.js','utf8'),
 sql=fs.readFileSync('supabase/migrations/20261030160000_connected_erp_pilot.sql','utf8');
new vm.Script(ops);new vm.Script(ui);
assert.ok(html.includes('greenrich-erp-pilot.js?v=20261030-erp-pilot-2'),'Pilot script must load');
assert.ok(html.indexOf('greenrich-erp-pilot.js?v=')<html.indexOf('greenrich-operations.js?v='),'Load before Operations shell');
assert.ok(ops.includes("['pilot','Connected Order-to-Stock · Pilot','stock']"),'ERP pilot inside existing Operations sidebar');
assert.ok(ops.includes('GreenRichPilot.mount('));
for(const stage of ['STOCK_CHECK','VENDOR_PO','RM_RECEIPT','ISSUE','JOBWORK','RECEIVE','ASSEMBLY','STICKER','INSPECTION','QC','STOCK','DISPATCH','SERVICE'])
 assert.ok(ui.includes(stage)&&sql.includes("'"+stage+"'"),'Missing '+stage);
for(const t of ['gr_pilot_products','gr_pilot_orders','gr_pilot_events','gr_pilot_pos','gr_pilot_material_events','gr_pilot_stock_events','gr_pilot_service'])
 assert.ok(sql.includes('create table if not exists public.'+t),'Missing '+t);
assert.ok(sql.includes('current_setting(\'gr.pilot_stock_post\',true) is distinct from \'posting\''),'Prevent manual pilot stock edits');
assert.ok(sql.includes('QC_ACCEPTED')&&sql.includes('PILOT_DISPATCH'),'Stock increases at accepted FG and decreases on dispatch');
assert.ok(sql.includes('v_issued <> v_used+v_scrap+v_vendor+v_returned'),'Reconciliation must balance');
assert.ok(sql.includes('Insufficient vendor-held raw material'),'Cannot consume what was never issued');
assert.ok(sql.includes('QC PASS required before stock receipt'),'QC gate required');
assert.ok(sql.includes('created_by')&&sql.includes('actor'),'Auditable transitions');
assert.ok(sql.includes('enable row level security'),'RLS must be enabled');
assert.ok(sql.includes('revoke all on function public.gr_pilot_step(uuid,text,jsonb) from public,anon'));
assert.ok(ui.includes('gr_pilot_product_create')&&ui.includes('gr_pilot_start_order')&&ui.includes('gr_pilot_step'));
assert.ok(ui.includes('gr_pilot_update_vendor'),'Editable existing vendor 360');
assert.ok(ui.includes('gr_pilot_pos'),'Vendor PO history included');
assert.ok(ui.includes('gr_pilot_service'),'Service after dispatch included');
console.log('PASS connected ERP pilot workflow integration, RLS, warehouse/vendor stock and QC-driven finished goods receipts');
