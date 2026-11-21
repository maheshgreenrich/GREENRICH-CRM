'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crm=fs.readFileSync('greenrich-crm-inline.js','utf8');
const inventory=fs.readFileSync('greenrich-inventory.js','utf8');
new vm.Script(crm);
const partA=crm.slice(crm.indexOf('const needsShipment=order=>'),crm.indexOf('function saveCompanyData(id,copy){'));
const partB=crm.slice(crm.indexOf('function adjustStockForSale('),crm.indexOf('function validateCustomer('));
const api=vm.runInNewContext(partA+partB+';({reconcileOrderStock,adjustStockForSale})');
const ui={};vm.runInNewContext(inventory,{window:ui});
const metrics=ui.GreenRichInventory.computeProductMetrics;
const product={id:'p',stock:20},sales=[],store={products:[product],sales};
const toSale=(id,qty,status='Pending')=>({id,product_id:'p',sku:'GRCOM25',qty,status});
const values=()=>metrics({id:'p',company_id:'grow-india',code:'GRCOM25',name:'25L',aggregate:product.stock,unit:'nos',material:{}},{
 sales:sales.map(x=>({company_id:'grow-india',record_id:x.id,payload:x})),dispatch:[],
 pos:[{company_id:'grow-india',status:'Partly Received',payload:{lines:[{code:'GRCOM25',quantity:10,received:0}]}}],
 bom:[],jobWork:[]
});
function check(expectedForecast,expectedOutgoing){
 assert.equal(product.stock,20,'On Hand must remain unchanged by any Sales Order');
 const m=values();
 assert.equal(m.onHand,20);assert.equal(m.incoming,10);
 assert.equal(m.outgoing,expectedOutgoing);assert.equal(m.forecast,expectedForecast);
}
check(30,0);
const first=toSale('so1',10);api.adjustStockForSale(store,null,first);sales.push(first);api.reconcileOrderStock(store);check(20,10);
const edited=toSale('so1',7);api.adjustStockForSale(store,first,edited);sales[0]=edited;api.reconcileOrderStock(store);check(23,7);
const second=toSale('so2',6);sales.push(second);api.reconcileOrderStock(store);check(17,13);
const cancelled=toSale('so2',6,'Cancelled');api.adjustStockForSale(store,second,cancelled);sales[1]=cancelled;api.reconcileOrderStock(store);check(23,7);
sales.splice(1,1);api.reconcileOrderStock(store);check(23,7);
sales[0].status='Completed';api.reconcileOrderStock(store);check(30,0);
assert.ok(!crm.includes('p.stock-=qty'),'Order import must not decrement actual stock');
assert.ok(!crm.includes('product.stock=free'),'Order reconciliation must not decrement actual stock');
console.log('On Hand fixed; SO and PO forecast updates passed.');
