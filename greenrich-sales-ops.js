'use strict';
/* GreenRich ONE: Sales order filters, approval handoff and cloud Dispatch.
 * Sales remain local to browser; approved dispatch snapshots sync via Supabase. No Attendance code.
 */
(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=x=>String(x??'').trim();
 const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n)||0);
 const num=n=>new Intl.NumberFormat('en-IN').format(Number(n)||0);
 const date=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
 const safeUrl=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}};
 const dataColumns=[
  ['date','Date'],['order','Order ID'],['company','Company'],['customer','Customer'],
  ['product','Product'],['channel','Channel'],['qty','Qty'],['status','Approval status'],
  ['taxable','Taxable ₹'],['tax','Tax ₹'],['shipping','Shipping ₹'],['total','Total ₹'],
  ['invoice','Invoice'],['actions','Actions']
 ];
 const defaults=['date','order','company','customer','product','channel','qty','status','total','actions'];
 let root=null,db=null,adapter=null,allowed=[],canApprove=false,canDispatch=false,dispatchRows=[],loading=null,request=0,selectedDispatch=null;
 const q=id=>root?.querySelector(id);
 const actionMessage=msg=>adapter?.toast?.(msg);
 const validCompany=id=>allowed.includes(id);
 const getRows=()=>adapter.getSales().filter(s=>validCompany(s._companyId||s.company_id)).map(s=>({...s,_companyId:s._companyId||s.company_id}));
 const customer=s=>adapter.getCustomers().find(c=>c.id===s.customer_id);
 const customerName=s=>customer(s)?.name||s.customer_name||'Customer not linked';
 const productName=s=>s.product_name||adapter.productName(s);
 const channelName=s=>s.channel_name||adapter.channelName(s);
 const companyName=s=>adapter.companyLabel(s._companyId);
 const orderKey=s=>(s._companyId||s.company_id)+'|'+s.id;
 const dispatchFor=s=>dispatchRows.find(d=>d.company_id===s._companyId&&d.source_sale_id===s.id);
 const approvalStatus=s=>dispatchFor(s)?.status==='Pending'?'Pending dispatch':dispatchFor(s)?.status||s.approval_status||'Pending verification';
 const filterPeriod=(period,from,to,day)=>{
  if(period==='all')return true;
  if(period==='custom')return (!from||day>=from)&&(!to||day<=to);
  if(period==='today')return day===date();
  if(period==='month')return String(day).slice(0,7)===date().slice(0,7);
  const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(period==='week')start.setDate(start.getDate()-((start.getDay()+6)%7));
  else if(period==='last30')start.setDate(start.getDate()-29);
  const stamp=[start.getFullYear(),String(start.getMonth()+1).padStart(2,'0'),String(start.getDate()).padStart(2,'0')].join('-');
  return day>=stamp&&day<=date();
 };
 function fill(id,label,values,keep=true){
  const select=q(id);if(!select)return;
  const chosen=keep?select.value:'all';
  select.replaceChildren();
  const first=document.createElement('option');first.value='all';first.textContent=label;select.append(first);
  for(const [value,name] of values){const opt=document.createElement('option');opt.value=value;opt.textContent=name;select.append(opt)}
  select.value=[...select.options].some(o=>o.value===chosen)?chosen:'all';
 }
 function updateChoices(){
  const company=q('#orders-company')?.value||'all';
  fill('#orders-company','All assigned companies',allowed.map(id=>[id,adapter.companyLabel(id)]));
  if(allowed.length===1){q('#orders-company').value=allowed[0];q('#orders-company').disabled=true}
  const scoped=getRows().filter(s=>company==='all'||s._companyId===company);
  const channels=new Set(scoped.map(channelName));
  fill('#sales-channel-filter','All channels',[...channels].filter(Boolean).sort().map(c=>[c,c]));
  const products=new Map();
  scoped.forEach(s=>{const key=s._companyId+'|'+(s.product_id||s.product_name||s.id);products.set(key,[key,productName(s)+' · '+companyName(s)])});
  fill('#orders-product','All products',[...products.values()].sort((a,b)=>a[1].localeCompare(b[1])));
 }
 function filteredSales(){
  const company=q('#orders-company')?.value||'all',channel=q('#sales-channel-filter')?.value||'all',product=q('#orders-product')?.value||'all';
  const term=text(q('#sales-search')?.value).toLowerCase(),period=q('#orders-period')?.value||'month';
  const from=q('#orders-from')?.value||'',to=q('#orders-to')?.value||'';
  return getRows().filter(s=>{
   if(!filterPeriod(period,from,to,s.date||''))return false;
   if(company!=='all'&&s._companyId!==company)return false;
   if(channel!=='all'&&channelName(s)!==channel)return false;
   if(product!=='all'&&s._companyId+'|'+(s.product_id||s.product_name||s.id)!==product)return false;
   if(!term)return true;
   const c=customer(s)||{},record=dispatchFor(s)||{};
   return [s.internal_order_id,s.order_id,s.invoice_number,s.date,companyName(s),
    customerName(s),c.mobile,c.mobile2,c.email,c.gstin,c.address1,c.city,c.state,
    productName(s),s.sku,channelName(s),s.status,approvalStatus(s),
    record.courier_name,record.tracking_number,record.order_id,s.notes]
    .some(value=>String(value??'').toLowerCase().includes(term));
  }).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 }
 const orderId=s=>s.internal_order_id||s.order_id||'Legacy order';
 const report=rows=>{
  const orderIds=new Set(rows.map(orderKey)),approved=rows.filter(s=>!!dispatchFor(s)||s.approval_status==='Approved');
  const pending=rows.filter(s=>!dispatchFor(s)&&s.approval_status!=='Approved'&&!['Cancelled','Returned'].includes(s.status));
  const cancelled=rows.filter(s=>['Cancelled','Returned'].includes(s.status));
  const todaySales=rows.filter(s=>s.date===date());
  const total=rows.reduce((sum,s)=>sum+(Number(s.total)||0),0);
  const metrics=[
   ['Total orders',orderIds.size,'In selected filters'],
   ['Awaiting approval',pending.length,'Need verification'],
   ['Approved orders',approved.length,'Passed to Dispatch'],
   ['Dispatched',rows.filter(s=>['Shipped','Delivered'].includes(approvalStatus(s))).length,'Handed to courier'],
   ["Today's orders",todaySales.length,'Matching current filters'],
   ['Sales value',money(total),'For filtered orders'],
   ['Cancelled / returned',cancelled.length,'Not eligible for approval']
  ];
  q('#orders-status-report').innerHTML=metrics.map(([label,value,note])=>
   '<div class="gr-order-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>').join('');
  return {orderIds,approved,pending,cancelled,total};
 };
 const getSelectedColumns=()=>{
  let selected;
  try{selected=JSON.parse(localStorage.getItem('greenrich-sales-columns-v1')||'null')}catch{}
  return Array.isArray(selected)?dataColumns.filter(([id])=>selected.includes(id)).map(([id])=>id):defaults.slice();
 };
 function saveColumns(columns){localStorage.setItem('greenrich-sales-columns-v1',JSON.stringify(columns))}
 function renderColumns(){
  const host=q('#orders-columns-choices');if(!host)return;
  const selected=getSelectedColumns();
  host.innerHTML=dataColumns.map(([key,label])=>'<label><input type="checkbox" data-column="'+esc(key)+'" '+(selected.includes(key)?'checked':'')+'><span>'+esc(label)+'</span></label>').join('');
 }
 const cell=(s,key)=>{
  const c=customer(s),status=approvalStatus(s);
  switch(key){
   case 'date':return esc(s.date);
   case 'order':return '<strong>'+esc(orderId(s))+'</strong><small>'+esc(s.order_id&&s.internal_order_id?'Platform: '+s.order_id:'')+'</small>';
   case 'company':return esc(companyName(s));
   case 'customer':return '<button class="gr-order-customer" data-customer-history="'+esc(s.customer_id||'')+'" data-customer-sale="'+esc(s.id)+'" type="button">'+esc(customerName(s))+'</button><small>'+esc(c?.mobile||'')+'</small>';
   case 'product':return '<strong>'+esc(productName(s))+'</strong><small>'+esc(s.sku||'')+'</small>';
   case 'channel':return '<span class="pill">'+esc(channelName(s))+'</span>';
   case 'qty':return num(s.qty);
   case 'status':return '<span class="gr-order-approval-tag" data-state="'+esc(status)+'">'+esc(status)+'</span>';
   case 'taxable':return money(s.taxable);
   case 'tax':return money(s.tax_amount);
   case 'shipping':return money(s.shipping_charge);
   case 'total':return '<strong>'+money(s.total)+'</strong>';
   case 'invoice':return adapter.invoiceAction(s);
   case 'actions':{
    const cloud=dispatchFor(s),blocked=['Cancelled','Returned'].includes(s.status);
    const approve=canApprove&&!cloud&&!s.approval_status&&!blocked?
     '<button class="gr-order-approve" type="button" data-approve-order="'+esc(s.id)+'" data-approve-company="'+esc(s._companyId)+'">Approve</button>':
     (cloud?'<span class="gr-order-approved">✓ Sent to dispatch</span>':
      (blocked?'<span class="gr-order-muted">Not approvable</span>':'<span class="gr-order-muted">'+esc(status)+'</span>'));
    return '<div class="gr-order-actions">'+window.GreenRichActionMenu.wrap(approve+adapter.rawActions('sales',s.id)+adapter.invoiceAction(s))+'</div>';
   }
   default:return '—';
  }
 };
 function renderSales(){
  if(!root?.isConnected||!q('#sales-table')||!q('#orders-table-head')||!q('#sales-count')||!q('#orders-filter-summary'))return;
  updateChoices();
  const sales=filteredSales(),stats=report(sales),cols=getSelectedColumns();
  q('#orders-table-head').innerHTML='<tr>'+cols.map(key=>'<th scope="col">'+esc(dataColumns.find(c=>c[0]===key)?.[1]||key)+'</th>').join('')+'</tr>';
  q('#sales-table').innerHTML=sales.length?sales.map(s=>'<tr>'+cols.map(key=>'<td data-order-cell="'+esc(key)+'">'+cell(s,key)+'</td>').join('')+'</tr>').join(''):
   '<tr><td colspan="'+cols.length+'" class="empty">No orders match these filters. Try changing the dates, company or search.</td></tr>';
  q('#sales-count').textContent=num(stats.orderIds.size)+' orders · '+num(sales.length)+' sale lines · '+money(stats.total);
  q('#orders-filter-summary').textContent='Showing '+num(sales.length)+' records · '+esc(q('#orders-period')?.selectedOptions[0]?.textContent||'All time')+' · '+esc(q('#orders-company')?.selectedOptions[0]?.textContent||'All companies');
 }
 async function refreshDispatch(){
  if(!db)throw Error('Signed-in access is required');
  const seq=++request,read=await db.from('gr_dispatch_orders').select('*').in('company_id',allowed).order('approved_at',{ascending:false}).limit(1500);
  if(read.error)throw Error('Unable to read shared dispatch: '+read.error.message);
  if(seq===request){dispatchRows=read.data||[];renderSales();renderDispatch()}
  return dispatchRows;
 }
 const delayedRefresh=async()=>{if(loading)return loading;loading=refreshDispatch();try{return await loading}finally{loading=null}};
 function renderDispatch(){
  if(!root?.isConnected||!q('#dispatch-table')||!q('#dispatch-metrics')||!q('#dispatch-count'))return;
  const term=text(q('#dispatch-search')?.value).toLowerCase(),status=q('#dispatch-status-filter')?.value||'all',company=q('#dispatch-company-filter')?.value||'all';
  const list=dispatchRows.filter(r=>allowed.includes(r.company_id)&&(status==='all'||r.status===status)&&(company==='all'||r.company_id===company)&&
   (!term||[r.order_id,r.platform_order_id,r.company_id,r.customer_name,r.customer_mobile,r.customer_email,r.product_name,r.sku,r.courier_name,r.tracking_number,r.invoice_number].some(x=>String(x??'').toLowerCase().includes(term))));
  const count=k=>list.filter(r=>r.status===k).length;
  q('#dispatch-metrics').innerHTML=[['Pending',count('Pending')+count('Approved')],['Packed',count('Packed')],['Shipped',count('Shipped')],['Delivered',count('Delivered')]].map(([label,value])=>'<div class="gr-order-stat"><span>'+label+'</span><strong>'+num(value)+'</strong></div>').join('');
  q('#dispatch-table').innerHTML=list.length?list.map(r=>'<tr>'+
   '<td><strong>'+esc(r.order_id)+'</strong><small>'+esc(r.order_date)+'</small></td>'+
   '<td>'+esc(adapter.companyLabel(r.company_id))+'</td>'+
   '<td><strong>'+esc(r.customer_name||'—')+'</strong><small>'+esc(r.customer_mobile||r.customer_email||'')+'</small></td>'+
   '<td>'+esc(r.product_name||'—')+'<small>'+num(r.quantity)+' units · '+money(r.order_total)+'</small></td>'+
   '<td>'+esc(new Date(r.approved_at).toLocaleDateString('en-IN'))+'</td>'+
   '<td><span class="gr-order-approval-tag" data-state="'+esc(r.status)+'">'+esc(r.status)+'</span></td>'+
   '<td>'+esc(r.courier_name||'Not assigned')+'<small>'+esc(r.tracking_number||'No tracking yet')+'</small></td>'+
   '<td><div class="gr-order-actions">'+window.GreenRichActionMenu.wrap('<button type="button" class="btn soft" data-dispatch-details="'+esc(r.id)+'">Details</button>'+
   (canDispatch?'<button class="gr-order-approve" type="button" data-dispatch-edit="'+esc(r.id)+'">Update</button>':'')
   )+'</div></td></tr>').join(''):'<tr><td class="empty" colspan="8">No dispatch orders match these filters.</td></tr>';
  q('#dispatch-count').textContent=num(list.length)+' dispatch orders · shared with authorized operations employees';
 }
 function showCustomer(id,sourceSaleId){
  if(adapter?.showCustomerProfile){adapter.showCustomerProfile(id,sourceSaleId);return}
  const c=adapter.getCustomers().find(item=>item.id===id);
  const source=getRows().find(s=>s.id===sourceSaleId);
  const name=c?.name||source?.customer_name||'Customer details';
  const relevant=getRows().filter(s=>id?s.customer_id===id:
   !!source&&s.customer_name===source.customer_name);
  const tracked=dispatchRows.filter(d=>id?d.customer_id===id:!!source&&d.customer_name===source.customer_name);
  const unique=new Set(relevant.map(orderKey));
  const units=relevant.reduce((sum,s)=>sum+(Number(s.qty)||0),0),revenue=relevant.reduce((sum,s)=>sum+(Number(s.total)||0),0);
  const quotations=adapter.getLeads().filter(l=>String(l.stage||'').toLowerCase()==='quotation' &&
   [l.contact,l.title].some(t=>String(t||'').toLowerCase().includes(name.toLowerCase())));
  q('#gr-customer-history-title').textContent=name+' · Customer profile';
  const info=key=>esc(c?.[key]||'Not recorded');
  q('#gr-customer-history-content').innerHTML=
   '<div class="gr-customer-profile-grid"><div><span>Phone numbers</span><strong>'+info('mobile')+'</strong><small>'+info('mobile2')+'</small></div>'+
   '<div><span>Email</span><strong>'+info('email')+'</strong></div>'+
   '<div><span>Address</span><strong>'+esc([c?.address1,c?.address2,c?.city,c?.state,c?.pincode].filter(Boolean).join(', ')||'Not recorded')+'</strong></div>'+
   '<div><span>GSTIN / Tags</span><strong>'+info('gstin')+'</strong><small>'+esc((c?.tag_ids||[]).map(tag=>adapter.getTags().find(t=>t.id===tag)?.name).filter(Boolean).join(', ')||'—')+'</small></div></div>'+
   '<div class="gr-order-status-metrics"><div class="gr-order-stat"><span>Orders in this browser</span><strong>'+num(unique.size)+'</strong></div><div class="gr-order-stat"><span>Units ordered</span><strong>'+num(units)+'</strong></div><div class="gr-order-stat"><span>Total sales</span><strong>'+money(revenue)+'</strong></div><div class="gr-order-stat"><span>Quote-stage leads</span><strong>'+num(quotations.length)+'</strong></div></div>'+
   '<h3>Order history</h3><div class="gr-profile-timeline">'+(relevant.length?relevant.map(s=>'<div><strong>'+esc(orderId(s))+' · '+esc(s.date)+'</strong><span>'+esc(productName(s))+' · '+num(s.qty)+' units · '+money(s.total)+'</span><small>'+esc(companyName(s))+' · '+esc(approvalStatus(s))+'</small></div>').join(''):'<p>No local order history available for this customer.</p>')+'</div>'+
   '<h3>Courier tracking history</h3><div class="gr-profile-timeline">'+(tracked.length?tracked.map(r=>'<div><strong>'+esc(r.order_id)+' · '+esc(r.status)+'</strong><span>'+esc(r.courier_name||'Courier not assigned')+' · '+esc(r.tracking_number||'Tracking pending')+'</span>'+((safeUrl(r.tracking_url))?'<a rel="noopener noreferrer" target="_blank" href="'+esc(safeUrl(r.tracking_url))+'">Open courier tracking</a>':'')+'</div>').join(''):'<p>No approved dispatch/tracking records linked to this customer.</p>')+'</div>'+
   '<h3>Previous quotations / leads</h3><div class="gr-profile-timeline">'+(quotations.length?quotations.map(l=>'<div><strong>'+esc(l.title||'Quotation enquiry')+'</strong><span>Value: '+money(l.value)+' · '+esc(l.followup||'No follow-up date')+'</span></div>').join(''):'<p>No quotation-stage enquiries found. A separate quotation document archive is not yet available.</p>')+'</div>'+
   '<p class="gr-ops-disclaimer">Customer contacts are shared. Sales order history above is limited to sales saved in this browser; dispatch tracking is shared with authorized users.</p>';
  q('#gr-customer-history-dialog').showModal();
 }
 async function approveOrder(id,companyId,button){
  if(!canApprove)return actionMessage('Your role does not have Approve permission');
  if(!validCompany(companyId))return actionMessage('Company access denied');
  const sale=getRows().find(s=>s.id===id&&s._companyId===companyId);
  if(!sale)return actionMessage('Sale not found in this browser');
  if(['Cancelled','Returned'].includes(sale.status))return actionMessage('Cancelled or returned orders cannot be approved');
  if(dispatchFor(sale))return actionMessage('Order already approved');
  const c=customer(sale);
  if(!window.confirm('Approve order '+orderId(sale)+' and send it to the shared Dispatch queue?'))return;
  button.disabled=true;
  const detail={company_id:companyId,source_sale_id:sale.id,order_id:orderId(sale),platform_order_id:sale.order_id||null,
   order_date:sale.date,channel:channelName(sale),customer_id:sale.customer_id||null,
   customer_name:customerName(sale),customer_mobile:c?.mobile||null,customer_email:c?.email||null,
   shipping_address:[c?.address1,c?.address2,c?.city,c?.state,c?.pincode].filter(Boolean).join(', '),
   product_name:productName(sale),sku:sale.sku||null,quantity:Number(sale.qty)||0,
   order_total:Number(sale.total)||0,invoice_number:sale.invoice_number||null,
   source_snapshot:{sale:JSON.parse(JSON.stringify(sale)),customer:c?{name:c.name,email:c.email,mobile:c.mobile,address1:c.address1,city:c.city,state:c.state,pincode:c.pincode}:null}
  };
  try{
   const result=await db.from('gr_dispatch_orders').insert(detail).select('*').single();
   if(result.error)throw Error(result.error.code==='23505'?'Already approved in Dispatch':result.error.message);
   const saved=adapter.saveApproved(companyId,id,result.data);
   if(!saved)actionMessage('Approved in the shared Dispatch queue, but local browser state could not be saved.');
   else actionMessage('Approved and moved to Dispatch');
   await delayedRefresh();
  }catch(error){actionMessage('Approval failed: '+error.message)}
  finally{button.disabled=false}
 }
 function openDispatch(id,readonly=false){
  const order=dispatchRows.find(item=>item.id===id);
  if(!order)return actionMessage('Dispatch record not found; refresh first');
  selectedDispatch=id;
  q('#gr-dispatch-editor-title').textContent=(readonly?'Dispatch details · ':'Update dispatch · ')+order.order_id;
  q('#gr-dispatch-editor-info').innerHTML='<p><strong>'+esc(order.customer_name||'Customer')+'</strong> · '+esc(order.product_name)+' · '+num(order.quantity)+' units</p><p>'+esc(adapter.companyLabel(order.company_id))+' · '+money(order.order_total)+' · '+esc(order.shipping_address||'Shipping address not recorded')+'</p>'+
   '<p>Approved: '+esc(new Date(order.approved_at).toLocaleString('en-IN'))+'</p>';
  for(const field of ['status','courier_name','tracking_number','tracking_url','dispatch_note']){
   const element=q('#gr-dispatch-editor-form').elements.namedItem(field);if(element)element.value=order[field]|| (field==='status'?'Pending':'');
   if(element)element.disabled=readonly;
  }
  q('#gr-dispatch-editor-form').querySelector('button[type="submit"]').hidden=readonly;
  q('#gr-dispatch-editor').showModal();
 }
 async function saveDispatch(event){
  event.preventDefault();if(!canDispatch)return actionMessage('Your role cannot update Dispatch');
  const current=dispatchRows.find(r=>r.id===selectedDispatch);
  if(!current)return actionMessage('Dispatch row missing');
  const form=event.currentTarget,values=Object.fromEntries(new FormData(form).entries());
  for(const key of Object.keys(values))values[key]=text(values[key]);
  if(!['Pending','Packed','Shipped','Delivered'].includes(values.status))return actionMessage('Invalid stage');
  const sequence=['Pending','Packed','Shipped','Delivered'];
  if(sequence.indexOf(values.status)<sequence.indexOf(current.status))return actionMessage('Cannot move a dispatched order backward');
  if(values.status==='Delivered'&&!['Shipped','Delivered'].includes(current.status))return actionMessage('Mark the order Shipped before Delivered');
  if(['Shipped','Delivered'].includes(values.status)&&(!values.courier_name||!values.tracking_number))return actionMessage('Courier name and tracking number are required to ship');
  if(values.tracking_url&&!safeUrl(values.tracking_url))return actionMessage('Use a valid http/https courier tracking URL');
  const payload={status:values.status,courier_name:values.courier_name||null,tracking_number:values.tracking_number||null,
   tracking_url:values.tracking_url||null,dispatch_note:values.dispatch_note||null,updated_at:new Date().toISOString()};
  if(values.status==='Shipped'&&!current.dispatched_at)payload.dispatched_at=new Date().toISOString();
  if(values.status==='Delivered'&&!current.delivered_at)payload.delivered_at=new Date().toISOString();
  const button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{
   const response=await db.from('gr_dispatch_orders').update(payload).eq('id',selectedDispatch).eq('status',current.status).select('*').single();
   if(response.error)throw Error(response.error.message);
   q('#gr-dispatch-editor').close();await delayedRefresh();actionMessage('Dispatch updated: '+values.status);
  }catch(error){actionMessage('Dispatch update failed: '+error.message)}
  finally{button.disabled=false}
 }
 function exportFiltered(){
  const cols=dataColumns.filter(([id])=>getSelectedColumns().includes(id));
  const rows=filteredSales();
  const heads=['Order date','Order ID','Platform order ID','Company','Customer','Email','Mobile','Product','Channel','Quantity','Approval','Sales status','Taxable','GST','Shipping','Total','Invoice'];
  const values=rows.map(s=>{const c=customer(s);return [s.date,orderId(s),s.order_id||'',companyName(s),customerName(s),c?.email||'',c?.mobile||'',productName(s),channelName(s),s.qty,approvalStatus(s),s.status,s.taxable,s.tax_amount,s.shipping_charge,s.total,s.invoice_number||'']});
  const csv=[heads,...values].map(row=>row.map(value=>{let v=String(value??'');if(/^[\s]*[=+@\-\t]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}).join(',')).join('\r\n');
  const link=document.createElement('a'),blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  link.href=URL.createObjectURL(blob);link.download='greenrich-filtered-orders-'+date()+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),2000);
  actionMessage('Exported '+rows.length+' filtered orders');
 }
 function connect(){
  q('#orders-columns-choices').addEventListener('change',e=>{
   const input=e.target.closest('[data-column]');if(!input)return;
   const keys=[...q('#orders-columns-choices').querySelectorAll('[data-column]:checked')].map(x=>x.dataset.column);
   if(!keys.length){input.checked=true;return actionMessage('At least one column must stay visible')}
   saveColumns(keys);renderSales();
  });
  q('#orders-columns-toggle').onclick=()=>{
   const panel=q('#orders-columns-panel');panel.hidden=!panel.hidden;
   q('#orders-columns-toggle').setAttribute('aria-expanded',String(!panel.hidden));
  };
  q('#orders-columns-default').onclick=()=>{saveColumns(defaults);renderColumns();renderSales()};
  q('#orders-reset').onclick=()=>{
   q('#orders-period').value='month';q('#orders-company').value='all';q('#orders-product').value='all';q('#sales-channel-filter').value='all';
   q('#orders-from').value='';q('#orders-to').value='';q('#sales-search').value='';renderSales();
  };
  ['orders-period','orders-company','sales-channel-filter','orders-product'].forEach(id=>q('#'+id).onchange=renderSales);
  ['orders-from','orders-to'].forEach(id=>q('#'+id).onchange=()=>{
   if(q('#orders-from').value||q('#orders-to').value)q('#orders-period').value='custom';renderSales();
  });
  q('#sales-search').oninput=renderSales;
  q('#orders-export').onclick=exportFiltered;
  q('#orders-scroll-left').onclick=()=>q('#orders-horizontal-scroll').scrollBy({left:-440,behavior:'smooth'});
  q('#orders-scroll-right').onclick=()=>q('#orders-horizontal-scroll').scrollBy({left:440,behavior:'smooth'});
  q('#dispatch-refresh').onclick=()=>void delayedRefresh().catch(e=>actionMessage(e.message));
  q('#dispatch-status-filter').onchange=renderDispatch;q('#dispatch-company-filter').onchange=renderDispatch;
  q('#dispatch-search').oninput=renderDispatch;
  q('#gr-customer-history-close').onclick=()=>q('#gr-customer-history-dialog').close();
  q('#gr-dispatch-editor-close').onclick=()=>q('#gr-dispatch-editor').close();
  q('#gr-dispatch-editor-form').onsubmit=saveDispatch;
  root.addEventListener('click',event=>{
   const approve=event.target.closest('[data-approve-order]');
   if(approve&&root.contains(approve)){void approveOrder(approve.dataset.approveOrder,approve.dataset.approveCompany,approve);return}
   const customerButton=event.target.closest('[data-customer-history]');
   if(customerButton&&root.contains(customerButton)){showCustomer(customerButton.dataset.customerHistory,customerButton.dataset.customerSale);return}
   const edit=event.target.closest('[data-dispatch-edit]');
   if(edit&&root.contains(edit)){openDispatch(edit.dataset.dispatchEdit);return}
   const details=event.target.closest('[data-dispatch-details]');
   if(details&&root.contains(details)){openDispatch(details.dataset.dispatchDetails,true)}
  });
 }
 async function mount(container,{client,companies,approve,dispatch,source}){
  root=container;db=client;adapter=source;allowed=[...new Set(companies||[])];canApprove=Boolean(approve);canDispatch=Boolean(dispatch);
  if(!root||!db||!allowed.length)throw Error('Sales operations requires company access and a signed-in session');
  fill('#dispatch-company-filter','All assigned companies',allowed.map(id=>[id,adapter.companyLabel(id)]),false);
  renderColumns();connect();
  try{await delayedRefresh()}catch(error){actionMessage(error.message);renderSales();renderDispatch()}
 }
 window.GreenRichSalesOps={mount,renderSales,renderDispatch,getDispatchRows:()=>dispatchRows.slice(),refresh:delayedRefresh,filterPeriod,isApproved:(companyId,id)=>dispatchRows.some(r=>r.company_id===companyId&&r.source_sale_id===id)};
})();
