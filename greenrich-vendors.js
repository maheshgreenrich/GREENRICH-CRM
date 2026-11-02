'use strict';
/* Vendor workspace: company-scoped records, linked CRM stock, no inventory mutations. */
(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=x=>String(x||'').trim().toLowerCase().replace(/\s+/g,' ');
 const amount=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?String(Number(x)):'Not recorded';
 let ctx=null,root=null,selected=null,editing=null,dirty=false,busy=false,token=0,stock=[],productionStock=[],stockState='';
 const data=kind=>ctx.rows.filter(r=>r.kind===kind);
 const current=()=>selected&&data('vendor').find(r=>r.company_id===selected.company&&r.record_id===selected.id);
 const message=text=>{const el=root?.querySelector('[data-vendor-message]');if(el){el.textContent=text;el.hidden=!text;}};
 function leave(){if(busy)return false;if(dirty&&!window.confirm('Discard unsaved vendor changes?'))return false;selected=null;dirty=false;token++;return true;}
 function matches(record,vendor,key){
  if(record.company_id!==vendor.company_id)return false;
  const p=record.payload,v=vendor.payload,id=p.vendor_id||p.preferred_vendor_id;
  if(id)return id===vendor.record_id;
  const names=[v.name,...(v.aliases||[])].map(norm).filter(Boolean),name=norm(p[key]);
  if(!names.includes(name))return false;
  return data('vendor').filter(r=>r.company_id===vendor.company_id&&[r.payload.name,...(r.payload.aliases||[])].map(norm).includes(name)).length===1;
 }
 function materials(v){return data('material').filter(r=>r.company_id===v.company_id&&(matches(r,v,'preferred_vendor')||(v.payload.vendor_products||[]).some(p=>p.material_id===r.record_id)));}
 function render(options){ctx=options;root=options.root;if(selected&&root.querySelector('[data-vendor-form]')&&(dirty||busy))return;if(selected)detail();else list();}
 function list(){
  token++;selected=null;dirty=false;
  const vendors=data('vendor').filter(r=>ctx.scope==='all'||r.company_id===ctx.scope).sort((a,b)=>String(a.payload.name||'').localeCompare(String(b.payload.name||'')));
  root.innerHTML='<section class="gr-ops-surface gr-vendors"><header class="gr-ops-heading"><h3>Vendor master</h3>'+(ctx.can('create')?'<button type="button" class="gr-ops-primary" data-vendor-new>+ New Vendor</button>':'')+'</header><div class="gr-ops-tools"><input type="search" data-vendor-search aria-label="Search vendor" placeholder="Search Vendor"><button type="button" data-vendor-refresh>Refresh</button></div><p data-vendor-message role="status" hidden></p><div class="gr-ops-scroll"><table class="gr-ops-table gr-vendor-list"><thead><tr><th>Vendor name</th><th>Manage</th></tr></thead><tbody>'+vendors.map((r,i)=>'<tr data-vendor-row><td><button class="gr-vendor-link" type="button" data-vendor-open="'+i+'">'+esc(r.payload.name||'Unnamed vendor')+'</button>'+(ctx.scope==='all'?'<small>'+esc(ctx.companyName(r.company_id))+'</small>':'')+'</td><td><button type="button" data-vendor-open="'+i+'">'+(ctx.can('edit')?'Edit':'View')+'</button></td></tr>').join('')+'</tbody></table></div><p class="gr-vendor-empty" data-vendor-empty '+(vendors.length?'hidden':'')+'>No vendors found.</p></section>';
  root.querySelector('[data-vendor-search]').oninput=e=>{let count=0;root.querySelectorAll('[data-vendor-row]').forEach((row,i)=>{row.hidden=!norm(vendors[i].payload.name+' '+(vendors[i].payload.contact||'')+' '+(vendors[i].payload.phone||'')).includes(norm(e.target.value));if(!row.hidden)count++});root.querySelector('[data-vendor-empty]').hidden=Boolean(count)};
  root.querySelectorAll('[data-vendor-open]').forEach(b=>b.onclick=()=>{const r=vendors[Number(b.dataset.vendorOpen)];selected={id:r.record_id,company:r.company_id};detail()});
  root.querySelector('[data-vendor-new]')?.addEventListener('click',()=>{selected={id:'',company:ctx.scope==='all'?ctx.companies[0]:ctx.scope};detail()});
  root.querySelector('[data-vendor-refresh]').onclick=()=>ctx.reload();
 }
 function detail(){
  const v=current()||{company_id:selected.company,payload:{}},p=v.payload,editable=ctx.can(selected.id?'edit':'create'),viewToken=++token;
  editing=JSON.parse(JSON.stringify(v));dirty=false;stock=[];productionStock=[];stockState='Loading CRM stock…';
  root.innerHTML='<section class="gr-ops-surface gr-vendors"><header class="gr-ops-heading"><div><button type="button" class="gr-vendor-link" data-vendor-back>← Vendors</button><h3>'+(selected.id?'Vendor 360':'New Vendor')+'</h3><small>'+esc(p.name||'Vendor details')+'</small></div><div class="gr-vendor-actions"><button type="button" data-vendor-back>Cancel</button>'+(editable?'<button type="submit" form="gr-vendor-form" class="gr-ops-primary">Save record</button>':'')+'</div></header><p data-vendor-message role="status" hidden></p><form id="gr-vendor-form" data-vendor-form class="gr-vendor-form"><label>Company<select name="company_id" '+(selected.id?'disabled':'')+'>'+ctx.companies.map(id=>'<option value="'+esc(id)+'" '+(id===v.company_id?'selected':'')+'>'+esc(ctx.companyName(id))+'</option>').join('')+'</select></label>'+ctx.fields.map(([key,label,type,required])=>'<label class="'+(type==='textarea'?'gr-vendor-wide':'')+'">'+esc(label)+(required?' *':'')+ctx.control(key,type,{required,current:p[key]})+'</label>').join('')+'</form><section class="gr-vendor-section"><h4>Vendor products</h4><p>Available products and stock in CRM. Vendor quantities are supplier-reported; saving does not adjust CRM stock.</p><div data-vendor-products></div>'+(editable?'<div class="gr-vendor-add"><label>Add material<select data-vendor-material aria-label="Material to link"></select></label><button type="button" data-vendor-add>Link material</button></div>':'')+'</section><section class="gr-vendor-section"><h4>Purchase order history</h4><div data-vendor-pos></div><div data-vendor-po-detail></div></section></section>';
  const form=root.querySelector('[data-vendor-form]');
  const decorate=()=>window.GreenRichFormBuilder?.decorate?.(form,selected.company,'ops_vendor');
  decorate();
  if(selected.id)void window.GreenRichFormBuilder?.recentAnswers?.(selected.company,'ops_vendor',selected.id).then(values=>{if(token===viewToken&&!dirty){window.GreenRichFormBuilder.decorate(form,selected.company,'ops_vendor',values);if(!editable)form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true)}}).catch(()=>{});
  if(!editable)form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);
  form.oninput=()=>{dirty=true};form.onchange=()=>{dirty=true};
  form.elements.namedItem('company_id').onchange=e=>{selected.company=e.target.value;dirty=true;stock=[];stockState='Loading CRM stock…';decorate();products({...v,company_id:selected.company,payload:{...p,vendor_products:[]}},editable);void loadStock(viewToken)};
  root.querySelectorAll('[data-vendor-back]').forEach(b=>b.onclick=()=>{if(leave())list()});
  products(v,editable);orders(v);form.onsubmit=save;
  void loadStock(viewToken);
 }
 function products(v,editable){
  const list=materials(v),manual=v.payload.vendor_products||[];
  root.querySelector('[data-vendor-products]').innerHTML='<div class="gr-ops-scroll"><table class="gr-ops-table gr-vendor-products"><thead><tr><th>Material code</th><th>Item / material description</th><th>Stock in CRM</th><th>At vendor (reported)</th></tr></thead><tbody>'+list.map(r=>{const reported=manual.find(p=>p.material_id===r.record_id);return '<tr data-material-id="'+esc(r.record_id)+'"><td>'+esc(r.payload.code)+'</td><td>'+esc(r.payload.name)+'<small>'+esc(r.payload.uom||'')+'</small></td><td data-crm-stock="'+esc(r.record_id)+'">'+esc(stockState)+'</td><td>'+(editable?'<input form="gr-vendor-form" type="number" min="0" step="any" data-vendor-qty aria-label="Stock at vendor for '+esc(r.payload.code)+'" placeholder="Not recorded" value="'+esc(reported?.vendor_qty??'')+'">':esc(amount(reported?.vendor_qty)))+(reported?.reported_at?'<small>Reported '+esc(new Date(reported.reported_at).toLocaleDateString())+'</small>':'')+'</td></tr>'}).join('')+'</tbody></table></div>'+(list.length?'':'<p class="gr-vendor-empty">No materials linked to this vendor yet.</p>');
  root.querySelectorAll('[data-vendor-qty]').forEach(el=>el.oninput=()=>{dirty=true});
  if(editable){const select=root.querySelector('[data-vendor-material]'),available=data('material').filter(r=>r.company_id===v.company_id&&!list.some(m=>m.record_id===r.record_id));select.innerHTML='<option value="">Select material</option>'+available.map(r=>'<option value="'+esc(r.record_id)+'">'+esc(r.payload.code+' · '+r.payload.name)+'</option>').join('');root.querySelector('[data-vendor-add]').onclick=()=>{if(!select.value)return;const updated=readProducts(v);updated.push({material_id:select.value,vendor_qty:null});products({...v,payload:{...v.payload,vendor_products:updated}},editable);updateStock();dirty=true};}
  updateStock();
 }
 function readProducts(v){return [...root.querySelectorAll('[data-material-id]')].map(row=>{const old=(v.payload.vendor_products||[]).find(p=>p.material_id===row.dataset.materialId)||{},input=row.querySelector('[data-vendor-qty]'),value=input?input.value:old.vendor_qty,qty=value===''||value==null?null:Number(value);if(qty!==null&&(!Number.isFinite(qty)||qty<0))throw Error('Vendor stock must be a positive number or zero.');return {...old,material_id:row.dataset.materialId,vendor_qty:qty,reported_at:qty!==old.vendor_qty?new Date().toISOString():old.reported_at||null}});}
 async function loadStock(viewToken){
  try{const company=selected.company,result=[];for(let start=0;;start+=1000){const r=await ctx.db.from('gr_crm_records').select('record_id,payload').eq('company_id',company).eq('kind','products').range(start,start+999);if(r.error)throw Error(r.error.message);result.push(...(r.data||[]));if((r.data||[]).length<1000)break;}if(token!==viewToken||selected?.company!==company)return;stock=result;const ledger=await ctx.db.from('gr_production_balances').select('material_id,quantity').eq('company_id',company);if(token!==viewToken||selected?.company!==company)return;productionStock=ledger.error?[]:ledger.data||[];stockState='Not linked';updateStock();}
  catch(e){if(token===viewToken){stockState='Stock unavailable';updateStock();message('CRM stock could not be loaded. Vendor details can still be saved.')}}
 }
 function updateStock(){root.querySelectorAll('[data-crm-stock]').forEach(el=>{const m=data('material').find(r=>r.record_id===el.dataset.crmStock&&r.company_id===selected?.company)?.payload;const match=m&&stock.filter(p=>m.crm_product_id?p.record_id===m.crm_product_id:norm(p.payload.sku)&&norm(p.payload.sku)===norm(m.code));const posted=productionStock.find(b=>b.material_id===el.dataset.crmStock);el.textContent=posted?amount(posted.quantity):match?.length===1?amount(match[0].payload.stock):stockState;});}
 function orders(v){
  const list=data('purchase_order').filter(r=>matches(r,v,'vendor')).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
  root.querySelector('[data-vendor-pos]').innerHTML=list.map((r,i)=>'<article class="gr-vendor-po"><div><strong>'+esc(r.payload.po_number||'Purchase order')+'</strong><small>'+esc(r.payload.status||'Draft')+' · Expected delivery: '+esc(r.payload.expected_on||'Not set')+'</small><small>'+esc(r.payload.material_code)+' · Quantity: '+esc(r.payload.quantity??'Not set')+'</small></div><button type="button" data-vendor-po="'+i+'">View PO</button></article>').join('')||'<p class="gr-vendor-empty">No purchase orders recorded for this vendor.</p>';
  root.querySelectorAll('[data-vendor-po]').forEach(b=>b.onclick=()=>{const r=list[Number(b.dataset.vendorPo)],area=root.querySelector('[data-vendor-po-detail]');area.innerHTML='<article class="gr-vendor-po-details" tabindex="-1"><h4>'+esc(r.payload.po_number)+'</h4><dl>'+ctx.poFields.map(([key,label])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(r.payload[key]??'Not set')+'</dd></div>').join('')+'</dl><button type="button" data-close-po>Close details</button></article>';area.querySelector('[data-close-po]').onclick=()=>{area.innerHTML='';b.focus()};area.firstElementChild.focus()});
 }
 async function save(event){
  event.preventDefault();if(busy)return;
  const form=event.currentTarget,v=selected.id?editing:null,id=selected.id,company=selected.company;
  if(!ctx.can(id?'edit':'create')||!ctx.companies.includes(company))return message('Your role cannot save this vendor.');
  if(!form.reportValidity())return;
  busy=true;const buttons=root.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
  try{
   const payload={...(v?.payload||{}),id:id||crypto.randomUUID()};
   for(const [key]of ctx.fields){const field=form.elements.namedItem(key);if(field)payload[key]=field.value.trim();}
   if(!payload.name)throw Error('Vendor name is required.');
   if(data('vendor').some(r=>r.company_id===company&&r.record_id!==id&&norm(r.payload.name)===norm(payload.name)))throw Error('A vendor with this name already exists in this company.');
   if(v&&norm(v.payload.name)!==norm(payload.name))payload.aliases=[...new Set([...(v.payload.aliases||[]),v.payload.name])];
   payload.vendor_products=readProducts(v||{payload:{}});
   const extra=window.GreenRichFormBuilder?.collect?.(form,company,'ops_vendor')||{};
   const row={company_id:company,kind:'vendor',record_id:payload.id,payload,updated_at:new Date().toISOString()};
   let q=ctx.db.from('gr_ops_records');
   if(id){q=q.update({payload,updated_at:row.updated_at}).eq('company_id',company).eq('kind','vendor').eq('record_id',id);if(v.updated_at)q=q.eq('updated_at',v.updated_at)}else q=q.insert(row);
   const result=await q.select('record_id');if(result.error)throw Error(result.error.message);if(!result.data?.length)throw Error('This vendor changed elsewhere or you no longer have access. Reload before saving.');
   // Update local identity immediately, even when optional custom-answer persistence fails.
   const existing=current();if(existing)Object.assign(existing,row);else ctx.rows.push(row);editing=JSON.parse(JSON.stringify(row));
   selected={id:payload.id,company};dirty=false;
   let warning='';try{if(Object.keys(extra).length)await window.GreenRichFormBuilder?.saveAnswers?.(company,'ops_vendor',payload.id,extra)}catch(e){warning=' Custom fields were not saved: '+e.message;dirty=true;}
   await ctx.reload();if(!warning)detail();message('Vendor saved.'+warning);
  }catch(e){message('Unable to save vendor: '+e.message)}
  finally{busy=false;buttons.forEach(b=>b.disabled=false)}
 }
 window.addEventListener('beforeunload',e=>{if(dirty&&root?.isConnected&&root.querySelector('[data-vendor-form]')){e.preventDefault();e.returnValue=''}});
 window.GreenRichVendors={render,leave,reset(){selected=null;editing=null;dirty=false;busy=false;token++;}};
})();
