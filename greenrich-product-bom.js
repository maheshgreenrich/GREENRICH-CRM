'use strict';
(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=x=>String(x||'').trim().toLowerCase();
 const qty=x=>Number(Number(x).toFixed(6));
 const sessions=new WeakMap();
 function status(product){if(product.active===false)return 'Inactive';const stock=Number(product.stock);if(product.stock==null||product.stock===''||!Number.isFinite(stock))return 'Not set';return stock<=0?'Out of stock':stock<=Number(product.low_stock_threshold??1)?'Low stock':'Active'}
 function calculate(components,materials,bom,products,count=1){
  if(!Number.isInteger(count)||count<1)throw Error('Build quantity must be a positive whole number.');
  const totals=new Map();let draft=false;
  function visit(id,quantity,path){
   if(path.includes(id)||path.length>20)throw Error('A circular or excessively deep BOM needs correction in Operations.');
   const m=materials.find(m=>m.id===id);if(!m)throw Error('A selected material is no longer available. Remove it and select another.');
   if(!Number.isFinite(quantity)||quantity<=0)throw Error('Each required quantity must be greater than zero.');
   const children=m.type==='SFG'&&Object.hasOwn(m,'production_stock')?[]:bom.filter(b=>b.parent_code===m.code);
   if(children.length){for(const b of children){const matches=materials.filter(x=>x.code===b.child_code);if(matches.length!==1)throw Error('BOM material missing or ambiguous: '+b.child_code);if(b.uom&&matches[0].uom&&norm(b.uom)!==norm(matches[0].uom))throw Error('BOM unit differs from material unit for '+b.child_code);if(b.status!=='Validated')draft=true;visit(matches[0].id,quantity*Number(b.qty),[...path,id]);}return;}
   const prev=totals.get(id);totals.set(id,{material:m,required:(prev?.required||0)+quantity});
  }
  components.forEach(c=>visit(c.material_id,Number(c.quantity)*count,[]));
  const lines=[...totals.values()].map(x=>{const m=x.material,matches=products.filter(p=>m.crm_product_id?p.id===m.crm_product_id:norm(p.sku)===norm(m.code));const value=Object.hasOwn(m,'production_stock')?m.production_stock:matches.length===1?matches[0].stock:null,available=value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;return {...x,required:qty(x.required),available,remaining:available===null?null:qty(available-x.required),shortage:available===null?null:qty(Math.max(0,x.required-available))}});
  const capacity=lines.length&&lines.every(x=>x.available!==null)?Math.min(...lines.map(x=>Math.floor(x.available/(x.required/count)))):null;
  return {lines,draft,capacity};
 }
 function mount(form,{client,product={},products}){
  form.querySelector('[data-product-bom]')?.remove();
  const company=form.querySelector('[name=company_id]'),stock=form.querySelector('[name=stock]');
  const panel=document.createElement('section');panel.className='wide gr-product-bom';panel.dataset.productBom='';
  panel.innerHTML='<fieldset class="gr-product-mode wide"><legend>Product inventory type</legend><label><input type="radio" value="simple" name="inventory_mode"> Simple stock</label><label><input type="radio" value="bom" name="inventory_mode"> Multiple BOM</label></fieldset><label class="gr-low-threshold">Low-stock alert at or below<input type="number" min="0" step="1" data-low-threshold value="'+esc(product.low_stock_threshold??1)+'"></label><p data-product-status role="status"></p><div data-bom-detail hidden><h3>Materials needed to build this product</h3><p>Enter the material quantity needed for <strong>one finished product</strong>. SFG lines use posted SFG stock; other nested BOMs expand into raw materials below.</p><div class="gr-bom-picker"><label>Search material name or code<input type="search" data-bom-search placeholder="Search raw material or component"></label><label>Material<select data-bom-material></select></label><button type="button" data-bom-add>Add material</button><button type="button" data-bom-refresh>Refresh stock</button></div><div data-bom-recipe></div><label class="gr-bom-build">Products to build (preview)<input type="number" min="1" step="1" value="1" data-bom-count></label><div data-bom-preview aria-live="polite"></div><p>Finished stock is entered separately. This preview does not reserve or deduct materials.</p></div><p data-bom-error role="alert" hidden></p>';
  form.querySelector('#editor-fields').append(panel);
  stock.closest('label').before(panel.querySelector('.gr-product-mode'));
  const state={components:JSON.parse(JSON.stringify(product.bom_components||[])),materials:[],bom:[],loading:false,error:'',company:company.value,token:0};sessions.set(form,{collect});
  const $=q=>panel.querySelector(q);form.querySelector('[name=inventory_mode][value="'+(product.inventory_mode==='bom'?'bom':'simple')+'"]').checked=true;
  const mode=()=>form.querySelector('[name=inventory_mode]:checked').value;
  function error(message){$('[data-bom-error]').textContent=message;$('[data-bom-error]').hidden=!message}
  function preview(){
   $('[data-product-status]').textContent='Finished product stock: '+status({stock:stock.value,active:form.querySelector('[name=active]')?.value!=='false',low_stock_threshold:$('[data-low-threshold]').value});
   $('[data-bom-detail]').hidden=mode()!=='bom';panel.querySelectorAll('[data-component-qty],[data-bom-count]').forEach(el=>el.disabled=mode()!=='bom');if(mode()!=='bom'){error('');return}
   if(state.loading){$('[data-bom-preview]').textContent='Loading materials…';return}if(state.error){error(state.error);return}
   try{const result=calculate(state.components,state.materials,state.bom,products(company.value),Number($('[data-bom-count]').value));error('');
    $('[data-bom-preview]').innerHTML='<p><strong>'+(result.capacity===null?'Build capacity: stock information incomplete':'Can build '+result.capacity+' finished products from available materials')+'</strong>'+(result.draft?' · Includes draft BOM quantities; review before production.':'')+'</p><div class="gr-bom-scroll"><table><thead><tr><th>Material code</th><th>SFG / raw material / component</th><th>Required</th><th>Available stock</th><th>Remaining</th><th>Shortage</th><th>Unit</th></tr></thead><tbody>'+result.lines.map(l=>'<tr><td>'+esc(l.material.code)+'</td><td>'+esc(l.material.name)+'</td><td>'+l.required+'</td><td>'+(l.available??'Not recorded')+'</td><td>'+(l.remaining===null?'—':Math.max(0,l.remaining))+'</td><td class="'+(l.shortage>0?'gr-bom-short':'')+'">'+(l.shortage??'Unknown')+'</td><td>'+esc(l.material.uom)+'</td></tr>').join('')+'</tbody></table></div>'+(result.lines.length?'':'<p>Add materials to see stock requirements.</p>');
   }catch(e){$('[data-bom-preview]').textContent='';error(e.message)}
  }
  function picker(){const term=norm($('[data-bom-search]').value);$('[data-bom-material]').innerHTML='<option value="">Select material</option>'+state.materials.filter(m=>norm(m.code+' '+m.name).includes(term)&&!state.components.some(c=>c.material_id===m.id)).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.code+' · '+m.name)+'</option>').join('')}
  function recipe(){
   $('[data-bom-recipe]').innerHTML='<div class="gr-bom-scroll"><table><thead><tr><th>Material code</th><th>Item / material description</th><th>Required per product</th><th>Unit</th><th></th></tr></thead><tbody>'+state.components.map((c,i)=>{const m=state.materials.find(m=>m.id===c.material_id);return '<tr><td>'+esc(m?.code||'Missing')+'</td><td>'+esc(m?.name||c.material_id)+'</td><td><input type="number" min="0.000001" step="any" data-component-qty="'+i+'" value="'+esc(c.quantity)+'" aria-label="Required quantity for '+esc(m?.code||'material')+'"></td><td>'+esc(m?.uom||'')+'</td><td><button type="button" data-component-remove="'+i+'">Remove</button></td></tr>'}).join('')+'</tbody></table></div>';
   panel.querySelectorAll('[data-component-qty]').forEach(input=>input.oninput=()=>{state.components[Number(input.dataset.componentQty)].quantity=Number(input.value);preview()});panel.querySelectorAll('[data-component-remove]').forEach(b=>b.onclick=()=>{state.components.splice(Number(b.dataset.componentRemove),1);recipe();picker();preview()});
  }
  async function load(){const token=++state.token;state.loading=true;state.error='';state.materials=[];state.bom=[];picker();preview();try{if(!company.value){state.loading=false;recipe();preview();return}if(!client)throw Error('Cloud connection unavailable.');const rows=[];for(let offset=0;;offset+=1000){const r=await client.from('gr_ops_records').select('kind,record_id,payload').eq('company_id',company.value).in('kind',['material','bom']).range(offset,offset+999);if(r.error)throw Error(r.error.message);rows.push(...r.data);if(r.data.length<1000)break}if(token!==state.token)return;state.materials=rows.filter(r=>r.kind==='material').map(r=>({...r.payload,id:r.record_id}));state.bom=rows.filter(r=>r.kind==='bom').map(r=>r.payload);const balances=await client.from('gr_production_balances').select('material_id,quantity').eq('company_id',company.value);if(balances.error)throw Error(balances.error.message);if(token!==state.token)return;state.materials.forEach(m=>{if(['RM','RW','SFG'].includes(m.type))m.production_stock=Number((balances.data||[]).find(b=>b.material_id===m.id)?.quantity||0)});}catch(e){if(token!==state.token)return;state.error='Unable to load company materials: '+e.message;}if(token!==state.token)return;state.loading=false;recipe();picker();preview()}
  company.addEventListener('change',()=>{if(company.value!==state.company){state.company=company.value;state.components=[];void load()}});
  form.querySelectorAll('[name=inventory_mode]').forEach(r=>r.onchange=()=>{recipe();preview()});stock.addEventListener('input',preview);form.querySelector('[name=active]')?.addEventListener('change',preview);$('[data-low-threshold]').oninput=preview;$('[data-bom-count]').oninput=preview;$('[data-bom-search]').oninput=picker;
  $('[data-bom-refresh]').onclick=()=>void load();
  $('[data-bom-add]').onclick=()=>{const id=$('[data-bom-material]').value;if(!id)return;state.components.push({material_id:id,quantity:1});recipe();picker();preview()};
  function collect(){try{const threshold=Number($('[data-low-threshold]').value);if(!Number.isInteger(threshold)||threshold<0)throw Error('Low-stock threshold must be zero or a positive whole number.');if(mode()==='bom'){if(state.loading||state.error)throw Error(state.error||'Wait for materials to load.');if(!state.components.length)throw Error('Add at least one material for a Multiple BOM product.');calculate(state.components,state.materials,state.bom,products(company.value));}return {inventory_mode:mode(),low_stock_threshold:threshold,bom_components:JSON.parse(JSON.stringify(state.components))}}catch(e){error(e.message);throw e}}
  void load();return {collect};
 }
 window.GreenRichProductBOM={mount,calculate,status,collect:form=>sessions.get(form)?.collect()||{}};
})();
