'use strict';
/* One-page GreenRich ONE ERP pilot: real-time Supabase state, TEST data only. */
window.GreenRichPilot=(function(){
 const LABELS={STOCK_CHECK:'Check Finished Stock',VENDOR_PO:'Create Vendor PO',RM_RECEIPT:'Receive Raw Materials in Warehouse',ISSUE:'Issue Material to Vendor',JOBWORK:'Job Work & Wastage',RECEIVE:'Receive Processed Parts',ASSEMBLY:'Final Assembly',STICKER:'Stickering',INSPECTION:'Incoming Inspection',QC:'Final Quality Check',STOCK:'Automatic Finished Stock',DISPATCH:'Dispatch',SERVICE:'Service / Warranty'};
 const TEMPLATES={
  SIMPLE:['STOCK_CHECK','ASSEMBLY','STICKER','QC','STOCK','DISPATCH','SERVICE'],
  OUTSOURCED:['STOCK_CHECK','VENDOR_PO','RM_RECEIPT','ISSUE','JOBWORK','RECEIVE','ASSEMBLY','STICKER','INSPECTION','QC','STOCK','DISPATCH','SERVICE'],
  DIRECT:['STOCK_CHECK','RECEIVE','INSPECTION','QC','STOCK','DISPATCH','SERVICE']
 };
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const styles=`
 .gp{font-size:13px;color:#274366}.gp h3{color:#102e55;margin:0 0 8px;font-size:18px}.gp h4{margin:0 0 10px;color:#18385f;font-size:15px}
 .gp-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px}
 .gp-grid{display:grid;grid-template-columns:minmax(210px,.85fr) minmax(270px,1.3fr) minmax(230px,1fr);gap:12px}
 .gp-card{background:#fff;border:1px solid #d9e4f1;border-radius:12px;padding:16px;margin-bottom:12px}
 .gp-alert{background:#fff4e0;color:#835a19;border:1px solid #f0d6a5;border-radius:10px;padding:12px;margin-bottom:12px}
 .gp-success{color:#0d7954}.gp small{color:#64748b}.gp .gp-step{border-left:3px solid #dae4f1;margin-left:10px;padding:9px 10px 9px 15px;color:#64748b}
 .gp .gp-step.done{border-left-color:#169669;color:#23684f}.gp .gp-step.current{border-left-color:#2f5cb4;background:#eaf2ff;font-weight:700;color:#204d8f}
 .gp button{width:auto!important;min-height:34px!important;padding:8px 11px!important;font-size:12px!important;border-radius:8px!important}
 .gp .gp-btn{border:1px solid #2b55a2;background:#2451a6;color:white}.gp .gp-outline{border:1px solid #ccdaed;background:white;color:#244e90}
 .gp label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:#506784;margin:10px 0}
 .gp input,.gp select,.gp textarea{width:100%;min-width:0;box-sizing:border-box;background:white;border:1px solid #cbd9ec;border-radius:8px;padding:10px;font:inherit;color:#203e60}
 .gp textarea{min-height:70px}.gp .gp-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
 .gp .gp-number{font-size:26px;color:#103358;font-weight:800;display:block;margin:5px 0}
 .gp .gp-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
 .gp .gp-options label{display:flex;flex-direction:row;align-items:center;margin:0;gap:4px}.gp .gp-options input{width:auto}
 .gp .gp-history{max-height:260px;overflow:auto}.gp .gp-history article{padding:9px 0;border-bottom:1px solid #e6edf6}
 .gp .gp-list{overflow:auto;max-height:210px}.gp table{width:100%;border-collapse:collapse;font-size:12px}
 .gp td,.gp th{border-bottom:1px solid #e4ebf5;padding:8px;text-align:left}
 .gp dialog{width:min(620px,92vw);border:1px solid #d3e0ed;border-radius:14px;padding:22px;max-height:88vh;overflow:auto}
 .gp dialog::backdrop{background:#0b2b4b91}
 @media(max-width:1120px){.gp-grid{grid-template-columns:1fr 1.2fr}.gp-vendor-col{grid-column:1/-1}}
 @media(max-width:650px){.gp-grid{display:block}}
 `;
 const el=(root,s)=>root.querySelector(s);
 const opts=(rows,v)=>rows.map(([id,label])=>'<option value="'+esc(id)+'" '+(id===v?'selected':'')+'>'+esc(label)+'</option>').join('');
 const pName=(ctx,p)=>p?.name||'No product selected';
 const available=(ctx,p)=>ctx.stock.filter(s=>s.product_id===p?.id).reduce((a,x)=>a+Number(x.qty_change),0);
 const match=(ctx,ord)=>ctx.products.find(p=>p.id===ord?.product_id);
 const stages=(p)=>p?.steps||[];
 const orderNum=o=>'PILOT-SO-'+o.id.slice(0,8).toUpperCase();
 async function fetchAll(ctx){
  const c=ctx.companies;
  const q=[
   ctx.db.from('gr_pilot_products').select('*').in('company_id',c).order('created_at'),
   ctx.db.from('gr_pilot_orders').select('*').in('company_id',c).order('created_at',{ascending:false}).limit(500),
   ctx.db.from('gr_pilot_events').select('*').in('company_id',c).order('id',{ascending:false}).limit(1000),
   ctx.db.from('gr_pilot_pos').select('*').in('company_id',c).order('issued_at',{ascending:false}).limit(500),
   ctx.db.from('gr_pilot_stock_events').select('*').in('company_id',c).limit(500),
   ctx.db.from('gr_pilot_service').select('*').in('company_id',c).limit(500),
   ctx.db.from('gr_pilot_material_events').select('*').in('company_id',c).limit(1000),
   ctx.db.from('gr_ops_records').select('company_id,record_id,payload').in('company_id',c).eq('kind','vendor').limit(500)
  ];
  const res=await Promise.all(q);
  const err=res.find(r=>r.error)?.error;if(err)throw err;
  [ctx.products,ctx.orders,ctx.events,ctx.pos,ctx.stock,ctx.service,ctx.materials,ctx.vendors]=res.map(r=>r.data||[]);
  // Keep the unfinished practice SO first; completed system example is selectable.
  ctx.orders.sort((a,b)=>Number(a.status==='COMPLETED')-Number(b.status==='COMPLETED')||
    new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
  if(!ctx.products.some(p=>p.id===ctx.pid))ctx.pid=ctx.products[0]?.id;
  if(!ctx.orders.some(o=>o.id===ctx.oid))ctx.oid=ctx.orders.find(o=>o.product_id===ctx.pid)?.id;
 }
 const toast=(ctx,message)=>{const area=el(ctx.root,'#gp-message');if(area){area.hidden=false;area.textContent=message}};
 const buttons=(labels)=>labels.map(([id,text])=>'<button type="button" data-action="'+id+'" class="gp-outline">'+esc(text)+'</button>').join('');
 const vendorName=(ctx,id)=>ctx.vendors.find(v=>v.record_id===id)?.payload?.name||id||'—';
 function paint(ctx){
  if(!ctx.root.isConnected)return;
  const prods=ctx.products.filter(p=>ctx.company==='all'||p.company_id===ctx.company);
  const p=prods.find(p=>p.id===ctx.pid)||prods[0];
  const orders=ctx.orders.filter(o=>o.product_id===p?.id);
  const o=orders.find(o=>o.id===ctx.oid)||orders[0];if(p)ctx.pid=p.id;if(o)ctx.oid=o.id;
  const po=ctx.pos.find(x=>x.order_id===o?.id);
  const movements=ctx.materials.filter(x=>x.order_id===o?.id);
  const fgMovements=ctx.stock.filter(x=>x.order_id===o?.id);
  const ware=movements.filter(x=>x.location==='WAREHOUSE').reduce((v,x)=>v+Number(x.qty_change),0);
  const ven=movements.filter(x=>x.location==='VENDOR').reduce((v,x)=>v+Number(x.qty_change),0);
  const events=ctx.events.filter(e=>e.order_id===o?.id);
  const step=o&&p?.steps[o.cursor]||null;
  const companyFields=ctx.companies.length>1?'<label>Working company<select id="gp-company">'+opts([['all','Both companies'],...ctx.companies.map(x=>[x,x==='grow-india'?'Grow India':'Enviro Solutions'])],ctx.company)+'</select></label>':'';
  const workflow=(p?.steps||[]).map((s,i)=>'<div class="gp-step '+(o&&(i<o.cursor?'done':i===o.cursor?'current':'') )+'">'+(o&&i<o.cursor?'✓ ':'')+(i+1)+'. '+esc(LABELS[s]||s)+'</div>').join('');
  const parts=(p?.parts||[]).map(x=>'<tr><td>'+esc(x.code)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.qty)+'</td><td>'+esc(x.uom||'nos')+'</td></tr>').join('');
  const status=o?o.status==='COMPLETED'?'Completed':'Step '+(o.cursor+1)+' / '+p.steps.length:'No order yet';
  const vendorRows=ctx.vendors.filter(v=>v.company_id===p?.company_id);
  const vendor=ctx.vendors.find(v=>v.record_id===(po?.vendor_id||ctx.vendorId))||vendorRows[0];
  const vendorPOs=ctx.pos.filter(x=>x.company_id===vendor?.company_id&&x.vendor_id===vendor?.record_id);
  const form=step?'<form id="gp-step-form">'+(step==='VENDOR_PO'?'<label>Choose vendor<select name="vendor_id">'+opts(vendorRows.map(v=>[v.record_id,v.payload?.name||v.record_id]),po?.vendor_id)+'</select></label>':'')+
    (step==='RM_RECEIPT'?'<label>Raw material received from supplier (kg)<input name="received_kg" type="number" min=".001" step=".001" value="50" required></label>':'')+
    (step==='ISSUE'?'<label>Material issued to vendor (kg)<input name="issued" type="number" min=".001" step=".001" value="50" required></label>':'')+
    (step==='JOBWORK'?'<p>Sample 50 kg lot: 8 kg used, 2 kg scrap, 40 kg remains at vendor.</p><div class="gp-options">'+
    [['issued','Issued','50'],['net_used','Net used','8'],['scrap','Scrap','2'],['vendor_balance','At vendor','40'],['returned','Returned','0']].map(([k,label,v])=>'<label>'+label+'<input name="'+k+'" type="number" min="0" step=".001" value="'+v+'" required></label>').join('')+'</div>':'')+
    (step==='RECEIVE'?'<label>Accepted processed parts (nos)<input name="accepted_qty" type="number" min="1" step="1" value="'+o.qty+'" required></label>':'')+
    (step==='INSPECTION'||step==='QC'?'<label>Inspection result<select name="result"><option value="PASS">PASS</option><option value="FAIL">FAIL</option></select></label>':'')+
    '<label>Activity notes<textarea name="note" required placeholder="Describe the work completed"></textarea></label>'+
    '<button class="gp-btn" type="submit" '+(!ctx.canEdit?'disabled':'')+'>✓ Complete '+esc(LABELS[step])+'</button></form>':'<p>Start a test Sales Order to begin the process.</p>';
  const orderList=orders.map(x=>[x.id,orderNum(x)+' · '+x.customer_name+' · '+x.qty+' nos']);
  ctx.root.innerHTML='<style>'+styles+'</style><div class="gp">'+
   '<div class="gp-top"><div><h3>Order → Production → Stock → Service</h3><small>Live Supabase records · clearly marked PILOT, not commercial or financial transactions</small></div>'+
   '<div class="gp-row">'+buttons([['refresh','Refresh cloud data']])+ '</div></div><div id="gp-message" class="gp-alert" hidden></div>'+
   '<div class="gp-alert"><b>Test environment inside GreenRich ONE:</b> The pilot SKU is inactive and cannot be sold. Actual customer orders, GST invoices, and real stock are not modified. Test quantity only changes after QC receipt or dispatch.</div>'+
   '<div class="gp-grid"><div>'+
   '<div class="gp-card"><h4>1. Product / BOM</h4>'+companyFields+
   '<label>Product<select id="gp-product">'+opts(prods.map(x=>[x.id,x.name+' ('+x.sku+')']),p?.id)+'</select></label>'+
   '<span class="gp-number">'+(p?available(ctx,p):0)+' nos</span><small>Current pilot finished stock — '+(p&&available(ctx,p)>0?'Available':'Out of Stock')+'</small><p>CRM Stock & Products SKU: '+esc(p?.sku||'—')+'</p>'+
   '<div class="gp-row"><button data-action="newproduct" class="gp-btn">+ Create product & workflow</button></div></div>'+
   '<div class="gp-card"><h4>2. Workflow stage map</h4>'+workflow+'</div></div>'+
   '<div><div class="gp-card"><h4>3. Sales Order / Availability</h4><label>Choose order<select id="gp-order">'+opts(orderList,o?.id)+'</select></label>'+
   '<div class="gp-row"><button class="gp-btn" data-action="neworder">+ Create test Sales Order</button></div>'+
   '<p>Order: <b>'+esc(o?orderNum(o):'—')+'</b> · Qty: <b>'+esc(o?.qty??0)+'</b> · '+esc(status)+'</p>'+
   (o?'<p>Customer: '+esc(o.customer_name)+'</p>':'')+
   '<div class="gp-alert">'+(step?'Next action: '+esc(LABELS[step]):'No outstanding workflow action')+'</div>'+ (o?form:'')+'</div>'+
   '<div class="gp-card"><h4>4. BOM / Material Requirements</h4><div class="gp-list"><table><thead><tr><th>Code</th><th>Part</th><th>Qty / FG</th><th>UOM</th></tr></thead><tbody>'+parts+'</tbody></table></div>'+
   '<div class="gp-row"><span class="gp-tag">RM warehouse: '+esc(ware.toFixed(3))+' kg</span><span class="gp-tag">RM at vendor: '+esc(ven.toFixed(3))+' kg</span></div><p>These quantities are calculated from posted test RM receipts, issues, consumption, waste and returns.</p></div>'+
   '<div class="gp-card"><h4>5. Timestamped work history</h4><div class="gp-history">'+(events.length?events.map(e=>'<article><b>'+esc(LABELS[e.step])+'</b><br>'+esc(e.note)+'<br><small>'+esc(new Date(e.at).toLocaleString('en-IN'))+'</small></article>').join(''):'No activities recorded.')+'</div></div></div>'+
   '<div class="gp-vendor-col"><div class="gp-card"><h4>6. Vendor 360</h4>'+
   '<label>Supplier<select id="gp-vendor">'+opts(vendorRows.map(v=>[v.record_id,v.payload?.name||v.record_id]),vendor?.record_id)+'</select></label>'+
   (vendor?'<p><b>'+esc(vendor.payload?.name)+'</b></p><p>Mobile: '+esc(vendor.payload?.phone||'Not verified')+'</p><p>Address: '+esc(vendor.payload?.location||'Not verified')+'</p><p>GSTIN: '+esc(vendor.payload?.gstin||'Not verified')+'</p>':'<p>No vendors registered</p>')+
   '<button class="gp-outline" data-action="editvendor">Edit vendor details</button></div>'+
   '<div class="gp-card"><h4>7. Vendor Purchase Order History</h4><div class="gp-list"><table><thead><tr><th>PO</th><th>Order</th><th>Date</th></tr></thead><tbody>'+
   (vendorPOs.length?vendorPOs.map(x=>'<tr><td>'+esc(x.number)+'</td><td>'+esc(orderNum(ctx.orders.find(o=>o.id===x.order_id)||{id:x.order_id}))+'</td><td>'+esc(x.issued_at?.slice(0,10))+'</td></tr>').join(''):'<tr><td colspan="3">No pilot purchase orders yet</td></tr>')+
   '</tbody></table></div><small>Real PO financial approval remains separate.</small></div>'+
   '<div class="gp-card"><h4>8. Service & Warranty History</h4>'+
   (ctx.service.filter(s=>s.order_id===o?.id).map(s=>'<p>'+esc(s.ticket)+' · '+esc(s.status)+'<br>'+esc(s.details)+'</p>').join('')||'<p>Service record will be created after test dispatch.</p>')+'</div></div></div></div>';
  el(ctx.root,'#gp-company')?.addEventListener('change',e=>{ctx.company=e.target.value;ctx.pid=null;ctx.oid=null;paint(ctx)});
  el(ctx.root,'#gp-product')?.addEventListener('change',e=>{ctx.pid=e.target.value;ctx.oid=ctx.orders.find(o=>o.product_id===ctx.pid)?.id;paint(ctx)});
  el(ctx.root,'#gp-order')?.addEventListener('change',e=>{ctx.oid=e.target.value;paint(ctx)});
  el(ctx.root,'#gp-vendor')?.addEventListener('change',e=>{ctx.vendorId=e.target.value;paint(ctx)});
  ctx.root.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(ctx,b.dataset.action));
  el(ctx.root,'#gp-step-form')?.addEventListener('submit',e=>submitStep(ctx,e));
 }
 async function reload(ctx){await fetchAll(ctx);paint(ctx)}
 function dialog(ctx,title,html,onSubmit){
  const d=document.createElement('dialog');d.className='gp';
  d.innerHTML='<h3>'+esc(title)+'</h3><form>'+html+'<div class="gp-row"><button type="button" class="gp-outline" data-cancel>Cancel</button><button class="gp-btn" type="submit">Save</button></div></form>';
  document.body.append(d);d.onclose=()=>d.remove();d.querySelector('[data-cancel]').onclick=()=>d.close();
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();const btn=d.querySelector('[type=submit]');btn.disabled=true;
   try{await onSubmit(new FormData(e.currentTarget));d.close();await reload(ctx)}catch(err){alert(err.message)}finally{btn.disabled=false}};
  d.showModal();return d;
 }
 function action(ctx,a){
  const p=ctx.products.find(x=>x.id===ctx.pid),o=ctx.orders.find(x=>x.id===ctx.oid);
  if(a==='refresh')return reload(ctx).catch(e=>toast(ctx,e.message));
  if(a==='neworder'){
   if(!p)return toast(ctx,'Select product first');
   dialog(ctx,'Create PILOT Sales Order','<p>Test order only. It will not affect actual sales revenue.</p>'+
    '<label>Customer / label<input name="customer" required value="Training Customer (Not Real)"></label>'+
    '<label>Quantity (nos)<input name="qty" type="number" min="1" max="100" value="1" required></label>',
    async f=>{const {data,error}=await ctx.db.rpc('gr_pilot_start_order',{p_product:p.id,p_qty:Number(f.get('qty')),p_customer:f.get('customer')});
    if(error)throw error;ctx.oid=data});
  }else if(a==='editvendor'){
   const vendor=ctx.vendors.find(x=>x.record_id===(ctx.vendorId||ctx.pos.find(x=>x.order_id===o?.id)?.vendor_id))||
    ctx.vendors.find(v=>v.company_id===p?.company_id);
   if(!vendor)return toast(ctx,'No vendor available');
   dialog(ctx,'Manage vendor (existing GreenRich master)',
    '<label>Company name<input name="name" required value="'+esc(vendor.payload?.name)+'"></label>'+
    '<label>Mobile number<input name="phone" value="'+esc(vendor.payload?.phone||'')+'" placeholder="+919876543210"></label>'+
    '<label>Address<textarea name="address">'+esc(vendor.payload?.location||'')+'</textarea></label>'+
    '<label>GSTIN (leave blank until verified)<input name="gstin" value="'+esc(vendor.payload?.gstin||'')+'"></label>',
    async f=>{const {error}=await ctx.db.rpc('gr_pilot_update_vendor',{p_company:vendor.company_id,p_vendor:vendor.record_id,
     p_name:f.get('name'),p_mobile:f.get('phone'),p_address:f.get('address'),p_gstin:f.get('gstin')});if(error)throw error});
  }else if(a==='newproduct'){
    const company=ctx.company==='all'?ctx.companies[0]:ctx.company;
    const fields='<label>Company<select name="company">'+opts(ctx.companies.map(c=>[c,c==='grow-india'?'Grow India':'Enviro Solutions']),company)+'</select></label>'+
      '<label>Product name<input name="name" required placeholder="Example: Home Composter 50L"></label>'+
      '<label>SKU (starts PILOT-)<input name="sku" required value="PILOT-NEW-50"></label>'+
      '<label>Process type<select name="type">'+opts([['SIMPLE','Simple assembly'],['OUTSOURCED','Vendor job work + manufacturing'],['DIRECT','Direct receipt']],'OUTSOURCED')+'</select></label>'+
      '<label>Workflow stage codes (comma-separated)<textarea name="steps" required>'+TEMPLATES.OUTSOURCED.join(', ')+'</textarea></label>'+
      '<label>Components, each line: code | name | qty | unit<textarea name="parts">PART-01 | Lid | 1 | nos\nPART-02 | Collection tab | 1 | nos</textarea></label>';
    const d=dialog(ctx,'Create Product + Custom BOM + Stages',fields,async f=>{
      const parts=String(f.get('parts')).split('\n').map(x=>x.trim()).filter(Boolean).map(x=>{const [code,name,qty,uom]=x.split('|').map(y=>y.trim());if(!code||!name||!Number.isFinite(Number(qty))||Number(qty)<=0)throw Error('Enter valid parts: code | name | qty | unit');return {code,name,qty:Number(qty),uom:uom||'nos'}});
      const steps=String(f.get('steps')).split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
      const {data,error}=await ctx.db.rpc('gr_pilot_product_create',{p_company:f.get('company'),p_sku:f.get('sku'),p_name:f.get('name'),p_parts:parts,p_steps:steps});
      if(error)throw error;ctx.company=f.get('company');ctx.pid=data;ctx.oid=null;
    });
    const ty=d.querySelector('select[name=type]'),steps=d.querySelector('textarea[name=steps]');ty.onchange=()=>steps.value=TEMPLATES[ty.value].join(', ');
  }
 }
 async function submitStep(ctx,e){
  e.preventDefault();
  const o=ctx.orders.find(x=>x.id===ctx.oid),p=ctx.products.find(x=>x.id===o?.product_id),step=stages(p)[o.cursor];
  const f=new FormData(e.currentTarget),d={};
  if(step==='VENDOR_PO')d.vendor_id=f.get('vendor_id');
  if(step==='RM_RECEIPT')d.received_kg=f.get('received_kg');
  if(step==='ISSUE')d.issued=f.get('issued');
  if(step==='JOBWORK')for(const k of ['issued','net_used','scrap','vendor_balance','returned'])d[k]=f.get(k);
  if(step==='RECEIVE')d.accepted_qty=f.get('accepted_qty');
  if(['QC','INSPECTION'].includes(step))d.result=f.get('result');
  const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
  try{const {error}=await ctx.db.rpc('gr_pilot_step',{p_order:o.id,p_note:f.get('note'),p_details:d});if(error)throw error;await reload(ctx)}
  catch(err){toast(ctx,err.message);btn.disabled=false}
 }
 async function mount(root,{client,companies,selection,canEdit}){
  root.innerHTML='<p>Loading connected ERP pilot from Supabase…</p>';
  const ctx={root,db:client,companies,company:selection||'all',canEdit,products:[],orders:[],events:[],pos:[],stock:[],service:[],materials:[],vendors:[],pid:null,oid:null,vendorId:'vendor-sivaji-enterprises'};
  try{await reload(ctx);if(root._pilotChannel)await client.removeChannel(root._pilotChannel);
   const channel=client.channel('gr-pilot-'+Math.random().toString(36).slice(2))
   .on('postgres_changes',{event:'*',schema:'public',table:'gr_pilot_orders'},()=>void reload(ctx).catch(()=>{}))
   .subscribe();root._pilotChannel=channel}catch(e){root.textContent='Pilot not ready: '+e.message+'; check the database migration';}
 }
 return {mount};
})();
