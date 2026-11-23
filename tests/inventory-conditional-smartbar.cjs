'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('greenrich-inventory.js','utf8'),html=fs.readFileSync('secure.html','utf8');
const window={};vm.runInNewContext(script,{window});
const m=window.GreenRichInventory;
const item={id:'item-1',company_id:'grow-india',code:'GRCOM25',name:'25L Composter',unit:'nos',material:{track_inventory:true}};
const nums={onHand:20,forecast:15,bomCount:1,bomLines:2,sold:3,outgoing:5,purchaseOrders:2,incoming:10,min:4,max:25,subcontractIn:3,subcontractOut:0,lowStock:false};
for(const [saleable,purchasable,expected] of [
 [true,true,['stock','bom','sales','purchases','reorder','subcontract']],
 [true,false,['stock','bom','sales','reorder','subcontract']],
 [false,true,['stock','bom','purchases','reorder','subcontract']],
 [false,false,['stock','bom','reorder','subcontract']]
]){
 const instance={...item,saleable,purchasable};
 assert.deepEqual(Array.from(m.productStatusVisibility(instance)),expected);
 const markup=m.renderProductStatus(instance,nums);
 const names=[...markup.matchAll(/data-inv-status="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(names,expected);
 assert.ok(markup.includes('20 nos'));
 assert.ok(markup.includes('15 nos Forecasted'));
 assert.equal(markup.includes('5 nos Outgoing'),saleable);
 assert.equal(markup.includes('10 nos Incoming'),purchasable);
 assert.equal(markup.includes('Purchase Orders'),purchasable);
 assert.ok(!markup.includes('Documents'));
}
const blank=m.renderNewInventoryPage({companies:['grow-india'],companyName:()=> 'Greenrich'},'grow-india');
assert.ok(blank.includes('data-inv-new-stat="sales"'));
assert.ok(blank.includes('data-inv-new-stat="purchases"'));
assert.ok(script.includes("form.elements.namedItem('saleable').onchange=syncSalePurchase"));
assert.ok(script.includes("form.elements.namedItem('purchasable').onchange=syncSalePurchase"));
assert.ok(script.includes('await updateItem(item,changes)'));
assert.match(html,/greenrich-inventory[.]js[?]v=20261123-independent-sku-material-type-v15/);
console.log('PASS 4 Sales/Purchase combinations: conditional Sold and Purchase stats; stock unchanged.');
