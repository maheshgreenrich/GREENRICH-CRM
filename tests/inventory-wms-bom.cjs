'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
for(const x of ['greenrich-inventory.js','greenrich-one.js','greenrich-production.js','greenrich-operations.js']){
 assert.doesNotThrow(()=>new vm.Script(source(x),{filename:x}),x+' must parse');
}
const page=source('greenrich-one.js'),html=source('secure.html'),ui=source('greenrich-inventory.js');
assert.ok(page.includes("stock:'Inventory'")&&page.includes("GreenRichInventory.mount"),'Inventory navigation must be loaded');
assert.ok(!page.includes("stock:'products'"),'Legacy page must not shadow Inventory');
assert.ok(html.includes('greenrich-inventory.js')&&html.includes('greenrich-inventory.css'),'Boot must load inventory files');
for(const token of ['FG','SFG','IM','RM','Warehouse Stock','Vendor / Job Work Stock','Multi-level BOM',
 'Purchase Shortages','verified_count','transfer','gr_inventory_location_action','gr_ops_records','gr_production_documents',
 'issued','used','waste','returned','remaining','saveBom','savePr','Open Saleable Product Editor'])
 assert.ok(ui.includes(token),'Missing production/inventory workflow '+token);
const sql=source('supabase/migrations/20261116213000_inventory_wms_foundation.sql');
for(const token of ['gr_inventory_locations','gr_inventory_location_balances','gr_inventory_location_movements',
 'gr_inventory_location_action','pg_advisory_xact_lock','gr_ops_allowed','unique(company_id,request_id)',
 'quantity>=0','Insufficient verified stock','gr_crm_records','gr_ops_records','CHENNAI','NUNGAMBAKKAM','AMAZON',
 'enable row level security','revoke all'])
 assert.ok(sql.includes(token),'Missing inventory ledger contract '+token);
assert.ok(sql.includes('No direct browser write permissions'),'Production and CRM balances must not be directly editable');
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://maheshgreenrich.github.io/GREENRICH-CRM/secure.html'});
const mocks={
 gr_crm_records:[{company_id:'grow-india',record_id:'product-a',kind:'products',payload:{sku:'FG-001',name:'MGB 100',stock:8}}],
 gr_ops_records:[
 {company_id:'grow-india',record_id:'rm1',kind:'material',payload:{code:'RM-001',name:'SS sheet',type:'RM',uom:'kg',reorder_level:20}},
 {company_id:'grow-india',record_id:'im1',kind:'material',payload:{code:'IM-001',name:'Hinge plate',type:'IM',uom:'nos'}},
 {company_id:'grow-india',record_id:'sfg1',kind:'material',payload:{code:'SFG-001',name:'Top hinge',type:'SFG',uom:'nos'}},
 {company_id:'grow-india',record_id:'bom1',kind:'bom',payload:{parent_code:'SFG-001',child_code:'IM-001',qty:1,uom:'nos',revision:'R1'}}
 ],
 gr_inventory_locations:['CHENNAI','NUNGAMBAKKAM','AMAZON'].map((c,i)=>({company_id:'grow-india',id:'location-'+i,code:c,name:c+' warehouse',kind:'warehouse'})),
 gr_inventory_location_balances:[{company_id:'grow-india',location_id:'location-0',item_kind:'RM',item_id:'rm1',quantity:50,uom:'kg'}],
 gr_inventory_location_movements:[],gr_production_documents:[
 {company_id:'grow-india',id:'job-1',kind:'job',number:'STN-1',status:'Part received',payload:{
  vendor:{name:'Sivaji Enterprises'},material:{name:'SS Sheet',uom:'kg'},issued:50,used:8,waste:2,returned:0,remaining:40}}],
 gr_production_balances:[{company_id:'grow-india',material_id:'rm1',quantity:50}]
};
function query(table){
 const q={_table:table,_filters:[],select(){return q},in(){return q},eq(field,value){q._filters.push([field,value]);return q},
 order(){return q},limit(){return q},range:async()=>{
  let out=mocks[table]||[];
  for(const [f,v] of q._filters)out=out.filter(r=>r[f]===v);
  return {data:out,error:null};
 }};
 return q;
}
const db={from:query,rpc:async()=>({data:{message:'Stock transfer recorded'},error:null})};
const sandbox={window:dom.window,document:dom.window.document,console,crypto:require('node:crypto').webcrypto,
 FormData:dom.window.FormData,Intl,Set,Promise};
vm.runInNewContext(ui,sandbox);
(async()=>{
 const root=dom.window.document.getElementById('root');
 await sandbox.window.GreenRichInventory.mount(root,{db,companies:['grow-india'],scope:'grow-india',
 companyName:id=>id,can:()=>true,userId:'user-test',openLegacy:()=>{},openOperations:()=>{}});
 assert.match(root.textContent,/MGB 100/);
 assert.match(root.textContent,/SS sheet/);
 assert.match(root.textContent,/Final \/ Saleable/);
 root.querySelector('[data-inv-tab="vendors"]').click();
 assert.match(root.textContent,/Sivaji Enterprises/);
 assert.match(root.textContent,/40/);
 root.querySelector('[data-inv-tab="warehouses"]').click();
 assert.equal(root.querySelectorAll('.gr-inv-stats article').length,3);
 assert.match(root.textContent,/NUNGAMBAKKAM/);
 root.querySelector('[data-inv-tab="bom"]').click();
 assert.match(root.textContent,/IM-001/);
 assert.ok(root.querySelector('[data-inv-bom]'),'Draft BOM editor must exist');
 root.querySelector('[data-inv-tab="purchasing"]').click();
 assert.match(root.textContent,/Purchase requisition/);
 assert.ok(root.querySelector('[data-inv-pr]'),'Purchase requisition form should exist');
 console.log('PASS: Inventory loads company products, stage hierarchy, 3 warehouses, vendor STN, draft BOM and purchase requisition');
})().catch(e=>{console.error(e);process.exitCode=1});
