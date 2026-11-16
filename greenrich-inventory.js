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
 const S={root:null,ctx:null,tab:'catalog',scope:'',items:[],bom:[],locations:[],balances:[],movements:[],pos:[],prodBalances:[],focus:null,filter:'',busy:false};
 const locName=id=>S.locations.find(x=>x.id===id)?.name||'—';
 const inScope=x=>S.scope==='all'||x.company_id===S.scope;
 const companyName=id=>S.ctx.companyName(id);
 const companyOptions=()=>S.ctx.companies.map(id=>'<option value="'+esc(id)+'"'+(S.scope===id?' selected':'')+'>'+esc(companyName(id))+'</option>').join('');
 const e=(key,title,val='',required=true)=>'<label>'+esc(title)+'<input name="'+key+'" value="'+esc(val)+'" '+(required?'required':'')+'></label>';
 const choice=(key,title,arr,selected='')=>'<label>'+esc(title)+'<select name="'+key+'" required><option value="">Select…</option>'+arr.map(([id,label])=>'<option value="'+esc(id)+'"'+(String(selected)===String(id)?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>';
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
   rows('gr_production_documents','*',q=>q.eq('kind','po')),
   rows('gr_production_balances')
  ]);
  const list=[];
  for(const r of products)list.push({company_id:r.company_id,id:r.record_id,code:r.payload.sku||r.payload.code||r.record_id,
   name:r.payload.name||'Untitled saleable product',stage:'FG',saleable:true,purchasable:!!r.payload.purchasable,
   unit:r.payload.uom||'nos',aggregate:r.payload.stock,material:r.payload,original:'crm'});
  for(const r of materials.filter(x=>x.kind==='material')){
   const p=r.payload||{};const stage=type(p.type),id=r.record_id;
   const overlap=list.some(i=>i.company_id===r.company_id&&i.code.trim().toLowerCase()===String(p.code||'').trim().toLowerCase());
   list.push({company_id:r.company_id,id,code:p.code||id,name:p.name||id,stage,saleable:stage==='FG',
    purchasable:stage==='RM'||p.source_type==='Buy',unit:p.uom||'nos',aggregate:aggregates.find(x=>x.company_id===r.company_id&&x.material_id===id)?.quantity??null,
    material:p,original:'ops',overlap});
  }
  S.items=list;S.bom=materials.filter(x=>x.kind==='bom');S.locations=locations;
  S.balances=balances;S.movements=movements;S.pos=docs;S.prodBalances=aggregates;
 }
 const getLocBalance=item=>S.balances.filter(b=>b.company_id===item.company_id&&b.item_kind===item.stage&&b.item_id===item.id)
   .reduce((sum,b)=>sum+Number(b.quantity||0),0);
 function layout(){
  const tabs=[['catalog','Product & Material Master'],['warehouses','Warehouse Stock'],['bom','Multi-level BOM'],['purchasing','Purchase Shortages'],['activity','Stock Movement Audit']];
  S.root.innerHTML='<div class="gr-inventory"><header class="gr-inv-head"><div><small>GREENRICH ONE · INVENTORY</small><h2>Inventory & Material Control</h2><p>Saleable · Purchasable · Raw material · Intermediate · Semi-finished · Final goods</p></div>'+
   '<label>Company<select data-inv-company><option value="all"'+(S.scope==='all'?' selected':'')+'>All assigned companies</option>'+companyOptions()+'</select></label></header>'+
   '<p class="gr-inv-warning">Location stock is based on verified physical counts and transfers. Existing CRM saleable stock and production balances are shown separately until reconciled; locations are NOT auto-filled from aggregate stock.</p>'+
   '<div class="gr-inv-tabs">'+tabs.map(([key,name])=>'<button type="button" data-inv-tab="'+key+'"'+(S.tab===key?' class="active"':'')+'>'+name+'</button>').join('')+
   '<button type="button" data-inv-legacy>Open Saleable Product Editor</button><button type="button" data-inv-operations>Operations & Production</button></div>'+
   '<div data-inventory-notice role="status" hidden></div><div data-inventory-content></div></div>';
  S.root.querySelector('[data-inv-company]').onchange=e=>{S.scope=e.target.value;draw()};
  S.root.querySelectorAll('[data-inv-tab]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.invTab;S.focus=null;layout();draw()});
  S.root.querySelector('[data-inv-legacy]').onclick=()=>S.ctx.openLegacy(S.root);
  S.root.querySelector('[data-inv-operations]').onclick=()=>S.ctx.openOperations();
 }
 function draw(){
  const box=S.root.querySelector('[data-inventory-content]');if(!box)return;
  if(S.focus){box.innerHTML=detail(S.focus);bind();return;}
  box.innerHTML=S.tab==='catalog'?catalog():S.tab==='warehouses'?warehouse():
   S.tab==='bom'?bom():S.tab==='purchasing'?purchase():audit();
  bind();
 }
 const kindCount=k=>S.items.filter(i=>inScope(i)&&i.stage===k).length;
 function catalog(){
  const items=S.items.filter(inScope).filter(i=>!S.filter||[i.code,i.name,i.stage].join(' ').toLowerCase().includes(S.filter.toLowerCase()));
  return '<div class="gr-inv-stats">'+stages.map(k=>'<article><small>'+names[k]+'</small><strong>'+kindCount(k)+'</strong></article>').join('')+'</div>'+
   '<div class="gr-inv-controls"><input type="search" data-inv-search value="'+esc(S.filter)+'" placeholder="Search product, code, stage"><span>Click any item to see warehouses, BOM and sourcing.</span></div>'+
   '<div class="gr-inv-scroll"><table><thead><tr><th>Code / Item</th><th>Level</th><th>Saleable</th><th>Purchasable</th><th>Aggregate stock</th><th>Verified locations</th><th></th></tr></thead><tbody>'+
   (items.map((i,n)=>'<tr><td><strong>'+esc(i.code)+'</strong><small>'+esc(i.name)+'</small></td><td>'+esc(i.stage)+'</td><td>'+(i.saleable?'Yes':'—')+'</td><td>'+(i.purchasable?'Yes':'—')+
    '</td><td>'+(i.aggregate===null||i.aggregate===undefined?'Not recorded':fmt(i.aggregate)+' '+esc(i.unit))+
    '</td><td>'+fmt(getLocBalance(i))+' '+esc(i.unit)+'</td><td><button data-inv-item="'+n+'">View</button></td></tr>').join('')||
    '<tr><td colspan="7">No products found.</td></tr>')+'</tbody></table></div>';
 }
 const scopedItems=()=>S.items.filter(inScope).filter(i=>!S.filter||[i.code,i.name,i.stage].join(' ').toLowerCase().includes(S.filter.toLowerCase()));
 function detail(index){
  const item=S.items.find(i=>i.company_id===index.co&&i.id===index.id&&i.original===index.original);
  if(!item)return '<p>Product not found</p>';
  const amounts=S.locations.filter(x=>x.company_id===item.company_id);
  const edges=S.bom.filter(x=>x.company_id===item.company_id&&String(x.payload.parent_code||'').toLowerCase()===item.code.toLowerCase());
  const recent=S.movements.filter(x=>x.company_id===item.company_id&&x.item_kind===item.stage&&x.item_id===item.id).slice(0,15);
  return '<button data-inv-back>← Back to Inventory</button><h3>'+esc(item.code)+' · '+esc(item.name)+'</h3>'+
   '<div class="gr-inv-stats"><article><small>Product stage</small><strong>'+esc(names[item.stage])+'</strong></article>'+
   '<article><small>Aggregate record</small><strong>'+esc(item.aggregate===null?'Not recorded':fmt(item.aggregate)+' '+item.unit)+'</strong></article>'+
   '<article><small>Verified across warehouses</small><strong>'+fmt(getLocBalance(item))+' '+esc(item.unit)+'</strong></article></div>'+
   '<h4>Stock by actual location</h4>'+table(['Warehouse / Location','Verified stock'],amounts.map(l=>'<tr><td>'+esc(l.name)+'</td><td>'+fmt(S.balances.find(b=>b.company_id===item.company_id&&b.location_id===l.id&&b.item_id===item.id&&b.item_kind===item.stage)?.quantity||0)+' '+esc(item.unit)+'</td></tr>'))+
   '<h4>BOM children</h4>'+table(['Component code','Per parent','UOM','Revision'],edges.map(b=>'<tr><td>'+esc(b.payload.child_code)+'</td><td>'+esc(b.payload.qty)+'</td><td>'+esc(b.payload.uom)+'</td><td>'+esc(b.payload.revision)+'</td></tr>'))+
   '<h4>Recent warehouse activity</h4>'+table(['Action','Quantity','From → To','Date'],recent.map(m=>'<tr><td>'+esc(m.action)+'</td><td>'+fmt(m.quantity)+' '+esc(m.uom)+'</td><td>'+esc(locName(m.from_location))+' → '+esc(locName(m.to_location))+'</td><td>'+esc(new Date(m.posted_at).toLocaleDateString('en-IN'))+'</td></tr>'))+
   '<p class="gr-inv-warning">For manufacturing BOM routing and vendor job-work (issued, used, scrap, returned), open Operations & Production. Warehouse allocation is separate until reconciled.</p>';
 }
 function table(heads,body){return '<div class="gr-inv-scroll"><table><thead><tr>'+heads.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+body.join('')+'</tbody></table></div>'}
 function warehouse(){
  const locs=S.locations.filter(inScope),items=S.items.filter(inScope),canEdit=S.ctx.can('stock','edit'),canApprove=S.ctx.can('stock','approve');
  const form='<form data-inv-form class="gr-inv-form"><h4>Verified physical count / Internal transfer</h4>'+
   '<div class="gr-inv-grid">'+choice('company','Company',S.ctx.companies.map(x=>[x,companyName(x)]),S.scope==='all'?'':S.scope)+
   choice('item','Product / Material',items.map(x=>[x.company_id+'|'+x.stage+'|'+x.id,x.code+' · '+x.name+' ['+x.stage+']']))+
   choice('action','Movement',[['verified_count','Verified physical count (Admin / Approver)'],['transfer','Transfer between locations']])+
   choice('from_location','From warehouse (transfer only)',locs.map(x=>[x.id,x.name]))+
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
 function bom(){
  const mapped=S.bom.filter(inScope),productCode=S.items.filter(inScope).map(i=>i.code).filter(Boolean);
  const edges=mapped.map(r=>({...r.payload,company_id:r.company_id}));
  const index=new Map(S.items.filter(inScope).map(x=>[x.company_id+'|'+x.code.toLowerCase(),x]));
  return '<h3>Multi-level BOM and product transformation</h3><p>Approved BOMs should follow FG → SFG → IM → RM; revisions, UOM conversion, processing vendor and routing are mandatory before automated purchasing or manufacturing.</p>'+
   '<div class="gr-inv-flow"><span>FG final assembly</span><b>←</b><span>SFG welding / fitment</span><b>←</b><span>IM cutting / folding</span><b>←</b><span>RM purchase</span></div>'+
   '<p>Workbook example: FG-001 MGB100 FRP · SFG-001 top hinge · IM-001 hinge plate · RM-001 SS sheet. Existing draft BOM mappings appear below.</p>'+
   table(['Parent','Child','Stage','Required / parent','BOM revision','Status'],edges.map(r=>{
    const child=index.get(r.company_id+'|'+String(r.child_code||'').toLowerCase());
    return '<tr><td><strong>'+esc(r.parent_code)+'</strong></td><td>'+esc(r.child_code)+'</td><td>'+esc(child?.stage||'Review stage')+'</td><td>'+esc(r.qty)+' '+esc(r.uom)+'</td><td>'+esc(r.revision)+'</td><td>'+esc(r.status||'Draft')+'</td></tr>'}))+
   '<p class="gr-inv-warning">The uploaded Excel is a mapping example, not approval of exact production quantities. BOMs must be technically validated before release.</p>';
 }
 function purchase(){
  const items=S.items.filter(inScope).filter(i=>i.purchasable),po=S.pos.filter(inScope);
  const shortages=items.filter(i=>i.aggregate!==null&&Number(i.aggregate)<=Number(i.material.reorder_level||0)&&i.original==='ops');
  return '<h3>Raw Material Purchase Planning</h3><p>Low stock and reorder triggers should create Purchase Requisitions, then approved POs. Existing live production POs are listed below.</p>'+
   '<div class="gr-inv-stats"><article><small>Purchasable materials</small><strong>'+items.length+'</strong></article><article><small>Low/reorder candidates</small><strong>'+shortages.length+'</strong></article><article><small>Live purchase orders</small><strong>'+po.length+'</strong></article></div>'+
   '<h4>Reorder candidates</h4>'+table(['Code','Material','Stock','Reorder level','Source vendor'],shortages.map(i=>'<tr><td>'+esc(i.code)+'</td><td>'+esc(i.name)+'</td><td>'+fmt(i.aggregate)+' '+esc(i.unit)+'</td><td>'+fmt(i.material.reorder_level)+'</td><td>'+esc(i.material.preferred_vendor||i.material.preferred_vendor_id||'—')+'</td></tr>'))+
   '<h4>Existing Purchase Orders</h4>'+table(['PO','Company','Vendor','Status','Date'],po.map(d=>'<tr><td>'+esc(d.number)+'</td><td>'+esc(companyName(d.company_id))+'</td><td>'+esc(d.payload.vendor?.name||'—')+'</td><td>'+esc(d.status)+'</td><td>'+esc(new Date(d.created_at).toLocaleDateString('en-IN'))+'</td></tr>'))+
   '<p><button data-inv-operations>Open Purchase Order / Production Planning</button></p>';
 }
 function audit(){
  return '<h3>Verified physical stock movement audit</h3>'+
   table(['Date','Company','Item','Movement','Qty','Source','Destination','Reference'],S.movements.filter(inScope).map(m=>'<tr><td>'+esc(new Date(m.posted_at).toLocaleString('en-IN'))+'</td><td>'+esc(companyName(m.company_id))+'</td><td>'+esc(m.item_code)+'</td><td>'+esc(m.action)+'</td><td>'+fmt(m.quantity)+' '+esc(m.uom)+'</td><td>'+esc(locName(m.from_location))+'</td><td>'+esc(locName(m.to_location))+'</td><td>'+esc(m.reference||'—')+'</td></tr>'));
 }
 function bind(){
  const input=S.root.querySelector('[data-inv-search]');if(input)input.oninput=e=>{S.filter=e.target.value;draw()};
  S.root.querySelectorAll('[data-inv-item]').forEach(b=>b.onclick=()=>{
   const item=scopedItems()[Number(b.dataset.invItem)];if(item){S.focus={id:item.id,co:item.company_id,original:item.original};draw()}
  });
  S.root.querySelector('[data-inv-back]')?.addEventListener('click',()=>{S.focus=null;draw()});
  S.root.querySelectorAll('[data-inv-operations]').forEach(b=>b.onclick=()=>S.ctx.openOperations());
  const f=S.root.querySelector('[data-inv-form]');if(f)f.onsubmit=event=>void post(event).catch(e=>notify(e.message,true));
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