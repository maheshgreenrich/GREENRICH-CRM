'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('greenrich-inventory.js','utf8'),html=fs.readFileSync('secure.html','utf8');
const win={};vm.runInNewContext(script,{window:win});
const {renderProductIdentifiers,validateProductCodeChange}=win.GreenRichInventory;
const item={id:'item-1',original:'crm',company_id:'grow-india',code:'GRCOM25',material:{sku:'GRCOM25'}};
const edit=renderProductIdentifiers(item,true);
assert.match(edit,/Product Code \/ SKU/);
assert.match(edit,/value="GRCOM25"/);
assert.match(edit,/data-inv-material-type/);
assert.match(edit,/data-inv-material-suffix/);
assert.doesNotMatch(edit,/Reference No\./);
assert.equal(validateProductCodeChange(item,'grcom25',{items:[item]}),'GRCOM25');
assert.equal(validateProductCodeChange(item,' grcom25653 ',{items:[item]}),'GRCOM25653');
assert.throws(()=>validateProductCodeChange(item,'',{items:[item]}),/1–64/);
assert.throws(()=>validateProductCodeChange(item,'invalid code',{items:[item]}),/1–64/);
assert.throws(()=>validateProductCodeChange(item,'gr-2',{items:[item,{id:'item-2',company_id:'grow-india',original:'crm',code:'GR-2'}]}),/already exists/);
assert.equal(validateProductCodeChange(item,'GRCOM25653',{
 items:[item],
 sales:[{company_id:'grow-india',payload:{product_id:'item-1',sku:'GRCOM25'}}],
 dispatch:[{company_id:'grow-india',sku:'GRCOM25'}],
 bom:[{company_id:'grow-india',payload:{parent_code:'GRCOM25'}}],
 pos:[{company_id:'grow-india',payload:{lines:[{code:'GRCOM25'}]}}],
 jobWork:[{company_id:'grow-india',payload:{material:{code:'GRCOM25'}}}]
}),'GRCOM25653','Historical document links must not block a unique SKU');
assert.equal(validateProductCodeChange(item,'GRCOM25653',{items:[item],sales:null,dispatch:null}),'GRCOM25653');
assert.ok(script.includes(".rpc('gr_inventory_rename_sku'"),'SKU renaming must use atomic database function');
assert.ok(script.includes('await load();'),'New code should be refreshed after save');
assert.match(html,/greenrich-inventory\.js\?v=20261123-material-type-filter-v14/);
console.log('PASS: SKU can change with linked documents; duplicate current codes rejected; atomic SKU save.');
