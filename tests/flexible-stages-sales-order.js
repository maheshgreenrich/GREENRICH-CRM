'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=path=>fs.readFileSync(path,'utf8');
const lead=read('greenrich-lead-pipeline.js'),crm=read('greenrich-crm-inline.js'),
 cloud=read('greenrich-crm-cloud.js'),ops=read('greenrich-sales-ops.js'),
 sql=read('supabase/migrations/20261031070000_flexible_stages_verified_sales_orders.sql'),
 html=read('secure.html');
for(const [name,js] of [['leads',lead],['crm',crm],['cloud',cloud],['sales-ops',ops]])
 new vm.Script(js,{filename:name});
assert.ok(lead.includes('const allowed=stages'),'Every non-Won stage must allow direct moves');
assert.ok(!lead.includes("l.stage==='Contacted'?['Qualified','Lost']"),'Remove stage-by-stage path');
assert.ok(lead.includes("const orders=ctx.orders.filter"),'Show matching Sales Orders');
assert.ok(lead.includes("o.payload?.lead_id===l.lead_id"),'New lead-created orders must match lead ID');
assert.ok(lead.includes("leadEmail&&"),'Existing order histories may match verified email');
assert.ok(lead.includes("if(!['Won','Lost'].includes(stage)&&!fd.get('due'))"),'Lost and Won do not require follow-ups');
assert.ok(lead.includes("window.GreenRichCRM.createOrderForLead({...ctx.leadPayloads"),'Pass complete lead details');
assert.ok(!lead.includes('Link this lead to an existing customer before creating its sales order'),'No manual customer linking prerequisite');
assert.ok(crm.includes("if(search.length<2)"),'Never list all personal contact details before typing');
assert.ok(crm.includes("data-choose-lead")&&crm.includes("data-choose-customer"),'Search both leads and customers');
assert.ok(crm.includes('selectLeadForOrder=lead=>'),'Prefill Sales Order from selected lead');
assert.ok(crm.includes("setCustomerMode('new')")&&crm.includes('new_mobile:lead.mobile'),'Create customer from an unlinked lead');
assert.ok(crm.includes('GreenRichCRMCloud.whenSynced(targetId)'),'Await persisted order before conversion');
assert.ok(crm.includes("gr_pipeline_win_with_order"),'Convert after confirmed Sales Order is saved');
assert.ok(crm.includes("current.data.stage==='Won'"),'Repeat orders must not reconvert completed leads');
assert.ok(crm.includes("gr_pipeline_link_customer"),'Pending order must link a real shared customer');
assert.ok(cloud.includes('async function whenSynced(company)'), 'Cloud must expose a synchronized save barrier');
assert.ok(ops.includes("!q('#dispatch-metrics')")&&ops.includes("!q('#orders-table-head')"),'Avoid null element toast errors');
assert.ok(sql.includes("if v.stage='Won' then raise exception"),'Completed won records cannot change stage');
assert.ok(sql.includes("if p_stage not in ('Won','Lost')"),'Active stages require future follow-up');
assert.ok(sql.includes("explicitlink:=so->>'lead_id'=p_lead"),'Verify a newly created order linked to a lead');
assert.ok(sql.includes('gr_lead_can')&&sql.includes("r.kind='sales'"),'Retain server authorization and verified Sales Orders');
assert.ok(html.includes('greenrich-lead-pipeline.js?v='),'Live app loads lead module');
console.log('PASS flexible lead stages, full customer/lead search, repeat sales, cloud-synchronized automatic Won and null DOM safeguards');
