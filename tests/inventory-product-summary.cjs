'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const window={};
vm.runInNewContext(fs.readFileSync('greenrich-inventory.js','utf8'),{window},{filename:'greenrich-inventory.js'});
const calc=window.GreenRichInventory.computeProductMetrics;
assert.equal(typeof calc,'function');
const item={id:'product-25',company_id:'grow-india',code:'GRCOM25',name:'Compost Bin 25L',unit:'nos',aggregate:20,material:{min_stock:4,max_stock:35}};
const example={
 bom:[{company_id:'grow-india',payload:{parent_code:'GRCOM25',revision:'R1',child_code:'RM-1'}},{company_id:'grow-india',payload:{parent_code:'GRCOM25',revision:'R1',child_code:'RM-2'}}],
 pos:[{company_id:'grow-india',status:'Partly Received',payload:{lines:[{code:'GRCOM25',quantity:7,received:2}]}}],
 sales:[{company_id:'grow-india',record_id:'sale1',payload:{sku:'GRCOM25',qty:10,status:'Pending'}},{company_id:'grow-india',record_id:'sale2',payload:{sku:'GRCOM25',qty:3,status:'Completed'}},
   {company_id:'another-company',record_id:'sale3',payload:{sku:'GRCOM25',qty:99,status:'Pending'}}],
 dispatch:[],jobWork:[]
};
const result=calc(item,example);
assert.equal(result.onHand,20);
assert.equal(result.incoming,5);
assert.equal(result.outgoing,10);
assert.equal(result.forecast,15);
assert.equal(result.bomCount,1);
assert.equal(result.bomLines,2);
assert.equal(result.sold,3);
assert.equal(result.purchaseOrders,1);
assert.equal(result.lowStock,false);
assert.equal(result.min,4);
assert.equal(result.max,35);
assert.equal(calc({...item,aggregate:3},example).lowStock,true);
assert.equal(calc({...item,aggregate:4},example).lowStock,false);
assert.equal(calc({...item,aggregate:null},example).forecast,null);
assert.equal(calc(item,{...example,sales:null}).forecast,null);
assert.equal(calc(item,{...example,dispatch:null}).outgoing,null);
assert.equal(calc(item,{...example,pos:[{company_id:'grow-india',status:'Received',payload:{lines:[{code:'GRCOM25',quantity:8,received:8}]}}]}).incoming,0);
assert.equal(calc(item,{...example,bom:[...example.bom,{company_id:'grow-india',payload:{parent_code:'GRCOM25',revision:'R2'}}]}).bomCount,2);
const subcontract=calc({id:'rm1',company_id:'grow-india',code:'RM-1',name:'Material',unit:'nos',aggregate:10,material:{}},{
 bom:[],pos:[],sales:[],dispatch:[],jobWork:[{company_id:'grow-india',status:'At vendor',payload:{material:{code:'RM-1'},remaining:3}}]
});
assert.equal(subcontract.subcontractOut,3);
assert.equal(subcontract.min,null);
assert.equal(subcontract.max,null);
console.log('Product inventory stock-ribbon assertions passed');
