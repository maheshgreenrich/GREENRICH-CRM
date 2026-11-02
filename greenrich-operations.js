'use strict';
/* GreenRich ONE Operations & Production — company-scoped cloud records.
 * Draft configuration from uploaded ERP SOP/workbook, not a live stock or accounting ledger.
 * Never modifies Attendance, existing CRM sales or Dispatch state. */
(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=()=>new Date().toISOString().slice(0,10);
 const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'ops-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 const TYPES={
  material:{label:'Material master',module:'stock',fields:[['code','Material code','text',true],['name','Item / material description','text',true],['type','Material level','select:FG,SFG,IM,RM',true],['qty','Reference quantity','number'],['uom','Unit','select:nos,unit,kg,mtr,ltr,sets'],['operation','Operation / routing','text'],['preferred_vendor','Source vendor','text'],['source_type','Source method','select:Make,Buy,Job work / verify'],['status','Review status','select:Draft,Review requested,Validated'],['notes','Notes','textarea']]},
  vendor:{label:'Vendor master',module:'purchase',fields:[['name','Vendor name','text',true],['contact','Contact person','text'],['phone','Phone','tel'],['email','Email','email'],['gstin','GSTIN','text'],['location','Location / address','textarea'],['state','State','text'],['city','City','text'],['pincode','Pincode','text'],['category','Supplies / service','text'],['status','Approval status','select:Draft,Review requested,Approved'],['notes','Notes','textarea']]},
  bom:{label:'Multi-level BOM',module:'stock',fields:[['parent_code','Parent product code','text',true],['child_code','Required component code','text',true],['qty','Required quantity per parent','number',true],['uom','UOM','select:nos,kg,mtr,ltr,sets',true],['revision','BOM revision','text',true],['status','Review status','select:Draft,Review requested,Validated'],['notes','Mapping / change notes','textarea']]},
  requisition:{label:'Purchase requisitions',module:'purchase',fields:[['order_ref','Sales / work order reference','text'],['material_code','Required material code','text',true],['quantity','Required quantity','number',true],['uom','UOM','select:nos,kg,mtr,ltr,sets',true],['need_by','Required by','date'],['requester','Requested by','text'],['status','Status','select:Draft,Submitted,Approved,Ordered,Closed'],['notes','Shortage / purpose','textarea']]},
  purchase_order:{label:'Supplier purchase orders',module:'purchase',fields:[['po_number','Purchase order ID','text',true],['vendor','Vendor name','text',true],['material_code','Material code','text',true],['quantity','Quantity','number',true],['unit_price','Unit price (₹)','number'],['expected_on','Expected delivery','date'],['status','Status','select:Draft,Awaiting approval,Issued,Part received,Received,Closed,Cancelled'],['notes','Revision / approval evidence','textarea']]},
  goods_receipt:{label:'Material receiving & inspection',module:'purchase',fields:[['po_number','Purchase order ID','text',true],['material_code','Material code','text',true],['received_qty','Received quantity','number',true],['accepted_qty','Accepted quantity','number',true],['rejected_qty','Rejected quantity','number'],['received_on','Receipt date','date',true],['inspector','Inspector','text'],['status','Inspection','select:Pending inspection,Accepted,Part accepted,Rejected'],['notes','Damage / shortage / evidence','textarea']]},
  job_work:{label:'Vendor job-work / challans',module:'purchase',fields:[['job_ref','Job-work order reference','text',true],['vendor','Outside processor','text',true],['operation','Operation (cutting/welding/etc.)','text',true],['material_code','Input material code','text'],['issued_qty','Issued to vendor','number'],['received_qty','Received back','number'],['rejected_qty','Rejected/rework','number'],['due_on','Return due','date'],['status','Status','select:Draft,Sent to vendor,Part received,QC pending,Reconciled,Closed'],['notes','Batch, challan, scrap / invoice','textarea']]},
  work_order:{label:'Production & assembly orders',module:'stock',fields:[['order_ref','Linked sales order','text'],['work_number','Work order number','text',true],['product_code','Finished-product code','text',true],['planned_qty','Production quantity','number',true],['due_on','Plan completion date','date'],['bom_revision','Approved BOM revision','text'],['routing','Operations / routing','textarea'],['status','Production stage','select:Draft,Planning,Material awaiting,Released,In production,QC pending,Finished'],['notes','Issue, returns / batch notes','textarea']]},
  qc:{label:'Quality control & NCR',module:'stock',fields:[['work_number','Work / job order','text',true],['material_code','Inspected product / material','text',true],['inspected_qty','Inspected quantity','number',true],['accepted_qty','Passed quantity','number',true],['rejected_qty','Rejected quantity','number'],['inspection_on','Inspection date','date',true],['inspector','Inspector','text'],['status','QC decision','select:Pending,Passed,Part accepted,Failed,Rework required'],['serial_batch','Batch / serial reference','text'],['notes','QC evidence, defects or NCR','textarea']]},
  dispatch_check:{label:'Pre-dispatch release checklist',module:'dispatch',fields:[['order_ref','Sales order reference','text',true],['work_number','Production / QC reference','text'],['invoice_ref','Invoice reference','text'],['packing_slip','Packing slip ID','text'],['accessories_checked','Specifications / accessories checked','select:No,Yes'],['quality_cleared','QC cleared','select:No,Yes'],['commercial_cleared','Accounts cleared','select:No,Yes'],['status','Release checkpoint','select:Draft,Pending QC,Pending Accounts,Ready for dispatch'],['notes','Checklist & exceptions','textarea']]},
  receivable:{label:'Payment collection tracker',module:'accounts',fields:[['invoice_ref','Invoice number','text',true],['customer','Customer / account','text'],['due_amount','Amount due (₹)','number',true],['paid_amount','Amount received (₹)','number'],['due_on','Payment due date','date'],['status','Collection stage','select:Pending,Part paid,Disputed,Collected,Closed'],['notes','Receipt / TDS / deduction','textarea']]},
  service:{label:'Installation, warranty & service',module:'customers',fields:[['customer','Customer name','text',true],['product_code','Product code','text'],['serial_batch','Serial / batch','text'],['installation_date','Installation date','date'],['warranty_end','Warranty end date','date'],['technician','Assigned technician','text'],['status','Service stage','select:Installation pending,Installed,Ticket open,In service,Resolved,AMC follow-up'],['notes','Site, ticket, complaint / consumable','textarea']]}
 };
 const TABS=[
  ['overview','Process Overview','stock'],['material','Master Material','stock'],['vendor','Vendor','purchase'],
  ['job_work','Job Work','stock'],['raw_material','Raw Materials','stock'],['purchase_order','Purchase Order','purchase'],['qc','Quality Check','stock']
 ];
 const FLOW=[
  ['Lead & qualification','Marketing / Sales','Source, lead register, call logs, Hot/Warm/Cold and site requirement'],
  ['Quotation & customer PO','Sales / Engineering','Specification, costing, GST, approved quotation, signed PO'],
  ['Sales order clearance','Sales / Accounts','Credit/payment terms, customer GST and invoice milestone'],
  ['Material & BOM planning','Operations / ERP','FG→SFG→IM→RM, revision, sourcing and stock shortages'],
  ['Purchase & inward inspection','Purchase / Stores / QC','RFQ, vendor comparison, PO, receipt and inspection'],
  ['Job work & challan','Purchase / Operations','Issued quantities, vendor tracking, received/rejected, reconciliation'],
  ['Production & QC','Operations / Quality','Issue, routing, work-in-progress, inspection, finished-goods release'],
  ['Invoice & dispatch','Accounts / Dispatch','Commercial/QC release, packing slip, courier LR/AWB'],
  ['Delivery & collection','Logistics / Sales / Accounts','POD, shortage/damage closure, invoice and receipt allocation'],
  ['Installation & AMC','Service / Sales','Installation, warranty, service ticket and consumable follow-up']
 ];
 let productionRole='',host=null,db=null,companyIds=[],companyScope='all',caps={},isAdmin=false,kind='overview',rows=[],version=0,channel=null,refreshTimer=null;
 const companyName=id=>id==='grow-india'?'GreenRich Grow India Pvt Ltd':'GreenRich Enviro Solutions Pvt Ltd';
 const allowedType=id=>{if(['Sales','Telecaller','Marketing'].includes(productionRole))return false;if(productionRole==='Accounts')return ['purchase_order','vendor'].includes(id)&&Boolean(caps.purchase?.view);return Boolean(caps[['vendor','purchase_order'].includes(id)?'purchase':'stock']?.view)};
 const canEdit=(id,action)=>isAdmin||Boolean(caps[TYPES[id]?.module]?.[action]);
 const allKind=id=>rows.filter(r=>r.kind===id).map(r=>({...r.payload,_companyId:r.company_id,_savedAt:r.updated_at}));
 const scopeRows=id=>allKind(id).filter(r=>companyScope==='all'||r._companyId===companyScope);
 const actionAlert=message=>{const area=host?.querySelector('#gr-ops-alert');if(area){area.hidden=false;area.textContent=message}const inline=host?.querySelector('#gr-ops-editor[open] #gr-ops-form-error');if(inline){inline.hidden=false;inline.textContent=message}};
 const pill=x=>'<span class="gr-ops-pill">'+esc(x||'Draft')+'</span>';
 const colsFor=id=>id==='material'?[['code','Material code'],['name','Item / material description'],['_stock','Stock quantity'],['uom','Unit']]:TYPES[id].fields.filter(([key])=>['code','name','type','parent_code','child_code','vendor','material_code','po_number','work_number','job_ref','order_ref','quantity','qty','status','review_status','due_on','expected_on'].includes(key)).slice(0,6);
 function filterCompany(){
  if((kind==='vendor'&&!window.GreenRichVendors.leave())||(kind!=='vendor'&&!window.GreenRichProduction.leave())){host.querySelector('#gr-ops-company').value=companyScope;return;}
  const value=host.querySelector('#gr-ops-company')?.value;
  if(value==='all'&&companyIds.length===2)companyScope='all';
  else if(companyIds.includes(value))companyScope=value;
  draw();
 }
 async function fetchRows(){
  const result=[];
  for(let start=0;start<10000;start+=1000){
   const r=await db.from('gr_ops_records').select('company_id,kind,record_id,payload,updated_at').in('company_id',companyIds).range(start,start+999);
   if(r.error)throw Error(r.error.message);
   result.push(...(r.data||[]));if((r.data||[]).length<1000)break;
  }
  if(kind==='vendor'){const live=await db.from('gr_production_documents').select('company_id,id,number,payload,updated_at,status').in('company_id',companyIds).eq('kind','po');if(!live.error)for(const d of live.data||[]){result.push({company_id:d.company_id,kind:'purchase_order',record_id:d.id,updated_at:d.updated_at,payload:{id:d.id,po_number:d.number,vendor_id:d.payload.vendor_id,vendor:d.payload.vendor?.name,material_code:d.payload.lines?.map(l=>l.code).join(', '),quantity:d.payload.lines?.map(l=>l.quantity+' '+l.uom).join(', '),expected_on:d.payload.delivery_date,status:d.status,notes:d.payload.terms}})}}
  rows=result;
 }
 async function reload(){
  const token=++version;
  try{await fetchRows();if(token!==version||!host?.isConnected)return;draw()}
  catch(error){actionAlert('Operations cloud: '+error.message)}
 }
 const reloadSoon=()=>{if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void reload(),250)};
 function drawOverview(){
  const available=['material','vendor','bom','work_order','requisition','purchase_order','job_work','qc','dispatch_check','receivable','service'];
  const summary=available.filter(allowedType).map(x=>({name:TYPES[x].label,count:scopeRows(x).length}));
  host.querySelector('#gr-ops-body').innerHTML='<section class="gr-ops-welcome"><div><small>GREENRICH OPERATIONS · PHASE 1</small><h2>Manufacturing & ERP workflow</h2><p>One process from order confirmation through material planning, production, QC, dispatch, collection and service.</p></div><strong>Company-scoped · Cloud synced</strong></section>'+
   '<div class="gr-ops-metrics">'+summary.slice(0,8).map(s=>'<div class="gr-ops-metric"><small>'+esc(s.name)+'</small><strong>'+s.count+'</strong></div>').join('')+'</div>'+
   '<div class="gr-ops-surface"><div class="gr-ops-heading"><h3>End-to-end responsibility and documents</h3><span>From operations team ERP flowchart · pages 2–13</span></div>'+
    '<div class="gr-ops-flow">'+FLOW.map(([title,owner,evidence],i)=>'<div class="gr-ops-flowstep"><span class="gr-ops-step">'+String(i+1).padStart(2,'0')+'</span><div><strong>'+esc(title)+'</strong><small>'+esc(owner)+'</small><p>'+esc(evidence)+'</p></div></div>').join('')+'</div></div>'+
   '<div class="gr-ops-note"><strong>Not automatically connected to existing live stock, invoices or Dispatch.</strong> The new Operations area records planning and evidence separately. Material allocation, physical stock adjustments, statutory invoice timing and dispatch blocking require signed-off rules before automation.</div>'+
   (isAdmin&&companyIds.includes('grow-india')?'<div class="gr-ops-import"><div><h3>FG-001 composter mapping from the uploaded Excel file</h3><p>Load 31 materials, named vendors and a proposed multi-level BOM as unapproved draft records for Operations to verify. Existing records are never overwritten.</p></div><button class="gr-ops-primary" type="button" data-import="fg001">Import FG-001 draft</button></div>':'');
 }
 function drawTable(){
  const type=TYPES[kind],search=(host.querySelector('#gr-ops-search')?.value||'').trim().toLowerCase();
  let list=scopeRows(kind).sort((a,b)=>String(b._savedAt||'').localeCompare(String(a._savedAt||'')));
  if(search)list=list.filter(row=>Object.values(row).some(value=>String(value??'').toLowerCase().includes(search)));
  const fields=colsFor(kind);
  const body=list.length?list.map(item=>'<tr data-ops-search="'+esc(Object.values(item).join(' '))+'"><td>'+esc(companyName(item._companyId))+'</td>'+
    fields.map(([key])=>key==='_stock'?'<td data-material-stock data-material-company="'+esc(item._companyId)+'" data-material-id="'+esc(item.id)+'">Loading…</td>':'<td>'+esc(item[key]??'—')+'</td>').join('')+
    '<td>'+(kind==='material'?'':pill(item.status)+' ')+(canEdit(kind,'edit')?'<button class="gr-ops-rowbutton" type="button" data-edit-record="'+esc(item.id)+'" data-edit-company="'+esc(item._companyId)+'">Edit</button>':'')+'</td></tr>').join(''):
    '<tr><td colspan="'+(fields.length+2)+'" class="gr-ops-empty">No '+esc(type.label.toLowerCase())+' records match this view.</td></tr>';
  host.querySelector('#gr-ops-body').innerHTML='<section class="gr-ops-surface"><div class="gr-ops-heading"><div><h3>'+esc(type.label)+'</h3><p>Shared company-scoped records · '+list.length+' displayed</p></div>'+
    (canEdit(kind,'create')?'<button class="gr-ops-primary" type="button" data-new-record="'+kind+'">+ New record</button>':'')+'</div>'+
    '<div class="gr-ops-tools"><input id="gr-ops-search" type="search" value="'+esc(search)+'" placeholder="Search description, reference, vendor or status…"><button type="button" data-refresh="yes">Refresh</button></div>'+
    '<div class="gr-ops-scroll"><table class="gr-ops-table"><thead><tr><th>Company</th>'+fields.map(([_,label])=>'<th>'+esc(label)+'</th>').join('')+'<th>Manage</th></tr></thead><tbody>'+body+'</tbody></table></div></section>'+
    (kind==='bom'?bomInspector():'')+
    (kind==='material'?'<p class="gr-material-stock-note">Stock is shown from the linked CRM product (matching material code / SKU). Unlinked stock is shown as Not recorded.</p>':'')+
    (['work_order','goods_receipt','qc','dispatch_check'].includes(kind)?'<div class="gr-ops-note">These records track status and evidence. They do not yet perform automatic warehouse inventory adjustments or release statutory documents.</div>':'');
  if(kind==='material')void drawMaterialStock();
 }
 let stockRequest=0;
 async function drawMaterialStock(){
  const request=++stockRequest,target=host.querySelector('#gr-ops-body');
  try{
   const products=[];
   for(let start=0;;start+=1000){
    const r=await db.from('gr_crm_records').select('company_id,record_id,payload').in('company_id',companyIds).eq('kind','products').range(start,start+999);
    if(r.error)throw Error(r.error.message);products.push(...(r.data||[]));if((r.data||[]).length<1000)break;
   }
   if(request!==stockRequest||kind!=='material'||!target.isConnected)return;
   target.querySelectorAll('[data-material-stock]').forEach(cell=>{
    const material=allKind('material').find(m=>m.id===cell.dataset.materialId&&m._companyId===cell.dataset.materialCompany);
    const matches=material?products.filter(p=>p.company_id===material._companyId&&(material.crm_product_id?p.record_id===material.crm_product_id:String(p.payload.sku||'').trim().toLowerCase()===String(material.code||'').trim().toLowerCase())):[];
    const value=matches.length===1?matches[0].payload.stock:null;
    cell.textContent=value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?String(Number(value)):'Not recorded';
    cell.title=matches.length===1?'Current CRM product stock':'No unique CRM product linked by material code / SKU';
   });
  }catch(error){if(request===stockRequest&&kind==='material')target.querySelectorAll('[data-material-stock]').forEach(cell=>{cell.textContent='Unavailable';cell.title='CRM stock could not be loaded. Refresh to retry.'})}
 }
 function bomInspector(){
  const drafts=scopeRows('bom'),missing=drafts.filter(l=>!(Number(l.qty)>0)||!l.parent_code||!l.child_code),validated=drafts.filter(l=>l.status==='Validated');
  return '<div class="gr-ops-bom-review"><div><h3>Multi-level BOM verification</h3><p>'+drafts.length+' mapping lines · '+validated.length+' validated · '+missing.length+' with missing quantities or codes</p></div><p>No purchase or work-order demand is automatically released from draft lines. Confirm hierarchy, revision, UOM, source and material quantity before approving the BOM.</p></div>'+
   '<div class="gr-ops-plan"><div><h3>Material requirement preview</h3><p>Explode FG → SFG → IM → RM after the full BOM for that product is validated. This is a read-only quantity preview, not a warehouse stock movement.</p></div>'+
   '<div class="gr-ops-plan-fields"><label>Company<select id="gr-ops-plan-company">'+companyIds.map(id=>'<option value="'+id+'">'+esc(companyName(id))+'</option>').join('')+'</select></label>'+
   '<label>Finished product<select id="gr-ops-plan-product">'+allKind('material').filter(m=>m.type==='FG').map(m=>'<option value="'+esc(m.code)+'" data-company="'+esc(m._companyId)+'">'+esc(m.code)+' — '+esc(m.name)+'</option>').join('')+'</select></label>'+
   '<label>Build quantity<input id="gr-ops-plan-qty" type="number" min="1" step="1" value="1"></label><button type="button" class="gr-ops-primary" data-plan-bom="yes">Preview materials</button></div>'+
   '<div id="gr-ops-plan-output" aria-live="polite"></div></div>';
 }
 function explodeBom(company,rootCode,count){
  if(!companyIds.includes(company))throw Error('Company not assigned to this user');
  if(!Number.isInteger(count)||count<=0)throw Error('Enter a positive whole-number production quantity');
  const materials=allKind('material').filter(m=>m._companyId===company),bom=allKind('bom').filter(l=>l._companyId===company);
  const byCode=new Map(materials.map(m=>[m.code,m]));
  if(!byCode.has(rootCode))throw Error('Finished product not found for this company');
  const totals=new Map();
  function visit(code,qty,trail){
   if(trail.includes(code))throw Error('BOM loop detected: '+[...trail,code].join(' → '));
   if(trail.length>12)throw Error('BOM is too deep; check the structure');
   const lines=bom.filter(x=>x.parent_code===code);
   if(!lines.length){
    if(code===rootCode)throw Error('No BOM links recorded for this finished product');
    const item=byCode.get(code);if(!item)throw Error('Material '+code+' not found');
    const previous=totals.get(code)||{code,name:item.name,qty:0,uom:item.uom||'—',source:item.source_type||'Unspecified'};
    previous.qty+=qty;totals.set(code,previous);return;
   }
   const unapproved=lines.find(x=>x.status!=='Validated'||!(Number(x.qty)>0)||!x.uom);
   if(unapproved)throw Error('BOM '+code+' has unapproved or incomplete line '+unapproved.child_code+'. Ask Operations to verify all lines first.');
   for(const link of lines){
    if(!byCode.has(link.child_code))throw Error('BOM references unknown material '+link.child_code);
    visit(link.child_code,qty*Number(link.qty),[...trail,code]);
   }
  }
  visit(rootCode,count,[]);
  return [...totals.values()].sort((a,b)=>a.code.localeCompare(b.code));
 }
 function showBomPlan(){
  const company=host.querySelector('#gr-ops-plan-company')?.value;
  const product=host.querySelector('#gr-ops-plan-product')?.value;
  const count=Number(host.querySelector('#gr-ops-plan-qty')?.value);
  const area=host.querySelector('#gr-ops-plan-output');if(!area)return;
  try{
   const lines=explodeBom(company,product,count);
   area.innerHTML='<div class="gr-ops-plan-ready"><strong>'+lines.length+' material requirements · '+count+' finished products</strong><div class="gr-ops-scroll"><table class="gr-ops-table"><thead><tr><th>Material code</th><th>Description</th><th>Calculated quantity</th><th>Unit</th><th>Source</th></tr></thead><tbody>'+
    lines.map(x=>'<tr><td>'+esc(x.code)+'</td><td>'+esc(x.name)+'</td><td>'+esc(Number(x.qty.toFixed(4)))+'</td><td>'+esc(x.uom)+'</td><td>'+esc(x.source)+'</td></tr>').join('')+
    '</tbody></table></div></div>';
  }catch(error){area.innerHTML='<div class="gr-ops-note">'+esc(error.message)+'</div>'}
 }
 function draw(){
  if(!host?.isConnected)return;
  host.querySelectorAll('[data-ops-tab]').forEach(button=>{
   button.classList.toggle('active',button.dataset.opsTab===kind);
   button.setAttribute('aria-current',button.dataset.opsTab===kind?'page':'false');
  });
  if(kind!=='vendor'&&TABS.some(t=>t[0]===kind)){void window.GreenRichProduction.render({root:host.querySelector('#gr-ops-body'),db,tab:kind,scope:companyScope,companies:companyIds,companyName,role:productionRole,can:(module,action)=>Boolean(caps[module]?.[action])});return;}
  if(kind==='vendor')window.GreenRichVendors.render({root:host.querySelector('#gr-ops-body'),db,rows,scope:companyScope,companies:companyIds,companyName,can:action=>canEdit('vendor',action),fields:TYPES.vendor.fields,poFields:TYPES.purchase_order.fields,control:options,reload});
  else if(kind==='overview')drawOverview();
  else if(kind==='pilot'){
   const body=host.querySelector('#gr-ops-body');
   if(!window.GreenRichPilot){body.textContent='Connected ERP pilot failed to load. Please refresh.';return;}
   void window.GreenRichPilot.mount(body,{client:db,companies:companyIds,selection:companyScope,
      canEdit:Boolean(caps.stock?.edit && caps.stock?.create)})
    .catch(e=>{body.textContent='Pilot loading failed: '+e.message});
  }else if(kind==='training'){
   const body=host.querySelector('#gr-ops-body');
   if(!window.GreenRichWorkflowTraining){body.textContent='Training module could not load. Refresh the application.';return;}
   void window.GreenRichWorkflowTraining.mount(body,{client:db,companies:companyIds,selection:companyScope,
    canWrite:Boolean(caps.stock?.create&&caps.stock?.edit)})
   .catch(e=>{body.textContent='Unable to open training: '+e.message});
  }else drawTable();
 }
 function options(field,type,value){
  if(type.startsWith('select:'))return '<select name="'+field+'" '+(value.required?'required':'')+'>'+type.slice(7).split(',').map(x=>'<option value="'+esc(x)+'" '+(x===value.current?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select>';
  if(type==='textarea')return '<textarea name="'+field+'" rows="3">'+esc(value.current||'')+'</textarea>';
  return '<input name="'+field+'" type="'+type+'" '+(type==='number'?'step="any" min="0"':'')+' value="'+esc(value.current??'')+'" '+(value.required?'required':'')+'>';
 }
 function openEditor(id='',recordCompany=''){
  const editor=host.querySelector('#gr-ops-editor'),obj=id?rows.find(r=>r.kind===kind&&r.company_id===recordCompany&&r.record_id===id):null;
  if(id&&!obj)return actionAlert('Record not found; refresh.');
  const item={...(obj?.payload||{})},type=TYPES[kind];
  if(kind==='material'&&item.preferred_vendor_id){const vendor=rows.find(r=>r.kind==='vendor'&&r.company_id===recordCompany&&r.record_id===item.preferred_vendor_id);if(vendor)item.preferred_vendor=vendor.payload.name;}
  editor.dataset.kind=kind;editor.dataset.recordId=id;editor.dataset.company=recordCompany;editor.classList.toggle('gr-material-dialog',kind==='material');
  editor.querySelector('#gr-ops-dialog-title').textContent=(id?'Edit ':'New ')+type.label;
  editor.querySelector('#gr-ops-form').innerHTML='<label>Company'+(kind==='material'?' *':'')+'<select name="company_id" '+(id?'disabled':'')+'>'+companyIds.filter(cid=>companyScope==='all'||companyScope===cid||id).map(cid=>'<option value="'+cid+'" '+((id?recordCompany:companyScope===cid)?'selected':'')+'>'+esc(companyName(cid))+'</option>').join('')+'</select></label>'+
   (kind==='material'?['code','name','uom','operation','preferred_vendor','source_type','notes'].map(key=>type.fields.find(f=>f[0]===key)):type.fields).map(([key,label,control,required])=>'<label>'+esc(label)+(required?' *':'')+options(key,control,{required,current:item[key]})+'</label>').join('')+
   '<div class="gr-ops-form-buttons"><button type="button" data-cancel-record>Cancel</button><button class="gr-ops-primary" type="submit" data-save-record>Save record</button></div><p id="gr-ops-form-error" role="alert" hidden></p>';
  if(id)editor.querySelector('[name=company_id]').value=recordCompany;
  const form=editor.querySelector('#gr-ops-form');
  const selectedCompany=id?recordCompany:form.elements.namedItem('company_id')?.value||companyIds[0];
  const materialLayout=()=>{
   if(kind!=='material')return;
   const actions=form.querySelector('.gr-ops-form-buttons');actions.style.order='-1';actions.classList.add('gr-material-actions');
   form.elements.namedItem('notes')?.closest('label')?.classList.add('gr-material-notes');
   const input=form.elements.namedItem('preferred_vendor');if(!input)return;
   const company=form.elements.namedItem('company_id').value;
   const vendors=rows.filter(r=>r.kind==='vendor'&&r.company_id===company);
   if(input.tagName==='INPUT'){
    input.setAttribute('list','gr-material-vendors');input.placeholder='Search vendor';input.autocomplete='off';
    let list=form.querySelector('#gr-material-vendors');if(!list){list=document.createElement('datalist');list.id='gr-material-vendors';form.append(list)}
    list.innerHTML=vendors.map(r=>'<option value="'+esc(r.payload.name)+'"></option>').join('');
   }
  };
  const apply=co=>{window.GreenRichFormBuilder?.decorate?.(form,co,'ops_'+kind);materialLayout()};
  apply(selectedCompany);
  if(!id)form.elements.namedItem('company_id')?.addEventListener('change',event=>apply(event.target.value));
  if(id)void window.GreenRichFormBuilder?.recentAnswers?.(selectedCompany,'ops_'+kind,id).then(values=>{
   if(editor.open&&editor.dataset.recordId===id){window.GreenRichFormBuilder.decorate(form,selectedCompany,'ops_'+kind,values);materialLayout();}
  }).catch(()=>{});
  editor.showModal();
 }
 async function saveRecord(event){
  event.preventDefault();
  const dialog=host.querySelector('#gr-ops-editor'),form=event.currentTarget,id=dialog.dataset.recordId;
  const k=dialog.dataset.kind,current=id?rows.find(r=>r.kind===k&&r.record_id===id&&r.company_id===dialog.dataset.company):null,
   company=id?current?.company_id:form.elements.namedItem('company_id')?.value;
  if(!companyIds.includes(company))return actionAlert('This company is not assigned to your account.');
  let extra={};
  try{extra=window.GreenRichFormBuilder?.collect?.(form,company,'ops_'+k)||{}}
  catch(err){return actionAlert('Form questions: '+err.message)}
  const payload={...(current?.payload||{}),id:id||uid()};
  for(const [field,,control] of TYPES[k].fields){
   if(!form.elements.namedItem(field))continue;
   const value=form.elements.namedItem(field)?.value?.trim()||'';
   payload[field]=control==='number'?(value===''?null:Number(value)):value;
  }
  if(!id&& !canEdit(k,'create')||id&&!canEdit(k,'edit'))return actionAlert('Your role cannot save '+TYPES[k].label);
  const mat=allKind('material').filter(r=>r._companyId===company);
  if(k==='bom'){
   if(payload.parent_code===payload.child_code)return actionAlert('A material cannot contain itself.');
   if(!mat.some(r=>r.code===payload.parent_code)||!mat.some(r=>r.code===payload.child_code))return actionAlert('Add the parent and child to Material Master first.');
   if(payload.status==='Validated'&&(!isAdmin||!(payload.qty>0)))return actionAlert('Only Admin can validate BOM lines, and quantity must be greater than zero.');
  }
  if(k==='material'){
   if(!payload.name)return actionAlert('Item / material is required.');
   if(!id){payload.type=/^(FG|SFG|IM|RM)(?:-|$)/i.exec(payload.code)?.[1]?.toUpperCase()||'RM';payload.status='Draft';payload.qty=null;}
   const selectedVendor=rows.filter(r=>r.kind==='vendor'&&r.company_id===company&&String(r.payload.name||'').trim().toLowerCase()===String(payload.preferred_vendor||'').trim().toLowerCase());
   if(payload.preferred_vendor&&selectedVendor.length!==1&&payload.preferred_vendor!==current?.payload?.preferred_vendor)return actionAlert('Select a source vendor from this company’s Vendor master.');
   payload.preferred_vendor_id=selectedVendor.length===1?selectedVendor[0].record_id:payload.preferred_vendor?current?.payload?.preferred_vendor_id||null:null;
   if(selectedVendor.length===1)payload.preferred_vendor=selectedVendor[0].payload.name;
  }
  if(k==='material'&&!payload.code)return actionAlert('Material code is required.');
  if(k==='material'&&allKind('material').some(r=>r._companyId===company&&r.code===payload.code&&r.id!==id))return actionAlert('Material code already exists for this company.');
  if(k==='goods_receipt'&&Number(payload.accepted_qty||0)+Number(payload.rejected_qty||0)>Number(payload.received_qty||0))return actionAlert('Accepted plus rejected quantity cannot exceed received quantity.');
  if(k==='qc'&&Number(payload.accepted_qty||0)+Number(payload.rejected_qty||0)>Number(payload.inspected_qty||0))return actionAlert('QC accepted plus rejected cannot exceed inspected quantity.');
  if(k==='dispatch_check'&&payload.status==='Ready for dispatch'&&(!isAdmin||payload.quality_cleared!=='Yes'||payload.commercial_cleared!=='Yes'||!payload.packing_slip))return actionAlert('Admin sign-off, QC, Accounts clearance and packing slip are required.');
  const button=form.querySelector('[data-save-record]');button.disabled=true;
  try{
   const values={company_id:company,kind:k,record_id:payload.id,payload,updated_at:new Date().toISOString()};
   const response=id?await db.from('gr_ops_records').update({payload,updated_at:values.updated_at}).eq('company_id',company).eq('kind',k).eq('record_id',id).select('record_id'):
    await db.from('gr_ops_records').insert(values).select('record_id');
   if(response.error)throw Error(response.error.message);
   if(!response.data?.length)throw Error('Record was not saved. Verify permissions.');
   let extrasIssue='';
   if(Object.keys(extra).length){
    try{await window.GreenRichFormBuilder.saveAnswers(company,'ops_'+k,payload.id,extra)}
    catch(e){extrasIssue=' Additional form answers failed: '+e.message}
   }
   dialog.close();actionAlert('Saved '+TYPES[k].label+' to shared GreenRich cloud.'+extrasIssue);await reload();
  }catch(error){actionAlert('Save failed: '+error.message)}finally{button.disabled=false}
 }
 async function importExample(){
  if(!isAdmin||!companyIds.includes('grow-india'))return actionAlert('Only Admin assigned to Grow India can import the example.');
  if(!window.GreenRichOperationsSeed)return actionAlert('Workbook mapping file missing. Refresh the page.');
  const example=window.GreenRichOperationsSeed.records;
  if(!confirm('Import '+example.length+' unapproved draft material/vendor/BOM records into GreenRich Grow India? Existing records will NOT be overwritten. No live stock will change.'))return;
  try{
   for(let start=0;start<example.length;start+=70){
    const chunk=example.slice(start,start+70).map(r=>({...r,company_id:'grow-india'}));
    const result=await db.from('gr_ops_records').upsert(chunk,{onConflict:'company_id,kind,record_id',ignoreDuplicates:true});
    if(result.error)throw Error(result.error.message);
   }
   actionAlert('Imported FG-001 draft mapping. Review every BOM link, quantity and supplier before validation.');await reload();
  }catch(error){actionAlert('Import error: '+error.message)}
 }
 async function mount(container,{client,companies,selection,role,can}){
  if(channel&&db)await db.removeChannel(channel);if(refreshTimer)clearTimeout(refreshTimer);
  db=client;host=container;companyIds=companies;companyScope=selection==='all'&&companies.length===2?'all':companies.includes(selection)?selection:companies[0];
  productionRole=role;isAdmin=role==='Admin';caps=Object.fromEntries([...new Set(Object.values(TYPES).map(x=>x.module))].map(module=>
   [module,Object.fromEntries(['view','create','edit','delete','approve','export'].map(action=>[action,isAdmin||Boolean(can(module,action))]))]));
  window.GreenRichVendors?.reset();window.GreenRichProduction?.reset();
  kind=role==='Accounts'?'purchase_order':'overview';rows=[];version++;
  try{await window.GreenRichFormBuilder?.ready?.(db,companyIds)}
  catch(e){actionAlert('Form Builder settings unavailable: '+e.message)}
  host.innerHTML='<div class="gr-ops"><div class="gr-ops-banner"><div><span>GREENRICH ONE · ERP OPERATIONS</span><h2>Operations & Production</h2><p>Material to vendor, production to QC, and delivery readiness</p></div>'+
   '<label>Working company<select id="gr-ops-company"><option value="all">Both companies</option>'+companyIds.map(id=>'<option value="'+id+'">'+esc(companyName(id))+'</option>').join('')+'</select></label></div>'+
   '<div class="gr-ops-notice" id="gr-ops-alert" role="status" hidden></div>'+
   '<nav class="gr-ops-tabs" aria-label="Operations modules">'+TABS.filter(x=>allowedType(x[0])).map(([id,label])=>'<button type="button" data-ops-tab="'+id+'">'+esc(label)+'</button>').join('')+'</nav>'+
   '<main id="gr-ops-body" class="gr-ops-main"></main><dialog id="gr-ops-editor" class="gr-ops-dialog"><header><h3 id="gr-ops-dialog-title"></h3><button type="button" data-cancel-record aria-label="Close">×</button></header><form id="gr-ops-form"></form></dialog></div>';
  const c=host.querySelector('#gr-ops-company');if(companyIds.length<2){c.value=companyIds[0];c.querySelector('[value=all]').remove();c.disabled=true}else c.value=companyScope;
  c.onchange=filterCompany;
  host.addEventListener('click',event=>{
   const tab=event.target.closest('[data-ops-tab]');if(tab){if(!allowedType(tab.dataset.opsTab))return;if(kind==='vendor'&&!window.GreenRichVendors.leave())return;if(kind!=='vendor'&&!window.GreenRichProduction.leave())return;kind=tab.dataset.opsTab;draw();if(kind==='vendor')void reload();return}
   const create=event.target.closest('[data-new-record]');if(create){openEditor();return}
   const edit=event.target.closest('[data-edit-record]');if(edit){openEditor(edit.dataset.editRecord,edit.dataset.editCompany);return}
   if(event.target.closest('[data-cancel-record]')){host.querySelector('#gr-ops-editor').close();return}
   if(event.target.closest('[data-refresh]')){void reload();return}
   if(event.target.closest('[data-import]')){void importExample();return}
   if(event.target.closest('[data-plan-bom]')){showBomPlan();return}
  });
  host.querySelector('#gr-ops-form').onsubmit=saveRecord;
  host.addEventListener('change',event=>{if(event.target.id==='gr-ops-plan-company'){const id=event.target.value;host.querySelectorAll('#gr-ops-plan-product option').forEach(option=>{option.hidden=option.dataset.company!==id});const valid=[...host.querySelectorAll('#gr-ops-plan-product option')].find(option=>!option.hidden);if(valid)host.querySelector('#gr-ops-plan-product').value=valid.value;}});
  host.addEventListener('input',event=>{if(event.target.id==='gr-ops-search'){const term=event.target.value.toLowerCase();host.querySelectorAll('.gr-ops-table tbody tr').forEach(row=>row.hidden=!(row.dataset.opsSearch||row.textContent).toLowerCase().includes(term))}});
  draw();await reload();
  if(host?.isConnected){
   channel=db.channel('greenrich-ops-'+Math.random().toString(36).slice(2))
    .on('postgres_changes',{event:'*',schema:'public',table:'gr_ops_records'},reloadSoon)
    .on('postgres_changes',{event:'*',schema:'public',table:'gr_production_balances'},reloadSoon)
    .on('postgres_changes',{event:'*',schema:'public',table:'gr_production_documents'},reloadSoon)
    .on('postgres_changes',{event:'*',schema:'public',table:'gr_crm_records',filter:'kind=eq.products'},reloadSoon).subscribe();
  }
 }
 window.GreenRichOperations={mount,TYPES,TABS,FLOW};
})();
