'use strict';
/* GreenRich ONE modern Customer 360 profile.
 * Only renders real, accessible GreenRich CRM and Dispatch records.
 * No Attendance dependencies. */
(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=value=>String(value??'').trim();
 const rupees=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n)||0);
 const count=n=>new Intl.NumberFormat('en-IN').format(Number(n)||0);
 const date=value=>{if(!value)return 'Not recorded';const d=new Date(String(value).slice(0,10)+'T12:00:00');return Number.isNaN(d.valueOf())?text(value):d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})};
 const safeWeb=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
 const phoneValue=value=>{
  const raw=text(value);
  if(!raw)return '';
  const digits=raw.replace(/\D/g,'');
  if(digits.length===10)return '91'+digits;
  if(digits.length>10&&digits.length<=15)return digits;
  return '';
 };
 const phoneHref=value=>{const digits=text(value).replace(/\D/g,'');return digits.length>=10?'tel:+'+(digits.length===10?'91':'')+digits:''};
 const orderKey=s=>(s._companyId||s.company_id||'')+'|'+(s.internal_order_id||s.id);
 const linkButton=(label,key,disabled=false,style='')=>'<button type="button" class="gr360-btn '+style+'" data-gr360="'+key+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>';
 const empty=message=>'<div class="gr360-empty">'+esc(message)+'</div>';
 let mount=null,current=null,actions=null;
 function dataFor({customer,sales=[],leads=[],tasks=[],dispatch=[],tags=[],companyLabel=()=>'',sourceSale=null}){
  const id=customer?.id||'',email=text(customer?.email).toLowerCase(),numbers=[customer?.mobile,customer?.mobile2].map(v=>text(v).replace(/\D/g,'').slice(-10)).filter(v=>v.length===10);
  const matchedSale=s=>id&&s.customer_id===id || !id&&sourceSale&&s.id===sourceSale.id;
  const purchases=sales.filter(matchedSale).sort((a,b)=>text(b.date).localeCompare(text(a.date)));
  const orderIds=[...new Set(purchases.map(orderKey))];
  const eligible=purchases.filter(s=>!['Cancelled','Returned'].includes(s.status));
  const total=eligible.reduce((n,s)=>n+(Number(s.total)||0),0),units=eligible.reduce((n,s)=>n+(Number(s.qty)||0),0);
  const products=new Map();
  for(const s of eligible){
   const key=(s._companyId||s.company_id||'')+'|'+(s.product_id||s.sku||s.product_name||s.id);
   const prev=products.get(key)||{name:s.product_name||s.sku||'Product',company:companyLabel(s._companyId||s.company_id),qty:0,value:0,orders:new Set()};
   prev.qty+=Number(s.qty)||0;prev.value+=Number(s.total)||0;prev.orders.add(orderKey(s));products.set(key,prev);
  }
  const productItems=[...products.values()].sort((a,b)=>b.value-a.value);
  const matchedContact=contact=>{
   const value=text(contact).toLowerCase();
   if(!value)return false;
   if(email&&value.includes(email))return true;
   if(numbers.some(n=>value.replace(/\D/g,'').includes(n)))return true;
   const name=text(customer?.name).toLowerCase();
   return name.length>=4&&(value===name||value.includes(name));
  };
  const opportunities=leads.filter(l=>id&&l.customer_id===id || (!l.customer_id&&matchedContact(l.contact||l.title))).sort((a,b)=>text(b.followup).localeCompare(text(a.followup)));
  const quotations=opportunities.filter(l=>text(l.stage).toLowerCase()==='quotation' || !!l.quotation_number || !!l.quotation_id);
  const followups=tasks.filter(t=>id&&t.customer_id===id || (!t.customer_id&&matchedContact(t.contact))).sort((a,b)=>text(b.due).localeCompare(text(a.due)));
  const deliveries=dispatch.filter(d=>id&&d.customer_id===id || (!d.customer_id&&((email&&text(d.customer_email).toLowerCase()===email)||numbers.includes(text(d.customer_mobile).replace(/\D/g,'').slice(-10))))).sort((a,b)=>text(b.approved_at).localeCompare(text(a.approved_at)));
  const knownTags=(customer?.tag_ids||[]).map(id=>tags.find(t=>t.id===id)?.name).filter(Boolean);
  const monthValues=new Map();for(const s of eligible){const m=text(s.date).slice(0,7);if(/^\d{4}-\d{2}$/.test(m))monthValues.set(m,(monthValues.get(m)||0)+(Number(s.total)||0))}
  const mostRecent=eligible.reduce((prev,s)=>!prev||text(s.date)>text(prev.date)?s:prev,null);
  return {id,email,numbers,purchases,orderIds,eligible,total,units,productItems,opportunities,quotations,followups,deliveries,knownTags,monthValues,mostRecent,repeatProducts:productItems.filter(p=>p.orders.size>1).length};
 }
 function monthChart(data){
  const now=new Date(),months=[];
  for(let i=11;i>=0;i--){const date=new Date(now.getFullYear(),now.getMonth()-i,1);const month=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');months.push({key:month,label:date.toLocaleString('en-IN',{month:'short'}),year:date.getFullYear(),value:data.monthValues.get(month)||0})}
  const max=Math.max(1,...months.map(m=>m.value));
  return '<div class="gr360-chart" role="img" aria-label="Last 12 months of customer sales, with exact monthly values always visible">'+months.map((m,i)=>
   '<div class="gr360-chart-month" title="'+esc(m.key)+' · '+esc(rupees(m.value))+'"><span class="gr360-chart-value">'+(m.value?esc(rupees(m.value)):'—')+'</span><div class="gr360-chart-track"><div class="gr360-chart-bar '+(i===11?'recent':'')+'" style="height:'+Math.max(m.value?5:1,Math.round(m.value/max*100))+'%"></div></div><span class="gr360-chart-label">'+esc(m.label)+'</span></div>'
  ).join('')+'</div><div class="gr360-chart-foot">Last 12 calendar months · actual order values · cancelled/returned orders excluded</div>';
 }
 function contactField(label,value,href=''){
  const display=text(value)||'Not recorded';
  return '<div class="gr360-contact"><span>'+esc(label)+'</span>'+(href?'<a href="'+esc(href)+'" rel="noopener noreferrer">'+esc(display)+'</a>':'<strong>'+esc(display)+'</strong>')+'</div>';
 }
 function productList(model){
  const max=Math.max(1,...model.productItems.map(p=>p.value));
  return model.productItems.length?model.productItems.slice(0,12).map(p=>
   '<div class="gr360-product"><div class="gr360-product-line"><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.company)+' · '+count(p.orders.size)+' orders · '+count(p.qty)+' units'+(p.orders.size>1?' · Repeat purchase':'')+'</small></div><b>'+esc(rupees(p.value))+'</b></div><div class="gr360-product-track"><span style="width:'+Math.max(2,Math.round(p.value/max*100))+'%"></span></div></div>'
  ).join(''):empty('No paid product history for this customer yet.');
 }
 function orderList(model,companyLabel){
  if(!model.purchases.length)return empty('No sales orders are linked to this customer yet.');
  return '<div class="gr360-tablewrap"><table class="gr360-table"><thead><tr><th>Order ID / Date</th><th>Company / Product</th><th>Quantity</th><th>Value</th><th>Invoice</th><th>Delivery</th><th>Actions</th></tr></thead><tbody>'+model.purchases.map(s=>{
   const delivery=model.deliveries.find(d=>d.source_sale_id===s.id&&(d.company_id===(s._companyId||s.company_id)));
   const key=(s._companyId||s.company_id||'')+'|'+s.id;
   return '<tr><td><strong>'+esc(s.internal_order_id||s.order_id||'Legacy order')+'</strong><small>'+esc(date(s.date))+(s.order_id?' · '+esc(s.order_id):'')+'</small></td>'+
    '<td><strong>'+esc(s.product_name||s.sku||'Product')+'</strong><small>'+esc(companyLabel(s._companyId||s.company_id))+'</small></td>'+
    '<td>'+count(s.qty)+'</td><td><strong>'+esc(rupees(s.total))+'</strong><small>'+esc(s.status||'—')+'</small></td>'+
    '<td><span class="gr360-status">'+esc(s.invoice_status||'Draft')+'</span><small>'+esc(s.invoice_number||'Not numbered')+'</small></td>'+
    '<td><span class="gr360-status '+(delivery?.status==='Delivered'?'delivered':'')+'">'+esc(delivery?.status||'Awaiting dispatch')+'</span>'+
    (delivery?.tracking_number?'<small>'+esc(delivery.courier_name||'Courier')+' · '+esc(delivery.tracking_number)+'</small>':'')+'</td>'+
    '<td><div class="gr360-row-actions">'+linkButton('View invoice','invoice:'+key)+linkButton('WhatsApp','invoice-whatsapp:'+key)+linkButton('Email','invoice-email:'+key)+'</div></td></tr>';
  }).join('')+'</tbody></table></div>';
 }
 function shipmentList(model){
  return model.deliveries.length?model.deliveries.map(d=>
   '<div class="gr360-event"><span class="gr360-event-dot"></span><div><div class="gr360-event-top"><strong>'+esc(d.order_id||'Order')+'</strong><span class="gr360-status '+(d.status==='Delivered'?'delivered':'')+'">'+esc(d.status||'Approved')+'</span></div>'+
   '<p>'+esc(d.courier_name||'Courier not assigned')+(d.tracking_number?' · Tracking '+esc(d.tracking_number):' · Tracking pending')+'</p>'+
   '<small>Approved '+esc(date(d.approved_at))+(d.dispatched_at?' · Dispatched '+esc(date(d.dispatched_at)):'')+(d.delivered_at?' · Delivered '+esc(date(d.delivered_at)):'')+'</small>'+
   (safeWeb(d.tracking_url)?'<a target="_blank" rel="noopener noreferrer" href="'+esc(safeWeb(d.tracking_url))+'">Track shipment ↗</a>':'')+
   '<div class="gr360-row-actions">'+linkButton('WhatsApp update','tracking-whatsapp:'+d.id)+linkButton('Email update','tracking-email:'+d.id)+'</div></div></div>'
  ).join(''):empty('No approved dispatch or courier tracking information yet.');
 }
 function quotationList(model){
  return model.quotations.length?model.quotations.map(l=>
   '<div class="gr360-event"><span class="gr360-event-dot purple"></span><div><div class="gr360-event-top"><strong>'+esc(l.title||'Quotation enquiry')+'</strong><span class="gr360-status">'+esc(l.stage||'Quotation')+'</span></div><p>'+esc(l.notes||'No quotation description saved.')+'</p><small>Expected value '+esc(rupees(l.value))+(l.followup?' · Follow-up '+esc(date(l.followup)):'')+'</small>'+
   '<div class="gr360-row-actions">'+linkButton('Share summary on WhatsApp','quote-whatsapp:'+l.id)+linkButton('Email summary','quote-email:'+l.id)+'</div></div></div>'
  ).join(''):empty('No quotation-stage enquiries linked to this customer. Previous quotation PDF files are not stored in the current CRM.');
 }
 function followupList(model){
  return model.followups.length?model.followups.slice(0,15).map(t=>
   '<div class="gr360-event"><span class="gr360-event-dot green"></span><div><div class="gr360-event-top"><strong>'+esc(t.title||'Follow-up')+'</strong><span class="gr360-status '+(t.status==='Done'?'delivered':'')+'">'+esc(t.status||'Open')+'</span></div><p>'+esc(t.notes||'No notes')+'</p><small>'+esc(t.due?date(t.due):'No date')+(t.owner?' · '+esc(t.owner):'')+'</small></div></div>'
  ).join(''):empty('No linked follow-ups for this customer.');
 }
 const payloadInfo=(c,model)=>{
  const address=[c.address1,c.address2,c.city,c.state,c.pincode,c.country].filter(Boolean).join(', ');
  return [c.name||'Customer',c.company?'Company: '+c.company:'','Phone: '+(c.mobile||'—'),
   c.mobile2?'Alternative phone: '+c.mobile2:'','Email: '+(c.email||'—'),'Address: '+(address||'Not recorded'),
   c.gstin?'GSTIN: '+c.gstin:'','Total orders: '+model.orderIds.length,'Total sales: '+rupees(model.total)].filter(Boolean).join('\n');
 };
 function render(element,{customer,sales,leads,tasks,dispatch,tags,companyLabel,sourceSale,onBack,onEdit,onInvoice,onRefresh}){
  if(!customer&&!sourceSale)throw Error('Customer is not found.');
  current={customer:customer||{id:'',name:sourceSale?.customer_name||'Unlinked customer'},sourceSale};
  actions={onBack,onEdit,onInvoice,onRefresh,companyLabel};
  mount=element;
  const c=current.customer,model=dataFor({customer:c,sales,leads,tasks,dispatch,tags,companyLabel,sourceSale});
  current.model=model;
  const name=text(c.name)||'Customer',initials=name.split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase();
  const address=[c.address1,c.address2,c.city,c.state,c.pincode,c.country].filter(Boolean).join(', ');
  const primaryPhone=phoneValue(c.mobile)||phoneValue(c.mobile2);
  const latest=model.mostRecent?date(model.mostRecent.date):'No orders';
  element.innerHTML=
   '<div class="gr360-page">'+
    '<div class="gr360-breadcrumb">'+linkButton('← All customers','back')+'<span>Customer directory / '+esc(name)+'</span></div>'+
    '<div class="gr360-hero"><div class="gr360-hero-main"><div class="gr360-avatar" aria-hidden="true">'+esc(initials||'GR')+'</div><div class="gr360-identity"><span class="gr360-eyebrow">GREENRICH · CUSTOMER 360</span><h2>'+esc(name)+'</h2><p>'+esc(c.company||c.type||'Customer profile')+'</p><div class="gr360-tags">'+model.knownTags.map(t=>'<span>'+esc(t)+'</span>').join('')+(model.orderIds.length>1?'<span class="repeat">Repeat customer</span>':'')+'</div></div></div>'+
    '<div class="gr360-hero-actions">'+linkButton('WhatsApp','whatsapp',!primaryPhone,'main')+linkButton('Email customer','email',!text(c.email))+linkButton('Share details','share',!primaryPhone)+linkButton('Edit customer','edit',!text(c.id))+'</div></div>'+
    '<div class="gr360-stats">'+[
     ['Lifetime revenue',rupees(model.total),'Excludes cancelled / returned'],
     ['Orders placed',count(model.orderIds.length),'Across assigned companies'],
     ['Units purchased',count(model.units),'From completed sales lines'],
     ['Avg. order value',rupees(model.orderIds.length?model.total/model.orderIds.length:0),'Total revenue ÷ orders'],
     ['Repeat products',count(model.repeatProducts),'Products ordered more than once'],
     ['Last purchase',latest,'Most recent valid order']
    ].map(([title,val,sub])=>'<div class="gr360-stat"><small>'+esc(title)+'</small><strong>'+esc(val)+'</strong><span>'+esc(sub)+'</span></div>').join('')+'</div>'+
    '<div class="gr360-main-grid">'+
     '<div class="gr360-primary">'+
      '<section class="gr360-panel"><div class="gr360-panel-heading"><div><span class="gr360-kicker">REVENUE</span><h3>Sales performance</h3><p>Monthly customer purchase history</p></div><span class="gr360-hint">Amounts always visible</span></div>'+monthChart(model)+'</section>'+
      '<section class="gr360-panel"><div class="gr360-panel-heading"><div><span class="gr360-kicker">PRODUCTS</span><h3>Most purchased products</h3><p>Quantity, spending and repeat order frequency</p></div></div>'+productList(model)+'</section>'+
     '</div>'+
     '<div class="gr360-aside">'+
      '<section class="gr360-panel"><div class="gr360-panel-heading"><div><span class="gr360-kicker">CONTACT</span><h3>Customer information</h3></div></div>'+
       '<div class="gr360-contact-grid">'+contactField('Primary phone',c.mobile,phoneHref(c.mobile))+contactField('Second phone',c.mobile2,phoneHref(c.mobile2))+
        contactField('Email',c.email,text(c.email)?'mailto:'+encodeURIComponent(c.email):'')+contactField('Company',c.company)+
        contactField('Customer type',c.type)+contactField('Address line 1',c.address1)+contactField('Address line 2',c.address2)+
        contactField('City',c.city)+contactField('State',c.state)+contactField('PIN code',c.pincode)+contactField('Country',c.country)+
        contactField('GSTIN',c.gstin)+contactField('Source',c.source)+contactField('Account owner',c.owner)+
        '</div><div class="gr360-contact-footer"><strong>Full address</strong><p>'+esc(address||'Not recorded')+'</p>'+linkButton('Copy contact details','copy')+'</div></section>'+
      '<section class="gr360-panel"><div class="gr360-panel-heading"><div><span class="gr360-kicker">CUSTOMER NOTES</span><h3>Additional information</h3></div></div><p class="gr360-notes">'+esc(c.notes||'No customer notes recorded.')+'</p></section>'+
     '</div></div>'+
    '<section class="gr360-panel gr360-wide"><div class="gr360-panel-heading"><div><span class="gr360-kicker">ORDERS & INVOICES</span><h3>Complete sales order history</h3><p>All accessible company orders, invoice references and delivery status</p></div><span class="gr360-hint">'+count(model.orderIds.length)+' orders</span></div>'+orderList(model,companyLabel)+'</section>'+
    '<div class="gr360-bottom-grid">'+
     '<section class="gr360-panel"><div class="gr360-panel-heading"><div><span class="gr360-kicker">DELIVERY</span><h3>Courier & tracking timeline</h3><p>Dispatch updates from the shared operations queue</p></div></div>'+shipmentList(model)+'</section>'+
     '<section class="gr360-panel"><div class="gr360-panel-heading"><div><span class="gr360-kicker">QUOTATIONS</span><h3>Quotation & enquiry history</h3><p>Recorded quotation-stage enquiries, not fictional documents</p></div></div>'+quotationList(model)+'</section>'+
     '<section class="gr360-panel"><div class="gr360-panel-heading"><div><span class="gr360-kicker">ACTIVITY</span><h3>Follow-ups & actions</h3><p>Open and completed customer follow-up tasks</p></div></div>'+followupList(model)+'</section>'+
    '</div>'+
    '<div class="gr360-disclaimer">WhatsApp and email actions open your own messaging app with a prepared message. WhatsApp and email text links do not attach PDFs. Open an invoice and select Share PDF to use the mobile share menu (including WhatsApp/email where supported). Otherwise download the PDF and attach it manually. Only actual GreenRich records appear above.</div>'+
   '</div>';
  function shareText(kind,record){
   const top='Hello '+name+',\n';
   if(kind==='invoice'){return top+'Here are your GreenRich invoice details:\nInvoice: '+(record.invoice_number||'Draft / not numbered')+'\nOrder: '+(record.internal_order_id||record.order_id||'Order')+'\nDate: '+date(record.date)+'\nProduct: '+(record.product_name||'Product')+'\nQuantity: '+count(record.qty)+'\nTotal: '+rupees(record.total)+'\nPlease request the PDF attachment separately.'}
   if(kind==='tracking'){return top+'Your GreenRich shipment status:\nOrder: '+(record.order_id||'Order')+'\nCourier: '+(record.courier_name||'Not yet assigned')+'\nTracking/AWB: '+(record.tracking_number||'Pending')+'\nStatus: '+(record.status||'Approved')+(safeWeb(record.tracking_url)?'\nTracking: '+safeWeb(record.tracking_url):'')}
   if(kind==='quote'){return top+'Here is the quotation/enquiry summary:\n'+(record.title||'Quotation')+'\nExpected value: '+rupees(record.value)+'\nStatus: '+(record.stage||'Quotation')+'\nPlease request the official quotation document separately.'}
   if(kind==='details')return 'GreenRich customer details\n'+payloadInfo(c,model);
   return top+'Thank you for being a GreenRich customer. How can we help you today?';
  }
  function openMessage(channel,message){
   if(channel==='whatsapp'){
    const phone=phoneValue(c.mobile)||phoneValue(c.mobile2);
    if(!phone)return window.alert('This customer has no valid WhatsApp number.');
    window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');
   }else{
    if(!text(c.email))return window.alert('Customer email is not recorded.');
    const subject=message.includes('invoice')?'GreenRich invoice details':message.includes('shipment')?'GreenRich delivery update':message.includes('quotation')?'GreenRich quotation summary':'GreenRich customer communication';
    window.location.href='mailto:'+encodeURIComponent(c.email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(message);
   }
  }
  element.onclick=event=>{
   const button=event.target.closest('[data-gr360]');if(!button)return;
   const [kind,...parts]=button.dataset.gr360.split(':'),ref=parts.join(':');
   if(kind==='back'){actions.onBack?.();return}
   if(kind==='edit'){actions.onEdit?.(c.id);return}
   if(kind==='whatsapp'||kind==='email'||kind==='share'){openMessage(kind==='email'?'email':'whatsapp',shareText(kind==='share'?'details':'intro'));return}
   if(kind==='copy'){const summary=payloadInfo(c,model);if(navigator.clipboard?.writeText){navigator.clipboard.writeText(summary).then(()=>{button.textContent='Copied ✓'}).catch(()=>window.prompt('Copy customer information',summary))}else window.prompt('Copy customer information',summary);return}
   if(kind.startsWith('invoice')){
    const sale=model.purchases.find(s=>((s._companyId||s.company_id||'')+'|'+s.id)===ref);
    if(!sale)return;
    if(kind==='invoice')actions.onInvoice?.(sale.id,sale._companyId||sale.company_id);
    else openMessage(kind.endsWith('email')?'email':'whatsapp',shareText('invoice',sale));
    return;
   }
   if(kind.startsWith('tracking')){
    const record=model.deliveries.find(d=>d.id===ref);
    if(record)openMessage(kind.endsWith('email')?'email':'whatsapp',shareText('tracking',record));return;
   }
   if(kind.startsWith('quote')){
    const quote=model.quotations.find(l=>l.id===ref);
    if(quote)openMessage(kind.endsWith('email')?'email':'whatsapp',shareText('quote',quote));
   }
  };
  return model;
 }
 window.GreenRichCustomerProfile={render,dataFor,phoneValue};
})();
