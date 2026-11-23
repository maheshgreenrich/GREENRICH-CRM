'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('greenrich-inventory.js','utf8');
const html=fs.readFileSync('secure.html','utf8');
const window={};vm.runInNewContext(source,{window},{filename:'greenrich-inventory.js'});
const app=window.GreenRichInventory;
assert.equal(app.formatMaterialCode('SFG','001'),'SFG001');
assert.equal(app.formatMaterialCode('FG','100'),'FG100');
assert.equal(app.formatMaterialCode('IM','002'),'IM002');
assert.equal(app.formatMaterialCode('RM','004'),'RM004');
assert.throws(()=>app.formatMaterialCode('FG',''),/suffix/);
assert.throws(()=>app.formatMaterialCode('SFG','001 bad'),/suffix/);
assert.throws(()=>app.formatMaterialCode('RW','001'),/valid Material Type/);
assert.equal(app.materialSuffixFromCode('SFG001','SFG'),'001');
assert.equal(app.materialSuffixFromCode('IM-001','IM'),'001');
assert.equal(app.materialSuffixFromCode('GRCOM25','FG'),'');
const original={id:'sku1',original:'crm',company_id:'grow-india',code:'GRCOM25',stage:'FG',name:'Composter 25 L',unit:'nos',material:{}};
const detailed=app.renderProductIdentifiers(original,true);
for(const marker of ['data-inv-material-type','data-inv-material-suffix','data-inv-material-preview','data-inv-material-apply']){
 assert(detailed.includes(marker),'Material selector not found: '+marker);
}
assert(!detailed.includes('Reference No.'));
assert(detailed.includes('data-inv-product-code'),'Manual SKU editing must continue');
const newForm=app.renderNewInventoryPage({companies:['grow-india'],companyName:()=> 'Greenrich Grow India'},'grow-india');
assert(newForm.includes('name="stage" data-inv-create-material-type'));
assert(newForm.includes('name="material_suffix" data-inv-create-material-suffix'));
assert(newForm.includes('name="code"'));
assert(!newForm.includes('name="reference"'));
const record=app.prepareInventoryRecord({
 company_id:'grow-india',name:'Hinge plate',code:app.formatMaterialCode('SFG','001'),stage:'SFG',
 uom:'nos',source_type:'Make',saleable:false,purchasable:false,track_inventory:true
},[],'record-1');
assert.equal(record.stage,'SFG');
assert.equal(record.code,'SFG001');
assert.equal(record.kind,'material');
assert.equal(record.payload.material_type,'SFG');
assert.equal(record.payload.type,'SFG');
assert.equal(record.payload.qty,null);
assert.equal(app.validateProductCodeChange(original,'SFG001',{items:[original]}),'SFG001');
assert.throws(()=>app.validateProductCodeChange(original,'SFG001',{
 items:[original,{id:'other',original:'ops',company_id:'grow-india',code:'SFG001'}]
}),/already exists/);
assert(source.includes("S.materialFilter==='all'||i.stage===S.materialFilter"));
assert(source.includes('data-inv-material-filter'));
assert(source.includes("materialFilter.onchange=()=>{S.materialFilter=materialFilter.value;draw()}"));
assert(source.includes("r.payload.material_type||'FG'"));
assert(source.includes('type(p.material_type||stage),stockKind:stage'));
assert(source.includes('item.stockKind||item.stage'));
assert(source.includes(".rpc('gr_inventory_set_material_identity'"));
assert(source.includes('p_material_type:materialType'));
assert(source.includes('await load();'));
assert.match(html,/greenrich-inventory\.js\?v=20261123-material-type-filter-v14/);
console.log('PASS: SKU SFG001 generation, material type editing/filtering, duplicate guard, stock ledger identity kept.');
