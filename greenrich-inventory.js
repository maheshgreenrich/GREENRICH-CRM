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
 const S={root:null,ctx:null,tab:'catalog',scope:'',items:[],bom:[],locations:[],balances:[],movements:[],pos:[],jobWork:[],sales:null,dispatch:null,requisitions:[],prodBalances:[],focus:null,filter:'',materialFilter:'all',view:'cards',detailTab:'general',creating:false,createTab:'general',newPhotoUrl:null,busy:false};
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
  // Sales/dispatch access is independently permissioned. An inaccessible source is
  // unknown (—), never silently treated as zero outstanding orders.
  const [salesResult,dispatchResult]=await Promise.allSettled([
   rows('gr_crm_records','company_id,record_id,payload',q=>q.eq('kind','sales')),
   rows('gr_dispatch_orders','company_id,id,source_sale_id,order_id,sku,product_name,quantity,status')
  ]);
  S.sales=salesResult.status==='fulfilled'?salesResult.value:null;
  S.dispatch=dispatchResult.status==='fulfilled'?dispatchResult.value:null;
  const list=[];
  for(const r of products)list.push({company_id:r.company_id,id:r.record_id,code:r.payload.sku||r.payload.code||r.record_id,
   name:r.payload.name||'Untitled saleable product',stage:type(r.payload.material_type||'FG'),stockKind:'FG',saleable:r.payload.saleable!==false,purchasable:!!r.payload.purchasable,
   unit:r.payload.uom||'nos',aggregate:r.payload.stock,material:r.payload,original:'crm'});
  for(const r of materials.filter(x=>x.kind==='material')){
   const p=r.payload||{};const stage=type(p.type),id=r.record_id;
   const overlap=list.some(i=>i.company_id===r.company_id&&i.code.trim().toLowerCase()===String(p.code||'').trim().toLowerCase());
   list.push({company_id:r.company_id,id,code:p.code||id,name:p.name||id,stage:type(p.material_type||stage),stockKind:stage,saleable:typeof p.saleable==='boolean'?p.saleable:stage==='FG',
    purchasable:typeof p.purchasable==='boolean'?p.purchasable:stage==='RM'||p.source_type==='Buy',unit:p.uom||'nos',aggregate:aggregates.find(x=>x.company_id===r.company_id&&x.material_id===id)?.quantity??null,
    material:p,original:'ops',overlap});
  }
  S.items=list;S.bom=materials.filter(x=>x.kind==='bom');S.requisitions=materials.filter(x=>x.kind==='requisition');S.locations=locations;
  S.balances=balances;S.movements=movements;S.pos=docs.filter(x=>x.kind==='po');S.jobWork=docs.filter(x=>x.kind==='job');S.prodBalances=aggregates;
 }
 const getLocBalance=item=>S.balances.filter(b=>b.company_id===item.company_id&&b.item_kind===(item.stockKind||item.stage)&&b.item_id===item.id)
   .reduce((sum,b)=>sum+Number(b.quantity||0),0);

 // Read-only per-product indicators. Never mutate authoritative balances.
 const metricNum=value=>value===null||value===undefined||value===''?null:
  (Number.isFinite(Number(value))?Number(value):null);
 const nonNegative=value=>Math.max(0,metricNum(value)??0);
 const key=v=>String(v??'').trim().toLowerCase();
 function matchesMetricItem(item,p={}){
  if(!p||typeof p!=='object')return false;
  const id=p.product_id??p.item_id;
  const code=p.sku??p.code??p.product_code??p.material_code??p.material_id;
  if(id!==null&&id!==undefined&&String(id)===String(item.id))return true;
  const aliases=Array.isArray(item.material?.sku_aliases)?item.material.sku_aliases:[];
  const allCodes=[item.code,...aliases].map(key);
  if(code!==null&&code!==undefined&&key(code))return allCodes.includes(key(code));
  if(id!==null&&id!==undefined&&key(id))return allCodes.includes(key(id));
  const name=p.product_name??p.item_name??p.name;
  return !!name&&key(name)===key(item.name);
 }
 function productMetrics(item,sources){
  const material=item.material||{};
  const sameCompany=r=>r.company_id===item.company_id;
  const bomLines=(sources.bom||[]).filter(r=>sameCompany(r)&&[item.code,...(Array.isArray(material.sku_aliases)?material.sku_aliases:[])].some(code=>key(r.payload?.parent_code)===key(code)));
  const bomCount=new Set(bomLines.map(r=>String(r.payload?.revision||'Unversioned'))).size;
  const approvedPos=(sources.pos||[]).filter(d=>sameCompany(d)&&!['draft','cancelled','canceled','rejected','void'].includes(key(d.status)) &&
    Array.isArray(d.payload?.lines)&&d.payload.lines.some(line=>matchesMetricItem(item,line)));
  const pendingPO=approvedPos.reduce((sum,d)=>sum+(key(d.status)==='received'||key(d.status)==='closed'?0:
    d.payload.lines.filter(line=>matchesMetricItem(item,line)).reduce((sub,line)=>sub+Math.max(0,nonNegative(line.quantity)-nonNegative(line.received)),0)),0);
  const salesAvailable=Array.isArray(sources.sales);
  const dispatchAvailable=Array.isArray(sources.dispatch);
  const sales=salesAvailable?sources.sales.filter(r=>sameCompany(r)&&matchesMetricItem(item,r.payload||{})):[];
  const completedSales=sales.filter(r=>['completed','delivered','fulfilled','closed'].includes(key(r.payload?.status)));
  const pendingSales=sales.filter(r=>['pending','approved','confirmed','processing','ready to dispatch','partially dispatched','partly dispatched'].includes(key(r.payload?.status)));
  const dispatch=dispatchAvailable?sources.dispatch.filter(d=>sameCompany(d)&&matchesMetricItem(item,d)):[];
  const openDispatch=dispatch.filter(d=>['pending','approved','confirmed','processing','packing','packed','ready','ready to dispatch'].includes(key(d.status)));
  const deliveredDispatch=dispatch.filter(d=>['delivered','completed'].includes(key(d.status)));
  const saleRefs=new Set(sales.map(s=>String(s.record_id)));
  const dispatchedSaleRefs=new Set(openDispatch.map(d=>String(d.source_sale_id||'')).filter(Boolean));
  const sold=salesAvailable&&dispatchAvailable?completedSales.reduce((sum,r)=>sum+nonNegative(r.payload?.qty),0)+
    deliveredDispatch.filter(d=>!d.source_sale_id||!saleRefs.has(String(d.source_sale_id))).reduce((sum,d)=>sum+nonNegative(d.quantity),0):null;
  const outgoing=salesAvailable&&dispatchAvailable?pendingSales.filter(r=>!dispatchedSaleRefs.has(String(r.record_id))).reduce((sum,r)=>sum+nonNegative(r.payload?.qty),0)+
    openDispatch.reduce((sum,d)=>sum+nonNegative(d.quantity),0):null;
  const jobs=(sources.jobWork||[]).filter(sameCompany);
  const openJobs=jobs.filter(d=>!['completed','cancelled','canceled','closed'].includes(key(d.status)));
  const subcontractOut=openJobs.filter(j=>matchesMetricItem(item,j.payload?.material||{}))
   .reduce((sum,j)=>sum+nonNegative(j.payload?.remaining),0);
  const outputJobs=openJobs.filter(j=>matchesMetricItem(item,{
    product_id:j.payload?.output_product_id,
    code:j.payload?.output_material_code||j.payload?.output_product_code||j.payload?.output_item_code
  }));
  let subcontractIn=0;
  for(const j of outputJobs){
   const planned=metricNum(j.payload?.expected_output??j.payload?.planned_output_qty);
   if(planned===null){subcontractIn=null;break;}
   subcontractIn+=Math.max(0,planned-nonNegative(j.payload?.output));
  }
  const onHand=metricNum(item.aggregate);
  const min=metricNum(material.min_stock??material.reorder_level??material.min_qty??material.min_level);
  const max=metricNum(material.max_stock??material.max_level??material.maximum_stock??material.max_qty);
  const incoming=pendingPO;
  const forecast=onHand===null||outgoing===null?null:onHand+incoming-outgoing;
  return {onHand,forecast,bomCount,bomLines:bomLines.length,sold,outgoing,
   incoming,purchaseOrders:approvedPos.length,min,max,subcontractIn,subcontractOut,
   lowStock:min!==null&&onHand!==null&&onHand<min};
 }
 const showMetric=(value,uom='')=>value===null||value===undefined?'—':fmt(value)+(uom?' '+esc(uom):'');
 function productStatusVisibility(item){
  // Sales/Purchase flags control display, never physical stock or forecast math.
  return ['stock','bom',...(item.saleable?['sales']:[]),
   ...(item.purchasable?['purchases']:[]),'reorder','subcontract'];
 }
 function stockSummary(item,metrics){
  const unit=item.unit||'nos';
  const chip=(name,main,sub,tip,accent='')=>'<div class="gr-inv-metric '+accent+
   '" data-inv-status="'+name+'" title="'+esc(tip)+'" role="group" aria-label="'+esc(name)+'">'+
   '<strong>'+main+'</strong>'+(sub?'<small>'+sub+'</small>':'')+'</div>';
  const cards={
   stock:chip('stock',showMetric(metrics.onHand,unit)+' <span>On Hand</span>',
    showMetric(metrics.forecast,unit)+' Forecasted',
    'Actual On Hand changes only on physical transactions. Forecast = On Hand + pending PO receipts − pending sales / dispatches.','gr-inv-metric-primary'),
   bom:chip('bom',showMetric(metrics.bomCount)+' <span>Bill of Materials</span>',
    metrics.bomLines+' component lines','BOM revisions and component lines'),
   sales:chip('sales',showMetric(metrics.sold)+' <span>Sold</span>',
    showMetric(metrics.outgoing,unit)+' Outgoing',
    'Completed sales and pending dispatches; shown only when Sales is selected'),
   purchases:chip('purchases',showMetric(metrics.purchaseOrders)+' <span>Purchase Orders</span>',
    showMetric(metrics.incoming,unit)+' Incoming',
    'Approved purchase orders and incoming quantities; shown only when Purchase is selected'),
   reorder:chip('reorder','Min: '+showMetric(metrics.min),
    'Max: '+showMetric(metrics.max),'Configured minimum and maximum reorder levels',metrics.lowStock?'gr-inv-metric-danger':''),
   subcontract:chip('subcontract','In: '+showMetric(metrics.subcontractIn),
    'Out: '+showMetric(metrics.subcontractOut),'Subcontracting incoming and outgoing quantities')
  };
  return '<div class="gr-inv-summary" role="region" aria-label="Product inventory status">'+
   productStatusVisibility(item).map(name=>cards[name]).join('')+'</div>'+
   (metrics.lowStock?'<div class="gr-inv-low-stock" role="alert">⚠ Low stock: '+esc(item.name)+
    ' has '+showMetric(metrics.onHand,unit)+' remaining, below the minimum of '+
    showMetric(metrics.min,unit)+'. Please check and replenish stock.</div>':'');
 }
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
  if(S.creating){box.innerHTML=newInventoryForm();bind();return;}
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
    (i.material?.track_inventory===false?'':'<span class="gr-inv-onhand">'+qty+' <span>On Hand (aggregate)</span></span>')+'</span>'+
    (image?'<img loading="lazy" alt="" src="'+esc(image)+'" onerror="this.hidden=true">':'<span class="gr-inv-product-placeholder">'+initials+'</span>')+'</button>';
  }).join('');
  const list='<div class="gr-inv-scroll"><table><thead><tr><th>Code / Item</th><th>Level</th><th>Saleable</th><th>Purchasable</th><th>Aggregate stock</th><th>Verified locations</th><th></th></tr></thead><tbody>'+
   (items.map((i,n)=>'<tr><td><strong>'+esc(i.code)+'</strong><small>'+esc(i.name)+'</small></td><td>'+esc(i.stage)+'</td><td>'+(i.saleable?'Yes':'—')+'</td><td>'+(i.purchasable?'Yes':'—')+
   '</td><td>'+(i.aggregate===null||i.aggregate===undefined?'Not recorded':fmt(i.aggregate)+' '+esc(i.unit))+'</td><td>'+fmt(getLocBalance(i))+' '+esc(i.unit)+'</td><td><button data-inv-item="'+n+'">View</button></td></tr>').join('')||
   '<tr><td colspan="7">No products found.</td></tr>')+'</tbody></table></div>';
  return '<div class="gr-inv-catalog-head"><div><h3>Products</h3><small>'+selected+' products · '+S.items.filter(inScope).length+' total in selected company</small></div><div class="gr-inv-catalog-actions">'+(S.ctx.can('stock','create')?'<button type="button" class="gr-inv-add-new" data-inv-create-open>+ Add New Inventory</button>':'')+'<button type="button" data-inv-view="cards" class="'+(S.view==='cards'?'active':'')+'" aria-label="Card view">▦ Cards</button><button type="button" data-inv-view="list" class="'+(S.view==='list'?'active':'')+'" aria-label="List view">☷ List</button></div></div>'+
   '<div class="gr-inv-controls"><input type="search" data-inv-search value="'+esc(S.filter)+'" placeholder="Search products by name, code or stage" aria-label="Search products">'+'<label class="gr-inv-type-filter"><span>Material Type</span><select data-inv-material-filter aria-label="Filter inventory by material type"><option value="all"'+(S.materialFilter==='all'?' selected':'')+'>All Materials</option>'+stages.map(stage=>'<option value="'+stage+'"'+(S.materialFilter===stage?' selected':'')+'>'+stage+' — '+esc(names[stage])+'</option>').join('')+'</select></label></div>'+
   '<div class="gr-inv-stats">'+stages.map(k=>'<article><small>'+names[k]+'</small><strong>'+kindCount(k)+'</strong></article>').join('')+'</div>'+
   (S.view==='list'?list:'<div class="gr-inv-product-grid">'+(cards||'<p>No products found.</p>')+'</div>')+
   '<p class="gr-inv-footnote">On-hand figures are from existing aggregate records. Verified warehouse balances are kept separate until reconciled.</p>';
 }

 function newInventoryForm(ctx=S.ctx,scope=S.scope){
 const opts=(arr,sel)=>arr.map(([id,name])=>'<option value="'+esc(id)+'"'+(id===sel?' selected':'')+'>'+esc(name)+'</option>').join('');
 const input=(name,label,placeholder='',type='text',required=false)=>'<label class="gr-inv-new-field"><b>'+label+(required?' *':'')+'</b><input name="'+name+'" type="'+type+'" '+(type==='number'?'step="any" min="0"':'')+(required?'required':'')+' placeholder="'+esc(placeholder)+'" value=""></label>';
 const select=(name,label,options,initial)=>'<label class="gr-inv-new-field"><b>'+label+'</b><select name="'+name+'">'+opts(options,initial)+'</select></label>';
 const notes=(name,label)=>'<label class="gr-inv-new-field"><b>'+label+'</b><textarea rows="3" name="'+name+'" placeholder="Click to enter details"></textarea></label>';
 const companies=opts(ctx.companies.map(id=>[id,ctx.companyName(id)]),scope==='all'?ctx.companies[0]:scope);
 const tabs=[['general','General Information'],['sales','Sales'],['purchase','Purchase'],['inventory','Inventory']];
 return '<section class="gr-inv-new-page" data-inv-new-page><form data-inv-create-form novalidate>'+
  '<div class="gr-inv-new-bar"><div><button type="button" data-inv-create-cancel>‹ Products</button> <b>New Product</b></div>'+
  '<div><button type="button" data-inv-create-cancel>Discard</button> <button class="gr-inv-create-submit" type="submit">Save Product</button></div></div>'+
  '<div class="gr-inv-new-stats"><span>⚗ Bill of Materials 0</span><span data-inv-new-stat="sales">▥ 0 Sold · 0 Outgoing</span><span data-inv-new-stat="purchases">▤ 0 Purchase Orders · 0 Incoming</span><span>↻ Reordering Rules 0</span><span>⇄ In: 0 · Out: 0</span></div>'+
  '<div class="gr-inv-new-panel"><div class="gr-inv-new-hero"><div class="gr-inv-new-titlewrap">'+
  '<label class="gr-inv-new-title">☆ <input name="name" type="text" placeholder="e.g. 25 L Home Composter" maxlength="180" required aria-label="Product Name"></label>'+
  '<div class="gr-inv-new-code">'+input('code','Product Code / SKU','e.g. GRCOM25','text',true)+'</div>'+
  '<div class="gr-inv-new-material"><label><span>Material Type</span><select name="stage" data-inv-create-material-type>'+stages.map(t=>'<option value="'+t+'">'+t+'</option>').join('')+'</select></label>'+
  '<input name="material_text" data-inv-create-material-text type="text" maxlength="80" aria-label="Material Text" placeholder="Type here, e.g. 001"><output data-inv-create-material-full aria-label="Full Material Text">FG</output></div>'+'<div class="gr-inv-new-flags"><label><input type="checkbox" name="saleable" checked> Sales</label><label><input type="checkbox" name="purchasable" checked> Purchase</label></div>'+
  '<small>All fields are new. The product is not created until you save.</small></div>'+
  '<div class="gr-inv-new-photo"><button type="button" data-inv-create-photo-trigger aria-label="Click to select product image"><span data-inv-create-photo-icon>📷</span><img data-inv-create-preview hidden alt="New product image preview"><small>+ Add image</small></button>'+
  '<input data-inv-create-photo type="file" accept="image/png,image/jpeg,image/webp" hidden><small>PNG, JPG, WebP · max 3 MB</small></div></div>'+
  '<div class="gr-inv-new-tabs" role="tablist" aria-label="Product settings">'+tabs.map(([id,label])=>
   '<button type="button" role="tab" data-inv-create-tab="'+id+'" class="'+(id==='general'?'active':'')+'" aria-selected="'+(id==='general'?'true':'false')+'">'+label+'</button>').join('')+'</div>'+
  '<div class="gr-inv-new-body">'+
  '<section data-inv-create-pane="general"><div class="gr-inv-new-cols"><div>'+
  select('product_type','Product Type',[['Goods','Goods'],['Service','Service'],['Combo','Combo']],'Goods')+
  select('invoicing_policy','Invoicing Policy',[['Ordered quantities','Ordered quantities'],['Delivered quantities','Delivered quantities']],'Ordered quantities')+
  '<label class="gr-inv-new-field"><b>Track Inventory</b><span><input type="checkbox" name="track_inventory" checked> Enabled</span></label>'+
  '<div data-inv-create-stock-area class="gr-inv-new-opening">'+
  input('opening_stock','Opening Stock Quantity','0','number')+
  '<p class="gr-inv-new-stock-hint">Enter confirmed opening On Hand. Sales Orders never change this number. RM, IM and SFG opening balances require a separate approved warehouse / production stock count.</p></div></div><div>'+
  input('price','Sales Price (₹)','0.00','number')+input('tax','Sales Taxes (%)','0','number')+
  input('cost','Cost (₹)','0.00','number')+input('purchase_tax','Purchase Taxes (%)','0','number')+
  input('category','Category','e.g. Composting')+
  input('barcode','Barcode','Scan or enter barcode')+input('tags','Tags','Separate by comma')+'</div></div>'+
  '<div class="gr-inv-new-notes"><h4>Internal Notes</h4>'+notes('notes','Notes')+'</div></section>'+
  '<section data-inv-create-pane="sales" hidden><div class="gr-inv-new-cols"><div><h4>Upsell & Cross-Sell</h4>'+input('optional_products','Optional Products','Product codes separated by comma')+'</div>'+
  '<div><h4>Short Description</h4>'+notes('sales_description','Sales Description')+'</div></div></section>'+
  '<section data-inv-create-pane="purchase" hidden><h4>Vendors</h4><div class="gr-inv-new-cols"><div>'+
  input('preferred_vendor','Vendor','Supplier name')+input('min_purchase_qty','Minimum Quantity','0','number')+
  input('purchase_price','Vendor Unit Price (₹)','0.00','number')+input('lead_time','Lead Time (Days)','0','number')+'</div><div>'+
  select('bill_control','Vendor Bills',[['On received quantities','On received quantities'],['On ordered quantities','On ordered quantities']],'On received quantities')+
  notes('purchase_description','Purchase Description')+'</div></div>'+
  '<p class="gr-inv-create-note">Purchase Orders require an approved vendor in Vendor Master.</p></section>'+
  '<section data-inv-create-pane="inventory" hidden><div class="gr-inv-new-cols"><div><h4>Logistics</h4>'+
  '<label class="gr-inv-new-field"><b>Company *</b><select name="company_id" required>'+companies+'</select></label>'+
  select('uom','Unit of Measure',[['nos','nos'],['kg','kg'],['g','g'],['ltr','litres'],['m','metres'],['set','set']],'nos')+
  select('source_type','Manufacturing Source',[['Make','Own Factory'],['Buy','Purchase from Vendor'],['Subcontract','Vendor Job Work']],'Make')+
  input('responsible','Responsible','Employee')+input('weight','Weight (kg)','0','number')+
  input('volume','Volume (m³)','0','number')+input('delivery_time','Delivery Time (Days)','0','number')+
  '</div><div><h4>Counterpart Locations</h4>'+input('production_location','Production','Production location')+
  input('inventory_adjustment_location','Inventory Adjustment','Adjustment location')+'</div></div>'+
  '<div class="gr-inv-new-cols"><div><h4>Description for Receipts</h4>'+notes('receipt_description','Receipt Notes')+'</div>'+
  '<div><h4>Description for Delivery Orders</h4>'+notes('delivery_description','Delivery Notes')+'</div></div></section>'+
  '</div></div><p data-inv-create-error class="gr-inv-create-error" role="alert" hidden></p>'+
  '<div class="gr-inv-new-footer"><button type="button" data-inv-create-cancel>Discard</button><button type="submit" class="gr-inv-create-submit">Save Product</button></div>'+
  '</form></section>';
 }
 function prepareInventoryRecord(input,existing,recordId){
  const co=String(input.company_id||'').trim();
  const name=String(input.name||'').trim();
  const code=String(input.code||'').trim().toUpperCase();
  const stage=String(input.stage||'');
  const materialText=String(input.material_text||'').trim();
  if(materialText.length>80)throw Error('Material text must be at most 80 characters');
  const materialFullText=stage+materialText.toUpperCase();
  const uom=String(input.uom||'').trim();
  const reference='';
  const category=String(input.category||'').trim();
  const saleable=!!input.saleable,purchasable=!!input.purchasable;
  const source_type=String(input.source_type||'Make');
  if(!co)throw Error('Select a company');
  if(!name||name.length>180)throw Error('Enter a product name (maximum 180 characters)');
  if(!/^[A-Z0-9][A-Z0-9._\/-]{0,63}$/.test(code))throw Error('Enter a valid product code (1–64 characters, no spaces)');
  if(!stages.includes(stage))throw Error('Choose a valid inventory level');
  if(!['nos','kg','g','ltr','m','set'].includes(uom))throw Error('Choose a valid unit of measure');
  if(!['Make','Buy','Subcontract'].includes(source_type))throw Error('Choose a valid manufacturing source');
  if(reference.length>100||category.length>120)throw Error('Reference or category is too long');
  if((existing||[]).some(x=>x.company_id===co&&String(x.code||'').trim().toUpperCase()===code))
   throw Error('Product code '+code+' already exists in the selected company');
  const extra={};
  for(const name of ['cost','purchase_tax','purchase_price','min_purchase_qty','lead_time','weight','volume','delivery_time']){
   const raw=input[name];
   if(raw===undefined||raw===null||raw===''){extra[name]=null;continue;}
   if(!Number.isFinite(Number(raw))||Number(raw)<0)throw Error(name+' must be non-negative');
   extra[name]=Number(raw);
  }
  const tracks=input.track_inventory===true||input.track_inventory==='on';
  const openingText=String(input.opening_stock??'').trim();
  const opening=tracks&&openingText!==''?Number(openingText):0;
  if(tracks&&openingText!==''&&(!/^[0-9]+(?:[.][0-9]{1,6})?$/.test(openingText)||!Number.isFinite(opening)))
   throw Error('Opening stock must be a non-negative number with up to 6 decimal places');
  if(opening>0&&!(stage==='FG'&&saleable))
   throw Error('For raw materials, intermediates or semi-finished goods, save with 0 opening stock and record an approved warehouse or production opening count afterwards.');
  const settings={product_type:String(input.product_type||'Goods'),invoicing_policy:String(input.invoicing_policy||'Ordered quantities'),
   track_inventory:tracks,
   barcode:String(input.barcode||'').trim(),tags:String(input.tags||'').split(',').map(x=>x.trim()).filter(Boolean),
   optional_products:String(input.optional_products||'').split(',').map(x=>x.trim()).filter(Boolean),
   sales_description:String(input.sales_description||'').trim(),notes:String(input.notes||'').trim(),
   preferred_vendor:String(input.preferred_vendor||'').trim(),bill_control:String(input.bill_control||'On received quantities'),
   purchase_description:String(input.purchase_description||'').trim(),
   responsible:String(input.responsible||'').trim(),production_location:String(input.production_location||'').trim(),
   inventory_adjustment_location:String(input.inventory_adjustment_location||'').trim(),
   receipt_description:String(input.receipt_description||'').trim(),delivery_description:String(input.delivery_description||'').trim(),...extra};
  const price=Number(input.price||0),tax=Number(input.tax||0);
  if(!Number.isFinite(price)||price<0||!Number.isFinite(tax)||tax<0||tax>100)throw Error('Sales Price must be non-negative and Tax between 0 and 100');
  // FG products sold to customers use the existing CRM product master.
  // Internal FG, SFG, IM and RM stay in the manufacturing material master.
  const crm=stage==='FG'&&saleable;
  const payload=crm?
   {id:recordId,company_id:co,name,sku:code,reference,material_type:stage,material_text:materialText,material_full_text:materialFullText,category,uom,price,tax,stock:opening,active:true,inclusive:false,
    product_type:'Goods',source_type,saleable,purchasable,...settings}:
   {id:recordId,name,code,reference,material_type:stage,material_text:materialText,material_full_text:materialFullText,category,uom,type:stage,status:'Draft',qty:null,
    source_type,saleable,purchasable,needs_review:true,reorder_level:null,preferred_vendor:'',
    has_job_work:source_type==='Subcontract',price,tax,...settings};
  return {company_id:co,kind:crm?'products':'material',record_id:recordId,payload,original:crm?'crm':'ops',code,stage,opening_stock:opening};
 }
 async function createInventory(event){
  event.preventDefault();
  const form=event.currentTarget;
  if(S.busy)return;
  const errorBox=form.querySelector('[data-inv-create-error]');
  const showError=error=>{errorBox.textContent=error.message||String(error);errorBox.hidden=false};
  errorBox.hidden=true;
  if(!S.ctx.can('stock','create'))return showError(Error('You do not have permission to create inventory products'));
  const values=Object.fromEntries(new FormData(form));
  values.saleable=form.elements.namedItem('saleable')?.checked===true;
  values.purchasable=form.elements.namedItem('purchasable')?.checked===true;
  if(!S.ctx.companies.includes(values.company_id))return showError(Error('Company access denied'));
  let entry;
  try{
   entry=prepareInventoryRecord(values,S.items,uid());
   if(entry.opening_stock>0&&!S.ctx.can('stock','approve'))throw Error('Stock approval permission required to record opening On Hand. Save with 0 and request a stock approval.');
   if(entry.opening_stock>0){
    entry.payload.opening_stock_recorded_at=new Date().toISOString();
    entry.payload.opening_stock_recorded_by=S.ctx.userId;
    entry.payload.opening_stock_note='Explicit opening count recorded by authorised user at product creation. Warehouse verified balances remain separate.';
   }
   if(!form.checkValidity()){form.reportValidity();return}
  }catch(err){showError(err);return}
  S.busy=true;
  const submit=form.querySelector('[type="submit"]');
  submit.disabled=true;
  try{
   // Refresh duplicate detection from both product repositories, not just the displayed list.
   const [crm,ops]=await Promise.all([
    S.ctx.db.from('gr_crm_records').select('payload').eq('company_id',entry.company_id).eq('kind','products'),
    S.ctx.db.from('gr_ops_records').select('payload').eq('company_id',entry.company_id).eq('kind','material')
   ]);
   if(crm.error)throw Error('Product list verification failed: '+crm.error.message);
   if(ops.error)throw Error('Material list verification failed: '+ops.error.message);
   const found=[...(crm.data||[]),...(ops.data||[])].some(r=>String(r.payload?.sku||r.payload?.code||'').toUpperCase()===entry.code);
   if(found)throw Error('Product code '+entry.code+' already exists in this company. Choose another code.');
   const table=entry.original==='crm'?'gr_crm_records':'gr_ops_records';
   const {data,error}=await S.ctx.db.from(table).insert({
    company_id:entry.company_id,kind:entry.kind,record_id:entry.record_id,payload:entry.payload
   }).select('record_id');
   if(error)throw Error(error.message);
   if(!data?.length)throw Error('Product was not created. Check user permissions.');
   let photoWarning='';
   const photo=form.querySelector('[data-inv-create-photo]')?.files?.[0];
   if(photo){
    try{
     const ext=photo.type==='image/png'?'png':photo.type==='image/webp'?'webp':'jpg';
     const {data:auth,error:authError}=await S.ctx.db.auth.getUser();
     if(authError||!auth?.user?.id)throw Error('Sign in again for image upload');
     const storage=S.ctx.db.storage.from('gr-product-images');
     const path=[entry.company_id,entry.original,entry.record_id,auth.user.id,uid()+'.'+ext].join('/');
     const {error:uploadError}=await storage.upload(path,photo,{contentType:photo.type,upsert:false});
     if(uploadError)throw Error(uploadError.message);
     const url=storage.getPublicUrl(path)?.data?.publicUrl;
     if(!url)throw Error('Image URL unavailable');
     const {error:imageError}=await S.ctx.db.from(table).update({payload:{...entry.payload,image_url:url}})
      .eq('company_id',entry.company_id).eq('kind',entry.kind).eq('record_id',entry.record_id);
     if(imageError)throw Error(imageError.message);
    }catch(err){photoWarning='Product created, but photo upload failed: '+err.message}
   }
   if(S.newPhotoUrl){URL.revokeObjectURL(S.newPhotoUrl);S.newPhotoUrl=null}
   await load();
   S.creating=false;S.createTab='general';
   S.scope=entry.company_id;
   S.filter='';
   S.tab='catalog';S.focus={id:entry.record_id,co:entry.company_id,original:entry.original};S.detailTab='general';
   const company=S.root.querySelector('[data-inv-company]');
   if(company)company.value=entry.company_id;
   draw();
   notify(photoWarning||('New inventory item '+entry.code+' created. '+(entry.opening_stock>0?'Manual opening On Hand '+fmt(entry.opening_stock)+' '+entry.payload.uom+' recorded. Verify warehouse stock separately.':'No opening stock posted.')),!!photoWarning);
  }catch(error){showError(error)}
  finally{S.busy=false;submit.disabled=false}
 }
 const scopedItems=()=>S.items.filter(inScope).filter(i=>S.materialFilter==='all'||i.stage===S.materialFilter).filter(i=>!S.filter||[i.code,i.name,i.stage].join(' ').toLowerCase().includes(S.filter.toLowerCase()));

 function renderProductIdentifiers(item,canEdit){
  const code=String(item.code||''),stage=item.stage||'FG';
  const sku='<label class="gr-inv-identifier"><span>Product Code / SKU</span>'+
   (canEdit?'<input type="text" data-inv-product-code maxlength="64" spellcheck="false" aria-label="Product Code / SKU" value="'+esc(code)+'">':
    '<strong>'+esc(code||'—')+'</strong>')+'</label>';
  const materialText=String(item.material?.material_text||'');
  const fullText=stage+materialText.trim().toUpperCase();
  const material='<div class="gr-inv-material-details"><label class="gr-inv-identifier"><span>Material Type</span>'+
   (canEdit?'<select data-inv-material-type aria-label="Material Type">'+stages.map(t=>
      '<option value="'+t+'"'+(t===stage?' selected':'')+'>'+t+'</option>').join('')+'</select>':
      '<strong>'+esc(stage)+'</strong>')+'</label>'+
   (canEdit?'<input type="text" data-inv-material-text maxlength="80" aria-label="Material Text" placeholder="Type here, e.g. 001" value="'+esc(materialText)+'">':'')+
   '<output data-inv-material-full aria-label="Full Material Text">'+esc(fullText)+'</output>'+
   (canEdit?'<small data-inv-material-save-status role="status" aria-live="polite"></small>':'')+'</div>';
  return '<div class="gr-inv-product-identifiers">'+sku+material+'</div>';
 }
 function validateProductCodeChange(item,newCode,sources=S){
  const code=String(newCode||'').trim().toUpperCase();
  if(!code||code.length>64||!/^[A-Z0-9][A-Z0-9._\/-]*$/.test(code))
   throw Error('Product code must be 1–64 characters: letters, numbers, hyphen, dot, slash or underscore.');
  // Only the product SKU's current uniqueness is validated. Existing SO, PO, BOM
  // and dispatch links do not block a rename. The server updates live BOM links
  // atomically and retains old identifiers for historical-document lookups.
  if((sources.items||[]).some(p=>p.company_id===item.company_id&&
      !(p.id===item.id&&p.original===item.original)&&
      String(p.code||'').trim().toUpperCase()===code))
    throw Error('This product code already exists in the selected company.');
  return code;
 }
 function detail(index){
  const item=S.items.find(i=>i.company_id===index.co&&i.id===index.id&&i.original===index.original);
  if(!item)return '<p>Product not found</p>';
  const m=item.material||{}, amounts=S.locations.filter(x=>x.company_id===item.company_id);
  const edges=S.bom.filter(x=>x.company_id===item.company_id&&[item.code,...(Array.isArray(m.sku_aliases)?m.sku_aliases:[])].some(code=>String(x.payload.parent_code||'').toLowerCase()===String(code).toLowerCase()));
  const recent=S.movements.filter(x=>x.company_id===item.company_id&&x.item_kind===(item.stockKind||item.stage)&&x.item_id===item.id).slice(0,15);
  const t=(S.detailTab==='sales'&&!item.saleable)||(S.detailTab==='purchase'&&!item.purchasable)?'general':(S.detailTab||'general'), image=m.image_url||m.image||m.photo_url||'';
  const editable=S.ctx.can('stock','edit');
  const inlineFields={
    'product type':{key:'product_type',options:['Goods','Service','Combo']},
    'invoicing policy':{key:'invoicing_policy',options:['Delivered quantities','Ordered quantities']},
    'track inventory':{key:'track_inventory',options:['Yes','No']},
    'quantity on hand':{key:'stock',kind:'number',crmOnly:true},
    'sales price':{key:'price',kind:'number'},
    'sales taxes':{key:'tax',kind:'number'},
    'cost':{key:'cost',kind:'number'},
    'purchase taxes':{key:'purchase_tax',kind:'number'},
    'category':{key:'category'},
    'reference':{key:'reference'},
    'barcode':{key:'barcode'},
    'tags':{key:'tags'},
    'optional products':{key:'optional_products'},
    'sales description':{key:'sales_description',kind:'textarea'},
    'preferred vendor':{key:'preferred_vendor'},
    'lead time (days)':{key:'lead_time',kind:'number'},
    'vendor price':{key:'purchase_price',kind:'number'},
    'bill control':{key:'bill_control',options:['On received quantities','On ordered quantities']},
    'purchase description':{key:'purchase_description',kind:'textarea'},
    'responsible':{key:'responsible'},
    'weight':{key:'weight',kind:'number'},
    'volume':{key:'volume',kind:'number'},
    'delivery time':{key:'delivery_time',kind:'number'},
    'aggregate on hand':{key:'stock',kind:'number',crmOnly:true},
    'internal notes':{key:'notes',kind:'textarea'}
  };
  const field=(label,value)=>{
    const spec=inlineFields[label.toLowerCase()];
    const display=value===null||value===undefined||value===''?'—':String(value);
    if(!editable||!spec||(spec.crmOnly&&item.original!=='crm'))
      return '<div class="gr-inv-field"><b>'+esc(label)+'</b><span>'+esc(display)+'</span></div>';
    const key=spec.key;
    let raw=m[key];
    if(key==='stock')raw=item.aggregate;
    if(key==='price')raw=m.price??m.selling_price??m.sales_price;
    if(key==='tax')raw=m.sales_tax??m.tax_rate??m.tax;
    if(key==='cost')raw=m.cost??m.cost_price;
    if(key==='track_inventory')raw=m.track_inventory===false?'No':'Yes';
    if(key==='lead_time')raw=m.lead_time??m.delivery_time;
    if(Array.isArray(raw))raw=raw.join(', ');
    if(raw===null||raw===undefined)raw=(spec.options&&spec.options.includes(display))?display:'';
    if(spec.kind==='number'&&typeof raw==='string')raw=raw.replace(/[^0-9.-]/g,'');
    const attrs=' data-inv-edit="'+esc(key)+'" data-inv-kind="'+esc(spec.kind||'text')+'" aria-label="'+esc(label)+'"';
    let control;
    if(spec.options)control='<select'+attrs+'>'+spec.options.map(v=>'<option value="'+esc(v)+'"'+(String(raw)===v?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select>';
    else if(spec.kind==='textarea')control='<textarea'+attrs+' rows="2">'+esc(raw)+'</textarea>';
    else control='<input'+attrs+' type="'+(spec.kind==='number'?'number':'text')+'"'+(spec.kind==='number'?' step="any" min="0"':'')+' value="'+esc(raw)+'" placeholder="Click to edit">';
    return '<label class="gr-inv-field gr-inv-inline-field"><b>'+esc(label)+'</b><span class="gr-inv-inline-control">'+control+'</span></label>';
  };
  const toolbar='<div class="gr-inv-detail-toolbar"><button type="button" data-inv-back>‹ Products</button><span>'+esc(item.code)+'</span><div class="gr-inv-detail-tools"><button type="button" data-inv-detail-action="warehouses">▥ Warehouses</button><button type="button" data-inv-detail-action="bom">⚗ Bill of Materials <b>'+edges.length+'</b></button><button type="button" data-inv-detail-action="activity">▥ Movements <b>'+recent.length+'</b></button></div></div>';
  const intro='<div class="gr-inv-product-hero"><div class="gr-inv-hero-main"><h2>☆ '+esc(item.name)+'</h2>'+renderProductIdentifiers(item,editable)+
   '<div class="gr-inv-flags"><label class="gr-inv-flag"><input type="checkbox" data-inv-flag="saleable" '+(item.saleable?'checked':'')+' '+(!editable?'disabled':'')+'><span>Sales</span></label>'+
   '<label class="gr-inv-flag"><input type="checkbox" data-inv-flag="purchasable" '+(item.purchasable?'checked':'')+' '+(!editable?'disabled':'')+'><span>Purchase</span></label></div>'+
   '<p class="gr-inv-footnote">'+(item.saleable&&item.purchasable?'Purchased and resold, or manufactured and sold':item.saleable?'Manufactured / stocked for sales':item.purchasable?'Purchased for internal use or production':'Not enabled for sales or purchase')+'</p></div>'+
   '<div class="gr-inv-hero-photo">'+(editable?'<button type="button" class="gr-inv-photo-target" data-inv-photo-trigger title="Click to upload or replace product image" aria-label="Click to upload product image">':'<div class="gr-inv-photo-target">')+(image?'<img alt="'+esc(item.name)+'" src="'+esc(image)+'" onerror="this.hidden=true">':'<div class="gr-inv-product-placeholder">+ Add image</div>')+(editable?'<span class="gr-inv-photo-hint">✎ Change image</span></button><input type="file" data-inv-photo accept="image/png,image/jpeg,image/webp" style="display:none" aria-label="Upload product image">':'</div>')+'</div></div>';
  const tabs=[['general','General Information'],...(item.saleable?[['sales','Sales']]:[]),...(item.purchasable?[['purchase','Purchase']]:[]),['inventory','Inventory']];
  let body='';
  if(t==='general')body='<div class="gr-inv-detail-columns gr-inv-odoo-general"><section>'+
   field('Product Type',m.product_type||'Goods')+field('Invoicing Policy',m.invoicing_policy||'Delivered quantities')+field('Track Inventory',m.track_inventory===false?'No':'Yes')+(m.track_inventory===false?'':field('Quantity On Hand',item.aggregate===null||item.aggregate===undefined?'Not recorded':fmt(item.aggregate)+' '+item.unit))+
   '</section><section>'+field('Sales Price',m.price??m.selling_price??m.sales_price??'Not set')+field('Sales Taxes',m.sales_tax??m.tax_rate??m.tax??'Not configured')+field('Cost',m.cost??m.cost_price??'Not recorded')+field('Purchase Taxes',m.purchase_tax||'Not configured')+
   field('Category',m.category||m.category_name)+field('Barcode',m.barcode)+field('Tags',Array.isArray(m.tags)?m.tags.join(', '):m.tags)+
   '</section></div><section class="gr-inv-notes"><h4>Internal notes</h4>'+field('Internal notes',m.notes||m.description||'')+'</section>';
  if(t==='sales')body='<div class="gr-inv-detail-columns"><section><h4>Sales settings</h4>'+
    field('Can be sold',item.saleable?'Yes':'No')+field('Sales price',m.price??m.selling_price??m.sales_price??'Not set')+
    field('Invoicing policy',m.invoicing_policy||'Not configured')+field('Sales taxes',m.sales_tax??m.tax_rate??m.tax??'Not configured')+
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
    table(['Location','Verified stock'],amounts.map(l=>'<tr><td>'+esc(l.name)+'</td><td>'+fmt(S.balances.find(b=>b.company_id===item.company_id&&b.location_id===l.id&&b.item_id===item.id&&b.item_kind===(item.stockKind||item.stage))?.quantity||0)+' '+esc(item.unit)+'</td></tr>'))+
    '</section></div><div class="gr-inv-detail-columns"><section><h4>Bill of materials</h4>'+
    table(['Component','Quantity','Revision'],edges.map(b=>'<tr><td>'+esc(b.payload.child_code)+'</td><td>'+esc(b.payload.qty)+' '+esc(b.payload.uom)+'</td><td>'+esc(b.payload.revision)+'</td></tr>'))+
    '</section><section><h4>Recent stock movements</h4>'+
    table(['Action','Quantity','From → To'],recent.map(m=>'<tr><td>'+esc(m.action)+'</td><td>'+fmt(m.quantity)+' '+esc(m.uom)+'</td><td>'+esc(locName(m.from_location))+' → '+esc(locName(m.to_location))+'</td></tr>'))+'</section></div>'+
    '<p class="gr-inv-warning">Verified locations do not automatically overwrite the CRM product stock balance.</p>';
  return toolbar+(m.track_inventory===false?'':stockSummary(item,productMetrics(item,S)))+'<div class="gr-inv-detail-panel">'+intro+'<div class="gr-inv-detail-tabs">'+tabs.map(([key,label])=>'<button type="button" data-inv-detail-tab="'+key+'" class="'+(key===t?'active':'')+'">'+label+'</button>').join('')+'</div><div class="gr-inv-detail-body">'+body+'</div></div>';
 }
 function table(heads,body){return '<div class="gr-inv-scroll"><table><thead><tr>'+heads.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+body.join('')+'</tbody></table></div>'}
 function warehouse(){
  const locs=S.locations.filter(inScope),items=S.items.filter(inScope),canEdit=S.ctx.can('stock','edit'),canApprove=S.ctx.can('stock','approve');
  const form='<form data-inv-form class="gr-inv-form"><h4>Verified physical count / Internal transfer</h4>'+
   '<div class="gr-inv-grid">'+choice('company','Company',S.ctx.companies.map(x=>[x,companyName(x)]),S.scope==='all'?'':S.scope)+
   choice('item','Product / Material',items.map(x=>[x.company_id+'|'+(x.stockKind||x.stage)+'|'+x.id,x.code+' · '+x.name+' ['+x.stage+']']))+
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
    const i=items.find(x=>x.company_id===b.company_id&&x.id===b.item_id&&(x.stockKind||x.stage)===b.item_kind);
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
  const index=new Map(all.flatMap(x=>[x.code,...(Array.isArray(x.material?.sku_aliases)?x.material.sku_aliases:[])].map(code=>[x.company_id+'|'+String(code).toLowerCase(),x])));
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
  const materialFilter=S.root.querySelector('[data-inv-material-filter]');if(materialFilter)materialFilter.onchange=()=>{S.materialFilter=materialFilter.value;draw()};
  S.root.querySelectorAll('[data-inv-item]').forEach(b=>b.onclick=()=>{
   const item=scopedItems()[Number(b.dataset.invItem)];if(item){S.focus={id:item.id,co:item.company_id,original:item.original};S.detailTab='general';draw()}
  });
  S.root.querySelectorAll('[data-inv-view]').forEach(b=>b.onclick=()=>{S.view=b.dataset.invView;draw()});
  S.root.querySelector('[data-inv-create-open]')?.addEventListener('click',()=>{
   if(!S.ctx.can('stock','create'))return notify('Create permission required',true);
   S.creating=true;S.createTab='general';S.focus=null;draw();
   S.root.querySelector('.gr-inv-new-title input')?.focus();
  });
  const newPage=S.root.querySelector('[data-inv-new-page]');
  if(newPage){
   const form=newPage.querySelector('[data-inv-create-form]');
   const setTab=id=>{
    if(id==='sales'&&!form.elements.namedItem('saleable').checked)id='general';
    if(id==='purchase'&&!form.elements.namedItem('purchasable').checked)id='general';
    S.createTab=id;
    newPage.querySelectorAll('[data-inv-create-tab]').forEach(b=>{
     b.hidden=b.dataset.invCreateTab==='sales'&&!form.elements.namedItem('saleable').checked||
      b.dataset.invCreateTab==='purchase'&&!form.elements.namedItem('purchasable').checked;
     b.classList.toggle('active',b.dataset.invCreateTab===id);
     b.setAttribute('aria-selected',b.dataset.invCreateTab===id?'true':'false');
    });
    newPage.querySelectorAll('[data-inv-create-pane]').forEach(p=>p.hidden=p.dataset.invCreatePane!==id);
   };
   newPage.querySelectorAll('[data-inv-create-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.invCreateTab));
   const syncNewStatus=()=>{
    const sale=form.elements.namedItem('saleable').checked;
    const purchase=form.elements.namedItem('purchasable').checked;
    const saleStatus=newPage.querySelector('[data-inv-new-stat="sales"]');
    const purchaseStatus=newPage.querySelector('[data-inv-new-stat="purchases"]');
    if(saleStatus)saleStatus.hidden=!sale;
    if(purchaseStatus)purchaseStatus.hidden=!purchase;
   };
   const syncSalePurchase=()=>{setTab(S.createTab);syncNewStatus()};
   form.elements.namedItem('saleable').onchange=syncSalePurchase;
   form.elements.namedItem('purchasable').onchange=syncSalePurchase;
   syncNewStatus();
   const materialStage=form.elements.namedItem('stage');
   const materialText=form.elements.namedItem('material_text');
   const fullMaterial=newPage.querySelector('[data-inv-create-material-full]');
   const updateMaterialPreview=()=>{fullMaterial.textContent=materialStage.value+materialText.value.trim().toUpperCase()};
   materialStage.addEventListener('change',updateMaterialPreview);
   materialText.addEventListener('input',updateMaterialPreview);
   updateMaterialPreview();
   const track=form.elements.namedItem('track_inventory');
   const stockArea=newPage.querySelector('[data-inv-create-stock-area]');
   const stockField=form.elements.namedItem('opening_stock');
   const syncStock=()=>{const enabled=!!track.checked;stockArea.hidden=!enabled;stockField.disabled=!enabled;if(!enabled)stockField.value='';};
   track.onchange=syncStock;syncStock();
   setTab(S.createTab);
   newPage.querySelectorAll('[data-inv-create-cancel]').forEach(b=>b.onclick=()=>{
    if((form.elements.namedItem('name').value.trim()||form.elements.namedItem('code').value.trim()||
      newPage.querySelector('[data-inv-create-photo]').files?.length)&&!window.confirm('Discard this unsaved product?'))return;
    if(S.newPhotoUrl){URL.revokeObjectURL(S.newPhotoUrl);S.newPhotoUrl=null}
    S.creating=false;S.createTab='general';draw();
   });
   form.onsubmit=e=>void createInventory(e);
   const imageField=newPage.querySelector('[data-inv-create-photo]');
   newPage.querySelector('[data-inv-create-photo-trigger]').onclick=()=>imageField.click();
   imageField.onchange=()=>{
    const file=imageField.files?.[0];if(!file)return;
    const error=newPage.querySelector('[data-inv-create-error]');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3*1024*1024){
     error.hidden=false;error.textContent='Only PNG, JPG, WebP up to 3 MB are supported.';imageField.value='';return;
    }
    if(S.newPhotoUrl)URL.revokeObjectURL(S.newPhotoUrl);
    S.newPhotoUrl=URL.createObjectURL(file);
    const img=newPage.querySelector('[data-inv-create-preview]');img.src=S.newPhotoUrl;img.hidden=false;
    newPage.querySelector('[data-inv-create-photo-icon]').hidden=true;error.hidden=true;
   };
  }
  S.root.querySelectorAll('[data-inv-flag]').forEach(input=>input.onchange=()=>{input.disabled=true;void saveFlags(input).catch(err=>{draw();notify(err.message,true)})});
  let pendingSkuSave=null;
  const productCodeInput=S.root.querySelector('[data-inv-product-code]');
  if(productCodeInput){
   productCodeInput.dataset.initial=productCodeInput.value;
   productCodeInput.addEventListener('keydown',event=>{
    if(event.key==='Escape'){productCodeInput.value=productCodeInput.dataset.initial;productCodeInput.blur()}
    if(event.key==='Enter'){event.preventDefault();productCodeInput.blur()}
   });
   productCodeInput.onchange=()=>{const promise=saveProductCode(productCodeInput);pendingSkuSave=promise;void promise.catch(err=>{productCodeInput.disabled=false;notify(err.message,true)}).finally(()=>{if(pendingSkuSave===promise)pendingSkuSave=null})};
  }
  const typeSelect=S.root.querySelector('[data-inv-material-type]');
  const typeTextInput=S.root.querySelector('[data-inv-material-text]');
  const fullMaterial=S.root.querySelector('[data-inv-material-full]');
  const saveStatus=S.root.querySelector('[data-inv-material-save-status]');
  if(typeSelect&&typeTextInput&&fullMaterial){
   let lastSave=Promise.resolve();
   let saveVersion=0;
   const updatePreview=()=>{
    fullMaterial.textContent=typeSelect.value+typeTextInput.value.trim().toUpperCase();
    if(saveStatus)saveStatus.textContent='Not saved';
   };
   const queueSave=()=>{
    const version=++saveVersion,selectedType=typeSelect.value,selectedText=typeTextInput.value;
    if(saveStatus)saveStatus.textContent='Saving…';
    lastSave=lastSave.catch(()=>{}).then(async()=>{
     if(pendingSkuSave)await pendingSkuSave;
     const item=currentItem();
     if(!item)throw Error('Product no longer selected');
     await saveMaterialDetails(item,selectedType,selectedText);
     if(version===saveVersion&&saveStatus?.isConnected)saveStatus.textContent='Saved';
    }).catch(error=>{
     if(version===saveVersion&&saveStatus?.isConnected)saveStatus.textContent='Save failed';
     notify(error.message,true);
    });
   };
   typeSelect.addEventListener('change',()=>{updatePreview();queueSave()});
   typeTextInput.addEventListener('input',updatePreview);
   typeTextInput.addEventListener('change',queueSave);
   typeTextInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();typeTextInput.blur()}});
  }
  const photo=S.root.querySelector('[data-inv-photo]');S.root.querySelector('[data-inv-photo-trigger]')?.addEventListener('click',()=>photo?.click());if(photo)photo.onchange=()=>void savePhoto(photo).catch(err=>notify(err.message,true));
  S.root.querySelectorAll('[data-inv-edit]').forEach(el=>{
    el.dataset.initial=el.value;
    el.addEventListener('keydown',event=>{
      if(event.key==='Escape'){el.value=el.dataset.initial;el.blur()}
      if(event.key==='Enter'&&el.tagName!=='TEXTAREA'){event.preventDefault();el.blur()}
    });
    el.onchange=()=>void saveInlineField(el).catch(err=>{notify(err.message,true);el.disabled=false});
  });
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
 async function saveMaterialDetails(item,materialType,materialText){
  if(!stages.includes(materialType))throw Error('Material Type must be FG, SFG, IM or RM');
  const text=String(materialText||'').trim();
  if(text.length>80)throw Error('Material text must be at most 80 characters');
  if(materialType===item.stage&&text===String(item.material?.material_text||''))return;
  if(S.busy||!S.ctx.can('stock','edit'))throw Error('Inventory edit permission required');
  if(!S.ctx.companies.includes(item.company_id))throw Error('Company access denied');
  S.busy=true;
  try{
   // The Material Type and Material Text do not create or modify a Product SKU.
   const {data,error}=await S.ctx.db.rpc('gr_inventory_save_material_text',{
    p_company:item.company_id,p_origin:item.original,p_record_id:item.id,
    p_expected_code:item.code,p_material_type:materialType,p_material_text:text
   });
   if(error)throw Error(error.message);
   if(String(data?.sku||'').toUpperCase()!==String(item.code).toUpperCase()||data?.material_type!==materialType||data?.material_text!==text)
    throw Error('Material details could not be saved; SKU was not changed.');
   item.stage=materialType;
   item.material={...item.material,material_type:materialType,material_text:text,material_full_text:data.material_full_text};
   // Avoid redraws while the user is entering text.
  }finally{S.busy=false}
 }
 async function saveProductCode(input){
  const item=currentItem();
  if(!item||!input.isConnected)return;
  const previous=String(item.code||'').trim().toUpperCase();
  let next;
  try{
    next=validateProductCodeChange(item,input.value);
  }catch(error){input.value=previous;throw error;}
  if(next===previous){input.value=item.code;return;}
  if(S.busy||!S.ctx.can('stock','edit')){input.value=previous;throw Error('Inventory edit permission required');}
  if(!S.ctx.companies.includes(item.company_id)){input.value=previous;throw Error('Company access denied');}
  input.disabled=true;
  S.busy=true;
  try{
   const {data,error}=await S.ctx.db.rpc('gr_inventory_rename_sku',{
    p_company:item.company_id,
    p_origin:item.original,
    p_record_id:item.id,
    p_expected_code:previous,
    p_new_code:next
   });
   if(error)throw Error(error.message);
   if(!data||data.sku!==next)throw Error('SKU could not be saved. Refresh this product and try again.');
   await load();
   draw();
   notify('Product SKU changed from '+previous+' to '+next+'. Existing BOM links are preserved.');
  }catch(err){if(input.isConnected){input.value=previous;input.disabled=false;}throw err;}
  finally{S.busy=false;}
 }
 async function saveInlineField(el){
  const item=currentItem();
  if(!item||!el.isConnected)return;
  const key=el.dataset.invEdit;
  const allowed=['product_type','invoicing_policy','track_inventory','stock','price','tax','cost','purchase_tax','category','reference','barcode','tags','optional_products','sales_description','preferred_vendor','lead_time','purchase_price','bill_control','purchase_description','responsible','weight','volume','delivery_time','notes'];
  if(!allowed.includes(key))throw Error('This field cannot be edited');
  if(key==='stock'&&item.original!=='crm')throw Error('Use verified warehouse movements for manufactured material stock');
  if(el.value===el.dataset.initial)return;
  let value=el.value.trim();
  if(el.dataset.invKind==='number'){
    if(value!==''){
      const num=Number(value);
      if(!Number.isFinite(num)||num<0)throw Error('Enter a valid non-negative number');
      value=num;
    }
  }
  if(key==='track_inventory')value=value==='Yes';
  if(key==='tags')value=value.split(',').map(x=>x.trim()).filter(Boolean);
  if(key==='optional_products'&&Array.isArray(item.material?.optional_products))
    value=value.split(',').map(x=>x.trim()).filter(Boolean);
  let target=key;
  if(key==='price')target=['price','selling_price','sales_price'].find(k=>Object.prototype.hasOwnProperty.call(item.material||{},k))||'price';
  if(key==='cost')target=['cost','cost_price'].find(k=>Object.prototype.hasOwnProperty.call(item.material||{},k))||'cost';
  if(key==='tax')target=['sales_tax','tax_rate','tax'].find(k=>Object.prototype.hasOwnProperty.call(item.material||{},k))||'tax';
  el.disabled=true;
  await updateItem(item,{[target]:value});
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
   item.code=item.original==='crm'?(payload.sku||payload.code||item.code):(payload.code||item.code);
   if(item.original==='crm'&&Object.prototype.hasOwnProperty.call(changes,'stock'))item.aggregate=payload.stock;
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
  const {data:userData,error:userError}=await S.ctx.db.auth.getUser();
  if(userError||!userData?.user?.id)throw Error('Please sign in again to upload an image');
  const path=[item.company_id,item.original,item.id,userData.user.id,uid()+'.'+ext].join('/');
  const storage=S.ctx.db.storage.from('gr-product-images');
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
  const item=S.items.find(i=>i.company_id===co&&[i.company_id,i.stockKind||i.stage,i.id].join('|')===fd.get('item'));
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
    item_kind:(item.stockKind||item.stage),item_id:item.id,item_code:item.code,uom:item.unit,quantity,
    from_location:kind==='transfer'?from:null,to_location:to,
    reference:String(fd.get('reference')||''),notes:String(fd.get('notes')||'')
   },p_request:uid()});
   if(error)throw Error(error.message);
   await load();draw();notify(data?.message||'Inventory location updated');
  }finally{S.busy=false;button.disabled=false}
 }
 async function mount(root,context){
  S.root=root;S.ctx=context;S.scope=context.scope||context.companies[0];S.tab='catalog';S.focus=null;S.creating=false;S.createTab='general';
  root.innerHTML='<div class="gr-inventory">Loading Inventory…</div>';
  try{await load();layout();draw()}catch(e){root.innerHTML='<div class="gr-inventory"><h2>Inventory</h2><p>Could not load inventory: '+esc(e.message)+'</p><button data-retry>Retry</button></div>';root.querySelector('[data-retry]').onclick=()=>void mount(root,context)}
 }
 window.GreenRichInventory={mount,computeProductMetrics:productMetrics,productStatusVisibility,renderProductStatus:stockSummary,renderProductIdentifiers,validateProductCodeChange,prepareInventoryRecord,renderNewInventoryPage:newInventoryForm};
})();