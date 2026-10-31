'use strict';
(()=>{
let root=null,allowedTabs=[],adminMode=false,allowDashboardExport=false,allowInvoiceIssue=false,contactCapabilities={},pipelineConfig={};
const $=s=>root?.querySelector(s), all=s=>root?[...root.querySelectorAll(s)]:[], legacyKey='greenrich-crm-v2';
let activeCompany='grow-india',activeCompanyName='GreenRich Grow India Pvt Ltd',companyScope='grow-india',permittedCompanies=['grow-india'];
const storageKey=()=>activeCompany==='grow-india'?legacyKey:legacyKey+'::'+activeCompany;
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const date=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n)||0);
const num=n=>new Intl.NumberFormat('en-IN').format(Number(n)||0);
const round=n=>Math.round((Number(n)||0)*100)/100;
const initial=()=>({version:4,orderSequence:0,invoiceSequences:{},tags:[],products:[],channels:[{id:uid(),name:'Amazon',type:'Marketplace',active:true},{id:uid(),name:'Flipkart',type:'Marketplace',active:true},{id:uid(),name:'Website',type:'E-commerce',active:true}],customers:[],leads:[],tasks:[],sales:[]});
let data;try{data=JSON.parse(localStorage.getItem(storageKey()))||initial();if(!['sales','products','channels','customers','leads','tasks'].every(k=>Array.isArray(data[k])))throw Error('Invalid database')}catch{data=initial()}
let page='dashboard',editId='',editing='',charts=[],currentCustomerId='',currentSourceSaleId='';
const persist=()=>saveCompanyData(activeCompany,data);
const toast=(s,type)=>window.GreenRichNotify?.(s,type);
const scopedCompanyIds=()=>companyScope==='all'?permittedCompanies:[companyScope];
const scopeRows=k=>k==='customers'?data.customers:scopedCompanyIds().flatMap(companyId=>loadCompanyData(companyId)[k].map(row=>({...row,_companyId:companyId})));
const ownerOf=(k,id)=>k==='customers'?activeCompany:(scopedCompanyIds().find(companyId=>loadCompanyData(companyId)[k].some(row=>row.id===id))||'');
const find=(k,id)=>k==='customers'?data.customers.find(x=>x.id===id):scopeRows(k).find(x=>x.id===id);
const nameOf=(k,id)=>find(k,id)?.name||find(k,id)?.title||'—';
const safeN=n=>Number.isFinite(Number(n))?Number(n):0;
const getCalc=(qty,price,tax,inclusive)=>{qty=safeN(qty);price=safeN(price);tax=safeN(tax);let gross=qty*price;let base=inclusive?gross/(1+tax/100):gross;let gst=inclusive?gross-base:base*tax/100;return {base:round(base),gst:round(gst),total:round(base+gst)}};
const saleGross=s=>Number(s.total)||0;
const companyChoices=[{id:'grow-india',name:'GreenRich Grow India Pvt Ltd'},{id:'enviro-solutions',name:'GreenRich Enviro Solutions Pvt Ltd'}];
const companyLabel=id=>window.GreenRichCompanies?.list?.().find(c=>c.id===id)?.name||companyChoices.find(c=>c.id===id)?.name||'Unknown company';
const companyStorage=id=>id==='grow-india'?legacyKey:legacyKey+'::'+id;
function ensureCRMData(store){if(!Array.isArray(store.tags))store.tags=[];if(!Number.isInteger(store.orderSequence)||store.orderSequence<0)store.orderSequence=0;if(!store.invoiceSequences||typeof store.invoiceSequences!=='object')store.invoiceSequences={};return store}
function attachSharedCustomers(store){const shared=window.GreenRichSharedCustomers?.snapshot();if(shared){store.customers=shared.customers;store.tags=shared.tags}return ensureCRMData(store)}
function loadCompanyData(id){if(id===activeCompany)return attachSharedCustomers(data);let parsed;try{parsed=JSON.parse(localStorage.getItem(companyStorage(id))||'null')||initial()}catch{parsed=initial()}return attachSharedCustomers(parsed)}
function saveCompanyData(id,copy){
 try{
  const previous=JSON.parse(localStorage.getItem(companyStorage(id))||'null')||initial();
  if(!window.GreenRichCRMCloud)throw Error('Cloud synchronization service unavailable');
  localStorage.setItem(companyStorage(id),JSON.stringify(copy));
  if(id===activeCompany)data=copy;
  void window.GreenRichCRMCloud.commit(id,previous,copy).catch(error=>
   toast('CRM cloud save failed: '+error.message+'. Your data is still in this browser; do not clear its storage.'));
  return true;
 }catch(error){toast('Could not save CRM: '+error.message);return false}
}
const editorData=()=>loadCompanyData($('#f-company_id')?.value||activeCompany);
const cleanPhone=v=>{const x=String(v||'').replace(/\D/g,'');return x.length>10?x.slice(-10):x};
const consumesStock=s=>!['Cancelled','Returned'].includes(s.status);
function validateCustomer(store,person,ignore){
 const email=String(person.email||'').trim().toLowerCase();
 const mobile=cleanPhone(person.mobile),mobile2=cleanPhone(person.mobile2);
 if(!String(person.name||'').trim()||!String(person.address1||'').trim()||!email||!mobile)return 'Customer name, email, address and primary mobile are required.';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return 'Enter a valid customer email address.';
 if(mobile.length!==10||(person.mobile2&&mobile2.length!==10))return 'Enter valid 10-digit mobile numbers.';
 if(mobile2&&mobile2===mobile)return 'The two mobile numbers must be different.';
 if(store.customers.some(c=>c.id!==ignore&&(String(c.email||'').trim().toLowerCase()===email||[cleanPhone(c.mobile),cleanPhone(c.mobile2)].filter(x=>x.length===10).some(p=>p===mobile||p===mobile2))))return 'Duplicate customer: email or mobile number already exists. Select the existing customer instead.';
 return '';
}
const tagChecks=(store,name,chosen)=>'<div class="gr-tag-picks">'+(store.tags.length?store.tags.map(t=>'<label><input type="checkbox" name="'+esc(name)+'" value="'+esc(t.id)+'" '+(chosen.includes(t.id)?'checked':'')+'><span>'+esc(t.name)+'</span></label>').join(''):'<span class="gr-crm-help">No tags available. An Admin can create tags in Settings → Customer Tags.</span>')+'</div>';
function nextOrderId(store,companyId){
 const prefix=companyId==='enviro-solutions'?'GRE-ES-':'GRE-GI-';
 const last=Math.max(store.orderSequence||0,...store.sales.filter(s=>String(s.internal_order_id||'').startsWith(prefix)).map(s=>Number(s.internal_order_id.slice(prefix.length))||0));
 store.orderSequence=last+1;return prefix+String(store.orderSequence).padStart(6,'0');
}
function peekOrderId(store,companyId){
 const copy={orderSequence:store.orderSequence||0,sales:store.sales};
 return nextOrderId(copy,companyId);
}

