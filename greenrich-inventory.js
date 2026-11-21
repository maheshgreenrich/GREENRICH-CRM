'use strict';
/* GREENRICH ONE Inventory – company-scoped FG/SFG/IM/RM product master,
 * verified warehouse location balances, BOM mapping and purchasing shortages.
 * Existing CRM sellable stock and production ledger remain authoritative
 * until independently reconciled; warehouse counts never overwrite them. */
(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=x=>Number(x||0).toLocaleString('en-IN',{maximumFractionDigits:6});
 const stages=['FG','SFG','IM','RM'],names={FG:'Final / Saleable',SFG:'Semi-finished',IM:'Intermediate',RM:'Raw Material / Purchasable'};
 const type=x=>x==='RW'?'RM':stages.includes(x)?x:'RM';
 const uid=()=>crypto.randomUUID();
 const S={root:null,ctx:null,tab:'catalog',scope:'',items:[],bom:[],locations:[],balances:[],movements:[],pos:[],jobWork:[],requisitions:[],prodBalances:[],focus:null,filter:'',view:'cards',detailTab:'general',busy:false};
 const locName=id=>S.locations.find(x=>x.id===id)?.name||'—';
 const inScope=x=>S.scope==='all'||x.company_id===S.scope;
 const companyName=id=>S.ctx.companyName(id);
 const companyOptions=()=>S.ctx.companies.map(id=>'<option value="'+esc(id)+'"'+(S.scope===id?' selected':'')+'>'+esc(companyName(id))+'</option>').join('');
 const e=(key,title,val='',required=true)=>'<label>'+esc(title)+'<input name="'+key+'" value="'+esc(val)+'" '+(required?'required':'')+'></label>';
 const choice=(key,title,arr,selected='',required=true)=>'<label>'+esc(title)+'<select name="'+key+'" '+(required?'required':'')+'><option value="">Select…</option>'+arr.map(([id,label])=>'<option value="'+esc(id)+'"'+(String(selected)===String(id)?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>';
 const notify=(message,error=false)=>{const box=S.root.querySelector('[data-inventory-notice]');if(box){box.hidden=false;box.textContent=message;box.dataset.error=error?'true':'false'}};
 async function rows(table,select='*',configure){
  const all=[];for(let from=0;from<10000;from+=1000){
   let q=S.ctx.db.from(table).select(select).in('company_id',S.ctx.companies);
   if(configure)q=configure(q);
   const {data,error}=await q.range(from,from+999);
   if(error)throw Error(error.message);all.push(...data);
   if(data.length<1000)break;
  }return all;
 }
 async function load(){
  const [products,materials,locations,balances,movements,docs,aggregates]=await Promise.all([
   rows('gr_crm_records','company_id,record_id,payload',q=>q.eq('kind','products')),
   rows('gr_ops_records','company_id,kind,record_id,payload',q=>q.in('kind',['material','bom','requisition'])),
   rows('gr_inventory_locations'),
   rows('gr_inventory_location_balances'),
   rows('gr_inventory_location_movements','*',q=>q.order('posted_at',{ascending:false}).limit(200)),
   rows('gr_production_documents','*',q=>q.in('kind',['po','job'])),
   rows('gr_production_balances')
  ]);
  const list=[];
  for(const r of products)list.push({company_id:r.company_id,id:r.record_id,code:r.payload.sku||r.payload.code||r.record_id,
   name:r.payload.name||'Untitled saleable product',stage:'FG',saleable:r.payload.saleable!==false,purchasable:!!r.payload.purchasable,
   unit:r.payload.uom||'nos',aggregate:r.payload.stock,material:r.payload,original:'crm'});
  for(const r of materials.filter(x=>x.kind==='material')){
   const p=r.payload||{};const stage=type(p.type),id=r.record_id;
   const overlap=list.some(i=>i.company_id===r.company_id&&i.code.trim().toLowerCase()===String(p.code||'').trim().toLowerCase());
   list.push({company_id:r.company_id,id,code:p.code||id,name:p.name||id,stage,saleable:typeof p.saleable==='boolean'?p.saleable:stage==='FG',
    purchasable:typeof p.purchasable==='boolean'?p.purchasable:stage==='RM'||p.source_type==='Buy',unit:p.uom||'nos',aggregate:aggregates.find(x=>x.company_id===r.company_id&&x.material_id===id)?.quantity??null,
    material:p,original:'ops',overlap});
  }
  S.items=list;S.bom=materials.filter(x=>x.kind==='bom');S.requisitions=materials.filter(x=>x.kind==='requisition');S.locations=locations;
  S.balances=balances;S.movements=movements;S.pos=docs.filter(x=>x.kind==='po');S.jobWork=docs.filter(x=>x.kind==='job');S.prodBalances=aggregates;
 }
 const getLocBalance=item=>S.balances.filter(b=>b.company_id===item.company_id&&b.item_kind===item.stage&&b.item_id===item.id)
   .reduce((sum,b)=>sum+Number(b.quantity||0),0);
 function layout(){
  const tabs=[['catalog','Product & Material Master'],['warehouses','Warehouse Stock'],['vendors','Vendor / Job Work Stock'],['bom','Multi-level BOM'],['purchasing','Purchase Shortages'],['activity','Stock Movement Audit']];
  S.root.innerHTML='<div class="gr-inventory"><header class="gr-inv-head"><div><small>GREENRICH ONE · INVENTORY</small><h2>Inventory & Material Control</h2><p>Saleable · Purchasable · Raw material · Intermediate · Semi-finished · Final goods</p></div>'+
   '<label>Company<select data-inv-company><option value="all"'+(S.scope==='all'?' selected':'')+'>All assigned companies</option>'+companyOptions()+'</select></label></header>'+
   '<p class="gr-inv-warning">Location stock is based on verified physical counts and transfers. Existing CRM saleable stock and production balances are shown separately until reconciled; locations are NOT auto-filled from aggregate stock.</p>'+
   '<div class="gr-inv-tabs">'+tabs.map(([key,name])=>'<button type="button" data-inv-tab="'+key+'"'+(S.tab===key?' class="active"':'')+'>'+name+'</button>').join('')+
   '<button type="button" data-inv-legacy>Open Saleable Product Editor</button><button type="button" data-inv-operations>Operations & Production</button></div>'+
   '<div data-inventory-notice role="status" hidden></div><div data-inventory-content></div></div>';
  S.root.querySelector('[data-inv-company]').onchange=e=>{S.scope=e.target.value;S.focus=null;layout();draw()};
  S.root.querySelectorAll('[data-inv-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.invTab;S.focus=null;layout();draw()});
  S.root.querySelector('[data-inv-legacy]').onclick=()=>S.ctx.openLegacy(S.root);
  S.root.querySelector('[data-inv-operations]').onclick=()=>S.ctx.openOperations();
 }
 function draw(){
  const box=S.root.querySelector('[data-inventory-content]');if(!box)return;
  if(S.focus){box.innerHTML=detail(S.focus);bind();return;}
  box.innerHTML=S.tab==='catalog'?catalog():S.tab==='warehouses'?warehouse():S.tab==='vendors'?vendorStock():
   S.tab==='bom'?bom():S.tab==='purchasing'?purchase():audit();
  bind();
 }
 const kindCount=k=>S.items.filter(i=>inScope(i)&&i.stage===k).length;

 function catalog(){
  const items=scopedItems();
  const selected=items.length;
  const cards=items.map((i,n)=>{
   const image=i.material?.image_url||i.material?.image||i.material?.photo_url||'';
   const price=i.material?.price||i.material?.selling_price||i.material?.sales_price;
   const qty=i.aggregate===null||i.aggregate===undefined?'Not recorded':fmt(i.aggregate)+' '+esc(i.unit);
   const initials=esc((i.name||i.code).slice(0,2).toUpperCase());
   return '<button type="button" class="gr-inv-product-card" data-inv-item="'+n+'"><span class="gr-inv-product-copy"><b>'+esc(i.name)+'</b><small>'+esc(i.code)+' · '+esc(names[i.stage])+'</small>'+
    (price!==undefined&&price!==null&&price!==''?'<strong>₹ '+fmt(price)+'</strong>':'')+
    '<span class="gr-inv-onhand">'+qty+' <span>On Hand (aggregate)</span></span></span>'+
    (image?'<img loading="lazy" alt="" src="'+esc(image)+'" onerror="this.hidden=true">':'<span class="gr-inv-product-placeholder">'+initials+'</span>')+'</button>';
  }).join('');
  const list='<div class="gr-inv-scroll"><table><thead><tr><th>Code / Item</th><th>Level</th><th>Saleable</th><th>Purchasable</th><th>Aggregate stock</th><th>Verified locations</th><th></th></tr></thead><tbody>'+
   (items.map((i,n)=>'<tr><td><strong>'+esc(i.code)+'</strong><small>'+esc(i.name)+'</small></td><td>'+esc(i.stage)+'</td><td>'+(i.saleable?'Yes':'—')+'</td><td>'+(i.purchasable?'Yes':'—')+
   '</td><td>'+(i.aggregate===null||i.aggregate===undefined?'Not recorded':fmt(i.aggregate)+' '+esc(i.unit))+'</td><td>'+fmt(getLocBalance(i))+' '+esc(i.unit)+'</td><td><button data-inv-item="'+n+'">View</button></td></tr>').join('')||
   '<tr><td colspan="7">No products found.</td></tr>')+'</tbody></table></div>';
  return '<div class="gr-inv-catalog-head"><div><h3>Products</h3><small>'+selected+' products · '+S.items.filter(inScope).length+' total in selected company</small></div><div class="gr-inv-catalog-actions"><button type="button" data-inv-view="cards" class="'+(S.view==='cards'?'active':'')+'" aria-label="Card view">▦ Cards</button><button type="button" data-inv-view="list" class="'+(S.view==='list'?'active':'')+'" aria-label="List view">☷ List</button></div></div>'+
   '<div class="gr-inv-controls"><input type="search" data-inv-search value="'+esc(S.filter)+'" placeholder="Search products by name, code or stage" aria-label="Search products"></div>'+
   '<div class="gr-inv-stats">'+stages.map(k=>'<article><small>'+names[k]+'</small><strong>'+kindCount(k)+'</strong></article>').join('')+'</div>'+
   (S.view==='list'?list:'<div class="gr-inv-product-grid">'+(cards||'<p>No products found.</p>')+'</div>')+
   '<p class="gr-inv-footnote">On-hand figures are from existing aggregate records. Verified warehouse balances are kept separate until reconciled.</p>';
 }
 const scopedItems=()=>S.items.filter(inScope).filter(i=>!S.filter||[i.code,i.name,i.stage].join(' ').toLowerCase().includes(S.filter.toLowerCase()));

 function detail(index){
  const item=S.items.find(i=>i.company_id===index.co&&i.id===index.id&&i.original===index.original);
  if(!item)return '<p>Product not found</p>';
  const m=item.material||{}, amounts=S.locations.filter(x=>x.company_id===item.company_id);
  const edges=S.bom.filter(x=>x.company_id===item.company_id&&String(x.payload.parent_code||'').toLowerCase()===item.code.toLowerCase());
  const recent=S.movements.filter(x=>x.company_id===item.company_id&&x.item_kind===item.stage&&x.item_id===item.id).slice(0,15);
  const t=(S.detailTab==='sales'&&!item.saleable)||(S.detailTab==='purchase'&&!item.purchasable)?'general':(S.detailTab||'general'), image=m.image_url||m.image||m.photo_url||'';
  const field=(label,value)=>'<div class="gr-inv-field"><b>'+esc(label)+'</b><span>'+esc(value===null||value===undefined||value===''?'—':value)+'</span></div>';
  const toolbar='<div class="gr-inv-detail-toolbar"><button type="button" data-inv-back>‹ Products</button><span>'+esc(item.code)+'</span><div class="gr-inv-detail-tools"><button type="button" data-inv-detail-action="warehouses">▥ Warehouses</button><button type="button" data-inv-detail-action="bom">⚗ Bill of Materials <b>'+edges.length+'</b></button><button type="button" data-inv-detail-action="activity">▥ Movements <b>'+recent.length+'</b></button></div></div>';
  const editable=S.ctx.can('stock','edit');
  const intro='<div class="gr-inv-product-hero"><div class="gr-inv-hero-main"><h2>☆ '+esc(item.name)+'</h2>'+
   '<div class="gr-inv-flags"><label class="gr-inv-flag"><input type="checkbox" data-inv-flag="saleable" '+(item.saleable?'checked':'')+' '+(!editable?'disabled':'')+'><span>Sales</span></label>'+
   '<label class="gr-inv-flag"><input type="checkbox" data-inv-flag="purchasable" '+(item.purchasable?'checked':'')+' '+(!editable?'disabled':'')+'><span>Purchase</span></label></div>'+
   '<p class="gr-inv-footnote">'+(item.saleable&&item.purchasable?'Purchased and resold, or manufactured and sold':item.saleable?'Manufactured / stocked for sales':item.purchasable?'Purchased for internal use or production':'Not enabled for sales or purchase')+'</p></div>'+
   '<div class="gr-inv-hero-photo">'+(editable?'<button type="button" class="gr-inv-photo-target" data-inv-photo-trigger title="Click to upload or replace product image" aria-label="Click to upload product image">':'<div class="gr-inv-photo-target">')+(image?'<img alt="'+esc(item.name)+'" src="'+esc(image)+'" onerror="this.hidden=true">':'<div class="gr-inv-product-placeholder">+ Add image</div>')+(editable?'<span class="gr-inv-photo-hint">✎ Change image</span></button><input type="file" data-inv-photo accept="image/png,image/jpeg,image/webp" style="display:none" aria-label="Upload product image">':'</div>')+'</div></div>';
  const tabs=[['general','General Information'],...(item.saleable?[['sales','Sales']]:[]),...(item.purchasable?[['purchase','Purchase']]:[]),['inventory','Inventory']];
  let body='';
  if(t==='general')body='<div class="gr-inv-detail-columns gr-inv-odoo-general"><section>'+
   field('Product Type',m.product_type||'Goods')+field('Invoicing Policy',m.invoicing_policy||'Delivered quantities')+field('Track Inventory',m.track_inventory===false?'No':'Yes')+field('Quantity On Hand',item.aggregate===null||item.aggregate===undefined?'Not recorded':fmt(item.aggregate)+' '+item.unit)+
   '</section><section>'+field('Sales Price',m.price??m.selling_price??m.sales_price??'Not set')+field('Sales Taxes',m.sales_tax||m.tax_rate||'Not configured')+field('Cost',m.cost??m.cost_price??'Not recorded')+field('Purchase Taxes',m.purchase_tax||'Not configured')+
   field('Category',m.category||m.category_name)+field('Reference',m.reference||m.sku)+field('Barcode',m.barcode)+field('Tags',Array.isArray(m.tags)?m.tags.join(', '):m.tags)+
   '</section></div><section class="gr-inv-notes"><h4>Internal notes</h4><p>'+esc(m.notes||m.description||'No internal notes recorded.')+'</p></section>';
  if(t==='sales')body='<div class="gr-inv-detail-columns"><section><h4>Sales settings</h4>'+
    field('Can be sold',item.saleable?'Yes':'No')+field('Sales price',m.price??m.selling_price??m.sales_price??'Not set')+
    field('Invoicing policy',m.invoicing_policy||'Not configured')+field('Sales taxes',m.sales_tax||m.tax_rate||'Not configured')+
    '</section><section><h4>Upsell & cross-sell</h4>'+field('Optional products',Array.isArray(m.optional_products)?m.optional_products.join(', '):m.optional_products)+
    field('Sales description',m.sales_description||m.description||'Not recorded')+'</section></div>';
  if(t==='purchase')body='<div class="gr-inv-detail-columns"><section><h4>Purchase settings</h4>'+
    field('Can be purchased',item.purchasable?'Yes':'No')+field('Preferred vendor',m.preferred_vendor||m.preferred_vendor_id)+
    field('Lead time (days)',m.lead_time||m.delivery_time)+field('Vendor price',m.purchase_price||'Not recorded')+
    '<p class="gr-inv-footnote">Vendor prices and purchase orders are not generated automatically without approved supplier information.</p></section>'+
    '<section><h4>Purchase policy</h4>'+field('Bill control',m.bill_control||'On received quantities')+
    field('Purchase description',m.purchase_description||m.description)+'</section></div>';
  if(t==='inventory')body='<div class="gr-inv-detail-columns"><section><h4>Logistics</h4>'+
    field('Responsible',m.responsible||'Not assigned')+field('Weight',m.weight?m.weight+' kg':'Not recorded')+
    field('Volume',m.volume?m.volume+' m³':'Not recorded')+field('Delivery time',m.delivery_time?m.delivery_time+' days':'Not recorded')+
    field('Aggregate on hand',item.aggregate===null||item.aggregate===undefined?'Not recorded':fmt(item.aggregate)+' '+item.unit)+
    field('Verified in locations',fmt(getLocBalance(item))+' '+item.unit)+'</section>'+
    '<section><h4>Warehouse balances</h4>'+
    table(['Location','Verified stock'],amounts.map(l=>'<tr><td>'+esc(l.name)+'</td><td>'+fmt(S.balances.find(b=>b.company_id===item.company_id&&b.location_id===l.id&&b.item_id===item.id&&b.item_kind===item.stage)?.quantity||0)+' '+esc(item.unit)+'</td></tr>'))+
    '</section></div><div class="gr-inv-detail-columns"><section><h4>Bill of materials</h4>'+
    table(['Component','Quantity','Revision'],edges.map(b=>'<tr><td>'+esc(b.payload.child_code)+'</td><td>'+esc(b.payload.qty)+' '+esc(b.payload.uom)+'</td><td>'+esc(b.payload.revision)+'</td></tr>'))+
    '</section><section><h4>Recent stock movements</h4>'+
    table(['Action','Quantity','From → To'],recent.map(m=>'<tr><td>'+esc(m.action)+'</td><td>'+fmt(m.quantity)+' '+esc(m.uom)+'</td><td>'+esc(locName(m.from_location))+' → '+esc(locName(m.to_location))+'</td></tr>'))+'</section></div>'+
    '<p class="gr-inv-warning">Verified locations do not automatically overwrite the CRM product stock balance.</p>';
  return toolbar+'<div class="gr-inv-detail-panel">'+intro+'<div class="gr-inv-detail-tabs">'+tabs.map(([key,label])=>'<button type="button" data-inv-detail-tab="'+key+'" class="'+(key===t?'active':'')+'">'+label+'</button>').join('')+'</div><div class="gr-inv-detail-body">'+body+'</div></div>';
 }
 function table(heads,body){return '<div class="gr-inv-scroll"><table><thead><tr>'+heads.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+body.join('')+'</tbody></table></div>'}
 function warehouse(){
  const locs=S.locations.filter(inScope),items=S.items.filter(inScope),canEdit=S.ctx.can('stock','edit'),canApprove=S.ctx.can('stock','approve');
  const form='<form data-inv-form class="gr-inv-form"><h4>Verified physical count / Internal transfer</h4>'+
   '<div class="gr-inv-grid">'+choice('company','Company',S.ctx.companies.map(x=>[x,companyName(x)]),S.scope==='all'?'':S.scope)+
   choice('item','Product / Material',items.map(x=>[x.company_id+'|'+x.stage+'|'+x.id,x.code+' · '+x.name+' ['+x.stage+']']))+
   choice('action','Movement',[['verified_count','Verified physical count (Admin / Approver)'],['transfer','Transfer between locations']])+
   choice('from_location','From warehouse (transfer only)',locs.map(x=>[x.id,x.name]),'',false)+
   choice('to_location','To warehouse',locs.map(x=>[x.id,x.name]))+
   '<label>Quantity<input name="quantity" type="number" step="0.000001" min="0.000001" required></label>'+
   e('reference','Reference / challan', '',false)+
   e('notes','Reason / remarks','',false)+'</div>'+
   '<p>Physical count replaces the verified location quantity (not the aggregate CRM stock); transfers move only verified quantities. All actions are audited and cannot create negative warehouse stock.</p>'+
   '<button type="submit"'+(!canEdit?' disabled':'')+'>Record authorised movement</button></form>';
  const balances=S.balances.filter(inScope);
  return '<div class="gr-inv-stats">'+locs.filter(x=>x.kind==='warehouse'||x.kind==='marketplace').map(l=>'<article><small>'+esc(l.name)+'</small><strong>'+S.balances.filter(b=>b.location_id===l.id).length+' SKUs</strong></article>').join('')+'</div>'+
   '<h4>Location-wise verified on-hand quantity</h4>'+table(['Warehouse','Item / Stage','Quantity','UOM'],balances.map(b=>{
    const i=items.find(x=>x.company_id===b.company_id&&x.id===b.item_id&&x.stage===b.item_kind);
    return '<tr><td>'+esc(locName(b.location_id))+'</td><td>'+esc(i?.code||b.item_id)+' · '+esc(b.item_kind)+'</td><td>'+fmt(b.quantity)+'</td><td>'+esc(b.uom)+'</td></tr>'}))+
   (canEdit?form:'<p>Warehouse movements require stock edit permission.</p>');
 }
 function vendorStock(){
  const rows=S.jobWork.filter(inScope),open=rows.filter(d=>Number(d.payload.remaining)>0);
  const atVendor=open.reduce((m,d)=>{const p=d.payload||{},key=[d.company_id,p.vendor?.name,p.material?.uom].join('|');m[key]=(m[key]||0)+Number(p.remaining||0);return m},{});
  return '<h3>Material at job-work vendors</h3>'+
   '<p>Existing production STN / job-work ledger is the source of these figures. <b>Outstanding at vendor = issued − used − wastage − returned</b>. Each job is reconciled before closure.</p>'+
   '<div class="gr-inv-stats"><article><small>Job-work orders</small><strong>'+rows.length+'</strong></article><article><small>Outstanding STNs</small><strong>'+open.length+'</strong></article><article><small>Vendors with material</small><strong>'+Object.keys(atVendor).length+'</strong></article></div>'+
   table(['STN / Job reference','Vendor','Raw material','Issued','Used','Wastage','Returned','Outstanding','Status'],rows.map(d=>{
    const p=d.payload||{};return '<tr><td>'+esc(d.number)+'</td><td>'+esc(p.vendor?.name||'—')+'</td><td>'+esc(p.material?.name||p.material_id||'—')+
    '</td><td>'+fmt(p.issued)+' '+esc(p.material?.uom||'')+'</td><td>'+fmt(p.used)+'</td><td>'+fmt(p.waste)+'</td><td>'+fmt(p.returned)+'</td><td><strong>'+fmt(p.remaining)+'</strong></td><td>'+esc(d.status)+'</td></tr>'}))+
   '<h4>Vendor-wise outstanding balances</h4>'+table(['Company','Vendor','Outstanding','Unit'],Object.entries(atVendor).map(([key,value])=>{
    const [company,vendor,uom]=key.split('|');return '<tr><td>'+esc(companyName(company))+'</td><td>'+esc(vendor)+'</td><td>'+fmt(value)+'</td><td>'+esc(uom)+'</td></tr>'}))+
   '<button data-inv-operations>Open vendor issue, usage, wastage, returns & QC</button>'+
   '<p class="gr-inv-warning">Job-work material is not saleable warehouse stock. Issued and consumed quantities are linked to vendor STN, not invented as warehouse transfers.</p>';
 }
 function bom(){
  const mapped=S.bom.filter(inScope),all=S.items.filter(inScope);
  const edges=mapped.map(r=>({...r.payload,company_id:r.company_id}));
  const index=new Map(all.map(x=>[x.company_id+'|'+x.code.toLowerCase(),x]));
  const assignable=all.filter(i=>i.original==='ops');
  const choices=assignable.map(x=>[x.company_id+'|'+x.id,x.code+' · '+x.name+' ['+x.stage+']']);
  const form=S.ctx.can('stock','create')?'<form data-inv-bom class="gr-inv-form"><h4>Add draft BOM component</h4><p>A BOM component is recorded as a draft and must be technically verified before production release.</p><div class="gr-inv-grid">'+
   choice('company','Company',S.ctx.companies.map(x=>[x,companyName(x)]),S.scope==='all'?'':S.scope)+
   choice('parent','Parent product',choices)+choice('child','Child / input material',choices)+
   '<label>Quantity per parent<input type="number" name="qty" step="0.000001" min="0.000001" required></label>'+
   choice('uom','Unit',[['nos','nos'],['kg','kg'],['mtr','mtr'],['ltr','ltr'],['sets','sets']])+
   e('revision','BOM revision','R1')+
   e('operation','Operation / work centre','',false)+
   e('source','Make / Buy / Job work','',false)+
   e('notes','Remarks','',false)+'</div><button type="submit">Save Draft BOM Line</button></form>':'';
  return '<h3>Multi-level BOM and product transformation</h3><p>FG → SFG → IM → RM. Revisions, UOM conversion, make/buy/subcontract route, supplier, and quantities must be confirmed by Engineering before approval.</p>'+
   '<div class="gr-inv-flow"><span>FG final assembly</span><b>←</b><span>SFG welding / fitment</span><b>←</b><span>IM cutting / folding</span><b>←</b><span>RM purchase</span></div>'+
   '<p>Workbook reference: FG-001 MGB100 FRP · SFG-001 top hinge · IM-001 hinge plate · RM-001 SS sheet.</p>'+
   table(['Parent','Child','Stage','Required / parent','Revision','Status'],edges.map(r=>{
    const child=index.get(r.company_id+'|'+String(r.child_code||'').toLowerCase());
    return '<tr><td><strong>'+esc(r.parent_code)+'</strong></td><td>'+esc(r.child_code)+'</td><td>'+esc(child?.stage||'Review stage')+'</td><td>'+esc(r.qty)+' '+esc(r.uom)+'</td><td>'+esc(r.revision)+'</td><td>'+esc(r.status||'Draft')+'</td></tr>'}))+
   form+'<p class="gr-inv-warning">Source workbook records are sample mappings, not approved manufacturing recipes. Production cannot use unapproved BOM lines.</p>';
 }
 function purchase(){
  const items=S.items.filter(inScope).filter(i=>i.purchasable),po=S.pos.filter(inScope),pr=S.requisitions.filter(inScope);
  const shortages=items.filter(i=>i.original==='ops'&&i.aggregate!==null&&Number(i.aggregate)<=Number(i.material.reorder_level||0));
  const form=S.ctx.can('purchase','create')?'<form data-inv-pr class="gr-inv-form"><h4>Create purchase requisition from material shortage</h4><div class="gr-inv-grid">'+
   choice('item','Purchasable material',items.filter(i=>i.original==='ops').map(x=>[x.company_id+'|'+x.id,x.code+' · '+x.name+' ['+companyName(x.company_id)+']']))+
   '<label>Required quantity<input name="quantity" type="number" min="0.000001" step="0.000001" required></label>'+
   '<label>Need by<input name="need_by" type="date" required></label>'+
   e('reference','Production / Sales reference','',false)+e('notes','Shortage / purpose','',false)+'</div>'+
   '<button type="submit">Create Draft Purchase Requisition</button><p>Procurement approval, supplier quotation and PO issue remain in Purchase / Operations.</p></form>':'';
  return '<h3>Raw Material Purchase Planning</h3><p>Stock shortages can raise Purchase Requisitions. A PO is issued only after approval and vendor selection.</p>'+
   '<div class="gr-inv-stats"><article><small>Purchasable materials</small><strong>'+items.length+'</strong></article><article><small>Low/reorder candidates</small><strong>'+shortages.length+'</strong></article><article><small>Open requisitions</small><strong>'+pr.length+'</strong></article><article><small>Purchase orders</small><strong>'+po.length+'</strong></article></div>'+
   '<h4>Reorder alerts</h4>'+table(['Code','Material','Stock','Reorder level','Preferred source'],shortages.map(i=>'<tr><td>'+esc(i.code)+'</td><td>'+esc(i.name)+'</td><td>'+fmt(i.aggregate)+' '+esc(i.unit)+'</td><td>'+fmt(i.material.reorder_level)+'</td><td>'+esc(i.material.preferred_vendor||i.material.preferred_vendor_id||'—')+'</td></tr>'))+
   '<h4>Purchase requisitions</h4>'+table(['Reference','Material','Requested','Need by','Approval status'],pr.map(r=>'<tr><td>'+esc(r.payload.order_ref||r.record_id)+'</td><td>'+esc(r.payload.material_code)+'</td><td>'+fmt(r.payload.quantity)+' '+esc(r.payload.uom)+'</td><td>'+esc(r.payload.need_by||'—')+'</td><td>'+esc(r.payload.status)+'</td></tr>'))+
   '<h4>Live Purchase Orders</h4>'+table(['PO','Company','Vendor','Status','Date'],po.map(d=>'<tr><td>'+esc(d.number)+'</td><td>'+esc(companyName(d.company_id))+'</td><td>'+esc(d.payload.vendor?.name||'—')+'</td><td>'+esc(d.status)+'</td><td>'+esc(new Date(d.created_at).toLocaleDateString('en-IN'))+'</td></tr>'))+
   form+'<p><button data-inv-operations>Open Purchase Order / Production Planning</button></p>';
 }
 function audit(){
  return '<h3>Verified physical stock movement audit</h3>'+
   table(['Date','Company','Item','Movement','Qty','Source','Destination','Reference'],S.movements.filter(inScope).map(m=>'<tr><td>'+esc(new Date(m.posted_at).toLocaleString('en-IN'))+'</td><td>'+esc(companyName(m.company_id))+'</td><td>'+esc(m.item_code)+'</td><td>'+esc(m.action)+'</td><td>'+fmt(m.quantity)+' '+esc(m.uom)+'</td><td>'+esc(locName(m.from_location))+'</td><td>'+esc(locName(m.to_location))+'</td><td>'+esc(m.reference||'—')+'</td></tr>'));
 }
 function bind(){
  const input=S.root.querySelector('[data-inv-search]');if(input)input.oninput=e=>{S.filter=e.target.value;const pos=input.selectionStart;draw();const next=S.root.querySelector('[data-inv-search]');if(next){next.focus();next.setSelectionRange(pos,pos)}};
  S.root.querySelectorAll('[data-inv-item]').forEach(b=>b.onclick=()=>{
   const item=scopedItems()[Number(b.dataset.invItem)];if(item){S.focus={id:item.id,co:item.company_id,original:item.original};S.detailTab='general';draw()}
  });
  S.root.querySelectorAll('[data-inv-view]').forEach(b=>b.onclick=()=>{S.view=b.dataset.invView;draw()});
  S.root.querySelectorAll('[data-inv-flag]').forEach(input=>input.onchange=()=>{input.disabled=true;void saveFlags(input).catch(err=>{draw();notify(err.message,true)})});
  const photo=S.root.querySelector('[data-inv-photo]');S.root.querySelector('[data-inv-photo-trigger]')?.addEventListener('click',()=>photo?.click());if(photo)photo.onchange=()=>void savePhoto(photo).catch(err=>notify(err.message,true));
  S.root.querySelectorAll('[data-inv-detail-tab]').forEach(b=>b.onclick=()=>{const item=currentItem();if((b.dataset.invDetailTab==='sales'&&!item?.saleable)||(b.dataset.invDetailTab==='purchase'&&!item?.purchasable))return;S.detailTab=b.dataset.invDetailTab;draw()});
  S.root.querySelectorAll('[data-inv-detail-action]').forEach(b=>b.onclick=()=>{const dest=b.dataset.invDetailAction;if(dest==='warehouses'){S.detailTab='inventory';draw()}else{S.focus=null;S.tab=dest;layout();draw()}});
  S.root.querySelector('[data-inv-back]')?.addEventListener('click',()=>{S.focus=null;draw()});
  S.root.querySelectorAll('[data-inv-operations]').forEach(b=>b.onclick=()=>S.ctx.openOperations());
  const f=S.root.querySelector('[data-inv-form]');if(f)f.onsubmit=event=>void post(event).catch(e=>notify(e.message,true));
  const bomForm=S.root.querySelector('[data-inv-bom]');if(bomForm)bomForm.onsubmit=e=>void saveBom(e).catch(err=>notify(err.message,true));
  const prForm=S.root.querySelector('[data-inv-pr]');if(prForm)prForm.onsubmit=e=>void savePr(e).catch(err=>notify(err.message,true));
 }

 function currentItem(){
  return S.items.find(i=>S.focus&&i.company_id===S.focus.co&&i.id===S.focus.id&&i.original===S.focus.original);
 }
 async function updateItem(item,changes){
  if(S.busy||!S.ctx.can('stock','edit'))throw Error('Inventory edit permission required');
  if(!S.ctx.companies.includes(item.company_id))throw Error('Company access denied');
  S.busy=true;
  try{
   const tableName=item.original==='crm'?'gr_crm_records':'gr_ops_records';
   const kind=item.original==='crm'?'products':'material';
   const {data:current,error:readError}=await S.ctx.db.from(tableName).select('payload').eq('company_id',item.company_id).eq('kind',kind).eq('record_id',item.id).single();
   if(readError||!current)throw Error(readError?.message||'Product not found');
   const payload={...(current.payload||{}),...changes};
   const {data,error}=await S.ctx.db.from(tableName).update({payload}).eq('company_id',item.company_id).eq('kind',kind).eq('record_id',item.id).select('record_id');
   if(error)throw Error(error.message);
   if(!data?.length)throw Error('Update was not authorised or no matching record was found');
   item.material=payload;
   item.saleable=typeof payload.saleable==='boolean'?payload.saleable:item.saleable;
   item.purchasable=typeof payload.purchasable==='boolean'?payload.purchasable:item.purchasable;
   draw();notify('Product settings saved.');
  }finally{S.busy=false}
 }
 async function saveFlags(input){
  const item=currentItem();if(!item)throw Error('Select a product');
  const flag=input.dataset.invFlag;
  if(!['saleable','purchasable'].includes(flag))throw Error('Invalid product setting');
  const changes={[flag]:input.checked};
  if(!input.checked&&S.detailTab===(flag==='saleable'?'sales':'purchase'))S.detailTab='general';
  await updateItem(item,changes);
 }
 async function savePhoto(input){
  const item=currentItem(),file=input.files?.[0];
  if(!item||!file)return;
  if(!S.ctx.can('stock','edit'))throw Error('Inventory edit permission required');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3*1024*1024)throw Error('Select a PNG, JPG or WebP image up to 3 MB');
  if(S.busy)throw Error('Another inventory update is in progress');
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path='inventory-products/'+item.company_id+'/'+uid()+'.'+ext;
  const storage=S.ctx.db.storage.from('greenrich-branding');
  S.busy=true;
  try{
   const {error}=await storage.upload(path,file,{contentType:file.type,upsert:false});
   if(error)throw Error('Image upload failed: '+error.message);
  }finally{S.busy=false}
  const url=storage.getPublicUrl(path).data.publicUrl;
  if(!url)throw Error('Unable to generate product image URL');
  await updateItem(item,{image_url:url});
  notify('Product image saved and visible on inventory cards.');
 }
 async function saveBom(event){
  event.preventDefault();if(S.busy||!S.ctx.can('stock','create'))throw Error('Stock create permission required');
  const fd=new FormData(event.target),co=String(fd.get('company'));
  if(!S.ctx.companies.includes(co))throw Error('Company permission denied');
  const parent=S.items.find(i=>i.company_id===co&&i.original==='ops'&&co+'|'+i.id===fd.get('parent'));
  const child=S.items.find(i=>i.company_id===co&&i.original==='ops'&&co+'|'+i.id===fd.get('child'));
  if(!parent||!child)throw Error('Select parent and child in the same company');
  if(stages.indexOf(child.stage)<=stages.indexOf(parent.stage))throw Error('BOM must flow from FG → SFG → IM → RM (parent must be a higher production stage)');
  const qty=Number(fd.get('qty'));if(!(qty>0))throw Error('Positive quantity required');
  const previous=S.bom.some(b=>b.company_id===co&&b.payload.parent_code===parent.code&&b.payload.child_code===child.code&&b.payload.revision===fd.get('revision'));
  if(previous)throw Error('This BOM component already exists in the selected revision');
  if(!window.confirm('Save draft BOM component '+parent.code+' ← '+child.code+'?'))return;
  const record={company_id:co,kind:'bom',record_id:uid(),payload:{
   parent_code:parent.code,child_code:child.code,qty,uom:String(fd.get('uom')),revision:String(fd.get('revision')),
   operation:String(fd.get('operation')||''),source_type:String(fd.get('source')||''),notes:String(fd.get('notes')||''),
   status:'Draft',created_by:S.ctx.userId
  }};
  S.busy=true;
  try{
   const {error}=await S.ctx.db.from('gr_ops_records').insert(record);
   if(error)throw Error(error.message);
   await load();draw();notify('Draft BOM line saved. Engineering approval required before production.');
  }finally{S.busy=false}
 }
 async function savePr(event){
  event.preventDefault();if(S.busy||!S.ctx.can('purchase','create'))throw Error('Purchase permission required');
  const fd=new FormData(event.target),entry=String(fd.get('item'));
  const item=S.items.find(i=>i.original==='ops'&&i.purchasable&&i.company_id+'|'+i.id===entry);
  if(!item||!S.ctx.companies.includes(item.company_id))throw Error('Choose an authorised purchasable material');
  const quantity=Number(fd.get('quantity'));if(!(quantity>0))throw Error('Positive requested quantity required');
  const record={company_id:item.company_id,kind:'requisition',record_id:uid(),payload:{
   order_ref:String(fd.get('reference')||'PR-'+Date.now()),material_code:item.code,quantity,uom:item.unit,
   need_by:String(fd.get('need_by')),requester:S.ctx.userId,status:'Draft',notes:String(fd.get('notes')||''),
   material_id:item.id
  }};
  if(!window.confirm('Create draft purchase requisition for '+item.code+' · '+quantity+' '+item.unit+'?'))return;
  S.busy=true;
  try{
   const {error}=await S.ctx.db.from('gr_ops_records').insert(record);
   if(error)throw Error(error.message);
   await load();draw();notify('Purchase requisition saved as Draft. Approval and PO required.');
  }finally{S.busy=false}
 }
 async function post(event){
  event.preventDefault();if(S.busy)return;
  const fd=new FormData(event.target),co=String(fd.get('company')),kind=String(fd.get('action'));
  if(!S.ctx.companies.includes(co))throw Error('Company access denied');
  const item=S.items.find(i=>i.company_id===co&&[i.company_id,i.stage,i.id].join('|')===fd.get('item'));
  if(!item)throw Error('Choose a product belonging to this company');
  if(kind==='verified_count'&&!S.ctx.can('stock','approve'))throw Error('Stock approval permission required for physical count');
  const quantity=Number(fd.get('quantity')),from=String(fd.get('from_location')),to=String(fd.get('to_location'));
  if(!Number.isFinite(quantity)||quantity<=0)throw Error('Positive quantity required');
  const destination=S.locations.find(x=>x.id===to&&x.company_id===co);
  if(!destination)throw Error('Select destination warehouse in the chosen company');
  if(kind==='transfer'&&!S.locations.find(x=>x.id===from&&x.company_id===co))throw Error('Select source warehouse in the chosen company');
  if(!window.confirm((kind==='verified_count'?'Record verified count':'Transfer stock')+' for '+item.code+' · '+quantity+' '+item.unit+'?'))return;
  S.busy=true;const button=event.target.querySelector('[type=submit]');button.disabled=true;
  try{
   const {data,error}=await S.ctx.db.rpc('gr_inventory_location_action',{p_company:co,p_action:kind,p_input:{
    item_kind:item.stage,item_id:item.id,item_code:item.code,uom:item.unit,quantity,
    from_location:kind==='transfer'?from:null,to_location:to,
    reference:String(fd.get('reference')||''),notes:String(fd.get('notes')||'')
   },p_request:uid()});
   if(error)throw Error(error.message);
   await load();draw();notify(data?.message||'Inventory location updated');
  }finally{S.busy=false;button.disabled=false}
 }
 async function mount(root,context){
  S.root=root;S.ctx=context;S.scope=context.scope||context.companies[0];S.tab='catalog';S.focus=null;
  root.innerHTML='<div class="gr-inventory">Loading Inventory…</div>';
  try{await load();layout();draw()}catch(e){root.innerHTML='<div class="gr-inventory"><h2>Inventory</h2><p>Could not load inventory: '+esc(e.message)+'</p><button data-retry>Retry</button></div>';root.querySelector('[data-retry]').onclick=()=>void mount(root,context)}
 }
 window.GreenRichInventory={mount};
})();