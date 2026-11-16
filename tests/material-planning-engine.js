'use strict';
const assert=require('node:assert/strict');
const {plan,reconcileJobWork,parseQty,qtyString}=require('../erp/material-planning-engine.js');
const company_id='grow-india',order={id:'SO-001',company_id,item_code:'FG-001',quantity:'1',status:'RELEASED'};
const items=[['FG-001','FG','nos'],['SFG-001','SFG','nos'],['RM-001','RM','kg']]
 .map(([code,type,uom])=>({company_id,code,type,uom,status:'Validated'}));
const bom=[
 {company_id,parent_code:'FG-001',child_code:'SFG-001',qty:'2',uom:'nos',revision:'A',status:'Validated'},
 {company_id,parent_code:'SFG-001',child_code:'RM-001',qty:'3',uom:'kg',revision:'A',status:'Validated'}
];
const stock=(code,on_hand,type='WAREHOUSE',quality_status='ACCEPTED',reserved='0')=>
 ({company_id,item_code:code,on_hand,location_type:type,quality_status,reserved});
const rows=[stock('FG-001','0'),stock('SFG-001','1'),stock('RM-001','2')];
const shortage=plan({order,items,bom,stock:rows});
assert.equal(shortage.status,'MATERIAL_PLAN_READY');
assert.equal(shortage.fg_to_build,'1');
assert.equal(shortage.lines.find(x=>x.code==='SFG-001').shortage,'1');
assert.equal(shortage.purchase_demands[0].shortage,'1');
assert.equal(shortage.read_only,true);
const available=plan({order,items,bom,stock:[stock('FG-001','2','WAREHOUSE','ACCEPTED','1'),...rows.slice(1)]});
assert.equal(available.status,'FG_AVAILABLE');
assert.equal(available.lines.length,1);
const missingStock=plan({order,items,bom,stock:rows.slice(0,2)});
assert.equal(missingStock.status,'BLOCKED');
assert.ok(missingStock.warnings.some(w=>w.includes('Missing accepted warehouse stock')));
const unapproved=plan({order,items,bom:bom.map(x=>({...x,status:'Draft'})),stock:rows});
assert.equal(unapproved.status,'BLOCKED');
assert.ok(unapproved.warnings.some(w=>w.includes('Unapproved BOM')));
const atVendor=plan({order,items,bom,stock:[...rows.slice(0,2),stock('RM-001','50','VENDOR'),stock('RM-001','0')]});
assert.equal(atVendor.purchase_demands[0].shortage,'3');
const unapprovedItem=plan({order,items:items.map(x=>x.code==='RM-001'?{...x,status:'Draft'}:x),bom,stock:rows});
assert.equal(unapprovedItem.status,'BLOCKED');
assert.equal(reconcileJobWork({issued:'50',net_used:'8',scrap:'2',unused_at_vendor:'40',returned:'0'}).balanced,true);
assert.equal(reconcileJobWork({issued:'50',net_used:'8',scrap:'2',unused_at_vendor:'40',returned:'40'}).balanced,false);
assert.equal(qtyString(parseQty('0.080000')),'0.08');
assert.throws(()=>parseQty('0.0000001'));
assert.throws(()=>plan({order:{...order,status:'DRAFT'},items,bom,stock:rows}));
assert.throws(()=>plan({order:{...order,company_id:'enviro-solutions'},items,bom,stock:rows}));
console.log('PASS ERP preview: FG availability, SFG/RM shortage, draft BOM and items, vendor-held stock, reservations, job-work reconciliation, company separation');
