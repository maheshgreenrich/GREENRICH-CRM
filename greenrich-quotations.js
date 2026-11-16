'use strict';
/* GreenRich ONE: quotation drafts, product templates and PDF-ready document preview.
 * Independent of Sales Orders, dispatch approvals, and stock movements.
 * PdfCraft is a separate Rust/WASM build and is not bundled in this module.
 */
(()=>{
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0);
const rupee=v=>'₹'+fmt(v),n=v=>Math.max(0,Number(v)||0),round=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;
const date=()=>new Date().toLocaleDateString('en-CA');
const plusDays=(s,days)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
let root,access,products=[],customers=[],quotes=[],templates=[],letterheads={},profiles={},current,tab='quotes',designerPreview='';
const notify=(msg,type)=>access?.notify?.(msg,type);
const company=()=>current?.company_id||access?.company||access?.companies[0];
const productList=()=>products.filter(p=>p.company_id===company());
const getProduct=id=>productList().find(p=>p.id===id);
const getCustomer=()=>customers.find(c=>c.id===current?.customer_id);
const seller=()=>profiles[company()]||{};
const preset=()=>{const p=getProduct(current?.lines?.[0]?.product_id),name=p?.name||'Product';return {title:'PRICE QUOTATION',name:'Product default · '+name,accent:'#2454aa',header:/mgb|industrial|bulk|owc|shredder|community/i.test(name)?'Commercial Composting Solution':/microbe|fertili|booster|vermicompost/i.test(name)?'Organic & Microbial Inputs':'Home Composting Solution',footer:'Thank you for choosing GreenRich.',terms:'Delivery, transportation, installation, payment and offer validity are subject to confirmation.',bank:true}};
const candidateTemplates=()=>{
 const product=getProduct(current?.lines?.[0]?.product_id),cat=String(product?.category||'').toLowerCase();
 return templates.filter(t=>t.company_id===company()&&(!t.product_id||t.product_id===product?.id)&&(
 t.product_id===product?.id||(t.config?.scope==='category'&&String(t.config?.category||'').toLowerCase()===cat)||
 (!t.product_id&&(!t.config?.scope||t.config.scope==='company'||!t.config.designerVersion))
 ));
};
const selectedTemplate=()=>{
 const explicit=templates.find(t=>t.id===current?.template_id&&t.company_id===company());
 if(explicit)return explicit;
 const candidates=candidateTemplates();
 return candidates.find(t=>t.product_id===current?.lines?.[0]?.product_id)||
 candidates.find(t=>t.config?.scope==='category')||
 candidates.find(t=>t.config?.scope==='company')||null;
};
const chosenTemplate=()=>current?.template_snapshot||selectedTemplate()?.config||preset();
const selectedLetterhead=()=>current?.letterhead_snapshot||letterheads[company()]?.config||null;
const totals=()=>{let base=0,gst=0;for(const line of current.lines){const gross=round(n(line.qty)*n(line.rate)),r=n(line.tax),b=line.inclusive?round(gross/(1+r/100)):gross;base+=b;gst+=line.inclusive?round(gross-b):round(b*r/100)}base=round(base);gst=round(gst);const discount=Math.min(n(current.discount),base+gst),freight=n(current.freight);return {base,gst,discount,freight,total:round(base+gst-discount+freight)}};
const uuid=()=>crypto.randomUUID();
const quoteNo=()=> 'Q-'+(company()==='enviro-solutions'?'GRE':'GRG')+'-'+date().replace(/-/g,'')+'-'+uuid().slice(0,6).toUpperCase();
const empty=()=>({id:'',company_id:access.company==='all'?access.companies[0]:access.company,quotation_no:'',customer_id:'',quotation_date:date(),valid_until:plusDays(date(),30),status:'Draft',template_id:'',lines:[{product_id:'',description:'',qty:1,rate:0,tax:0,inclusive:false}],discount:0,freight:0,notes:'',terms:''});
const opt=(value,label,selected)=>'<option value="'+esc(value)+'"'+(selected?' selected':'')+'>'+esc(label)+'</option>';
const selectOptions=(list,value,label,chosen,placeholder)=>opt('',placeholder,!chosen)+list.map(x=>opt(value(x),label(x),chosen===value(x))).join('');
const read=async(q)=>{const r=await q;if(r.error)throw Error(r.error.message);return r.data||[]};
async function refresh(){
 const ids=access.companies;
 const result=await Promise.all([
 read(access.db.from('gr_crm_records').select('company_id,payload').eq('kind','products').in('company_id',ids)),
 read(access.db.from('gr_crm_customers').select('id,name,company,mobile,email,address1,address2,city,state,pincode').order('name')),
 read(access.db.from('gr_invoice_profiles').select('*').in('company_id',ids)),
 read(access.db.from('gr_quotations').select('*').in('company_id',ids).order('created_at',{ascending:false}).limit(300)),
 read(access.db.from('gr_quotation_templates').select('*').in('company_id',ids).order('name')),
 read(access.db.from('gr_quotation_letterheads').select('*').in('company_id',ids))
 ]);
 products=result[0].map(x=>({...x.payload,company_id:x.company_id}));customers=result[1];
 profiles=Object.fromEntries(result[2].map(x=>[x.company_id,x]));quotes=result[3];templates=result[4];letterheads=Object.fromEntries(result[5].map(r=>[r.company_id,r]));
}
function capture(){
 if(tab!=='quotes'||!current)return;
 const form=root.querySelector('#grq-form');if(!form)return;
 const val=name=>form.elements.namedItem(name)?.value??'';
 Object.assign(current,{quotation_no:val('quotation_no'),customer_id:val('customer_id'),quotation_date:val('quotation_date'),valid_until:val('valid_until'),status:val('status')||'Draft',template_id:val('template_id'),discount:n(val('discount')),freight:n(val('freight')),terms:val('terms'),notes:val('notes')});
 current.lines=[...form.querySelectorAll('[data-line]')].map(row=>{const f=k=>row.querySelector('[data-f="'+k+'"]');return {product_id:f('product').value,description:f('description').value,qty:n(f('qty').value),rate:n(f('rate').value),tax:n(f('tax').value),inclusive:f('inclusive').checked}});
}
function htmlDocument(){
 const design=chosenTemplate();
 if(design.designerVersion&&window.GreenRichQuotationDesigner){return window.GreenRichQuotationDesigner.renderHtml(design,selectedLetterhead(),{...current,total:totals().total},seller(),getCustomer());}
 const s=seller(),c=getCustomer(),cfg=design,t=totals(),accent=/^#[0-9a-f]{6}$/i.test(cfg.accent)?cfg.accent:'#2454aa';
 const lines=current.lines.map((l,i)=>{const gross=round(n(l.qty)*n(l.rate)),tax=l.inclusive?0:round(gross*n(l.tax)/100);return '<tr><td>'+(i+1)+'</td><td>'+esc(l.description||getProduct(l.product_id)?.name||'Product')+'</td><td class="right">'+fmt(l.qty)+'</td><td class="right">'+rupee(l.rate)+'</td><td class="right">'+fmt(l.tax)+'%</td><td class="right">'+rupee(gross+tax)+'</td></tr>'}).join('');
 const address=c?[c.address1,c.address2,c.city,c.state,c.pincode].filter(Boolean).join(', '):'';
 const css='*{box-sizing:border-box}body{margin:0;background:#fff;color:#1b2c47;font:12px/1.5 Arial,sans-serif}.paper{width:100%;min-height:1080px;padding:32px;margin:auto}.brand{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid '+accent+';padding-bottom:16px}.brand h1{font-size:21px;margin:0;color:'+accent+'}.brand h2{font-size:23px;margin:0;color:'+accent+'}.muted{color:#65728a;white-space:pre-line}.meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:25px 0}.meta strong{display:block;margin-bottom:5px}table{border-collapse:collapse;table-layout:fixed;width:100%}th{background:'+accent+';color:#fff;font-size:11px;text-align:left;padding:9px 7px}td{padding:10px 6px;border-bottom:1px solid #e0e5ee;word-wrap:break-word}.right{text-align:right}.total{width:290px;margin:18px 0 0 auto}.total div{display:flex;justify-content:space-between;padding:4px 0}.total .grand{font-size:16px;font-weight:700;border-top:2px solid #bccbdc;color:'+accent+'}.text{white-space:pre-wrap;margin-top:20px}.foot{margin-top:60px;border-top:1px solid #d8e1ee;padding-top:12px;font-size:11px;color:#536780}@media print{@page{size:A4;margin:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.paper{min-height:0}tr{break-inside:avoid}}';
 return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>'+esc(current.quotation_no||'Quotation')+'</title><style>'+css+'</style></head><body><main class="paper"><div class="brand"><div><h2>'+esc(s.legal_name||'GREENRICH')+'</h2><div class="muted">'+esc([s.address,s.city_state_pincode,s.phone,s.email].filter(Boolean).join(' · '))+'</div><div class="muted">GSTIN: '+esc(s.gstin||'—')+'</div></div><div><h1>'+esc(cfg.title||'PRICE QUOTATION')+'</h1><div class="muted">'+esc(cfg.header||'')+'</div></div></div><div class="meta"><section><strong>QUOTATION FOR</strong>'+esc(c?.name||'Customer')+'<br>'+esc(c?.company||'')+'<br>'+esc(address)+'<br>'+esc(c?.mobile||'')+'<br>'+esc(c?.email||'')+'</section><section><strong>DOCUMENT DETAILS</strong>Quotation: '+esc(current.quotation_no||'Draft')+'<br>Date: '+esc(current.quotation_date)+'<br>Valid until: '+esc(current.valid_until)+'<br>Status: '+esc(current.status)+'</section></div><table><thead><tr><th style="width:35px">#</th><th>Product description</th><th style="width:55px;text-align:right">Qty</th><th style="width:90px;text-align:right">Unit ₹</th><th style="width:55px;text-align:right">GST</th><th style="width:110px;text-align:right">Amount ₹</th></tr></thead><tbody>'+lines+'</tbody></table><div class="total"><div><span>Taxable value</span><b>'+rupee(t.base)+'</b></div><div><span>GST</span><b>'+rupee(t.gst)+'</b></div><div><span>Discount</span><b>− '+rupee(t.discount)+'</b></div><div><span>Freight</span><b>'+rupee(t.freight)+'</b></div><div class="grand"><span>Total</span><b>'+rupee(t.total)+'</b></div></div><div class="text"><strong>Terms & conditions</strong><br>'+esc(current.terms||cfg.terms||'As mutually agreed.')+'</div>'+(current.notes?'<div class="text"><strong>Remarks / specifications</strong><br>'+esc(current.notes)+'</div>':'')+(cfg.bank?'<div class="text"><strong>Bank details</strong><br>'+esc([s.bank_name,s.bank_branch,s.bank_account,s.bank_ifsc].filter(Boolean).join(' · '))+'</div>':'')+'<div class="foot">'+esc(cfg.footer||'Thank you for your interest.')+'<br><br>For '+esc(s.legal_name||'GREENRICH')+' · Authorized Signatory</div></main></body></html>';
}
const paper=()=>{const frame=root.querySelector('#grq-preview');if(frame)frame.srcdoc=htmlDocument();const total=root.querySelector('#grq-total');if(total)total.textContent=rupee(totals().total)};
const lineForm=(l,i)=>'<div class="grq-line" data-line="'+i+'"><select data-f="product" aria-label="Product">'+selectOptions(productList(),p=>p.id,p=>p.name+(p.sku?' · '+p.sku:''),l.product_id,'Custom product')+'</select><input data-f="description" aria-label="Description" placeholder="Description" value="'+esc(l.description)+'"><input data-f="qty" type="number" min=".01" step="any" aria-label="Qty" value="'+esc(l.qty)+'"><input data-f="rate" type="number" min="0" step=".01" aria-label="Rate" value="'+esc(l.rate)+'"><input data-f="tax" type="number" min="0" step=".01" max="100" aria-label="GST %" value="'+esc(l.tax)+'"><label class="grq-inline"><input data-f="inclusive" type="checkbox"'+(l.inclusive?' checked':'')+'>Incl GST</label><button type="button" class="grq-small" data-action="remove" data-index="'+i+'" aria-label="Remove item">×</button></div>';
function editor(){
 const saved=quotes.filter(q=>q.company_id===company()).map(q=>'<button type="button" class="grq-record'+(q.id===current.id?' current':'')+'" data-action="open" data-id="'+esc(q.id)+'"><b>'+esc(q.quotation_no)+'</b><small>'+esc(q.payload?.customer_name||'Customer')+' · '+esc(q.status)+'</small><small>'+rupee(q.payload?.total||0)+'</small></button>').join('');
 const filteredTemplates=candidateTemplates();
 return '<div class="grq-grid"><aside class="grq-list"><h3>Saved quotations</h3><div class="grq-scroller">'+(saved||'<p>No quotations yet.</p>')+'</div></aside><div class="grq-editor"><form id="grq-form"><div class="grq-fields"><label>Quotation no.<input name="quotation_no" maxlength="80" value="'+esc(current.quotation_no)+'" placeholder="Auto on save"></label><label>Customer<select name="customer_id">'+selectOptions(customers,c=>c.id,c=>c.name+(c.mobile?' · '+c.mobile:''),current.customer_id,'Select customer')+'</select></label><label>Date<input name="quotation_date" type="date" required value="'+esc(current.quotation_date)+'"></label><label>Valid until<input name="valid_until" type="date" value="'+esc(current.valid_until)+'"></label><label>Status<select name="status">'+['Draft','Sent','Accepted','Rejected','Expired'].map(x=>opt(x,x,current.status===x)).join('')+'</select></label><label>Product-wise template<select name="template_id">'+selectOptions(filteredTemplates,t=>t.id,t=>t.name,current.template_id||selectedTemplate()?.id||'','Auto · Product / Category / Company')+'</select></label></div><h3>Products & rates</h3><div class="grq-lines">'+current.lines.map(lineForm).join('')+'</div><button data-action="add" type="button">+ Add product</button><div class="grq-fields"><label>Discount ₹<input name="discount" type="number" min="0" step=".01" value="'+esc(current.discount)+'"></label><label>Freight / other charges ₹<input name="freight" type="number" min="0" step=".01" value="'+esc(current.freight)+'"></label><label class="grq-wide">Custom terms<textarea name="terms" rows="3" placeholder="Blank = product template defaults">'+esc(current.terms)+'</textarea></label><label class="grq-wide">Specifications / notes<textarea name="notes" rows="3">'+esc(current.notes)+'</textarea></label></div><div class="grq-total">Quotation total <strong id="grq-total">'+rupee(totals().total)+'</strong></div><div class="grq-actions"><button data-action="preview" type="button">Refresh preview</button><button data-action="pdf" type="button">PDF viewer</button><button data-action="print" type="button">Print / Save PDF</button><button data-action="send-mail" type="button">Email quotation</button>'+(access.canEdit?'<button class="primary" data-action="save" type="button">Save quotation</button>':'')+'</div></form></div><div class="grq-preview-wrap"><h3>Live preview</h3><iframe id="grq-preview" sandbox="allow-same-origin" title="Quotation document preview"></iframe></div></div>';
}
function templatesView(){
 const list=templates.filter(t=>t.company_id===company());
 return '<div class="grq-template-wrap"><section><h2>Product-wise templates</h2><p>Every product uses its fixed default unless a custom template is selected. Admin can save reusable designs for individual products.</p><div class="grq-table">'+list.map(t=>'<article><strong>'+esc(t.name)+'</strong><small>'+esc(productList().find(p=>p.id===t.product_id)?.name||'All products')+'</small><button data-action="template-edit" data-id="'+esc(t.id)+'">Edit</button></article>').join('')+'</div></section>'+(access.admin?'<form id="grq-template-form"><h3>Custom template editor</h3><input type="hidden" name="id"><label>Template name<input name="name" maxlength="120" required></label><label>Product<select name="product_id">'+selectOptions(productList(),p=>p.id,p=>p.name,'','All products')+'</select></label><label>Quotation title<input name="title" value="PRICE QUOTATION"></label><label>Accent<input name="accent" type="color" value="#2454aa"></label><label>Header<input name="header"></label><label>Footer<input name="footer"></label><label>Default terms<textarea name="terms" rows="5"></textarea></label><label class="grq-inline"><input type="checkbox" name="bank" checked> Include bank details</label><button type="submit" class="primary">Save template</button></form>':'<p>Template creation is available to Admin. Edit quotation notes and terms in your own quotation.</p>')+'</div>';
}
function render(){
 root.innerHTML='<div class="grq-app"><header class="grq-head"><div><h2>Quotations & PDF Workspace</h2><p>Customer quotations, fixed product layouts, custom templates and PDF preview</p></div><div class="grq-head-controls"><select id="grq-company" aria-label="Company">'+access.companies.map(x=>opt(x,access.companyNames?.[x]||x,company()===x)).join('')+'</select><button type="button" class="primary" data-action="new">+ New quotation</button></div></header><nav class="grq-tabs">'+[['quotes','Quotations'],['designer','Drag & Drop Designer'],['templates','Templates'],['mail','Gmail & Send History'],['pdf','PDF viewer & editor']].map(([key,name])=>'<button data-action="tab" data-tab="'+key+'" class="'+(tab===key?'active':'')+'">'+name+'</button>').join('')+'</nav>'+(tab==='quotes'?editor():tab==='designer'?'<div id="grq-designer-root"></div>':tab==='templates'?templatesView():tab==='mail'?'<div id="grq-mail-root"></div>':'<div class="grq-workbench" id="grq-pdf-root"></div>')+'</div>';
 if(tab==='designer'){
 if(!window.GreenRichQuotationDesigner)return notify('Visual designer script is not loaded. Refresh CRM.','error');
 const record=selectedTemplate();
 void window.GreenRichQuotationDesigner.mount(root.querySelector('#grq-designer-root'),{
  db:access.db,userId:access.userId,admin:access.admin,company:company(),companies:access.companies,companyNames:access.companyNames,
  products,templates,letterheads,seller:seller(),customer:getCustomer(),quotation:{...current,total:totals().total},template:record,
  reloadTemplates:async()=>{await refresh();return templates;},
  onSaved:()=>{notify('Saved design can now be selected in new quotations');},
  onPreview:(doc)=>{designerPreview=doc;tab='pdf';render();},
  notify
 }).catch(e=>notify(e.message,'error'));
 }
 if(tab==='mail'){
   if(!window.GreenRichQuotationMail)return notify('Quotation mail module missing. Refresh CRM.','error');
   window.GreenRichQuotationMail.mount(root.querySelector('#grq-mail-root'),{
    db:access.db,userId:access.userId,company:company(),companyName:access.companyNames?.[company()]||company(),
    admin:access.admin,canSend:access.canEdit,quotation:current,customer:getCustomer(),documentHtml:htmlDocument,notify
   });
  }
 if(tab==='quotes')paper();if(tab==='pdf')window.GreenRichPDFWorkbench?.mount(root.querySelector('#grq-pdf-root'),{documentHtml:designerPreview||htmlDocument(),documentName:current.quotation_no||'Quotation',notify});
}
async function save(){
 capture();
 if(!access.canEdit)throw Error('Quotation edit permission is required');
 if(!current.customer_id)throw Error('Select a customer');
 if(!current.lines.length||current.lines.some(x=>!x.description.trim()||x.qty<=0))throw Error('Add a description and positive quantity for every item');
 if(current.valid_until&&current.valid_until<current.quotation_date)throw Error('Validity date cannot precede quotation date');
 const customer=getCustomer(),record=selectedTemplate();
 const payload={lines:current.lines,discount:current.discount,freight:current.freight,notes:current.notes,terms:current.terms,customer_name:customer.name,total:totals().total,
 template_snapshot:current.template_snapshot||record?.config||null,letterhead_snapshot:current.letterhead_snapshot||selectedLetterhead()};
 const body={company_id:company(),quotation_no:current.quotation_no||quoteNo(),customer_id:current.customer_id,template_id:current.template_id||record?.id||null,quotation_date:current.quotation_date,valid_until:current.valid_until||null,status:current.status,payload,updated_by:access.userId,updated_at:new Date().toISOString()};
 const query=current.id?access.db.from('gr_quotations').update(body).eq('company_id',company()).eq('id',current.id).select().single():access.db.from('gr_quotations').insert({...body,created_by:access.userId}).select().single();
 const {data,error}=await query;if(error)throw Error('Save failed: '+error.message);current.id=data.id;current.quotation_no=data.quotation_no;await refresh();notify('Quotation saved to Supabase');render();
}
async function saveTemplate(form){
 if(!access.admin)throw Error('Only Admin can edit shared templates');
 const f=new FormData(form),name=String(f.get('name')||'').trim();
 if(!name)throw Error('Enter template name');
 const config={title:String(f.get('title')||'PRICE QUOTATION').slice(0,80),accent:f.get('accent'),header:String(f.get('header')||'').slice(0,250),footer:String(f.get('footer')||'').slice(0,250),terms:String(f.get('terms')||'').slice(0,3000),bank:f.has('bank')};
 const body={name,company_id:company(),product_id:f.get('product_id')||null,config,updated_at:new Date().toISOString()};
 const query=f.get('id')?access.db.from('gr_quotation_templates').update(body).eq('company_id',company()).eq('id',f.get('id')):access.db.from('gr_quotation_templates').insert({...body,created_by:access.userId});
 const result=await query;if(result.error)throw Error(result.error.message);await refresh();notify('Quotation template saved');render();
}
function print(){
 capture();const popup=window.open('','_blank');if(!popup)throw Error('Enable popups for this site');popup.document.open();popup.document.write(htmlDocument());popup.document.close();popup.focus();popup.onload=()=>popup.print();
}
async function perform(button){
 const a=button.dataset.action;
 if(a==='tab'){if(tab==='quotes')capture();designerPreview='';tab=button.dataset.tab;render();return}
 if(a==='new'){current=empty();tab='quotes';render();return}
 if(a==='add'){capture();current.lines.push({product_id:'',description:'',qty:1,rate:0,tax:0,inclusive:false});render();return}
 if(a==='remove'){capture();if(current.lines.length>1)current.lines.splice(Number(button.dataset.index),1);render();return}
 if(a==='open'){const q=quotes.find(x=>x.id===button.dataset.id);if(!q)return;current={...q,...q.payload,customer_id:q.customer_id||'',template_id:q.template_id||'',lines:q.payload?.lines||[]};tab='quotes';render();return}
 if(a==='preview'){capture();paper();return}
 if(a==='send-mail'){capture();if(!current.id)throw Error('Save quotation before sending');tab='mail';render();return}
 if(a==='save'){await save();return}
 if(a==='print'){print();return}
 if(a==='pdf'){capture();designerPreview='';tab='pdf';render();return}
 if(a==='template-edit'){
  const t=templates.find(x=>x.id===button.dataset.id),form=root.querySelector('#grq-template-form');if(!t||!form)return;
  for(const key of ['id','name','product_id'])form.elements.namedItem(key).value=t[key]||'';
  for(const key of ['title','accent','header','footer','terms'])form.elements.namedItem(key).value=t.config[key]||'';
  form.elements.namedItem('bank').checked=!!t.config.bank;form.scrollIntoView({behavior:'smooth'});
 }
}
function bind(){
 root.onclick=event=>{const b=event.target.closest('[data-action]');if(b&&root.contains(b))void perform(b).catch(e=>notify(e.message,'error'))};
 root.onchange=event=>{
  if(event.target.id==='grq-company'){access.company=event.target.value;current=empty();render();return}
  if(tab==='quotes'&&event.target.matches('[data-f="product"]')){
   const row=event.target.closest('[data-line]'),index=Number(row?.dataset.line);capture();const p=getProduct(current.lines[index]?.product_id);
   if(p){Object.assign(current.lines[index],{description:p.name,rate:n(p.price),tax:n(p.tax),inclusive:!!p.inclusive})}current.template_id='';current.template_snapshot=null;current.letterhead_snapshot=null;render();return;
  }
  if(tab==='quotes'&&event.target.name==='template_id'){current.template_snapshot=null;current.letterhead_snapshot=null;}
  if(tab==='quotes'&&event.target.closest('#grq-form')){capture();paper()}
 };
 root.oninput=event=>{if(tab==='quotes'&&event.target.closest('#grq-form')){capture();paper()}};
 root.onsubmit=event=>{if(event.target.id==='grq-template-form'){event.preventDefault();void saveTemplate(event.target).catch(e=>notify(e.message,'error'))}};
}
async function mount(host,options){
 root=host;access={...options,companies:options.companies||[],company:options.company==='all'?options.companies[0]:options.company};
 if(!access.db||!access.companies.length)throw Error('Sign in to use the quotation workspace');
 await refresh();current=empty();tab='quotes';bind();render();
}
window.GreenRichQuotations={mount};
})();