function channelName(s){return s.channel_name||nameOf('channels',s.channel_id)}
function productName(s){return s.product_name||nameOf('products',s.product_id)}
function customerName(s){return s.customer_name||nameOf('customers',s.customer_id)}
function el(tag,props={}){let e=document.createElement(tag);Object.entries(props).forEach(([k,v])=>k==='text'?e.textContent=v:e.setAttribute(k,v));return e}
const titles={dashboard:['Overview','Your sales, customers and growth in one place.','+ Add Sale','sales'],sales:['Sales Orders','Track sales orders across every channel and calculate GST.','+ Add Sale','sales'],customers:['Customers','Maintain complete customer contact and address records.','+ Add Customer','customers'],leads:['Leads & CRM','Assigned leads · New → Contacted → Qualified → Quotation → Won / Lost','+ Add Lead','leads'],tasks:['Follow-ups','Manage daily reminders and customer follow-ups.','+ Add Follow-up','tasks'],products:['Product Master','Set a default price and GST for every product.','+ Add Product','products'],channels:['Sales Channels','Add marketplaces, distributors and new sales sources.','+ Add Channel','channels'],dispatch:['Dispatch','Approved orders, packing and courier tracking.','Dispatch queue','sales'],reports:['Import & Export','Import Excel, export reports and back up your records.','+ Add Sale','sales']};
function navigate(p){if(!allowedTabs.includes(p))return;page=p;all('.page').forEach(x=>x.classList.toggle('active',x.id===p));all('#navigation button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===p));$('#page-heading').textContent=titles[p][0];$('#page-subtitle').textContent=titles[p][1];$('#primary-action').textContent=titles[p][2];$('#primary-action').hidden=p==='reports'||p==='dispatch'||p==='customers'||p==='leads'||(adminMode&&p==='dashboard');render();root?.scrollIntoView({block:'start'})}
function fillSelect(sel,rows,emptyLabel='None'){let old=sel.value;sel.replaceChildren();sel.append(el('option',{value:'',text:emptyLabel}));rows.forEach(r=>sel.append(el('option',{value:r.id,text:r.name||r.title})));if([...sel.options].some(o=>o.value===old))sel.value=old}

function channelFilters(){
 const selector=$('#sales-channel-filter');
 if(!selector)return;
 const selected=selector.value;
 selector.replaceChildren(el('option',{value:'all',text:'All channels'}));
 scopeRows('channels').forEach(c=>selector.append(el('option',{value:c.id,text:c.name+' · '+companyLabel(c._companyId)})));
 if([...selector.options].some(o=>o.value===selected))selector.value=selected;
}
const companyForSale=s=>s._companyId||s.company_id||activeCompany;
const overviewSales=()=>scopedCompanyIds().flatMap(companyId=>loadCompanyData(companyId).sales.map(s=>({...s,_companyId:companyId})));
const channelForSale=s=>s.channel_name||loadCompanyData(companyForSale(s)).channels.find(c=>c.id===s.channel_id)?.name||'Unknown channel';
const productForSale=s=>s.product_name||loadCompanyData(companyForSale(s)).products.find(p=>p.id===s.product_id)?.name||'Unknown product';
const customerForSale=s=>data.customers.find(c=>c.id===s.customer_id)?.name||s.customer_name||'Unknown customer';
const productKey=s=>companyForSale(s)+'|'+(s.product_id||s.product_name||s.id);
const palette=['#2058d8','#5c83f1','#14a5ab','#f6a13e','#9068dd','#ef6b8f','#2d966f','#6e8097'];
const currencyShort=n=>{
 const amount=Number(n)||0;
 return amount>=10000000?'₹'+(amount/10000000).toFixed(1)+'Cr':amount>=100000?'₹'+(amount/100000).toFixed(1)+'L':amount>=1000?'₹'+(amount/1000).toFixed(1)+'k':fmt(amount)
};
const sortedPairs=object=>Object.entries(object).sort((a,b)=>Number(b[1])-Number(a[1]));
function setOverviewOptions(id,items){
 const select=$(id);if(!select)return;
 const selected=select.value;
 select.replaceChildren(el('option',{value:'all',text:items.label}));
 items.values.forEach(item=>select.append(el('option',{value:item.value,text:item.text})));
 if([...select.options].some(option=>option.value===selected))select.value=selected;
}
function overviewFilterOptions(){
 const company=$('#filter-company')?.value||'all';
 setOverviewOptions('#filter-company',{label:'Both companies',values:companyChoices.filter(c=>scopedCompanyIds().includes(c.id)).map(c=>({value:c.id,text:companyLabel(c.id)}))});
 if(companyScope!=='all'){$('#filter-company').value=companyScope;$('#filter-company').disabled=true}else $('#filter-company').disabled=false;
 const customerList=[...data.customers].sort((a,b)=>a.name.localeCompare(b.name));
 setOverviewOptions('#filter-customer',{label:'All customers',values:customerList.map(c=>({value:c.id,text:c.name+(c.mobile?' · '+c.mobile:'')}))});
 const stores=companyChoices.filter(c=>scopedCompanyIds().includes(c.id)&&(company==='all'||company===c.id)).map(c=>({id:c.id,store:loadCompanyData(c.id)}));
 const sales=stores.flatMap(c=>c.store.sales.map(s=>({...s,_companyId:c.id})));
 const channels=new Set(stores.flatMap(c=>c.store.channels.map(ch=>ch.name)).concat(sales.map(channelForSale)));
 setOverviewOptions('#filter-channel',{label:'All channels',values:[...channels].filter(Boolean).sort((a,b)=>a.localeCompare(b)).map(c=>({value:c,text:c}))});
 const products=new Map();
 for(const entry of stores){
  for(const p of entry.store.products)products.set(entry.id+'|'+p.id,{value:entry.id+'|'+p.id,text:p.name+' · '+companyLabel(entry.id)});
 }
 for(const s of sales){
  const key=productKey(s);
  if(!products.has(key))products.set(key,{value:key,text:productForSale(s)+' · '+companyLabel(companyForSale(s))});
 }
 setOverviewOptions('#filter-product',{label:'All products',values:[...products.values()].sort((a,b)=>a.text.localeCompare(b.text))});
}
function inPeriod(s){
 const p=$('#period').value,d=s.date,now=new Date();
 if(p==='all')return true;
 if(p==='custom')return (!$('#filter-from').value||d>=$('#filter-from').value)&&(!$('#filter-to').value||d<=$('#filter-to').value);
 if(p==='today')return d===date();
 if(p==='month')return d.slice(0,7)===date().slice(0,7);
 if(p==='week'){
  const start=new Date(now);start.setDate(now.getDate()-((now.getDay()+6)%7));
  const from=start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0')+'-'+String(start.getDate()).padStart(2,'0');
  return d>=from&&d<=date();
 }
 if(p==='last30'){
  const start=new Date(now);start.setDate(now.getDate()-29);
  const from=start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0')+'-'+String(start.getDate()).padStart(2,'0');
  return d>=from&&d<=date();
 }
 return true;
}
function filteredSales(){
 const company=$('#filter-company')?.value||'all',channel=$('#filter-channel')?.value||'all';
 const customer=$('#filter-customer')?.value||'all',product=$('#filter-product')?.value||'all';
 return overviewSales().filter(s=>inPeriod(s)
  &&(company==='all'||companyForSale(s)===company)
  &&(channel==='all'||channelForSale(s)===channel)
  &&(customer==='all'||s.customer_id===customer)
  &&(product==='all'||productKey(s)===product));
}
function overviewStats(rows){
 const channels={},companies=Object.fromEntries(companyChoices.filter(c=>scopedCompanyIds().includes(c.id)).map(c=>[c.id,0])),products=new Map(),byDate={};
 let total=0,tax=0,qty=0;
 for(const sale of rows){
  const amount=saleGross(sale),count=Number(sale.qty)||0,name=channelForSale(sale),id=companyForSale(sale),key=productKey(sale);
  total+=amount;tax+=Number(sale.tax_amount)||0;qty+=count;
  byDate[sale.date]=(byDate[sale.date]||0)+amount;
  channels[name]=(channels[name]||0)+amount;
  companies[id]=(companies[id]||0)+amount;
  const item=products.get(key)||{key,name:productForSale(sale),companyId:id,revenue:0,qty:0,orders:0};
  item.revenue+=amount;item.qty+=count;item.orders++;products.set(key,item);
 }
 return {total,tax,qty,orders:new Set(rows.map(s=>s.internal_order_id||companyForSale(s)+'|'+s.id)).size,
  byDate,channels,companies,products:[...products.values()].sort((a,b)=>b.revenue-a.revenue)};
}
const progressMarkup=(items,max,unit)=>{
 if(!items.length)return '<p class="empty">No sales for the selected filters</p>';
 return items.map(([name,value],index)=>{
  const percentage=max>0?(Number(value)/max*100):0;
  return '<div class="gr-progress-item"><div class="gr-progress-info"><span>'+esc(name)+'</span><strong>'+fmt(value)+'</strong></div>'+
   '<div class="gr-progress-track"><div class="gr-progress-bar" style="width:'+percentage.toFixed(2)+'%;background:'+palette[index%palette.length]+'"></div></div>'+
   '<small>'+percentage.toFixed(1)+'% '+unit+'</small></div>';
 }).join('');
};
function renderDashboard(){
 overviewFilterOptions();
 const rows=filteredSales(),stats=overviewStats(rows),total=stats.total;
 $('#filter-context').textContent=rows.length+' sale line(s) · '+stats.orders+' orders · '+($('#filter-company').selectedOptions[0]?.textContent||'Both companies')+
  ' · '+($('#period').selectedOptions[0]?.textContent||'This month')+
  (rows.length?' · Updated from available records in this browser':' · No matching records');
 $('#metrics').innerHTML=[
  ['Total revenue',fmt(stats.total),'₹','Sales including GST and shipping'],
  ['Orders',num(stats.orders),'▤','Orders in selected filters'],
  ['Units sold',num(stats.qty),'◈','Products ordered'],
  ['Tax collected',fmt(stats.tax),'%','Calculated GST amount']
 ].map(x=>'<div class="metric"><span class="badge">'+x[2]+'</span><small>'+x[0]+'</small><strong>'+x[1]+'</strong><small>'+x[3]+'</small></div>').join('');
 charts.forEach(chart=>{try{chart.destroy()}catch(_){}});charts=[];
 const days=Object.keys(stats.byDate).sort(),channelPairs=sortedPairs(stats.channels),totalChannels=channelPairs.reduce((n,row)=>n+row[1],0);
 const channelQuantity=name=>rows.filter(s=>channelForSale(s)===name).reduce((n,s)=>n+(Number(s.qty)||0),0);
 const channelOrderCount=name=>new Set(rows.filter(s=>channelForSale(s)===name).map(s=>s.internal_order_id||companyForSale(s)+'|'+s.id)).size;
 $('#channel-breakdown').innerHTML=channelPairs.length?channelPairs.map(([name,amount],index)=>
  '<button type="button" class="gr-channel-row" data-channel-drill="'+esc(name)+'" aria-label="View '+esc(name)+' channel orders, products and customers">'+
  '<span class="gr-channel-name"><span class="gr-legend-swatch" style="background:'+palette[index%palette.length]+'"></span><span class="gr-channel-name-text">'+esc(name)+' · '+(totalChannels?((amount/totalChannels)*100).toFixed(1):0)+'%</span></span>'+
  '<span class="gr-channel-qty">'+num(channelQuantity(name))+' units <small>('+num(channelOrderCount(name))+' orders)</small></span>'+
  '<strong class="gr-channel-value">'+fmt(amount)+'</strong></button>'
 ).join(''):'<p class="empty">No channels in this period</p>';
 const avgOrderValue=stats.orders?round(stats.total/stats.orders):0;
 const buyerOrders=new Map();
 rows.filter(s=>s.customer_id).forEach(s=>{
  const orderId=s.internal_order_id||companyForSale(s)+'|'+s.id;
  if(!buyerOrders.has(s.customer_id))buyerOrders.set(s.customer_id,new Set());
  buyerOrders.get(s.customer_id).add(orderId);
 });
 const repeatBuyers=[...buyerOrders.values()].filter(orders=>orders.size>1).length;
 const pendingOrders=new Set(rows.filter(s=>s.status==='Pending').map(s=>s.internal_order_id||companyForSale(s)+'|'+s.id)).size;
 const peakDay=sortedPairs(stats.byDate)[0];
 $('#sales-insights').innerHTML=[
  ['Average order value',fmt(avgOrderValue),'Sales value ÷ number of orders'],
  ['Repeat customers',num(repeatBuyers),'Customers with 2+ orders in this period'],
  ['Pending orders',num(pendingOrders),'Orders currently awaiting completion'],
  ['Highest sales day',peakDay?esc(peakDay[0]):'—',peakDay?fmt(peakDay[1])+' revenue':'No sales in selected period']
 ].map(item=>'<div class="gr-insight-item"><span class="gr-insight-title">'+item[0]+'</span><strong>'+item[1]+'</strong><small>'+item[2]+'</small></div>').join('');
 const companyPairs=companyChoices.filter(c=>scopedCompanyIds().includes(c.id)).map(c=>[companyLabel(c.id),stats.companies[c.id]||0]);
 $('#company-comparison').innerHTML=progressMarkup(companyPairs,Math.max(0,...companyPairs.map(x=>x[1])),'of leading company');
 const top=stats.products.slice(0,8);
 $('#top-products').innerHTML=top.length?'<div class="gr-top-products-head"><span>Product</span><span>Revenue</span><span>Order quantity</span></div>'+
  top.map(p=>'<div class="gr-top-product"><div><strong>'+esc(p.name)+'</strong><small>'+esc(companyLabel(p.companyId))+' · '+p.orders+' sale line(s)</small><div class="gr-product-bar-track"><div class="gr-product-bar" style="width:'+(stats.products[0].revenue?100*p.revenue/stats.products[0].revenue:0).toFixed(1)+'%"></div></div></div><strong class="gr-product-revenue">'+fmt(p.revenue)+'</strong><button type="button" class="gr-quantity-drill" data-product-drill="'+esc(p.key)+'" title="View customers and orders for '+esc(p.name)+'">'+num(p.qty)+' units ↗</button></div>').join(''):'<p class="empty">No products for the selected filters</p>';
 const open=data.tasks.filter(t=>t.status!=='Done').length;
 $('#crm-overview').innerHTML='<div class="mini-row"><span>Shared customers</span><strong>'+num(data.customers.length)+'</strong></div>'+
  '<div class="mini-row"><span>Active leads in current company</span><strong>'+num(data.leads.filter(l=>!['Won','Lost'].includes(l.stage)).length)+'</strong></div>'+
  '<div class="mini-row"><span>Open follow-ups in current company</span><strong>'+num(open)+'</strong></div>'+
  '<div class="mini-row"><span>Overdue follow-ups in current company</span><strong>'+num(data.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<date()).length)+'</strong></div>';
 if(window.Chart){
  const labelPlugin={id:'grVisibleValues',afterDatasetsDraw(chart){
   if(chart.canvas?.id!=='trend-chart')return;
   const chartCtx=chart.ctx;chartCtx.save();chartCtx.textAlign='center';chartCtx.font='600 10px Inter, sans-serif';chartCtx.fillStyle='#173f91';
   const step=Math.max(1,Math.ceil(days.length/9));
   chart.getDatasetMeta(0).data.forEach((point,index)=>{if(index%step===0||index===days.length-1)chartCtx.fillText(currencyShort(stats.byDate[days[index]]),point.x,Math.max(chart.chartArea.top+12,point.y-10))});
   chartCtx.restore();
  }};
  charts.push(new Chart($('#trend-chart'),{
   type:'line',data:{labels:days,datasets:[{label:'Revenue (₹)',data:days.map(d=>stats.byDate[d]),borderColor:'#2058d8',backgroundColor:'#e4eaff',fill:true,tension:.25,pointRadius:days.length>15?2:4,pointHoverRadius:5}]},
   options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:22,right:10}},plugins:{legend:{display:false},tooltip:{enabled:true}},scales:{y:{beginAtZero:true,ticks:{callback:v=>currencyShort(v)}},x:{ticks:{maxTicksLimit:8}}}},
   plugins:[labelPlugin]
  }));
  charts.push(new Chart($('#channel-chart'),{
   type:'doughnut',data:{labels:channelPairs.length?channelPairs.map(c=>c[0]):['No sales'],
    datasets:[{data:channelPairs.length?channelPairs.map(c=>c[1]):[1],backgroundColor:channelPairs.length?channelPairs.map((_,i)=>palette[i%palette.length]):['#e4eaf3'],borderWidth:0}]},
   options:{responsive:true,maintainAspectRatio:false,cutout:'68%',onClick:(_event,elements)=>{if(elements.length&&channelPairs[elements[0].index])showChannelOrders(channelPairs[elements[0].index][0])},plugins:{legend:{display:false},tooltip:{enabled:true}}}
  }));
 }
 $('#trend-values').innerHTML=days.length?'<div class="gr-visible-legend-row"><span>First sale: '+esc(days[0])+' · Last sale: '+esc(days[days.length-1])+'</span><strong>'+fmt(total)+'</strong></div>':'<p class="empty">No sales to chart in this period</p>';
}
function showProductOrders(key){
 const rows=filteredSales().filter(s=>productKey(s)===key);
 if(!rows.length)return toast('No matching orders for this product');
 const name=productForSale(rows[0]),amount=rows.reduce((n,s)=>n+saleGross(s),0),qty=rows.reduce((n,s)=>n+Number(s.qty||0),0);
 const byCustomer=new Map();
 for(const s of rows){
  const id=s.customer_id||'unknown:'+customerForSale(s),person=data.customers.find(c=>c.id===s.customer_id),label=customerForSale(s);
  const item=byCustomer.get(id)||{label,person,qty:0,revenue:0,orders:0};
  item.qty+=Number(s.qty)||0;item.revenue+=saleGross(s);item.orders++;byCustomer.set(id,item);
 }
 const list=[...byCustomer.values()].sort((a,b)=>b.qty-a.qty),max=Math.max(0,...list.map(x=>x.qty));
 $('#product-orders-title').textContent=name+' · Customer orders';
 $('#product-orders-subtitle').textContent=companyLabel(companyForSale(rows[0]))+' · Based on the current dashboard filters';
 $('#product-orders-details').innerHTML='<div class="gr-product-order-meta"><span><strong>'+num(qty)+'</strong> units ordered</span><span><strong>'+num(rows.length)+'</strong> sale lines</span><span><strong>'+num(list.length)+'</strong> customers</span><span><strong>'+fmt(amount)+'</strong> revenue</span></div>'+
  '<h3>Quantity ordered by customer</h3><div class="gr-customer-orders">'+list.map((item,index)=>'<div class="gr-customer-order"><div><strong>'+esc(item.label)+'</strong><span>'+num(item.qty)+' units · '+fmt(item.revenue)+'</span></div><div class="gr-progress-track"><div class="gr-progress-bar" style="width:'+(max?100*item.qty/max:0).toFixed(1)+'%;background:'+palette[index%palette.length]+'"></div></div></div>').join('')+'</div>'+
  '<h3>Customer order details</h3><div class="gr-order-table-wrap"><table><thead><tr><th>Order date / ID</th><th>Customer</th><th>Phone / Email</th><th>Company</th><th>Quantity</th><th>Sale value</th></tr></thead><tbody>'+
  rows.map(s=>{const person=data.customers.find(c=>c.id===s.customer_id);return '<tr><td><strong>'+esc(s.date)+'</strong><small>'+esc(s.internal_order_id||s.order_id||'—')+'</small></td><td><strong>'+esc(customerForSale(s))+'</strong><small>'+esc(person?.address1||'')+'</small></td><td>'+esc(person?.mobile||'—')+'<small>'+esc(person?.email||'—')+'</small></td><td>'+esc(companyLabel(companyForSale(s)))+'</td><td>'+num(s.qty)+'</td><td>'+fmt(saleGross(s))+'</td></tr>'}).join('')+'</tbody></table></div>';
 $('#product-orders-dialog').showModal();
}



