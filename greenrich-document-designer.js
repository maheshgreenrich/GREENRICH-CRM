'use strict';
/* Admin document layouts for invoices and packing slips. Financial GST fields stay untouched. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const companies={'grow-india':'GreenRich Grow India Pvt Ltd','enviro-solutions':'GreenRich Enviro Solutions Pvt Ltd'};
 const fields={
  invoice:[['logo','Company logo'],['companyContact','Seller contact'],['shipTo','Ship-to'],['billTo','Bill-to'],['deliveryTerms','Delivery terms'],
   ['remarks','Remarks'],['bank','Bank details'],['declaration','Declaration'],['signature','Authorized signature'],['custom','Custom detail rows']],
  packing:[['logo','Company logo'],['companyContact','Seller contact'],['customer','Customer name'],['shippingAddress','Delivery address'],
   ['phone','Customer phone'],['email','Customer email'],['orderDate','Order date'],['invoiceNo','Invoice reference'],
   ['product','Products'],['sku','SKU'],['price','Order amount'],['courier','Courier'],['tracking','Tracking number'],
   ['notes','Dispatch notes'],['receivedBy','Received by'],['signature','Packed by'],['custom','Custom detail rows']]
 };
 const defaultFor=type=>({
  title:type==='invoice'?'TAX INVOICE':'PACKING SLIP',subtitle:type==='invoice'?'':'Goods packed for delivery',
  accent:'#2255aa',font:'Arial',scale:100,padding:26,logoUrl:'',headerText:'',
  footerText:type==='invoice'?'This is a computer-generated invoice.':'Please verify the goods on receipt.',
  customFields:[],visible:Object.fromEntries(fields[type].map(([k])=>[k,!['logo','price'].includes(k)]))
 });
 const allowedFonts=['Arial','Georgia','Times New Roman','Verdana'];
 let db=null,templates=new Map();
 const templateKey=(company,type)=>company+'|'+type;
 const imageUrl=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'?u.href:''}catch{return ''}};
 function normalize(type,value){
  if(!fields[type])throw Error('Invalid document type');
  const base=defaultFor(type),x=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const c={...base,...x,visible:{...base.visible,...(x.visible||{})}};
  for(const k of ['title','subtitle','headerText','footerText'])c[k]=String(c[k]||'').slice(0,k==='title'?80:700);
  c.accent=/^#[0-9a-f]{6}$/i.test(c.accent)?c.accent:base.accent;
  c.font=allowedFonts.includes(c.font)?c.font:'Arial';
  c.scale=Math.max(85,Math.min(120,Number(c.scale)||100));
  c.padding=Math.max(12,Math.min(55,Number(c.padding)||26));
  c.logoUrl=imageUrl(c.logoUrl);
  c.customFields=(Array.isArray(c.customFields)?c.customFields:[]).slice(0,12)
   .map(v=>({label:String(v.label||'').slice(0,70),value:String(v.value||'').slice(0,240)})).filter(v=>v.label&&v.value);
  for(const [k] of fields[type])c.visible[k]=Boolean(c.visible[k]);
  return c;
 }
 const current=(company,type)=>normalize(type,templates.get(templateKey(company,type)));
 async function load(client,companyIds){
  db=client;
  const ids=(companyIds||window.GreenRichCompanies?.allowed?.()||Object.keys(companies)).filter(c=>companies[c]);
  const response=await client.from('gr_document_templates').select('company_id,document_type,config').in('company_id',ids);
  if(response.error)throw Error('Document designs could not load: '+response.error.message);
  for(const r of response.data||[])if(fields[r.document_type])templates.set(templateKey(r.company_id,r.document_type),normalize(r.document_type,r.config));
 }
 const styling=c=>'--gr-doc-accent:'+c.accent+';--gr-doc-font:'+c.font+';--gr-doc-scale:'+(c.scale/100)+';--gr-doc-padding:'+c.padding+'px;';
 const row=(label,value)=>'<div class="gr-doc-data"><span>'+esc(label)+'</span><strong>'+esc(value||'—')+'</strong></div>';
 const show=(c,name,markup)=>c.visible[name]?markup:'';
 const extra=c=>show(c,'custom',c.customFields.length?'<section class="gr-doc-custom-details">'+c.customFields.map(x=>row(x.label,x.value)).join('')+'</section>':'');
 function heading(c,seller){
  const logo=show(c,'logo',c.logoUrl?'<img class="gr-doc-logo" crossorigin="anonymous" src="'+esc(c.logoUrl)+'" alt="Company logo">':'');
  return '<div class="gr-doc-brand">'+logo+'<div><strong>'+esc(seller.legal_name||'GreenRich ONE')+'</strong>'+
   show(c,'companyContact','<small>'+esc([seller.address,seller.city_state_pincode].filter(Boolean).join(', '))+'</small><small>'+
    esc([seller.phone,seller.email].filter(Boolean).join(' · '))+'</small>')+'</div></div>'+
   (c.headerText?'<p class="gr-doc-header-message">'+esc(c.headerText)+'</p>':'');
 }
 function packingHtml(order,seller,settings){
  const c=normalize('packing',settings||current(order.company_id,'packing'));
  const val=(key,label,value)=>show(c,key,row(label,value));
  const table=show(c,'product','<table class="gr-doc-lines"><thead><tr><th>#</th><th>Product description</th>'+
    (c.visible.sku?'<th>SKU</th>':'')+'<th class="num">Qty</th>'+
    (c.visible.price?'<th class="num">Value</th>':'')+'</tr></thead><tbody><tr><td>1</td><td>'+esc(order.product_name||'Product')+'</td>'+
    (c.visible.sku?'<td>'+esc(order.sku||'—')+'</td>':'')+'<td class="num">'+esc(order.quantity)+'</td>'+
    (c.visible.price?'<td class="num">₹'+esc(Number(order.order_total||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}))+'</td>':'')+
    '</tr></tbody></table>');
  return '<article class="gr-doc-paper gr-packing-paper" id="gr-packing-paper" style="'+styling(c)+'">'+heading(c,seller)+
   '<header class="gr-doc-title"><h1>'+esc(c.title)+'</h1><p>'+esc(c.subtitle)+'</p></header>'+
   '<section class="gr-doc-references">'+row('Order / Dispatch no.',order.order_id)+
    val('orderDate','Order date',order.order_date)+val('invoiceNo','Invoice reference',order.invoice_number)+
    row('Packing status',order.status)+val('customer','Customer',order.customer_name)+
    val('phone','Phone',order.customer_mobile)+val('email','Email',order.customer_email)+
    val('courier','Courier',order.courier_name)+val('tracking','Tracking / AWB',order.tracking_number)+'</section>'+
   show(c,'shippingAddress','<section class="gr-doc-address"><h3>Deliver to</h3><p>'+esc(order.shipping_address||'Not provided')+'</p></section>')+
   table+show(c,'notes','<section class="gr-doc-address"><h3>Dispatch / packing notes</h3><p>'+esc(order.dispatch_note||'—')+'</p></section>')+
   extra(c)+'<div class="gr-doc-signatures">'+
   show(c,'signature','<div><strong>Packed / checked by</strong><span></span></div>')+
   show(c,'receivedBy','<div><strong>Received by</strong><span></span></div>')+'</div>'+
   '<footer class="gr-doc-footer">'+esc(c.footerText)+'</footer></article>';
 }
 function invoiceHtml(source,company,status,model){
  // Invoices issued before this feature preserve their legacy appearance.
  const frozen=model?.document_config;
  if(status==='Issued'&&!frozen)return source;
  const c=normalize('invoice',frozen||current(company,'invoice'));
  const host=document.createElement('div');host.innerHTML=source;
  const paper=host.querySelector('.gr-invoice-paper');if(!paper)return source;
  paper.classList.add('gr-doc-custom','gr-doc-invoice');paper.setAttribute('style',styling(c));
  const title=paper.querySelector('.gr-invoice-heading');
  if(title){const draft=title.querySelector('.gr-invoice-draft');title.textContent=c.title;if(draft)title.append(draft);
   if(c.subtitle)title.insertAdjacentHTML('afterend','<p class="gr-doc-invoice-subtitle">'+esc(c.subtitle)+'</p>');
   if(c.headerText||c.visible.logo&&c.logoUrl)title.insertAdjacentHTML('beforebegin','<div class="gr-doc-invoice-banner">'+
    show(c,'logo',c.logoUrl?'<img class="gr-doc-logo" crossorigin="anonymous" src="'+esc(c.logoUrl)+'" alt="Company logo">':'')+
    '<span>'+esc(c.headerText)+'</span></div>');
  }
  const hide=selector=>paper.querySelector(selector)?.classList.add('gr-doc-hide');
  if(!c.visible.shipTo)hide('.gr-invoice-left .gr-invoice-party:nth-child(2)');
  if(!c.visible.billTo)hide('.gr-invoice-left .gr-invoice-party:nth-child(3)');
  if(!c.visible.deliveryTerms)hide('.gr-invoice-terms');
  if(!c.visible.signature)hide('.gr-invoice-sign');
  if(!c.visible.companyContact){
   paper.querySelectorAll('.gr-invoice-seller div').forEach(el=>{
    if(/^(phone:|email:)/i.test(el.textContent.trim()))el.classList.add('gr-doc-hide');
   });
  }
  const footer=paper.querySelector('.gr-invoice-footer');
  if(footer){
   const left=footer.firstElementChild;
   if(left)[...left.children].forEach((el,i,all)=>{
    const t=el.textContent.trim().toLowerCase();
    if((t==='remarks'&&!c.visible.remarks)||(t==='our bank details'&&!c.visible.bank)||(t==='declaration'&&!c.visible.declaration)){
     el.classList.add('gr-doc-hide');if(all[i+1]?.tagName==='P')all[i+1].classList.add('gr-doc-hide');
    }
   });
   if(c.visible.custom&&c.customFields.length)footer.insertAdjacentHTML('beforebegin',extra(c));
  }
  const note=paper.querySelector('.gr-invoice-computer');
  if(note&&c.footerText)note.textContent=c.footerText;
  return host.innerHTML;
 }
 async function save(company,type,config){
  if(!db)throw Error('Document database unavailable');
  const a=await db.auth.getUser(),id=a.data?.user?.id;
  if(!id)throw Error('Sign in to save layout');
  const payload={company_id:company,document_type:type,config:normalize(type,config),updated_by:id,updated_at:new Date().toISOString()};
  const r=await db.from('gr_document_templates').upsert(payload,{onConflict:'company_id,document_type'});
  if(r.error)throw Error(r.error.message);
  templates.set(templateKey(company,type),payload.config);
 }
 async function settings(host,{db:client,companies:companyIds,notify}){
  const ids=companyIds.filter(c=>companies[c]);if(!ids.length)throw Error('No company access');
  await load(client,ids);
  host.innerHTML='<section class="panel gr-document-settings"><h2>Document Designer · Invoice & Packing Slip</h2>'+
   '<p>Customize both PDF documents for each company. Set header, titles, logo, colours, fonts, margins, footer, custom detail fields and visibility. Mandatory invoice GST and totals remain protected.</p>'+
   '<div class="gr-doc-settings-select"><label>Company<select id="gr-doc-company">'+ids.map(c=>
    '<option value="'+esc(c)+'">'+esc(companies[c])+'</option>').join('')+'</select></label>'+
   '<label>Document<select id="gr-doc-type"><option value="invoice">Invoice</option><option value="packing">Packing slip</option></select></label></div>'+
   '<div class="gr-doc-designer"><form id="gr-doc-edit" class="gr-doc-edit"><div class="gr-doc-form-grid">'+
   [['title','Document title','text'],['subtitle','Subtitle','text'],['headerText','Header message','textarea'],
    ['footerText','Footer message','textarea'],['logoUrl','Logo URL (HTTPS)','url'],['accent','Accent colour','color'],
    ['font','Font','font'],['scale','Text size %','number'],['padding','Page margins (px)','number']]
    .map(([name,label,type])=>'<label>'+esc(label)+(type==='textarea'?'<textarea name="'+name+'" rows="2"></textarea>':
      type==='font'?'<select name="'+name+'">'+allowedFonts.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select>':
      '<input name="'+name+'" type="'+type+'" '+(type==='number'?'min="12" max="120"':'')+'>')+'</label>').join('')+
   '</div><h3>Show / hide sections</h3><div class="gr-doc-flag-list" id="gr-doc-flags"></div>'+
   '<label class="gr-doc-custom-input">Custom details (one per line: Label: Value)<textarea name="customRows" rows="5" placeholder="Project: Project A"></textarea></label>'+
   '<div class="gr-doc-actions"><button class="blue" type="submit">Save layout</button><button class="secondary" type="button" id="gr-doc-reset">Reset preview</button></div>'+
   '<p id="gr-doc-message" role="status"></p></form><div class="gr-doc-preview-area"><h3>Live A4 preview</h3><div id="gr-doc-preview"></div></div></div></section>';
  const el=s=>host.querySelector(s),form=el('#gr-doc-edit'),co=el('#gr-doc-company'),kind=el('#gr-doc-type');
  let active;
  const field=name=>form.elements.namedItem(name);
  function collect(){
   const c={...active,visible:{...active.visible}};
   for(const name of ['title','subtitle','headerText','footerText','logoUrl','accent','font','scale','padding'])c[name]=field(name).value;
   el('#gr-doc-flags').querySelectorAll('[data-visible]').forEach(input=>c.visible[input.dataset.visible]=input.checked);
   c.customFields=field('customRows').value.split(/\r?\n/).slice(0,12).map(t=>{const i=t.indexOf(':');return i>0?{label:t.slice(0,i).trim(),value:t.slice(i+1).trim()}:null}).filter(Boolean);
   return normalize(kind.value,c);
  }
  function preview(){
   const c=collect(),demo={company_id:co.value,order_id:'GR-ORDER-001',order_date:'2026-11-04',status:'Packed',
    invoice_number:'GRG/INV001',customer_name:'Sample Customer',customer_mobile:'+91 9876543210',
    customer_email:'customer@example.com',shipping_address:'Sample address, Tamil Nadu, India',
    product_name:'GreenRich Product',sku:'GR-101',quantity:2,order_total:25000,courier_name:'DTDC',tracking_number:'AWB-101',dispatch_note:'Check item count'};
   const seller={legal_name:companies[co.value],address:'Tamil Nadu, India',email:'sales@company.example'};
   el('#gr-doc-preview').innerHTML=kind.value==='packing'?packingHtml(demo,seller,c):
    '<article class="gr-doc-paper gr-doc-invoice-example" style="'+styling(c)+'">'+heading(c,seller)+
     '<h1>'+esc(c.title)+'</h1><p>'+esc(c.subtitle)+'</p><section class="gr-doc-references">'+row('Invoice','GRG/INV001')+
     row('Buyer','Sample Customer')+'</section><table class="gr-doc-lines"><tr><th>Product</th><th>Qty</th><th>GST</th><th>Amount</th></tr>'+
     '<tr><td>GreenRich Product</td><td>2</td><td>₹1,800</td><td>₹11,800</td></tr></table>'+extra(c)+
     '<footer class="gr-doc-footer">'+esc(c.footerText)+'</footer></article>';
  }
  function fill(c){
   active=normalize(kind.value,c);
   for(const name of ['title','subtitle','headerText','footerText','logoUrl','accent','font','scale','padding'])field(name).value=active[name];
   field('customRows').value=active.customFields.map(f=>f.label+': '+f.value).join('\n');
   el('#gr-doc-flags').innerHTML=fields[kind.value].map(([k,label])=>'<label><input type="checkbox" data-visible="'+k+'" '+(active.visible[k]?'checked':'')+'>'+esc(label)+'</label>').join('');
   preview();
  }
  function choose(){fill(current(co.value,kind.value))}
  co.onchange=choose;kind.onchange=choose;
  form.addEventListener('input',preview);form.addEventListener('change',preview);
  el('#gr-doc-reset').onclick=()=>fill(defaultFor(kind.value));
  form.onsubmit=async event=>{
   event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;
   try{await save(co.value,kind.value,collect());el('#gr-doc-message').textContent='Document layout saved.';notify?.('Document design saved')}
   catch(error){el('#gr-doc-message').textContent=error.message;notify?.(error.message)}
   finally{button.disabled=false}
  };
  choose();
 }
 window.GreenRichDocuments={load,current,save,settings,packingHtml,invoiceHtml,defaultFor,normalize};
})();
