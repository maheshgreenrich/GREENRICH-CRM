'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('greenrich-inventory.js','utf8'),html=fs.readFileSync('secure.html','utf8');
const w={};vm.runInNewContext(src,{window:w});
const s=w.GreenRichInventory.renderNewInventoryPage({companies:['grow-india'],companyName:()=> 'Greenrich Grow India'},'grow-india');
assert.ok(s.includes('class="gr-inv-new-page"'));
assert.ok(!s.includes('<dialog'));
for(const key of ['general','sales','purchase','inventory'])assert.ok(s.includes('data-inv-create-tab="'+key+'"'));
for(const key of ['name','code','reference','category','price','tax','cost','company_id','uom','source_type'])
 assert.ok(s.includes('name="'+key+'"'));
assert.ok(s.includes('data-inv-create-photo-trigger'));
assert.ok(s.includes('data-inv-create-cancel'));
assert.ok(s.includes('data-inv-create-form'));
assert.ok(src.includes("if(S.creating){box.innerHTML=newInventoryForm();bind();return;}"));
assert.ok(!src.includes('showModal()'));
assert.ok(!src.includes('data-inv-create-dialog'));
assert.match(html,/greenrich-inventory\.js\?v=20261121-opening-stock-sku-v11/);
console.log('New Inventory opens full unsaved product page, not modal.');