function showChannelOrders(name){
 const rows=filteredSales().filter(s=>channelForSale(s)===name).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 if(!rows.length)return toast('No channel orders match the selected filters.');
 const units=rows.reduce((n,s)=>n+(Number(s.qty)||0),0);
 const revenue=rows.reduce((n,s)=>n+saleGross(s),0);
 const orderKeys=new Set(rows.map(s=>s.internal_order_id||companyForSale(s)+'|'+s.id));
 const customerKeys=new Set(rows.filter(s=>s.customer_id).map(s=>s.customer_id));
 const products=new Map(),customers=new Map();
 for(const s of rows){
  const product=productKey(s),item=products.get(product)||{name:productForSale(s),company:companyLabel(companyForSale(s)),qty:0,revenue:0};
  item.qty+=Number(s.qty)||0;item.revenue+=saleGross(s);products.set(product,item);
  const key=s.customer_id||'unlinked:'+customerForSale(s);
  const person=data.customers.find(c=>c.id===s.customer_id);
  const customer=customers.get(key)||{name:customerForSale(s),phone:person?.mobile||'Not recorded',email:person?.email||'Not recorded',qty:0,revenue:0,orders:new Set()};
  customer.qty+=Number(s.qty)||0;customer.revenue+=saleGross(s);
  customer.orders.add(s.internal_order_id||companyForSale(s)+'|'+s.id);customers.set(key,customer);
 }
 const dialog=$('#channel-orders-dialog');
 $('#channel-orders-title').textContent=name+' · Sales channel details';
 $('#channel-orders-subtitle').textContent='Based on the current date, customer, product and company filters';
 const summary=[['Sales revenue',fmt(revenue)],['Order quantity',num(units)+' units'],['Orders',num(orderKeys.size)],['Customers',num(customerKeys.size)]];
 const productRows=[...products.values()].sort((a,b)=>b.revenue-a.revenue);
 const customerRows=[...customers.values()].sort((a,b)=>b.revenue-a.revenue);
 const asText=value=>value===undefined||value===null||String(value).trim()===''?'Not recorded':String(value);
 // Invoice fields are not currently part of the Add Sale form. Only show real stored values.
 const invoiceNumber=s=>asText(s.invoice_number||s.invoice_no||s.invoice_id);
 const tableRows=rows.map(s=>{
  const person=data.customers.find(c=>c.id===s.customer_id);
  const address=[person?.address1,person?.address2,person?.city,person?.state,person?.pincode].filter(Boolean).join(', ');
  return '<tr><td><strong>'+esc(asText(s.date))+'</strong><small>Internal: '+esc(asText(s.internal_order_id))+'</small><small>Platform: '+esc(asText(s.order_id))+'</small><small>Status: '+esc(asText(s.status))+'</small></td>'+
   '<td><strong>'+esc(customerForSale(s))+'</strong><small>'+esc(asText(person?.mobile))+'</small><small>'+esc(asText(person?.mobile2))+' · '+esc(asText(person?.email))+'</small><small>'+esc(asText(address))+'</small></td>'+
   '<td><strong>'+esc(productForSale(s))+'</strong><small>SKU: '+esc(asText(s.sku))+'</small><small>Company: '+esc(companyLabel(companyForSale(s)))+'</small><small>Quantity: '+num(s.qty)+' · Unit price: '+fmt(s.unit_price)+'</small></td>'+
   '<td><strong>'+num(s.qty)+' units</strong><small>Taxable: '+fmt(s.taxable)+'</small><small>GST ('+esc(asText(s.tax_rate))+'%): '+fmt(s.tax_amount)+'</small><small>Shipping: '+fmt(s.shipping_charge||0)+'</small><small>Tax '+(s.inclusive?'inclusive':'exclusive')+'</small></td>'+
   '<td><strong>'+fmt(saleGross(s))+'</strong><small>Invoice #: '+esc(invoiceNumber(s))+'</small><small>Invoice date: '+esc(asText(s.invoice_date))+'</small><small>Invoice status: '+esc(asText(s.invoice_status))+'</small><small>Invoice value: '+(s.invoice_total!=null&&s.invoice_total!==''?fmt(s.invoice_total):'Not recorded')+'</small><small>Invoice document: '+esc(asText(s.invoice_document_name||s.invoice_url?'Linked':'Not linked'))+'</small><small>Customer GSTIN: '+esc(asText(person?.gstin))+'</small><small>Notes: '+esc(asText(s.notes))+'</small></td></tr>';
 }).join('');
 const renderBreakdown=(items,type)=>items.length?'<div class="gr-channel-subtable">'+items.map(item=>'<div class="gr-channel-subrow"><span>'+esc(item.name)+(type==='product'?'<small> · '+esc(item.company)+'</small>':'<small> · '+esc(item.phone)+' · '+esc(item.email)+' · '+item.orders.size+' orders</small>')+'</span><span>'+num(item.qty)+' units</span><strong>'+fmt(item.revenue)+'</strong></div>').join('')+'</div>':'<p>No linked '+type+' records.</p>';
 $('#channel-orders-details').innerHTML=
  '<div class="gr-channel-detail-summary">'+summary.map(x=>'<div><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('')+'</div>'+
  '<h3>Products sold through '+esc(name)+'</h3>'+renderBreakdown(productRows,'product')+
  '<h3>Customers who ordered</h3>'+renderBreakdown(customerRows,'customer')+
  '<h3>All matching sales / order / invoice details</h3>'+
  '<p class="gr-channel-hint">Invoice number and document details appear only when stored in the sale record. GreenRich ONE does not currently generate invoices in this screen.</p>'+
  '<div class="gr-channel-table-wrap"><table><thead><tr><th>Order / Status</th><th>Customer / Contact / Address</th><th>Product / Company</th><th>Quantity / Tax / Shipping</th><th>Sale / Invoice / Notes</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>';
 dialog.showModal();
}

const reportFilename=()=>('greenrich-sales-overview-'+date());
const safeExcel=v=>typeof v==='string'&&/^[\s]*[=+@-]/.test(v)?"'"+v:v;
const summaryForExcel=(rows,stats)=>{
 const names=[
  ['Report','GreenRich ONE · Sales & CRM Overview'],
  ['Generated on',new Date().toLocaleString('en-IN')],
  ['Period',$('#period').selectedOptions[0]?.textContent||''],
  ['From',$('#filter-from').value||'—'],
  ['To',$('#filter-to').value||'—'],
  ['Company',$('#filter-company').selectedOptions[0]?.textContent||'Both companies'],
  ['Channel',$('#filter-channel').selectedOptions[0]?.textContent||'All channels'],
  ['Customer',$('#filter-customer').selectedOptions[0]?.textContent||'All customers'],
  ['Product',$('#filter-product').selectedOptions[0]?.textContent||'All products'],
  ['Sales lines',rows.length],
  ['Orders',stats.orders],
  ['Units sold',stats.qty],
  ['Sales revenue (INR)',round(stats.total)],
  ['Tax collected (INR)',round(stats.tax)]
 ];return names;
};
const ensureLibrary=(url,available)=>new Promise((resolve,reject)=>{
 if(available())return resolve();
 const script=document.createElement('script');
 script.src=url;script.async=true;
 script.onload=()=>available()?resolve():reject(Error('The report library did not load. Try again with an internet connection.'));
 script.onerror=()=>reject(Error('Unable to load the report library. Check your internet connection.'));
 document.head.appendChild(script);
});
const runExport=async(button,fn)=>{
 if(!allowDashboardExport)return toast('Your role does not have permission to export Sales reports.');
 if(button.disabled)return;
 button.disabled=true;const label=button.textContent;button.textContent='Preparing report...';
 try{await fn()}catch(error){console.error('Sales export failed:',error);toast('Export failed: '+error.message)}
 finally{button.disabled=false;button.textContent=label}
};
async function exportOverviewExcel(){
 await ensureLibrary('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',()=>!!window.XLSX);
 const rows=filteredSales(),stats=overviewStats(rows),book=window.XLSX.utils.book_new();
 const createSheet=(name,headers,records)=>{
  const cells=[headers,...records.map(item=>headers.map(h=>safeExcel(item[h]??'')))];
  const sheet=window.XLSX.utils.aoa_to_sheet(cells);
  sheet['!cols']=headers.map(h=>({wch:Math.min(48,Math.max(15,h.length+5))}));
  window.XLSX.utils.book_append_sheet(book,sheet,name);
 };
 const sheet=window.XLSX.utils.aoa_to_sheet(summaryForExcel(rows,stats));
 sheet['!cols']=[{wch:29},{wch:52}];window.XLSX.utils.book_append_sheet(book,sheet,'Report Summary');
 const sales=rows.map(s=>({
  'Date':s.date,'Company':companyLabel(companyForSale(s)),
  'Internal Order ID':s.internal_order_id||'Legacy','Platform Order ID':s.order_id||'',
  'Sales Channel':channelForSale(s),'Customer':customerForSale(s),
  'Customer Phone':data.customers.find(c=>c.id===s.customer_id)?.mobile||'',
  'Customer Email':data.customers.find(c=>c.id===s.customer_id)?.email||'',
  'Product':productForSale(s),'SKU':s.sku||'','Quantity':Number(s.qty)||0,
  'Unit Price (INR)':Number(s.unit_price)||0,'GST (%)':Number(s.tax_rate)||0,
  'Taxable (INR)':Number(s.taxable)||0,'GST Amount (INR)':Number(s.tax_amount)||0,
  'Shipping (INR)':Number(s.shipping_charge)||0,'Total (INR)':saleGross(s),
  'Order Status':s.status||'','Notes':s.notes||''
 }));
 const headers=['Date','Company','Internal Order ID','Platform Order ID','Sales Channel','Customer','Customer Phone','Customer Email','Product','SKU','Quantity','Unit Price (INR)','GST (%)','Taxable (INR)','GST Amount (INR)','Shipping (INR)','Total (INR)','Order Status','Notes'];
 createSheet('Filtered Sales',headers,sales);
 createSheet('Sales Channels',['Channel','Revenue (INR)','Share (%)'],sortedPairs(stats.channels).map(([name,value])=>({
  'Channel':name,'Revenue (INR)':round(value),'Share (%)':stats.total?round(value/stats.total*100):0
 })));
 createSheet('Companies',['Company','Revenue (INR)','Orders','Units'],companyChoices.map(c=>({
  'Company':companyLabel(c.id),'Revenue (INR)':round(stats.companies[c.id]||0),
  'Orders':new Set(rows.filter(s=>companyForSale(s)===c.id).map(s=>s.internal_order_id||s.id)).size,
  'Units':rows.filter(s=>companyForSale(s)===c.id).reduce((total,s)=>total+Number(s.qty||0),0)
 })));
 createSheet('Top Products',['Product','Company','Quantity Ordered','Sales Revenue (INR)','Sale Lines'],stats.products.map(p=>({
  'Product':p.name,'Company':companyLabel(p.companyId),'Quantity Ordered':p.qty,
  'Sales Revenue (INR)':round(p.revenue),'Sale Lines':p.orders
 })));
 window.XLSX.writeFile(book,reportFilename()+'.xlsx');
 toast('Filtered Excel report exported: '+rows.length+' sale lines');
}
async function exportOverviewPdf(){
 await Promise.all([
  ensureLibrary('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',()=>!!window.html2canvas),
  ensureLibrary('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',()=>!!window.jspdf?.jsPDF)
 ]);
 const section=$('#dashboard');if(!section)throw Error('Sales dashboard is unavailable');
 if(document.fonts?.ready)await document.fonts.ready;
 // Capture the full visible dashboard, including the actual Chart.js canvases,
 // progress bars, visible labels, filter values, top products and KPI cards.
 const canvas=await window.html2canvas(section,{
  backgroundColor:'#f5f7fd',scale:Math.min(2,Math.max(1.4,window.devicePixelRatio||1.5)),
  useCORS:true,logging:false,scrollX:0,scrollY:-window.scrollY,
  windowWidth:Math.max(document.documentElement.clientWidth,section.scrollWidth+40),
  onclone:doc=>{
   const actions=doc.querySelector('#dashboard-export-actions');
   if(actions)actions.style.visibility='hidden';
   const reset=doc.querySelector('#clear-filters');if(reset)reset.style.visibility='hidden';
  }
 });
 if(!canvas.width||!canvas.height)throw Error('The visual report could not be rendered');
 const {jsPDF}=window.jspdf,pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
 const pageWidth=297,pageHeight=210,margin=10,printWidth=pageWidth-margin*2,printHeight=pageHeight-margin*2;
 const scale=printWidth/canvas.width,chunkHeight=Math.max(1,Math.floor(printHeight/scale));
 let page=0;
 for(let top=0;top<canvas.height;top+=chunkHeight){
  if(page)pdf.addPage();
  const height=Math.min(chunkHeight,canvas.height-top),part=document.createElement('canvas');
  part.width=canvas.width;part.height=height;
  const context=part.getContext('2d');
  if(!context)throw Error('Cannot prepare visual PDF canvas');
  context.drawImage(canvas,0,top,canvas.width,height,0,0,canvas.width,height);
  pdf.addImage(part.toDataURL('image/png'),'PNG',margin,margin,printWidth,height*scale,undefined,'FAST');
  pdf.setFontSize(8);pdf.setTextColor(113,130,157);
  pdf.text('GreenRich ONE · Sales overview · Page '+(++page),pageWidth-margin,pageHeight-3,{align:'right'});
 }
 pdf.save(reportFilename()+'.pdf');
 toast('Visual dashboard PDF exported ('+page+' page'+(page===1?'':'s')+')');
}

const actButtons=(k,id)=>'<button class="action-button" data-edit="'+k+':'+id+'">Edit</button><button class="action-button delete" data-delete="'+k+':'+id+'">Delete</button>';
 const act=(k,id)=>window.GreenRichActionMenu.wrap(actButtons(k,id));
const invoiceAction=s=>'<button type="button" class="action-button gr-sales-invoice-action" data-sale-invoice="'+esc(s.id)+'" title="Preview or download the invoice for this sales order">'+(s.invoice_status==='Issued'?'Invoice · Issued':s.invoice_number?'Invoice · Draft':'Create Invoice')+'</button>';
const empty=cols=>`<tr><td class="empty" colspan="${cols}">No records yet. Use the Add button to begin.</td></tr>`;

function customerProfileBack(){
 currentCustomerId='';currentSourceSaleId='';
 $('#gr-customer-profile').hidden=true;$('#gr-customer-directory').hidden=false;
 $('#primary-action').hidden=true;
 $('#page-heading').textContent='Customers';$('#page-subtitle').textContent=titles.customers[1];
 const title=document.querySelector('#app #title');if(title)title.textContent='Customers';
 root?.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderCustomerProfile(){
 if(!currentCustomerId&&!currentSourceSaleId)return;
 if(!window.GreenRichCustomerProfile)return toast('Customer 360 profile is unavailable. Refresh this page.');
 const customer=data.customers.find(c=>c.id===currentCustomerId)||null;
 const source=scopeRows('sales').find(s=>s.id===currentSourceSaleId)||null;
 if(!customer&&!source){customerProfileBack();return}
 const area=$('#gr-customer-profile'),list=$('#gr-customer-directory');
 if(!area||!list)return;
 list.hidden=true;area.hidden=false;
 $('#primary-action').hidden=true;
 $('#page-heading').textContent='Customer profile';
 $('#page-subtitle').textContent='Contact information, order history, invoices and customer activity';
 const title=document.querySelector('#app #title');if(title)title.textContent='Customer profile';
 window.GreenRichCustomerProfile.render(area,{
  customer,sourceSale:source,sales:scopeRows('sales'),leads:scopeRows('leads'),tasks:scopeRows('tasks'),
  dispatch:window.GreenRichSalesOps?.getDispatchRows?.()||[],
  tags:data.tags,companyLabel,
  onBack:customerProfileBack,
  onEdit:id=>{if(id)window.GreenRichContacts?.openForm('customer',id)},
  onInvoice:(id,owner)=>void openSaleInvoice(id,owner),
  onRefresh:()=>renderCustomerProfile()
 });
 if(customer?.id&&window.GreenRichLeadPipeline?.renderCustomerTimeline)
  void window.GreenRichLeadPipeline.renderCustomerTimeline(area,pipelineConfig.client,customer.id,permittedCompanies,
   id=>id===pipelineConfig.userId?'Me':'Sales employee').catch(error=>console.warn('Lead history unavailable',error));
}
function openCustomerProfile(customerId='',saleId=''){
 const customer=data.customers.find(c=>c.id===customerId);
 const sale=scopeRows('sales').find(s=>s.id===saleId);
 if(!customer&&!sale)return toast('Customer record was not found in your authorized companies.');
 currentCustomerId=customer?.id||'';currentSourceSaleId=saleId||'';
 navigate('customers');
 window.GreenRichShell?.setPageWithoutRemount?.('customers');
 renderCustomerProfile();
}

function renderTables(){
 window.GreenRichSalesOps?.renderSales();
 let q=$('#customers-search').value.toLowerCase();
 $('#customers-table').innerHTML=data.customers.filter(c=>[c.name,c.mobile,c.mobile2,c.email,c.city,c.company].some(v=>String(v||'').toLowerCase().includes(q))).map(c=>'<tr><td><button type="button" class="gr-customer-name-link" data-customer-profile="'+esc(c.id)+'">'+esc(c.name)+'</button><small>'+esc(c.gstin||'')+'</small></td><td>'+esc(c.mobile)+'<small>'+esc(c.mobile2||'')+' · '+esc(c.email)+'</small></td><td>'+esc(c.city)+'<small>'+esc(c.state)+'</small></td><td>'+esc(c.company)+'</td><td>'+esc(c.type)+'</td><td>'+(c.tag_ids||[]).map(id=>'<span class="gr-customer-tag">'+esc(data.tags.find(t=>t.id===id)?.name||'')+'</span>').join('')+'</td><td>'+new Set(scopeRows('sales').filter(s=>s.customer_id===c.id).map(s=>s.internal_order_id||s._companyId+'|'+s.id)).size+'</td><td>'+act('customers',c.id)+'</td></tr>').join('')||empty(8);
 // Lead board is rendered only in #gr-lead-pipeline-root by GreenRichLeadPipeline.
 q=$('#tasks-search').value.toLowerCase();const taskFilter=$('#task-filter').value;
 $('#tasks-table').innerHTML=scopeRows('tasks').filter(t=>(taskFilter==='all'||(taskFilter==='done')===(t.status==='Done'))&&[t.title,t.contact,t.owner,companyLabel(t._companyId)].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>(a.due||'').localeCompare(b.due||'')).map(t=>'<tr><td>'+esc(t.due)+'</td><td><strong>'+esc(t.title)+'</strong><small>'+esc(t.notes)+'</small></td><td>'+esc(t.contact)+'<small>'+esc(companyLabel(t._companyId))+'</small></td><td>'+esc(t.owner)+'</td><td><span class="pill '+(t.status==='Done'?'good':'warn')+'">'+esc(t.status)+'</span></td><td>'+act('tasks',t.id)+'</td></tr>').join('')||empty(6);
 q=$('#products-search').value.toLowerCase();
 $('#products-table').innerHTML=scopeRows('products').filter(p=>[p.name,p.sku,p.brand,companyLabel(p._companyId)].some(v=>String(v||'').toLowerCase().includes(q))).map(p=>'<tr><td>'+esc(p.sku)+'</td><td><strong>'+esc(p.name)+'</strong></td><td>'+esc(companyLabel(p._companyId))+'</td><td>'+esc(p.brand)+'</td><td>'+fmt(p.price)+'</td><td>'+esc(p.tax)+'%</td><td><strong>'+esc(Number.isInteger(Number(p.stock))?p.stock:'Not set')+'</strong></td><td>'+(p.inclusive?'Inclusive':'Exclusive')+'</td><td><span class="pill '+(p.active?'good':'warn')+'">'+(p.active?'Active':'Inactive')+'</span></td><td>'+act('products',p.id)+'<button class="action-button" type="button" data-stock-update="'+esc(p.id)+'">Update Stock</button></td></tr>').join('')||empty(10);
 $('#channels-table').innerHTML=scopeRows('channels').map(c=>'<tr><td><strong>'+esc(c.name)+'</strong><small>'+esc(companyLabel(c._companyId))+'</small></td><td>'+esc(c.type)+'</td><td><span class="pill '+(c.active?'good':'warn')+'">'+(c.active?'Active':'Inactive')+'</span></td><td>'+scopeRows('sales').filter(s=>s.channel_id===c.id&&s._companyId===c._companyId).length+'</td><td>'+act('channels',c.id)+'</td></tr>').join('')||empty(5);
}
function render(){
 if(page==='dashboard')renderDashboard();
 else if(page==='dispatch')window.GreenRichSalesOps?.renderDispatch();
 else {
  renderTables();
  if(page==='leads'&&!window.GreenRichLeadPipeline){
   const area=$('#gr-lead-pipeline-root');
   if(area)area.innerHTML='<p class="notice">The updated lead pipeline could not load. Reload this CRM page using its latest version.</p>';
  }
  if(page==='leads'&&window.GreenRichLeadPipeline){
   void window.GreenRichLeadPipeline.mount($('#gr-lead-pipeline-root'),{
    ...pipelineConfig,db:pipelineConfig.client,companyIds:scopedCompanyIds(),
    companyNames:Object.fromEntries(companyChoices.map(c=>[c.id,companyLabel(c.id)])),notify:toast
   }).catch(e=>toast(e.message));
  }
  if(page==='tasks'&&window.GreenRichLeadPipeline){
   let host=$('#gr-quotation-followups');
   if(!host){host=document.createElement('section');host.id='gr-quotation-followups';host.className='card';$('#tasks').prepend(host);}
   void window.GreenRichLeadPipeline.mountFollowups(host,{
    ...pipelineConfig,db:pipelineConfig.client,companyIds:scopedCompanyIds(),
    companyNames:Object.fromEntries(companyChoices.map(c=>[c.id,companyLabel(c.id)])),notify:toast
   }).catch(e=>{host.textContent='Quotation follow-ups could not load: '+e.message});
  }
  if(page==='customers'){window.GreenRichContacts?.render();if(currentCustomerId||currentSourceSaleId)renderCustomerProfile()}
 }
}
const specs={
 products:[['company_id','Company','companies',true],['name','Product name','text',true],['sku','SKU / code','text',true],['hsn','HSN / SAC code (for invoice)','text'],['brand','Brand','text'],['category','Category','text'],['price','Default unit price (₹)','number',true],['tax','Default GST / tax %','number',true],['stock','Current stock quantity','number',true],['inclusive','Price includes GST?','select','',[['true','Yes – inclusive'],['false','No – exclusive']]],['active','Status','select','',[['true','Active'],['false','Inactive']]],['description','Description / notes','textarea']],
 channels:[['company_id','Company','companies',true],['name','Channel name','text',true],['type','Channel type','select','',[['Marketplace','Marketplace'],['E-commerce','E-commerce'],['Retail','Retail'],['Distributor','Distributor'],['Wholesale','Wholesale'],['Other','Other']]],['active','Status','select','',[['true','Active'],['false','Inactive']]]],
 customers:[['name','Full name / customer name','text',true],['mobile','Primary mobile number','tel',true],['mobile2','Second mobile number (optional)','tel'],['email','Email address','email',true],['tag_ids','Customer tags','tags'],['company','Company name','text'],['type','Customer type','select','',[['Individual','Individual'],['Retailer','Retailer'],['Distributor','Distributor'],['Wholesale','Wholesale'],['Business','Business']]],['address1','Address line 1','textarea',true],['address2','Address line 2','text'],['city','City','text'],['state','State','text'],['pincode','PIN code','text'],['country','Country','text'],['gstin','GSTIN (optional)','text'],['source','Customer source','text'],['owner','Account owner','text'],['notes','Customer notes / history','textarea']],
 leads:[['company_id','Company','companies',true],['title','Lead / enquiry title','text',true],['customer_id','Existing customer','customers'],['contact','Contact name / phone','text'],['source','Lead source','text'],['stage','Pipeline stage','select','',[['New','New'],['Contacted','Contacted'],['Qualified','Qualified'],['Quotation','Quotation'],['Won','Won'],['Lost','Lost']]],['value','Expected deal value (₹)','number'],['owner','Assigned to','text'],['followup','Next follow-up date','date'],['notes','Discussion notes','textarea']],
 tasks:[['company_id','Company','companies',true],['title','Follow-up / task','text',true],['due','Due date','date',true],['customer_id','Linked customer','customers'],['lead_id','Linked lead','leads'],['contact','Other contact','text'],['owner','Assigned to','text'],['status','Status','select','',[['Open','Open'],['Done','Done']]],['notes','Notes','textarea']],
 sales:[['date','Order date','date',true],['order_id','Platform order ID (optional)','text'],['internal_order_id','Internal Sales Order ID (automatic)','text',true],['company_id','Company','companies',true],['channel_id','Sales channel','channels',true],['customer_id','Existing customer','customers'],['product_id','Product','products',true],['qty','Quantity','number',true],['unit_price','Unit price (₹)','number',true],['tax_rate','Product GST / tax percentage (automatic)','number',true],['inclusive','Price includes tax?','select','',[['true','Yes, included'],['false','No, add tax']]],['shipping_charge','Shipping charge (optional)','number'],['shipping_gst_rate','Shipping GST % (optional; 0 if exempt)','number'],['payment_terms','Payment terms (optional)','text'],['dispatched_through','Dispatch / courier (optional)','text'],['delivery_note','Delivery note (optional)','text'],['invoice_reference','Invoice reference (optional)','text'],['terms_of_delivery','Terms of delivery (optional)','text'],['status','Order status','select','',[['Completed','Completed'],['Pending','Pending'],['Cancelled','Cancelled'],['Returned','Returned']]],['notes','Notes','textarea']]
};
function field([id,label,type,required,options],value){
 const wrap=el(type==='tags'?'div':'label',{class:type==='tags'?'wide gr-tag-field':type==='textarea'?'wide':''}),title=el('span',{text:label});wrap.append(title);let input;
 if(type==='tags'){wrap.insertAdjacentHTML('beforeend',tagChecks(data,id,Array.isArray(value)?value:[]));return wrap}
 if(type==='select'||['products','channels','customers','leads','companies'].includes(type)){
  input=el('select',{name:id,id:'f-'+id});
  if(type==='select'){(options||[]).forEach(([v,t])=>input.append(el('option',{value:v,text:t})))}
  else if(type==='companies'){input.append(el('option',{value:'',text:'Select company'}));companyChoices.filter(c=>permittedCompanies.includes(c.id)).forEach(c=>input.append(el('option',{value:c.id,text:companyLabel(c.id)})))}
  else{input.append(el('option',{value:'',text:'Select '+(type==='customers'?'customer':type==='products'?'product':type==='channels'?'channel':'lead')}));data[type].filter(r=>r.active!==false||r.id===value).forEach(r=>input.append(el('option',{value:r.id,text:r.name||r.title})))}
 }else{
  input=el(type==='textarea'?'textarea':'input',{name:id,id:'f-'+id});
  if(type!=='textarea')input.type=type;
  if(type==='number'){input.step=id==='qty'||id==='stock'?'1':'0.01';input.min=id==='qty'?'1':'0'}
  if(type==='tel')input.setAttribute('inputmode','tel');
 }
 if(required===true)input.required=true;
 if(value!==undefined&&value!==null)input.value=String(value);
 if(id==='internal_order_id')input.readOnly=true;
 wrap.append(input);return wrap;
}
function pricePreview(){
 const quantity=Number($('#f-qty')?.value),price=Number($('#f-unit_price')?.value),tax=Number($('#f-tax_rate')?.value),inclusive=$('#f-inclusive')?.value==='true',shipping=Number($('#f-shipping_charge')?.value||0),shippingRate=Number($('#f-shipping_gst_rate')?.value||0),shippingTax=round(shipping*shippingRate/100);
 const calc=getCalc(quantity,price,tax,inclusive);
 const summary=$('#price-summary');if(!summary)return;
 summary.hidden=false;
 summary.innerHTML='Taxable amount (before GST): <b>'+fmt(calc.base)+'</b><br>GST ('+(tax||0)+'%): <b>'+fmt(calc.gst)+'</b><br>Shipping charge: <b>'+fmt(shipping)+'</b><br>Shipping GST ('+shippingRate+'%): <b>'+fmt(shippingTax)+'</b><br>Final order total: <b>'+fmt(calc.total+shipping+shippingTax)+'</b>';
}
function openEditor(k,id=''){
 if(k==='channels'&&!adminMode)return toast('Only Admin can manage sales channels');
 editing=k;editId=id;const existing=id?find(k,id):null;
 $('#editor-title').textContent=(existing?'Edit ':'Add ')+({sales:'Sale',products:'Product',channels:'Channel',customers:'Customer',leads:'Lead',tasks:'Follow-up'}[k]);
 const defaults={date:date(),qty:1,stock:0,tax:0,price:0,inclusive:'true',active:'true',status:k==='tasks'?'Open':'Completed',stage:'New',type:k==='channels'?'Marketplace':'Individual',country:'India',company_id:companyScope==='all'?'':activeCompany};
 $('#editor-fields').replaceChildren(...specs[k].map(s=>field(s,s[0]==='company_id'&&existing?(existing._companyId||existing.company_id||activeCompany):(existing?.[s[0]]??defaults[s[0]]))));
 $('#price-summary').hidden=k!=='sales';
 if(k==='sales'){
  const fields=$('#editor-fields');
  const customerField=$('#f-customer_id').closest('label');
  customerField.classList.add('wide','gr-existing-customer-select');
  customerField.style.display='none';
  const picker=el('div',{class:'gr-customer-picker wide'});
  picker.innerHTML='<span class="gr-field-title">Customer or Lead <b>*</b></span><div class="gr-customer-switch"><button type="button" data-customer-mode="new">+ New Customer</button><button type="button" data-customer-mode="existing">Find Lead / Customer</button></div><div id="gr-existing-customer" hidden><label>Search lead or customer by name, mobile number or email<input id="gr-customer-search" type="search" autocomplete="off" placeholder="Type at least 2 characters to search"></label><div id="gr-customer-results" class="gr-customer-results"></div><div id="gr-customer-selected"></div></div><div id="gr-new-customer" hidden><div class="gr-new-customer-grid"><label>Customer full name *<input name="new_name" id="f-new_name" required></label><label>Email address *<input name="new_email" id="f-new_email" type="email" required></label><label>Primary mobile number *<input name="new_mobile" id="f-new_mobile" inputmode="tel" type="tel" required></label><label>Second mobile number (optional)<input name="new_mobile2" id="f-new_mobile2" inputmode="tel" type="tel"></label><label class="wide">Customer address *<textarea name="new_address1" id="f-new_address1" required></textarea></label><label>City<input name="new_city" id="f-new_city"></label><label>State (for GST invoice) *<input name="new_state" id="f-new_state" required placeholder="Tamil Nadu / Goa / ..."></label><label>PIN code<input name="new_pincode" id="f-new_pincode"></label><label>Customer GSTIN (optional)<input name="new_gstin" id="f-new_gstin"></label></div><div id="gr-new-customer-tags"></div></div>';
  fields.insertBefore(picker,customerField);
  const existingInvoice=existing||{};
  const invoiceExtra=el('details',{class:'gr-invoice-extra-fields wide'});
  invoiceExtra.innerHTML='<summary>Additional Invoice / Shipping Details (optional)</summary><div class="gr-invoice-extra-grid">'+[
   ['ship_to_name','Ship-to name'],['ship_to_address','Ship-to address'],['ship_to_phone','Ship-to phone'],
   ['ship_to_state','Ship-to state'],['ship_to_state_code','Ship-to GST state code'],
   ['delivery_note_date','Delivery note date'],['dispatch_doc','Dispatch document number'],
   ['destination','Destination'],['other_references','Other references'],['freight_hsn','Freight / shipping SAC']
  ].map(([key,title])=>'<label>'+esc(title)+'<input name="'+key+'" value="'+esc(existingInvoice[key]||'')+'" placeholder="'+esc(title)+'"></label>').join('')+'</div>';
  fields.append(invoiceExtra);
  const refreshCustomerTags=()=>{const wrap=$('#gr-new-customer-tags');wrap.innerHTML='<span class="gr-field-title">Customer tags (optional)</span>'+tagChecks(editorData(),'new_tag_ids',[])};
  function setCustomerMode(mode){
   formCustomerMode(mode);
   picker.querySelector('#gr-existing-customer').hidden=mode!=='existing';
   picker.querySelector('#gr-new-customer').hidden=mode!=='new';
   picker.querySelectorAll('[data-customer-mode]').forEach(b=>b.classList.toggle('active',b.dataset.customerMode===mode));
   picker.querySelectorAll('#gr-new-customer input,#gr-new-customer textarea').forEach(el=>{el.disabled=mode!=='new'});
   $('#f-customer_id').required=false;
   if(mode==='existing')drawCustomerMatches();
  }
  function formCustomerMode(mode){$('#editor-form').dataset.customerMode=mode}

  const setLeadReference=id=>{
   const form=$('#editor-form');if(!form)return;
   let field=form.querySelector('input[name=lead_id]');
   if(!field){field=document.createElement('input');field.type='hidden';field.name='lead_id';form.append(field)}
   field.value=id||'';
  };
  const selectLeadForOrder=lead=>{
   if(!lead)return;
   setLeadReference(lead.id||lead.lead_id);
   const db=editorData(),phone=cleanPhone(lead.mobile),email=String(lead.email||'').trim().toLowerCase();
   const known=db.customers.find(c=>c.id===lead.customer_id||
      (phone.length===10&&[c.mobile,c.mobile2].some(p=>cleanPhone(p)===phone))||
      (email&&String(c.email||'').trim().toLowerCase()===email));
   if(known){
    setCustomerMode('existing');
    const select=$('#f-customer_id');if(select)select.value=known.id;
    const display=$('#gr-customer-selected');if(display)display.textContent='Lead '+(lead.contact||lead.title||'')+' · Existing customer: '+known.name;
   }else{
    setCustomerMode('new');
    const fields={new_name:lead.name||lead.contact||lead.title||'',new_email:lead.email||'',new_mobile:lead.mobile||'',
      new_mobile2:lead.mobile2||'',new_address1:lead.address1||lead.address||'',new_city:lead.city||'',
      new_state:lead.state||'',new_pincode:lead.pincode||'',new_gstin:lead.gstin||''};
    Object.entries(fields).forEach(([id,v])=>{const field=$('#f-'+id);if(field)field.value=v});
    const display=$('#gr-customer-selected');if(display)display.textContent='Selected lead: '+(lead.contact||lead.title||'')+'. Complete any missing customer details.';
   }
  };
  picker.selectLeadForOrder=selectLeadForOrder;
  function drawCustomerMatches(){
   const results=picker.querySelector('#gr-customer-results'),search=(picker.querySelector('#gr-customer-search')?.value||'').trim().toLowerCase();
   if(!results)return;
   if(search.length<2){results.innerHTML='<p class="gr-crm-help">Enter at least two letters or numbers to search leads and customers.</p>';return}
   const digits=search.replace(/[^0-9]/g,'');
   const matches=r=>[r.name,r.title,r.contact,r.mobile,r.mobile2,r.email].some(v=>
    String(v||'').toLowerCase().includes(search)||(digits.length>=3&&String(v||'').replace(/[^0-9]/g,'').includes(digits)));
   const db=editorData(),customers=db.customers.filter(matches).slice(0,15),leads=(db.leads||[]).filter(matches).slice(0,15);
   results.innerHTML=leads.map(l=>'<button type="button" data-choose-lead="'+esc(l.id||l.lead_id)+'"><strong>Lead · '+esc(l.name||l.contact||l.title||'Enquiry')+'</strong><span>'+esc(l.mobile||'')+' · '+esc(l.email||'')+' · '+esc(l.stage||'New')+'</span></button>').join('')+
    customers.map(c=>'<button type="button" data-choose-customer="'+esc(c.id)+'"><strong>Customer · '+esc(c.name)+'</strong><span>'+esc(c.mobile||'')+' · '+esc(c.email||'')+'</span></button>').join('');
   if(!leads.length&&!customers.length)results.innerHTML='<p class="gr-crm-help">No matching records. Choose New Customer to create one.</p>';
   results.querySelectorAll('[data-choose-customer]').forEach(button=>button.onclick=()=>{
    const c=db.customers.find(item=>item.id===button.dataset.chooseCustomer);if(!c)return;
    setCustomerMode('existing');$('#f-customer_id').value=c.id;setLeadReference('');
    $('#gr-customer-selected').textContent='Selected customer: '+c.name;results.innerHTML='';
   });
   results.querySelectorAll('[data-choose-lead]').forEach(button=>button.onclick=()=>{
    const lead=(db.leads||[]).find(l=>(l.id||l.lead_id)===button.dataset.chooseLead);
    selectLeadForOrder(lead);results.innerHTML='';
   });
  }
  picker.querySelectorAll('[data-customer-mode]').forEach(b=>b.onclick=()=>setCustomerMode(b.dataset.customerMode));
  $('#gr-customer-search').oninput=drawCustomerMatches;
  const switchCompany=()=>{
   const db=editorData();
   fillSelect($('#f-channel_id'),db.channels.filter(x=>x.active!==false),'Select channel');
   fillSelect($('#f-product_id'),db.products.filter(x=>x.active!==false),'Select product');
   fillSelect($('#f-customer_id'),db.customers,'Select customer');
   $('#f-customer_id').value='';
   $('#gr-customer-search').value='';
   $('#gr-customer-selected').textContent='';
   setLeadReference('');
   $('#f-internal_order_id').value=existing?.internal_order_id||peekOrderId(db,$('#f-company_id').value);
   refreshCustomerTags();
   drawCustomerMatches();autoProductPricing();
  };
  const autoProductPricing=()=>{
   const db=editorData(),p=db.products.find(x=>x.id===$('#f-product_id').value);
   $('#f-unit_price').value=p?p.price:'';
   $('#f-tax_rate').value=p?p.tax:'';
   $('#f-inclusive').value=p?String(p.inclusive):'true';
   $('#gr-stock-preview').textContent=p?'Available stock: '+Number(p.stock||0)+' units':'Select a product to check stock';
   pricePreview();
  };
  const stockNote=el('div',{id:'gr-stock-preview',class:'gr-stock-preview wide'});
  $('#f-product_id').closest('label').after(stockNote);
  $('#f-company_id').addEventListener('change',switchCompany);
  $('#f-product_id').addEventListener('change',autoProductPricing);
  ['qty','unit_price','shipping_charge','shipping_gst_rate'].forEach(x=>$('#f-'+x).addEventListener('input',pricePreview));
  if(existing){
   const selectedDb=editorData();
   fillSelect($('#f-channel_id'),selectedDb.channels,'Select channel');
   fillSelect($('#f-product_id'),selectedDb.products,'Select product');
   fillSelect($('#f-customer_id'),selectedDb.customers,'Select customer');
   $('#f-channel_id').value=existing.channel_id||'';
   $('#f-product_id').value=existing.product_id||'';
   if(!existing.internal_order_id)$('#f-internal_order_id').value=peekOrderId(selectedDb,$('#f-company_id').value||activeCompany);
   $('#f-customer_id').value=existing.customer_id||'';
   setLeadReference(existing.lead_id||'');
   setCustomerMode('existing');$('#gr-customer-selected').textContent=existing.customer_name?'Selected: '+existing.customer_name:'';}
  else setCustomerMode(editorData().customers.length?'existing':'new');
  $('#f-tax_rate').readOnly=true;$('#f-inclusive').disabled=true;
  if(!existing)switchCompany();else{const p=editorData().products.find(x=>x.id===existing.product_id);$('#gr-stock-preview').textContent=p?'Available stock: '+Number(p.stock||0)+' units':'';pricePreview()}
 }
 if(k==='customers'){$('#f-company_id')?.remove();} // Customer records belong to the currently active company.
 $('#editor').showModal();
}
function createOrderForLead(lead){
 if(!lead?.lead_id&&!lead?.id)return toast('Lead details unavailable. Reopen this lead and try again.','error');
 if(!permittedCompanies.includes(lead.company_id))return toast('Company access denied.','error');
 if(!allowedTabs.includes('sales'))return toast('Sales Order creation is not enabled for your role.','error');
 navigate('sales');window.GreenRichShell?.setPageWithoutRemount?.('orders');
 openEditor('sales');
 const company=$('#f-company_id');if(company){company.value=lead.company_id;company.dispatchEvent(new Event('change'))}
 const picker=$('.gr-customer-picker');
 if(!picker?.selectLeadForOrder)return toast('Sales Order form did not load correctly. Refresh the CRM.','error');
 picker.selectLeadForOrder({...lead,id:lead.lead_id||lead.id});
 if(lead.product_id&&$('#f-product_id')){$('#f-product_id').value=lead.product_id;$('#f-product_id').dispatchEvent(new Event('change'))}
 if($('#f-notes'))$('#f-notes').value='Sales Order from lead: '+(lead.contact||lead.title||'Enquiry')+' ('+(lead.lead_id||lead.id)+')';
 toast('Lead details filled. Verify the customer, product, stock and order information before saving.','info');
}
async function saveEditor(event){
 event.preventDefault();
 const form=$('#editor-form'),inputs=new FormData(form),row={};
 inputs.forEach((value,key)=>{if(key!=='tag_ids')row[key]=String(value).trim()});
 const targetId=editing==='customers'?activeCompany:(row.company_id||(editId?ownerOf(editing,editId):companyScope==='all'?'':activeCompany));
 if(!permittedCompanies.includes(targetId))return toast('Select a company you are assigned to');
 if(editId&&editing!=='customers'&&targetId!==ownerOf(editing,editId))return toast('To edit an existing record, keep its current company.');
 const copy=JSON.parse(JSON.stringify(loadCompanyData(targetId)));ensureCRMData(copy);
 let old=editId?copy[editing].find(r=>r.id===editId):null;
 if(editId&&!old)return toast('Record could not be found in the selected company');
 if(editing==='sales'){
  const product=copy.products.find(p=>p.id===row.product_id),channel=copy.channels.find(c=>c.id===row.channel_id);
  if(!row.date||!product||!channel||product.active===false||channel.active===false)return toast('Enter date, active sales channel and product');
  row.qty=Number(row.qty);row.unit_price=Number(row.unit_price);row.shipping_charge=Number(row.shipping_charge||0);row.shipping_gst_rate=Number(row.shipping_gst_rate||0);
  row.tax_rate=Number(product.tax);row.inclusive=Boolean(product.inclusive);
  if(!Number.isInteger(row.qty)||row.qty<1||!Number.isFinite(row.unit_price)||row.unit_price<0||!Number.isFinite(row.shipping_charge)||row.shipping_charge<0||!Number.isFinite(row.shipping_gst_rate)||row.shipping_gst_rate<0||row.shipping_gst_rate>100)return toast('Quantity, unit price, shipping charge and shipping GST rate must be valid');
  if(row.order_id&&copy.sales.some(s=>s.id!==editId&&s.order_id&&s.order_id.toLowerCase()===row.order_id.toLowerCase()&&s.channel_id===row.channel_id&&s.product_id===row.product_id))return toast('This platform order, product and channel are already recorded');
  const mode=form.dataset.customerMode||'existing';
  const fresh=mode==='new'?{name:row.new_name||'',email:row.new_email||'',mobile:row.new_mobile||'',mobile2:row.new_mobile2||'',address1:row.new_address1||'',city:row.new_city||'',state:row.new_state||'',pincode:row.new_pincode||'',gstin:row.new_gstin||'',tag_ids:inputs.getAll('new_tag_ids'),company:companyLabel(targetId),type:'Individual',country:'India'}:null;
  if(fresh){const problem=validateCustomer(copy,fresh,'');if(problem)return toast(problem)}
  else if(!copy.customers.some(c=>c.id===row.customer_id))return toast('Find and select an existing customer, or choose New Customer');
  if(old&&old.invoice_status==='Issued')return toast('Issued invoice is locked. Do not edit this order; contact Accounts for credit-note adjustments.');
  if(old&&window.GreenRichSalesOps?.isApproved?.(targetId,old.id))return toast('Approved orders are locked; contact the dispatch team for delivery updates.');
  if(old&&consumesStock(old)){const previous=copy.products.find(p=>p.id===old.product_id);if(previous)previous.stock=Number(previous.stock||0)+Number(old.qty||0)}
  if(!Number.isInteger(Number(product.stock))||Number(product.stock)<row.qty)return toast('Insufficient stock for '+product.name+'. Available: '+(Number(product.stock)||0)+', requested: '+row.qty+'. Update product stock first.');
  const calc=getCalc(row.qty,row.unit_price,row.tax_rate,row.inclusive);
  const status=row.status||old?.status||'Completed';
  if(!['Completed','Pending','Cancelled','Returned'].includes(status))return toast('Select a valid order status');
  if(fresh){
   try{const created=await window.GreenRichSharedCustomers.saveCustomer(fresh);row.customer_id=created.id;copy.customers.push(created)}
   catch(error){return toast('Unable to create shared customer: '+error.message)}
  }
  const customer=copy.customers.find(c=>c.id===row.customer_id);
  if(!customer)return toast('Shared customer not found. Refresh and try again.');
  const shippingTax=round(row.shipping_charge*row.shipping_gst_rate/100);
   Object.assign(row,{
    id:editId||uid(),internal_order_id:old?.internal_order_id||nextOrderId(copy,targetId),
    invoice_number:old?.invoice_number||window.GreenRichInvoices.nextInvoiceId(copy,targetId,date()),
    invoice_date:old?.invoice_date||date(),invoice_status:old?.invoice_status||'Draft',
    invoice_snapshot:old?.invoice_snapshot||null,company_id:targetId,
    taxable:calc.base,tax_amount:calc.gst,shipping_tax_amount:shippingTax,
    total:round(calc.total+row.shipping_charge+shippingTax),product_name:product.name,
    sku:product.sku,hsn:product.hsn||'',channel_name:channel.name,customer_name:customer.name,status
   });
  ['new_name','new_email','new_mobile','new_mobile2','new_address1','new_city','new_state','new_pincode','new_gstin','new_tag_ids'].forEach(k=>delete row[k]);
  if(consumesStock(row))product.stock-=row.qty;
 }else if(editing==='products'){
  row.price=Number(row.price);row.tax=Number(row.tax);row.stock=Number(row.stock);
  if(!Number.isFinite(row.price)||row.price<0||!Number.isFinite(row.tax)||row.tax<0||row.tax>100||!Number.isInteger(row.stock)||row.stock<0)return toast('Enter a valid price, GST rate (0–100) and whole-number stock');
  if(copy.products.some(p=>p.id!==editId&&p.sku.toLowerCase()===row.sku.toLowerCase()))return toast('SKU must be unique for this company');
  row.inclusive=row.inclusive==='true';row.active=row.active==='true';row.company_id=targetId;
 }else if(editing==='channels'){
  if(copy.channels.some(c=>c.id!==editId&&c.name.toLowerCase()===row.name.toLowerCase()))return toast('Sales channel already exists');
  row.active=row.active==='true';
 }else if(editing==='customers'){
  row.tag_ids=inputs.getAll('tag_ids');
  const issue=validateCustomer(copy,row,editId);if(issue)return toast(issue);
  try{
   await window.GreenRichSharedCustomers.saveCustomer({...row,...(editId?{id:editId}:{})});
   attachSharedCustomers(data);$('#editor').close();render();
   toast(editId?'Shared customer updated':'Customer saved for all GreenRich employees');
  }catch(error){toast('Unable to save shared customer: '+error.message)}
  return;
 }else if(editing==='leads'){
  row.value=Number(row.value)||0;
  row.created_at=old?.created_at||new Date().toISOString();
 }
 if(editing!=='sales')row.id=editId||uid();
 if(old)Object.assign(old,row);else copy[editing].push(row);
 if(!saveCompanyData(targetId,copy))return;
 $('#editor').close();render();
 if(editing==='sales'&&targetId===activeCompany&&allowedTabs.includes('sales'))navigate('sales');
 toast((editing==='sales'?'Sales order '+row.internal_order_id+' saved. Draft invoice '+row.invoice_number+' created.':'Saved successfully')+(targetId!==activeCompany?' Switch to '+companyLabel(targetId)+' to view it.':''),'success');
 if(editing==='sales'&&!editId&&row.lead_id){
  try{
   await window.GreenRichCRMCloud.whenSynced(targetId);
   if(!['Issued','Confirmed','Approved','Completed','Dispatched'].includes(row.status)){
    toast('Sales Order saved. Change the order to Completed before converting this lead to Won.','info');return;
   }
   const client=pipelineConfig.client;
   if(!client)throw Error('CRM database connection unavailable');
   const result=await client.rpc('gr_pipeline_win_with_order',{
    p_company:targetId,p_lead:row.lead_id,p_order:row.id,
    p_note:'Confirmed Sales Order '+row.internal_order_id+' created from lead'
   });
   if(result.error)throw result.error;
   toast('Sale completed! Lead converted to Won and linked to customer '+row.customer_name+'.','success');
   if(allowedTabs.includes('leads')){
    navigate('leads');window.GreenRichShell?.setPageWithoutRemount?.('leads');
    await window.GreenRichLeadPipeline?.refreshRoot?.($('#gr-lead-pipeline-root'));
   }
  }catch(error){
   toast('Sales Order saved, but lead is not yet Won: '+error.message+'. Open the lead and select this order.','warning');
  }
 }
}

async function openSaleInvoice(id,ownerOverride=''){
 if(!window.GreenRichInvoices)return toast('Invoice module not loaded. Refresh the page.');
 const owner=ownerOverride&&permittedCompanies.includes(ownerOverride)?ownerOverride:ownerOf('sales',id);
 if(!owner||!permittedCompanies.includes(owner))return toast('You cannot access this company order.');
 const copy=JSON.parse(JSON.stringify(loadCompanyData(owner))),sale=copy.sales.find(s=>s.id===id);
 if(!sale)return toast('Sales order not found.');
 if(!sale.invoice_number){
  sale.invoice_number=window.GreenRichInvoices.nextInvoiceId(copy,owner,date());
  sale.invoice_date=date();sale.invoice_status='Draft';
  if(!saveCompanyData(owner,copy))return;render();
 }
 const product=copy.products.find(p=>p.id===sale.product_id),customer=data.customers.find(c=>c.id===sale.customer_id);
 try{
  await window.GreenRichInvoices.open({
   root,companyId:owner,sale,product,customer,
   canIssue:allowInvoiceIssue,
   onIssue:async(snapshot)=>{
    const now=JSON.parse(JSON.stringify(loadCompanyData(owner)));
    const selected=now.sales.find(s=>s.id===sale.id);
    if(!selected||selected.invoice_status==='Issued')throw Error('Order is already issued or unavailable.');
    selected.invoice_status='Issued';
    selected.invoice_snapshot=JSON.parse(JSON.stringify(snapshot));
    if(!saveCompanyData(owner,now))throw Error('Could not save invoice status in browser storage.');
    render();toast('Invoice '+selected.invoice_number+' issued');
   }
  });
 }catch(error){toast('Unable to open invoice: '+error.message)}
}

async function removeRecord(k,id){
 const item=find(k,id);if(!item)return;
 const owner=ownerOf(k,id);
 if(k==='customers'){
  if(!confirm('Delete this customer from both companies and all employee accounts?'))return;
  try{await window.GreenRichSharedCustomers.deleteCustomer(id);attachSharedCustomers(data);render();toast('Shared customer deleted')}
  catch(error){toast('Could not delete shared customer: '+error.message)}
  return;
 }
 if(k==='products'&&loadCompanyData(owner).sales.some(s=>s.product_id===id))return toast('Product is used in sales. Mark it inactive instead.');
 if(k==='channels'&&loadCompanyData(owner).sales.some(s=>s.channel_id===id))return toast('Channel is used in sales. Mark it inactive instead.');
 if(!confirm('Delete this '+k.slice(0,-1)+'? This cannot be undone.'))return;
 const copy=JSON.parse(JSON.stringify(loadCompanyData(owner)));
 if(k==='sales'&&item.invoice_status==='Issued')return toast('Issued invoices cannot be deleted. Contact Accounts for a credit note or authorised correction.');
  if(k==='sales'&&window.GreenRichSalesOps?.isApproved?.(owner,id))return toast('Approved orders cannot be deleted after dispatch handoff.');
  if(k==='sales'&&consumesStock(item)){const product=copy.products.find(p=>p.id===item.product_id);if(product&&Number.isInteger(Number(product.stock)))product.stock=Number(product.stock)+Number(item.qty||0)}
 copy[k]=copy[k].filter(r=>r.id!==id);
 if(saveCompanyData(owner,copy)){render();toast('Record deleted')}
}
const exportSales=r=>({'Date':r.date,'Internal Order ID':r.internal_order_id||'Legacy','Order ID':r.order_id||'','Company':companyLabel(r.company_id||activeCompany),'Channel':channelName(r),'Customer':customerName(r),'Product':productName(r),'SKU':r.sku||'','Quantity':r.qty,'Unit Price':r.unit_price,'Tax %':r.tax_rate,'Tax Inclusive':r.inclusive?'Yes':'No','Taxable Amount':r.taxable,'Tax Amount':r.tax_amount,'Shipping':r.shipping_charge||0,'Total Amount':r.total,'Order Status':r.status,'Notes':r.notes||''});
const csvSafe=x=>{let s=String(x??'');if(/^[\s]*[=+@\-]/.test(s)&&!/^-[\d.]+$/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
function download(name,blob){if(!adminMode)return toast('Only Admin can download backups');let u=URL.createObjectURL(blob),a=el('a',{href:u,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function excelDownload(name,rows,headers){if(!adminMode)return toast('Only Admin can export data');let safeRows=rows.map(row=>Object.fromEntries(headers.map(h=>[h,typeof row[h]==='string'&&/^[\s]*[=+@]/.test(row[h])?"'"+row[h]:row[h]??''])));if(window.XLSX){let ws=XLSX.utils.json_to_sheet(safeRows,{header:headers});ws['!cols']=headers.map(h=>({wch:Math.max(14,h.length+4)}));let wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'GreenRich');XLSX.writeFile(wb,name+'.xlsx')}else{let csv=[headers,...rows.map(r=>headers.map(h=>r[h]??''))].map(r=>r.map(csvSafe).join(',')).join('\r\n');download(name+'.csv',new Blob(['\ufeff'+csv],{type:'text/csv'}));toast('Excel library unavailable — exported CSV instead')}}
const salesHeaders=['Date','Internal Order ID','Order ID','Company','Channel','Customer','Product','SKU','Quantity','Unit Price','Tax %','Tax Inclusive','Taxable Amount','Tax Amount','Shipping','Total Amount','Order Status','Notes'];
function doExport(k){if(!adminMode)return toast('Only Admin can export data');if(k==='sales')return excelDownload('greenrich-sales-'+date(),scopeRows('sales').map(exportSales),salesHeaders);let list=scopeRows(k),headers=Object.keys(list[0]||({products:{name:'',sku:'',brand:'',price:'',tax:'',inclusive:'',active:''},channels:{name:'',type:'',active:''},customers:{name:'',mobile:'',email:'',address1:'',city:'',state:''},leads:{title:'',stage:'',value:'',followup:''},tasks:{title:'',due:'',status:''}}[k]));headers=headers.filter(h=>h!=='id');excelDownload('greenrich-'+k+'-'+date(),list,headers)}
function parseCsv(txt){let lines=[],row=[],col='',quoted=false;for(let i=0;i<txt.length;i++){const c=txt[i];if(c==='"'){if(quoted&&txt[i+1]==='"'){col+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(col);col=''}else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&txt[i+1]==='\n')i++;row.push(col);if(row.some(x=>x.trim()))lines.push(row);row=[];col=''}else col+=c}if(col||row.length){row.push(col);lines.push(row)}const headers=(lines.shift()||[]).map(h=>h.trim().replace(/^\ufeff/,''));return lines.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])))}
async function importSales(file){
 if(!adminMode)return toast('Only Admin can import sales');
 try{
  let rows;
  if(file.name.toLowerCase().endsWith('.csv'))rows=parseCsv(await file.text());
  else{if(!window.XLSX)throw Error('Excel library unavailable. Export as CSV.');const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''})}
  if(rows.length>10000)throw Error('Maximum 10,000 rows per import');
  let count=0,invalid=0,duplicates=0,stockSkipped=0;
  const copy=JSON.parse(JSON.stringify(data));ensureCRMData(copy);
  const normDate=v=>{if(v instanceof Date)return v.toISOString().slice(0,10);let s=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):''};
  for(const r of rows){
   const get=(...names)=>{const k=Object.keys(r).find(k=>names.includes(k.toLowerCase().trim()));return k?r[k]:''};
   const d=normDate(get('date','order date','sale date')),order=String(get('order id','order no','order number')).trim(),channel=String(get('channel','sales channel','marketplace')).trim(),prod=String(get('product','product name','sku')).trim();
   const c=copy.channels.find(c=>c.name.toLowerCase()===channel.toLowerCase()),p=copy.products.find(p=>[p.name.toLowerCase(),p.sku.toLowerCase()].includes(prod.toLowerCase()));
   const qty=Number(get('quantity','qty')),unit=Number(get('unit price','price')),inc=String(get('tax inclusive','price includes tax')).toLowerCase();
   if(!d||!c||!p||p.active===false||!Number.isInteger(qty)||qty<1||!Number.isFinite(unit)||unit<0){invalid++;continue}
   if(order&&copy.sales.some(s=>s.order_id===order&&s.channel_id===c.id&&s.product_id===p.id)){duplicates++;continue}
   if(!Number.isInteger(Number(p.stock))||Number(p.stock)<qty){stockSkipped++;continue}
   const inclusive=inc?['yes','true','inclusive','1'].includes(inc):p.inclusive,tax=Number(p.tax)||0,calc=getCalc(qty,unit,tax,inclusive);
   const customer=String(get('customer','customer name')).trim(),cr=copy.customers.find(x=>x.name.toLowerCase()===customer.toLowerCase());
   const internal=nextOrderId(copy,activeCompany);
   copy.sales.push({id:uid(),date:d,order_id:order,internal_order_id:internal,invoice_number:window.GreenRichInvoices.nextInvoiceId(copy,activeCompany,date()),invoice_date:date(),invoice_status:'Draft',shipping_gst_rate:0,shipping_tax_amount:0,company_id:activeCompany,channel_id:c.id,channel_name:c.name,customer_id:cr?.id||'',customer_name:customer,product_id:p.id,product_name:p.name,sku:p.sku,hsn:p.hsn||'',qty,unit_price:unit,tax_rate:tax,inclusive,taxable:calc.base,tax_amount:calc.gst,total:calc.total,shipping_charge:0,status:String(get('order status','status')||'Completed'),notes:String(get('notes')||'')});
   if(consumesStock(copy.sales[copy.sales.length-1]))p.stock-=qty;
   count++;
  }
  if(!saveCompanyData(activeCompany,copy))return;
  render();
  toast('Imported '+count+' sales; '+invalid+' invalid, '+duplicates+' duplicate, '+stockSkipped+' insufficient stock. Internal IDs assigned.');
 }catch(error){toast('Import error: '+error.message)}
 finally{$('#upload-sales').value=''}
}
function bind(){ all('#navigation button[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));$('#mobile-menu').onclick=()=>{};$('#primary-action').onclick=()=>{if(page==='leads'){navigate('customers');window.GreenRichShell?.setPageWithoutRemount?.('customers');window.GreenRichContacts?.setMode('lead');window.GreenRichContacts?.openForm('lead');return}openEditor(titles[page][3])};$('#close-editor').onclick=$('#cancel-editor').onclick=()=>$('#editor').close();$('#editor-form').onsubmit=saveEditor;root.addEventListener('click',e=>{const customer=e.target.closest('[data-customer-profile]');if(customer){openCustomerProfile(customer.dataset.customerProfile);return}let b=e.target.closest('[data-edit],[data-delete],[data-export],[data-stock-update],[data-sale-invoice]');if(!b||!root.contains(b))return;if(b.dataset.saleInvoice){void openSaleInvoice(b.dataset.saleInvoice);return}if(b.dataset.stockUpdate){const current=find('products',b.dataset.stockUpdate);if(!current)return;const entered=prompt('Enter new stock quantity for '+current.name,Number(current.stock||0));if(entered===null)return;const quantity=Number(entered);if(!Number.isInteger(quantity)||quantity<0)return toast('Stock quantity must be a whole number of 0 or more');const owner=ownerOf('products',current.id),copy=JSON.parse(JSON.stringify(loadCompanyData(owner)));copy.products.find(p=>p.id===current.id).stock=quantity;if(saveCompanyData(owner,copy)){render();toast('Stock updated for '+current.name)}return}if(b.dataset.edit){let[k,id]=b.dataset.edit.split(':');if(k==='leads'){navigate('customers');window.GreenRichShell?.setPageWithoutRemount?.('customers');window.GreenRichContacts?.setMode('lead');window.GreenRichContacts?.openForm('lead',id,ownerOf('leads',id));return}if(k==='customers'){window.GreenRichContacts?.openForm('customer',id);return}openEditor(k,id)}if(b.dataset.delete){let[k,id]=b.dataset.delete.split(':');removeRecord(k,id)}if(b.dataset.export){if(!adminMode)return toast('Only Admin can export data');doExport(b.dataset.export)}});['sales-search','customers-search','tasks-search','products-search'].forEach(id=>{const input=$('#'+id);if(input)input.oninput=renderTables});['sales-channel-filter','task-filter'].forEach(id=>{const input=$('#'+id);if(input)input.onchange=renderTables});['period','filter-channel','filter-company','filter-customer','filter-product'].forEach(id=>$('#'+id).onchange=renderDashboard);
 ['filter-from','filter-to'].forEach(id=>$('#'+id).onchange=()=>{if($('#filter-from').value||$('#filter-to').value)$('#period').value='custom';renderDashboard()});
 $('#clear-filters').onclick=()=>{
  $('#period').value='month';['filter-channel','filter-company','filter-customer','filter-product'].forEach(id=>$('#'+id).value='all');
  $('#filter-from').value='';$('#filter-to').value='';renderDashboard();
 };
 $('#dashboard-export-excel').onclick=()=>runExport($('#dashboard-export-excel'),exportOverviewExcel);
 $('#dashboard-export-pdf').onclick=()=>runExport($('#dashboard-export-pdf'),exportOverviewPdf);
 $('#close-product-orders').onclick=()=>$('#product-orders-dialog').close();
 $('#close-channel-orders').onclick=()=>$('#channel-orders-dialog').close();
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-product-drill]');
  if(button&&root.contains(button))showProductOrders(button.dataset.productDrill);
  const channel=event.target.closest('[data-channel-drill]');
  if(channel&&root.contains(channel))showChannelOrders(channel.dataset.channelDrill);
 });$('#import-sales-btn').onclick=()=>{if(!adminMode)return toast('Only Admin can import sales');if(companyScope==='all')return toast('Select one company in the top selector before importing');$('#upload-sales').click()};$('#upload-sales').onchange=e=>e.target.files[0]&&importSales(e.target.files[0]);$('#download-template').onclick=()=>excelDownload('greenrich-sales-template',[{'Date':date(),'Order ID':'AMZ-001','Channel':'Amazon','Customer':'','Product':'USE EXISTING PRODUCT NAME','SKU':'','Quantity':2,'Unit Price':199,'Tax %':5,'Tax Inclusive':'Yes','Taxable Amount':'','Tax Amount':'','Total Amount':'','Order Status':'Completed','Notes':'Example — replace this row'}],salesHeaders);$('#download-backup').onclick=()=>{if(companyScope==='all')return toast('Select one company to back up its CRM records');download('greenrich-backup-'+date()+'.json',new Blob([JSON.stringify(data,null,2)],{type:'application/json'}))};$('#restore-backup').onclick=()=>{if(!adminMode)return toast('Only Admin can restore backups');if(companyScope==='all')return toast('Select one company before restoring its backup');$('#upload-backup').click()};$('#upload-backup').onchange=async e=>{if(!adminMode){e.target.value='';return toast('Only Admin can restore backups')}let f=e.target.files[0];if(!f)return;try{let obj=JSON.parse(await f.text());if(!['sales','products','channels','customers','leads','tasks'].every(k=>Array.isArray(obj[k])))throw Error('Backup format invalid');if(!confirm('Restore this backup to shared CRM? It will apply to synced cloud records and can update or remove existing records.'))return;data=obj;persist();render();toast('Backup restoration queued for cloud sync')}catch(e){toast(e.message)}finally{e.target.value=''}}}
