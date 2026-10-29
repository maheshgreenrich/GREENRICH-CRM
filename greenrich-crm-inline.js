'use strict';
(()=>{
let root=null,allowedTabs=[],adminMode=false;
const $=s=>root?.querySelector(s), all=s=>root?[...root.querySelectorAll(s)]:[], legacyKey='greenrich-crm-v2';
let activeCompany='grow-india',activeCompanyName='GreenRich Grow India Pvt Ltd';
const storageKey=()=>activeCompany==='grow-india'?legacyKey:legacyKey+'::'+activeCompany;
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const date=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n)||0);
const num=n=>new Intl.NumberFormat('en-IN').format(Number(n)||0);
const round=n=>Math.round((Number(n)||0)*100)/100;
const initial=()=>({version:3,orderSequence:0,tags:[],products:[],channels:[{id:uid(),name:'Amazon',type:'Marketplace',active:true},{id:uid(),name:'Flipkart',type:'Marketplace',active:true},{id:uid(),name:'Website',type:'E-commerce',active:true}],customers:[],leads:[],tasks:[],sales:[]});
let data;try{data=JSON.parse(localStorage.getItem(storageKey()))||initial();if(!['sales','products','channels','customers','leads','tasks'].every(k=>Array.isArray(data[k])))throw Error('Invalid database')}catch{data=initial()}
let page='dashboard',editId='',editing='',charts=[];
const persist=()=>{try{localStorage.setItem(storageKey(),JSON.stringify(data));return true}catch{toast('Storage full or unavailable. Export a backup immediately.');return false}};
const toast=s=>{let n=$('#toast');n.textContent=s;n.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>n.classList.remove('show'),4300)};
const find=(k,id)=>data[k].find(x=>x.id===id);
const nameOf=(k,id)=>find(k,id)?.name||find(k,id)?.title||'—';
const safeN=n=>Number.isFinite(Number(n))?Number(n):0;
const getCalc=(qty,price,tax,inclusive)=>{qty=safeN(qty);price=safeN(price);tax=safeN(tax);let gross=qty*price;let base=inclusive?gross/(1+tax/100):gross;let gst=inclusive?gross-base:base*tax/100;return {base:round(base),gst:round(gst),total:round(base+gst)}};
const saleGross=s=>Number(s.total)||0;
const companyChoices=[{id:'grow-india',name:'GreenRich Grow India Pvt Ltd'},{id:'enviro-solutions',name:'GreenRich Enviro Solutions Pvt Ltd'}];
const companyLabel=id=>window.GreenRichCompanies?.list?.().find(c=>c.id===id)?.name||companyChoices.find(c=>c.id===id)?.name||'Unknown company';
const companyStorage=id=>id==='grow-india'?legacyKey:legacyKey+'::'+id;
function ensureCRMData(store){if(!Array.isArray(store.tags))store.tags=[];if(!Number.isInteger(store.orderSequence)||store.orderSequence<0)store.orderSequence=0;return store}
function attachSharedCustomers(store){const shared=window.GreenRichSharedCustomers?.snapshot();if(shared){store.customers=shared.customers;store.tags=shared.tags}return ensureCRMData(store)}
function loadCompanyData(id){if(id===activeCompany)return attachSharedCustomers(data);let parsed;try{parsed=JSON.parse(localStorage.getItem(companyStorage(id))||'null')||initial()}catch{parsed=initial()}return attachSharedCustomers(parsed)}
function saveCompanyData(id,copy){try{localStorage.setItem(companyStorage(id),JSON.stringify(copy));if(id===activeCompany)data=copy;return true}catch{toast('Unable to save browser records. Export a backup and check available storage.');return false}}
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
const titles={dashboard:['Overview','Your sales, customers and growth in one place.','+ Add Sale','sales'],sales:['Sales & Orders','Track sales across every channel and calculate GST.','+ Add Sale','sales'],customers:['Customers','Maintain complete customer contact and address records.','+ Add Customer','customers'],leads:['Leads & CRM','Capture enquiries, opportunities and deal stages.','+ Add Lead','leads'],tasks:['Follow-ups','Manage daily reminders and customer follow-ups.','+ Add Follow-up','tasks'],products:['Product Master','Set a default price and GST for every product.','+ Add Product','products'],channels:['Sales Channels','Add marketplaces, distributors and new sales sources.','+ Add Channel','channels'],reports:['Import & Export','Import Excel, export reports and back up your records.','+ Add Sale','sales']};
function navigate(p){if(!allowedTabs.includes(p))return;page=p;all('.page').forEach(x=>x.classList.toggle('active',x.id===p));all('#navigation button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===p));$('#page-heading').textContent=titles[p][0];$('#page-subtitle').textContent=titles[p][1];$('#primary-action').textContent=titles[p][2];$('#primary-action').hidden=p==='reports'||(adminMode&&p==='dashboard');render();root?.scrollIntoView({block:'start'})}
function fillSelect(sel,rows,emptyLabel='None'){let old=sel.value;sel.replaceChildren();sel.append(el('option',{value:'',text:emptyLabel}));rows.forEach(r=>sel.append(el('option',{value:r.id,text:r.name||r.title})));if([...sel.options].some(o=>o.value===old))sel.value=old}
function channelFilters(){for(let id of ['#filter-channel','#sales-channel-filter']){const e=$(id),v=e.value;e.replaceChildren(el('option',{value:'all',text:'All channels'}));data.channels.forEach(c=>e.append(el('option',{value:c.id,text:c.name})));if([...e.options].some(o=>o.value===v))e.value=v}}
function inPeriod(s){const p=$('#period').value,now=new Date(),d=s.date;if(p==='all')return true;if(p==='custom')return (!$('#filter-from').value||d>=$('#filter-from').value)&&(!$('#filter-to').value||d<=$('#filter-to').value);if(p==='today')return d===date();if(p==='month')return d.slice(0,7)===date().slice(0,7);if(p==='week'){let start=new Date(now);start.setDate(now.getDate()-((now.getDay()+6)%7));let st=`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;return d>=st&&d<=date()}if(p==='last30'){let start=new Date(now);start.setDate(now.getDate()-29);return d>=`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`&&d<=date()}return true}
function filteredSales(){return data.sales.filter(s=>inPeriod(s)&&($('#filter-channel').value==='all'||s.channel_id===$('#filter-channel').value))}
function renderDashboard(){const rows=filteredSales(),total=rows.reduce((s,r)=>s+saleGross(r),0),tax=rows.reduce((s,r)=>s+Number(r.tax_amount||0),0),qty=rows.reduce((s,r)=>s+Number(r.qty||0),0),uniqueOrders=new Set(rows.map(r=>r.internal_order_id||r.id)).size;$('#metrics').innerHTML=[['Total revenue',fmt(total),'₹','Net sales including GST'],['Orders',num(uniqueOrders),'▤','Unique orders in period'],['Units sold',num(qty),'◈','Products sold'],['Tax collected',fmt(tax),'%','Calculated GST amount']].map(a=>`<div class="metric"><span class="badge">${a[2]}</span><small>${a[0]}</small><strong>${a[1]}</strong><small>${a[3]}</small></div>`).join('');charts.forEach(c=>c.destroy());charts=[];const byDate={},byChannel={},byProduct={};rows.forEach(r=>{byDate[r.date]=(byDate[r.date]||0)+saleGross(r);const c=channelName(r);byChannel[c]=(byChannel[c]||0)+saleGross(r);const p=productName(r);byProduct[p]=(byProduct[p]||0)+saleGross(r)});if(window.Chart){let keys=Object.keys(byDate).sort(),ch=Object.keys(byChannel),palette=['#1749d4','#5f81ed','#12aaae','#f8a545','#956ce4','#ee7292'];charts.push(new Chart($('#trend-chart'),{type:'line',data:{labels:keys,datasets:[{data:keys.map(k=>byDate[k]),borderColor:'#1749d4',backgroundColor:'#e4eaff',fill:true,tension:.32,pointRadius:3}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}}));charts.push(new Chart($('#channel-chart'),{type:'doughnut',data:{labels:ch.length?ch:['No sales'],datasets:[{data:ch.length?ch.map(k=>byChannel[k]):[1],backgroundColor:ch.length?palette:'#e5eaf5',borderWidth:0}]},options:{maintainAspectRatio:false,cutout:'68%',plugins:{legend:{position:'bottom'}}}}))}else{console.warn('Chart.js unavailable. Connect to the internet to enable charts.')}$('#top-products').innerHTML=Object.entries(byProduct).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([n,v])=>`<div class="mini-row"><span>${esc(n)}</span><strong>${fmt(v)}</strong></div>`).join('')||'<div class="empty">No sales for this period</div>';const open=data.tasks.filter(t=>t.status!=='Done').length;$('#crm-overview').innerHTML=`<div class="mini-row"><span>Customers</span><strong>${data.customers.length}</strong></div><div class="mini-row"><span>Active leads</span><strong>${data.leads.filter(l=>!['Won','Lost'].includes(l.stage)).length}</strong></div><div class="mini-row"><span>Open follow-ups</span><strong>${open}</strong></div><div class="mini-row"><span>Overdue follow-ups</span><strong>${data.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<date()).length}</strong></div>`}
const act=(k,id)=>`<button class="action-button" data-edit="${k}:${id}">Edit</button><button class="action-button delete" data-delete="${k}:${id}">Delete</button>`;
const empty=cols=>`<tr><td class="empty" colspan="${cols}">No records yet. Use the Add button to begin.</td></tr>`;
function renderTables(){let q=$('#sales-search').value.toLowerCase(),ch=$('#sales-channel-filter').value;let sales=[...data.sales].filter(s=>(ch==='all'||s.channel_id===ch)&&[s.internal_order_id,s.order_id,productName(s),customerName(s),channelName(s)].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date));$('#sales-count').textContent=sales.length+' sales · '+new Set(sales.map(x=>x.internal_order_id||x.id)).size+' internal orders';$('#sales-table').innerHTML=sales.map(s=>'<tr><td>'+esc(s.date)+'</td><td><strong>'+esc(s.internal_order_id||'Legacy')+'</strong><small>'+esc(s.order_id||'No platform ID')+'</small></td><td>'+esc(companyLabel(s.company_id||activeCompany))+'</td><td>'+esc(customerName(s))+'</td><td><strong>'+esc(productName(s))+'</strong><small>'+esc(s.sku||'')+'</small></td><td><span class="pill">'+esc(channelName(s))+'</span></td><td>'+esc(s.qty)+'</td><td>'+fmt(s.taxable)+'</td><td>'+fmt(s.tax_amount)+'</td><td>'+fmt(s.shipping_charge||0)+'</td><td><strong>'+fmt(s.total)+'</strong></td><td>'+act('sales',s.id)+'</td></tr>').join('')||empty(12);
q=$('#customers-search').value.toLowerCase();$('#customers-table').innerHTML=data.customers.filter(c=>[c.name,c.mobile,c.mobile2,c.email,c.city,c.company].some(v=>String(v||'').toLowerCase().includes(q))).map(c=>'<tr><td><strong>'+esc(c.name)+'</strong><small>'+esc(c.gstin||'')+'</small></td><td>'+esc(c.mobile)+'<small>'+esc(c.mobile2||'')+' · '+esc(c.email)+'</small></td><td>'+esc(c.city)+'<small>'+esc(c.state)+'</small></td><td>'+esc(c.company)+'</td><td>'+esc(c.type)+'</td><td>'+(c.tag_ids||[]).map(id=>'<span class="gr-customer-tag">'+esc(data.tags.find(t=>t.id===id)?.name||'')+'</span>').join('')+'</td><td>'+new Set(data.sales.filter(s=>s.customer_id===c.id).map(s=>s.internal_order_id||s.id)).size+'</td><td>'+act('customers',c.id)+'</td></tr>').join('')||empty(8);
q=$('#leads-search').value.toLowerCase();let stage=$('#lead-stage-filter').value;$('#leads-table').innerHTML=data.leads.filter(l=>(stage==='all'||l.stage===stage)&&[l.title,l.contact,l.notes,l.owner].some(v=>String(v||'').toLowerCase().includes(q))).map(l=>`<tr><td><strong>${esc(l.title)}</strong><small>${esc(l.contact)}</small></td><td>${esc(l.source)}</td><td><span class="pill ${l.stage==='Won'?'good':l.stage==='Lost'?'warn':''}">${esc(l.stage)}</span></td><td>${fmt(l.value)}</td><td>${esc(l.owner)}</td><td>${esc(l.followup||'—')}</td><td>${act('leads',l.id)}</td></tr>`).join('')||empty(7);
q=$('#tasks-search').value.toLowerCase();let taskF=$('#task-filter').value;$('#tasks-table').innerHTML=data.tasks.filter(t=>(taskF==='all'||(taskF==='done')===(t.status==='Done'))&&[t.title,t.contact,t.owner].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>(a.due||'').localeCompare(b.due||'')).map(t=>`<tr><td>${esc(t.due)}</td><td><strong>${esc(t.title)}</strong><small>${esc(t.notes)}</small></td><td>${esc(t.contact)}</td><td>${esc(t.owner)}</td><td><span class="pill ${t.status==='Done'?'good':'warn'}">${esc(t.status)}</span></td><td>${act('tasks',t.id)}</td></tr>`).join('')||empty(6);
q=$('#products-search').value.toLowerCase();$('#products-table').innerHTML=data.products.filter(p=>[p.name,p.sku,p.brand].some(v=>String(v||'').toLowerCase().includes(q))).map(p=>'<tr><td>'+esc(p.sku)+'</td><td><strong>'+esc(p.name)+'</strong></td><td>'+esc(companyLabel(p.company_id||activeCompany))+'</td><td>'+esc(p.brand)+'</td><td>'+fmt(p.price)+'</td><td>'+esc(p.tax)+'%</td><td><strong>'+esc(Number.isInteger(Number(p.stock))?p.stock:'Not set')+'</strong></td><td>'+(p.inclusive?'Inclusive':'Exclusive')+'</td><td><span class="pill '+(p.active?'good':'warn')+'">'+(p.active?'Active':'Inactive')+'</span></td><td>'+act('products',p.id)+'<button class="action-button" type="button" data-stock-update="'+esc(p.id)+'">Update Stock</button></td></tr>').join('')||empty(10);
$('#channels-table').innerHTML=data.channels.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.type)}</td><td><span class="pill ${c.active?'good':'warn'}">${c.active?'Active':'Inactive'}</span></td><td>${data.sales.filter(s=>s.channel_id===c.id).length}</td><td>${act('channels',c.id)}</td></tr>`).join('')||empty(5)}
function render(){channelFilters();if(page==='dashboard')renderDashboard();else renderTables()}
const specs={
 products:[['company_id','Company','companies',true],['name','Product name','text',true],['sku','SKU / code','text',true],['brand','Brand','text'],['category','Category','text'],['price','Default unit price (₹)','number',true],['tax','Default GST / tax %','number',true],['stock','Current stock quantity','number',true],['inclusive','Price includes GST?','select','',[['true','Yes – inclusive'],['false','No – exclusive']]],['active','Status','select','',[['true','Active'],['false','Inactive']]],['description','Description / notes','textarea']],
 channels:[['name','Channel name','text',true],['type','Channel type','select','',[['Marketplace','Marketplace'],['E-commerce','E-commerce'],['Retail','Retail'],['Distributor','Distributor'],['Wholesale','Wholesale'],['Other','Other']]],['active','Status','select','',[['true','Active'],['false','Inactive']]]],
 customers:[['name','Full name / customer name','text',true],['mobile','Primary mobile number','tel',true],['mobile2','Second mobile number (optional)','tel'],['email','Email address','email',true],['tag_ids','Customer tags','tags'],['company','Company name','text'],['type','Customer type','select','',[['Individual','Individual'],['Retailer','Retailer'],['Distributor','Distributor'],['Wholesale','Wholesale'],['Business','Business']]],['address1','Address line 1','textarea',true],['address2','Address line 2','text'],['city','City','text'],['state','State','text'],['pincode','PIN code','text'],['country','Country','text'],['gstin','GSTIN (optional)','text'],['source','Customer source','text'],['owner','Account owner','text'],['notes','Customer notes / history','textarea']],
 leads:[['title','Lead / enquiry title','text',true],['customer_id','Existing customer','customers'],['contact','Contact name / phone','text'],['source','Lead source','text'],['stage','Pipeline stage','select','',[['New','New'],['Contacted','Contacted'],['Qualified','Qualified'],['Quotation','Quotation'],['Won','Won'],['Lost','Lost']]],['value','Expected deal value (₹)','number'],['owner','Assigned to','text'],['followup','Next follow-up date','date'],['notes','Discussion notes','textarea']],
 tasks:[['title','Follow-up / task','text',true],['due','Due date','date',true],['customer_id','Linked customer','customers'],['lead_id','Linked lead','leads'],['contact','Other contact','text'],['owner','Assigned to','text'],['status','Status','select','',[['Open','Open'],['Done','Done']]],['notes','Notes','textarea']],
 sales:[['date','Order date','date',true],['order_id','Platform order ID (optional)','text'],['internal_order_id','Internal Sales Order ID (automatic)','text',true],['company_id','Company','companies',true],['channel_id','Sales channel','channels',true],['customer_id','Existing customer','customers'],['product_id','Product','products',true],['qty','Quantity','number',true],['unit_price','Unit price (₹)','number',true],['tax_rate','Product GST / tax percentage (automatic)','number',true],['inclusive','Price includes tax?','select','',[['true','Yes, included'],['false','No, add tax']]],['shipping_charge','Shipping charge (optional)','number'],['status','Order status','select','',[['Completed','Completed'],['Pending','Pending'],['Cancelled','Cancelled'],['Returned','Returned']]],['notes','Notes','textarea']]
};
function field([id,label,type,required,options],value){
 const wrap=el(type==='tags'?'div':'label',{class:type==='tags'?'wide gr-tag-field':type==='textarea'?'wide':''}),title=el('span',{text:label});wrap.append(title);let input;
 if(type==='tags'){wrap.insertAdjacentHTML('beforeend',tagChecks(data,id,Array.isArray(value)?value:[]));return wrap}
 if(type==='select'||['products','channels','customers','leads','companies'].includes(type)){
  input=el('select',{name:id,id:'f-'+id});
  if(type==='select'){(options||[]).forEach(([v,t])=>input.append(el('option',{value:v,text:t})))}
  else if(type==='companies'){input.append(el('option',{value:'',text:'Select company'}));companyChoices.forEach(c=>input.append(el('option',{value:c.id,text:companyLabel(c.id)})))}
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
 const quantity=Number($('#f-qty')?.value),price=Number($('#f-unit_price')?.value),tax=Number($('#f-tax_rate')?.value),inclusive=$('#f-inclusive')?.value==='true',shipping=Number($('#f-shipping_charge')?.value||0);
 const calc=getCalc(quantity,price,tax,inclusive);
 $('#price-summary').hidden=false;
 $('#price-summary').innerHTML='Taxable amount (before GST): <b>'+fmt(calc.base)+'</b><br>GST ('+(tax||0)+'%): <b>'+fmt(calc.gst)+'</b><br>Shipping charge: <b>'+fmt(shipping)+'</b><br>Final order total: <b>'+fmt(calc.total+shipping)+'</b>';
}
function openEditor(k,id=''){
 if(k==='channels'&&!adminMode)return toast('Only Admin can manage sales channels');
 editing=k;editId=id;const existing=id?find(k,id):null;
 $('#editor-title').textContent=(existing?'Edit ':'Add ')+({sales:'Sale',products:'Product',channels:'Channel',customers:'Customer',leads:'Lead',tasks:'Follow-up'}[k]);
 const defaults={date:date(),qty:1,stock:0,tax:0,price:0,inclusive:'true',active:'true',status:k==='tasks'?'Open':'Completed',stage:'New',type:k==='channels'?'Marketplace':'Individual',country:'India',company_id:activeCompany};
 $('#editor-fields').replaceChildren(...specs[k].map(s=>field(s,existing?.[s[0]]??defaults[s[0]])));
 $('#price-summary').hidden=k!=='sales';
 if(k==='sales'){
  const fields=$('#editor-fields');
  const customerField=$('#f-customer_id').closest('label');
  customerField.classList.add('wide','gr-existing-customer-select');
  customerField.style.display='none';
  const picker=el('div',{class:'gr-customer-picker wide'});
  picker.innerHTML='<span class="gr-field-title">Customer <b>*</b></span><div class="gr-customer-switch"><button type="button" data-customer-mode="new">+ New Customer</button><button type="button" data-customer-mode="existing">Select Existing</button></div><div id="gr-existing-customer" hidden><label>Search existing customer by name, mobile number or email<input id="gr-customer-search" type="search" autocomplete="off" placeholder="Start typing to search"></label><div id="gr-customer-results" class="gr-customer-results"></div><div id="gr-customer-selected"></div></div><div id="gr-new-customer" hidden><div class="gr-new-customer-grid"><label>Customer full name *<input name="new_name" id="f-new_name" required></label><label>Email address *<input name="new_email" id="f-new_email" type="email" required></label><label>Primary mobile number *<input name="new_mobile" id="f-new_mobile" inputmode="tel" type="tel" required></label><label>Second mobile number (optional)<input name="new_mobile2" id="f-new_mobile2" inputmode="tel" type="tel"></label><label class="wide">Customer address *<textarea name="new_address1" id="f-new_address1" required></textarea></label></div><div id="gr-new-customer-tags"></div></div>';
  fields.insertBefore(picker,customerField);
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
  function drawCustomerMatches(){
   const search=$('#gr-customer-search').value.trim().toLowerCase(),persons=editorData().customers.filter(c=>[c.name,c.mobile,c.mobile2,c.email].some(v=>String(v||'').toLowerCase().includes(search))).slice(0,30);
   $('#gr-customer-results').innerHTML=persons.map(c=>'<button type="button" data-choose-customer="'+esc(c.id)+'"><strong>'+esc(c.name)+'</strong><span>'+esc(c.mobile||'')+' · '+esc(c.email||'')+'</span></button>').join('')||'<p class="gr-crm-help">No customers match. Choose New Customer to add one.</p>';
   $('#gr-customer-results').querySelectorAll('[data-choose-customer]').forEach(b=>b.onclick=()=>{$('#f-customer_id').value=b.dataset.chooseCustomer;const person=editorData().customers.find(c=>c.id===b.dataset.chooseCustomer);$('#gr-customer-selected').textContent=person?'Selected: '+person.name:'';});
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
  ['qty','unit_price','shipping_charge'].forEach(x=>$('#f-'+x).addEventListener('input',pricePreview));
  if(existing){if(!existing.internal_order_id)$('#f-internal_order_id').value=peekOrderId(editorData(),activeCompany);$('#f-customer_id').value=existing.customer_id||'';setCustomerMode('existing');$('#gr-customer-selected').textContent=existing.customer_name?'Selected: '+existing.customer_name:'';}
  else setCustomerMode(editorData().customers.length?'existing':'new');
  $('#f-tax_rate').readOnly=true;$('#f-inclusive').disabled=true;
  if(!existing)switchCompany();else{const p=editorData().products.find(x=>x.id===existing.product_id);$('#gr-stock-preview').textContent=p?'Available stock: '+Number(p.stock||0)+' units':'';pricePreview()}
 }
 if(k==='customers'){$('#f-company_id')?.remove();} // Customer records belong to the currently active company.
 $('#editor').showModal();
}
async function saveEditor(event){
 event.preventDefault();
 const form=$('#editor-form'),inputs=new FormData(form),row={};
 inputs.forEach((value,key)=>{if(key!=='tag_ids')row[key]=String(value).trim()});
 const targetId=(editing==='sales'||editing==='products')?(row.company_id||activeCompany):activeCompany;
 if(!companyChoices.some(x=>x.id===targetId))return toast('Select a valid company');
 if(editId&&targetId!==activeCompany)return toast('To edit an existing record, choose its current company.');
 const copy=JSON.parse(JSON.stringify(loadCompanyData(targetId)));ensureCRMData(copy);
 let old=editId?copy[editing].find(r=>r.id===editId):null;
 if(editId&&!old)return toast('Record could not be found in the selected company');
 if(editing==='sales'){
  const product=copy.products.find(p=>p.id===row.product_id),channel=copy.channels.find(c=>c.id===row.channel_id);
  if(!row.date||!product||!channel||product.active===false||channel.active===false)return toast('Enter date, active sales channel and product');
  row.qty=Number(row.qty);row.unit_price=Number(row.unit_price);row.shipping_charge=Number(row.shipping_charge||0);
  row.tax_rate=Number(product.tax);row.inclusive=Boolean(product.inclusive);
  if(!Number.isInteger(row.qty)||row.qty<1||!Number.isFinite(row.unit_price)||row.unit_price<0||!Number.isFinite(row.shipping_charge)||row.shipping_charge<0)return toast('Quantity, unit price and shipping amount must be valid');
  if(row.order_id&&copy.sales.some(s=>s.id!==editId&&s.order_id&&s.order_id.toLowerCase()===row.order_id.toLowerCase()&&s.channel_id===row.channel_id&&s.product_id===row.product_id))return toast('This platform order, product and channel are already recorded');
  const mode=form.dataset.customerMode||'existing';
  const fresh=mode==='new'?{name:row.new_name||'',email:row.new_email||'',mobile:row.new_mobile||'',mobile2:row.new_mobile2||'',address1:row.new_address1||'',tag_ids:inputs.getAll('new_tag_ids'),company:companyLabel(targetId),type:'Individual',country:'India'}:null;
  if(fresh){const problem=validateCustomer(copy,fresh,'');if(problem)return toast(problem)}
  else if(!copy.customers.some(c=>c.id===row.customer_id))return toast('Find and select an existing customer, or choose New Customer');
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
  Object.assign(row,{id:editId||uid(),internal_order_id:old?.internal_order_id||nextOrderId(copy,targetId),company_id:targetId,taxable:calc.base,tax_amount:calc.gst,total:round(calc.total+row.shipping_charge),product_name:product.name,sku:product.sku,channel_name:channel.name,customer_name:customer.name,status});
  ['new_name','new_email','new_mobile','new_mobile2','new_address1','new_tag_ids'].forEach(k=>delete row[k]);
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
 }else if(editing==='leads')row.value=Number(row.value)||0;
 if(editing!=='sales')row.id=editId||uid();
 if(old)Object.assign(old,row);else copy[editing].push(row);
 if(!saveCompanyData(targetId,copy))return;
 $('#editor').close();render();
 if(editing==='sales'&&targetId===activeCompany&&allowedTabs.includes('sales'))navigate('sales');
 toast((editing==='sales'?'Sales order '+row.internal_order_id+' saved. Stock updated.':'Saved successfully')+(targetId!==activeCompany?' Switch to '+companyLabel(targetId)+' to view it.':''));
}
async function removeRecord(k,id){
 const item=find(k,id);if(!item)return;
 if(k==='customers'){
  if(!confirm('Delete this customer from both companies and all employee accounts?'))return;
  try{await window.GreenRichSharedCustomers.deleteCustomer(id);attachSharedCustomers(data);render();toast('Shared customer deleted')}
  catch(error){toast('Could not delete shared customer: '+error.message)}
  return;
 }
 if(k==='products'&&data.sales.some(s=>s.product_id===id))return toast('Product is used in sales. Mark it inactive instead.');
 if(k==='channels'&&data.sales.some(s=>s.channel_id===id))return toast('Channel is used in sales. Mark it inactive instead.');
 if(!confirm('Delete this '+k.slice(0,-1)+'? This cannot be undone.'))return;
 const copy=JSON.parse(JSON.stringify(data));
 if(k==='sales'&&consumesStock(item)){const product=copy.products.find(p=>p.id===item.product_id);if(product&&Number.isInteger(Number(product.stock)))product.stock=Number(product.stock)+Number(item.qty||0)}
 copy[k]=copy[k].filter(r=>r.id!==id);
 if(saveCompanyData(activeCompany,copy)){render();toast('Record deleted')}
}
const exportSales=r=>({'Date':r.date,'Internal Order ID':r.internal_order_id||'Legacy','Order ID':r.order_id||'','Company':companyLabel(r.company_id||activeCompany),'Channel':channelName(r),'Customer':customerName(r),'Product':productName(r),'SKU':r.sku||'','Quantity':r.qty,'Unit Price':r.unit_price,'Tax %':r.tax_rate,'Tax Inclusive':r.inclusive?'Yes':'No','Taxable Amount':r.taxable,'Tax Amount':r.tax_amount,'Shipping':r.shipping_charge||0,'Total Amount':r.total,'Order Status':r.status,'Notes':r.notes||''});
const csvSafe=x=>{let s=String(x??'');if(/^[\s]*[=+@\-]/.test(s)&&!/^-[\d.]+$/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
function download(name,blob){if(!adminMode)return toast('Only Admin can download backups');let u=URL.createObjectURL(blob),a=el('a',{href:u,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function excelDownload(name,rows,headers){if(!adminMode)return toast('Only Admin can export data');let safeRows=rows.map(row=>Object.fromEntries(headers.map(h=>[h,typeof row[h]==='string'&&/^[\s]*[=+@]/.test(row[h])?"'"+row[h]:row[h]??''])));if(window.XLSX){let ws=XLSX.utils.json_to_sheet(safeRows,{header:headers});ws['!cols']=headers.map(h=>({wch:Math.max(14,h.length+4)}));let wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'GreenRich');XLSX.writeFile(wb,name+'.xlsx')}else{let csv=[headers,...rows.map(r=>headers.map(h=>r[h]??''))].map(r=>r.map(csvSafe).join(',')).join('\r\n');download(name+'.csv',new Blob(['\ufeff'+csv],{type:'text/csv'}));toast('Excel library unavailable — exported CSV instead')}}
const salesHeaders=['Date','Internal Order ID','Order ID','Company','Channel','Customer','Product','SKU','Quantity','Unit Price','Tax %','Tax Inclusive','Taxable Amount','Tax Amount','Shipping','Total Amount','Order Status','Notes'];
function doExport(k){if(!adminMode)return toast('Only Admin can export data');if(k==='sales')return excelDownload('greenrich-sales-'+date(),data.sales.map(exportSales),salesHeaders);let list=data[k],headers=Object.keys(list[0]||({products:{name:'',sku:'',brand:'',price:'',tax:'',inclusive:'',active:''},channels:{name:'',type:'',active:''},customers:{name:'',mobile:'',email:'',address1:'',city:'',state:''},leads:{title:'',stage:'',value:'',followup:''},tasks:{title:'',due:'',status:''}}[k]));headers=headers.filter(h=>h!=='id');excelDownload('greenrich-'+k+'-'+date(),list,headers)}
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
   copy.sales.push({id:uid(),date:d,order_id:order,internal_order_id:internal,company_id:activeCompany,channel_id:c.id,channel_name:c.name,customer_id:cr?.id||'',customer_name:customer,product_id:p.id,product_name:p.name,sku:p.sku,qty,unit_price:unit,tax_rate:tax,inclusive,taxable:calc.base,tax_amount:calc.gst,total:calc.total,shipping_charge:0,status:String(get('order status','status')||'Completed'),notes:String(get('notes')||'')});
   if(consumesStock(copy.sales[copy.sales.length-1]))p.stock-=qty;
   count++;
  }
  if(!saveCompanyData(activeCompany,copy))return;
  render();
  toast('Imported '+count+' sales; '+invalid+' invalid, '+duplicates+' duplicate, '+stockSkipped+' insufficient stock. Internal IDs assigned.');
 }catch(error){toast('Import error: '+error.message)}
 finally{$('#upload-sales').value=''}
}
function bind(){ all('#navigation button[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));$('#mobile-menu').onclick=()=>{};$('#primary-action').onclick=()=>openEditor(titles[page][3]);$('#close-editor').onclick=$('#cancel-editor').onclick=()=>$('#editor').close();$('#editor-form').onsubmit=saveEditor;root.addEventListener('click',e=>{let b=e.target.closest('[data-edit],[data-delete],[data-export],[data-stock-update]');if(!b||!root.contains(b))return;if(b.dataset.stockUpdate){const current=data.products.find(p=>p.id===b.dataset.stockUpdate);if(!current)return;const entered=prompt('Enter new stock quantity for '+current.name,Number(current.stock||0));if(entered===null)return;const quantity=Number(entered);if(!Number.isInteger(quantity)||quantity<0)return toast('Stock quantity must be a whole number of 0 or more');const copy=JSON.parse(JSON.stringify(data));copy.products.find(p=>p.id===current.id).stock=quantity;if(saveCompanyData(activeCompany,copy)){render();toast('Stock updated for '+current.name)}return}if(b.dataset.edit){let[k,id]=b.dataset.edit.split(':');openEditor(k,id)}if(b.dataset.delete){let[k,id]=b.dataset.delete.split(':');removeRecord(k,id)}if(b.dataset.export){if(!adminMode)return toast('Only Admin can export data');doExport(b.dataset.export)}});['sales-search','customers-search','leads-search','tasks-search','products-search'].forEach(id=>$('#'+id).oninput=renderTables);['sales-channel-filter','lead-stage-filter','task-filter'].forEach(id=>$('#'+id).onchange=renderTables);['period','filter-channel','filter-from','filter-to'].forEach(id=>$('#'+id).onchange=renderDashboard);$('#clear-filters').onclick=()=>{$('#period').value='month';$('#filter-channel').value='all';$('#filter-from').value='';$('#filter-to').value='';renderDashboard()};$('#import-sales-btn').onclick=()=>{if(!adminMode)return toast('Only Admin can import sales');$('#upload-sales').click()};$('#upload-sales').onchange=e=>e.target.files[0]&&importSales(e.target.files[0]);$('#download-template').onclick=()=>excelDownload('greenrich-sales-template',[{'Date':date(),'Order ID':'AMZ-001','Channel':'Amazon','Customer':'','Product':'USE EXISTING PRODUCT NAME','SKU':'','Quantity':2,'Unit Price':199,'Tax %':5,'Tax Inclusive':'Yes','Taxable Amount':'','Tax Amount':'','Total Amount':'','Order Status':'Completed','Notes':'Example — replace this row'}],salesHeaders);$('#download-backup').onclick=()=>download('greenrich-backup-'+date()+'.json',new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));$('#restore-backup').onclick=()=>{if(!adminMode)return toast('Only Admin can restore backups');$('#upload-backup').click()};$('#upload-backup').onchange=async e=>{if(!adminMode){e.target.value='';return toast('Only Admin can restore backups')}let f=e.target.files[0];if(!f)return;try{let obj=JSON.parse(await f.text());if(!['sales','products','channels','customers','leads','tasks'].every(k=>Array.isArray(obj[k])))throw Error('Backup format invalid');if(!confirm('Replace ALL current browser data with this backup?'))return;data=obj;persist();render();toast('Backup restored')}catch(e){toast(e.message)}finally{e.target.value=''}}}
window.GreenRichCRM={
 mount:async(container,view,allowed,companyId='grow-india',companyName='GreenRich Grow India Pvt Ltd',adminTools=false,client=null,isAdmin=false)=>{
  if(!/^[a-z0-9][a-z0-9_-]{2,48}$/.test(companyId))throw Error('Invalid company selection');
  if(!client||!window.GreenRichSharedCustomers)throw Error('Shared customer service is unavailable. Refresh the page.');
  activeCompany=companyId;activeCompanyName=companyName;adminMode=adminTools===true;
  if(!container||!document.getElementById('grCrmTemplate'))throw Error('CRM workspace template is missing');
  charts.forEach(chart=>{try{chart.destroy()}catch(_){}});charts=[];
  allowedTabs=(Array.isArray(allowed)?allowed:Object.keys(titles)).filter(x=>Object.hasOwn(titles,x)&&(adminMode||!['channels','reports'].includes(x)));
  if(!allowedTabs.length)throw Error('Sales & CRM permission required');
  container.innerHTML='';
  root=document.createElement('div');root.id='grCrmWorkspace';
  root.append(document.getElementById('grCrmTemplate').content.cloneNode(true));
  container.append(root);
  const notice=$('.gr-crm-data-notice');if(notice)notice.textContent='Shared customers and tags · Available to all active employees across both GreenRich companies. Sales, products and stock for '+activeCompanyName+' still remain on this browser and are NOT synchronized across devices.';
  all('#navigation button[data-page]').forEach(button=>button.hidden=!allowedTabs.includes(button.dataset.page));
  data=ensureCRMData(JSON.parse(localStorage.getItem(storageKey())||'null')||initial());
  if(!['sales','products','channels','customers','leads','tasks'].every(k=>Array.isArray(data[k])))throw Error('Local CRM data needs restoration from a valid backup');
  await window.GreenRichSharedCustomers.ready({client,admin:isAdmin===true});
  data=ensureCRMData(JSON.parse(localStorage.getItem(storageKey())||'null')||initial());
  attachSharedCustomers(data);
  $('#today-label').textContent=new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric'}).format(new Date());
  bind();navigate(allowedTabs.includes(view)?view:allowedTabs[0]);
  return root;
 },
 refresh:()=>{if(root?.isConnected&&page==='dashboard')render()},
 unmount:()=>{charts.forEach(chart=>{try{chart.destroy()}catch(_){}});charts=[];root=null}
};
})();
