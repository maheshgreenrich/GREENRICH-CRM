'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('secure.html','utf8');
const ops=fs.readFileSync('greenrich-operations.js','utf8');
const trainer=fs.readFileSync('greenrich-workflow-training.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261030151000_operations_workflow_training.sql','utf8');
new vm.Script(ops,{filename:'greenrich-operations.js'});
new vm.Script(trainer,{filename:'greenrich-workflow-training.js'});
assert.ok(html.includes('greenrich-workflow-training.js?v=20261030-training-1'),'Training file must load into existing CRM');
assert.ok(html.indexOf('greenrich-workflow-training.js?v=')<html.indexOf('greenrich-operations.js?v='),'Training needs to load before operations');
assert.ok(ops.includes("['training','Learn Production · Demo','stock']"),'Training must be a tab inside Operations');
assert.ok(ops.includes('GreenRichWorkflowTraining.mount('),'Operations should mount the trainer');
for(const type of ['SIMPLE_ASSEMBLY','MULTILEVEL','VENDOR_MADE','DIRECT_RECEIPT','CUSTOM'])
 assert.ok(trainer.includes(type),'All configurable workflow templates need to exist');
for(const stage of ['PARTS','SFG','RM','VENDOR_PO','JOBWORK','RECEIVE','ASSEMBLY','STICKER','QC','STOCK'])
 assert.ok(trainer.includes(stage),'Missing work stage '+stage);
for(const cmd of ['gr_demo_product_create','gr_demo_run_start','gr_demo_run_advance'])
 assert.ok(sql.includes('function public.'+cmd),'Backend RPC missing '+cmd);
assert.ok(sql.includes('stock_posted=(v_key=\'STOCK\')'),'Only final stage may update demo stock');
assert.ok(!sql.includes('update public.gr_crm_records')&&!sql.includes('update public.gr_ops_records')&&!sql.includes('update public.acc_'),'Demo must not modify live masters/ledger');
assert.ok(sql.includes("v_issued<>v_used+v_scrap+v_vendor+v_returned"),'Job work must balance');
assert.ok(sql.includes("p_details->>'result'<>'PASS'"),'QC must pass');
assert.ok(sql.includes('enable row level security'),'RLS required');
assert.ok(sql.includes('grant select on public.gr_erp_demo_products,public.gr_erp_demo_runs to authenticated'));
console.log('PASS: isolated manufacturing training, workflow templates, stage controls, QC, vendor reconciliation, stock safety, integration');