window.GreenRichCRM={
 mount:async(container,view,allowed,companyId='grow-india',companyName='GreenRich Grow India Pvt Ltd',adminTools=false,client=null,isAdmin=false,exportAllowed=false,companyIds=['grow-india'],issueAllowed=false,approveAllowed=false,dispatchAllowed=false,contactAccess={},leadPipelineAccess={})=>{
  pipelineConfig={...leadPipelineAccess,client};
  contactCapabilities=contactAccess||{};
  permittedCompanies=[...new Set((Array.isArray(companyIds)?companyIds:[]).filter(id=>companyChoices.some(c=>c.id===id)))];
  if(!permittedCompanies.length)throw Error('No company access. Contact the Admin.');
  if(companyId!=='all'&&!permittedCompanies.includes(companyId))throw Error('You are not assigned to the selected company.');
  if(companyId==='all'&&permittedCompanies.length!==2)throw Error('Both Companies requires access to both companies.');
  companyScope=companyId;const workingId=companyId==='all'?permittedCompanies[0]:companyId;
  if(!client||!window.GreenRichSharedCustomers)throw Error('Shared customer service is unavailable. Refresh the page.');
  activeCompany=workingId;activeCompanyName=companyName;adminMode=adminTools===true;allowDashboardExport=exportAllowed===true||isAdmin===true;allowInvoiceIssue=issueAllowed===true||isAdmin===true;
  if(!container||!document.getElementById('grCrmTemplate'))throw Error('CRM workspace template is missing');
  charts.forEach(chart=>{try{chart.destroy()}catch(_){}});charts=[];
  allowedTabs=(Array.isArray(allowed)?allowed:Object.keys(titles)).filter(x=>Object.hasOwn(titles,x)&&(adminMode||!['channels','reports'].includes(x)));
  if(!allowedTabs.length)throw Error('Sales & CRM permission required');
  container.innerHTML='';
  root=document.createElement('div');root.id='grCrmWorkspace';
  root.append(document.getElementById('grCrmTemplate').content.cloneNode(true));
  container.append(root);
  const notice=$('.gr-crm-data-notice');if(notice)notice.textContent='Connecting to shared GreenRich CRM data…';
  all('#navigation button[data-page]').forEach(button=>button.hidden=!allowedTabs.includes(button.dataset.page));
  data=ensureCRMData(JSON.parse(localStorage.getItem(storageKey())||'null')||initial());
  if(!['sales','products','channels','customers','leads','tasks'].every(k=>Array.isArray(data[k])))throw Error('Local CRM data needs restoration from a valid backup');
  $('#dashboard-export-actions').hidden=!allowDashboardExport;
  $('#today-label').textContent=new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric'}).format(new Date());
  bind();
  if(!window.GreenRichContacts)throw Error('Contact manager module missing. Refresh the page.');
  window.GreenRichContacts.mount($('#gr-contact-management'),{db:client,customers:()=>data.customers,tags:()=>data.tags,leads:()=>scopeRows('leads'),
    products:()=>scopeRows('products').map(p=>({...p,company_id:p.company_id||p._companyId})),companyIds:permittedCompanies,selectedCompany:()=>companyScope,companyLabel,notify:toast,
    openProfile:id=>openCustomerProfile(id),
    afterCustomerSave:()=>{attachSharedCustomers(data);render()},
    permission:(kind,action)=>Boolean(isAdmin||contactCapabilities[kind]?.[action])
  });
  if(!window.GreenRichSalesOps||!window.GreenRichActionMenu)throw Error('CRM actions module missing. Refresh GreenRich ONE.');
  const operationsReady=window.GreenRichSalesOps.mount(root,{client,companies:scopedCompanyIds(),approve:approveAllowed===true||isAdmin===true,dispatch:dispatchAllowed===true||isAdmin===true,source:{
   getSales:()=>scopeRows('sales'),getCustomers:()=>data.customers,getTags:()=>data.tags,
   getLeads:()=>scopeRows('leads'),showCustomerProfile:(customerId,saleId)=>openCustomerProfile(customerId,saleId),productName,channelName,companyLabel,
   invoiceAction,actions:act,rawActions:actButtons,toast,
   saveApproved:(companyId,saleId,record)=>{
    const copy=JSON.parse(JSON.stringify(loadCompanyData(companyId))),row=copy.sales.find(s=>s.id===saleId);
    if(!row)return false;
    row.approval_status='Approved';row.approved_at=record.approved_at;row.dispatch_id=record.id;
    return saveCompanyData(companyId,copy);
   }
  }});
  currentCustomerId='';currentSourceSaleId='';
  // First paint the requested CRM page, then load shared records in the background.
  navigate(allowedTabs.includes(view)?view:allowedTabs[0]);
  await window.GreenRichSharedCustomers.ready({client,admin:isAdmin===true});
  await window.GreenRichInvoices.load(client);
  if(!window.GreenRichCRMCloud)throw Error('Shared CRM service not loaded. Refresh this page.');
  const cloudState=await window.GreenRichCRMCloud.start({
   client,companyIds:permittedCompanies,
   onData:(companyId,store)=>{
    if(companyId===activeCompany)data=attachSharedCustomers(store);
    if(root?.isConnected)render();
   },
   onNotice:message=>toast(message)
  });
  if(notice)notice.textContent='Shared CRM active · '+activeCompanyName+
   ' · Sales, orders, products, stock, leads and follow-ups are available to authorized employees on all devices.'+
   (cloudState.migrated?' Imported '+cloudState.migrated+' existing browser records.':'');
  data=ensureCRMData(JSON.parse(localStorage.getItem(storageKey())||'null')||initial());
  attachSharedCustomers(data);
  await operationsReady;
  if(root?.isConnected)render();
  return root;
 },
 switchPage:view=>{if(allowedTabs.includes(view))navigate(view)},
 openCustomerProfile:(id,saleId='')=>openCustomerProfile(id,saleId),
 createOrderForLead,
 refresh:()=>{if(root?.isConnected&&page==='dashboard')render()},
 unmount:()=>{window.GreenRichCRMCloud?.stop?.();charts.forEach(chart=>{try{chart.destroy()}catch(_){}});charts=[];root=null}
};
})();
