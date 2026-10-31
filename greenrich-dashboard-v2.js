'use strict';
/* GreenRich ONE Business Intelligence v2.
   All numbers are calculated from authorized Supabase records; no demo data.
   Existing per-employee gr_dashboard_preferences widget IDs are preserved. */
(()=>{
 const previous=window.GreenRichExecutiveDashboard;
 if(!previous)throw Error('Dashboard core must load before Business Intelligence v2');
 const W=previous.widgets;
 const LABELS=Object.fromEntries(W);
 const C=['#3869e9','#14b8a6','#8b5cf6','#f59e0b','#ec4899','#0ea5e9','#10b981','#ef646b'];
 const ORDER=['day_sales','channel_sales','sales','company_sales','leads','conversion','salespeople','telecaller','attendance','customers','followups','order_status','dispatch','stock','recent','accounts'];
 const ACCESS={attendance:'attendance',sales:'sales',day_sales:'sales',channel_sales:'sales',company_sales:'sales',leads:'leads',order_status:'sales',dispatch:'dispatch',stock:'stock',telecaller:'leads',customers:'customers',followups:'leads',conversion:'leads',salespeople:'leads',recent:'sales',accounts:'accounts'};
 const emptyRecords=()=>({sales:[],products:[],leads:[],dispatch:[],attendance:[],customers:[],tags:[],channels:[]});
 let host=null,viewRoot=null,client=null,config=null,records=emptyRecords(),visible=[],staff=[],errors={},loading=false,timer=null,subscription=null,debounce=null,epoch=0,stamp='',available=true;
 // #content remains connected across menu changes. Only the dashboard's own
 // .gr2 element proves this screen is still open.
 const isActive=()=>!!viewRoot?.isConnected&&!!host?.contains(viewRoot);
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=v=>Number.isFinite(Number(v))?Number(v):0;
 const fmt=v=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(number(v));
 const money=v=>'₹'+fmt(v);
 const pct=(part,total)=>(total?((part/total)*100).toFixed(1):'0.0')+'%';
 const dateKey=v=>{if(!v)return '';const d=new Date(v);if(!Number.isFinite(d.valueOf()))return String(v).slice(0,10);const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const k=Object.fromEntries(p.map(x=>[x.type,x.value]));return k.year+'-'+k.month+'-'+k.day};
 const today=()=>dateKey(Date.now());
 const periodStart=p=>{const d=new Date(),v=new Date(d.getFullYear(),d.getMonth(),d.getDate());if(p==='today'){}else if(p==='week')v.setDate(v.getDate()-((v.getDay()+6)%7));else if(p==='month')v.setDate(1);else if(p==='last30')v.setDate(v.getDate()-29);else if(p==='last90')v.setDate(v.getDate()-89);else return '';return [v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('-')};
 const company=id=>id==='grow-india'?'GreenRich Grow India':'GreenRich Enviro Solutions';
 const inRange=(value,from,to)=>{const s=dateKey(value);return !!s&&(!from||s>=from)&&(!to||s<=to)};
 const sum=(rows,prop)=>rows.reduce((n,r)=>n+number(typeof prop==='function'?prop(r):r[prop]),0);
 const countUnique=(rows,identity)=>new Set(rows.map(identity)).size;
 const group=(rows,name,value)=>{const m=new Map();for(const r of rows){const k=String(name(r)||'Unspecified'),v=value?number(value(r)):1;m.set(k,(m.get(k)||0)+v)}return [...m].sort((a,b)=>b[1]-a[1])};
 const query=id=>host?.querySelector(id);
 const val=id=>query(id)?.value||'';
 const userCan=m=>config?.admin||!config?.canModule||config.canModule(m)||(m==='sales'&&config.canModule('orders'));
 const has=id=>visible.includes(id)&&userCan(ACCESS[id]);
 const note=msg=>'<div class="gr2-empty">'+e(msg)+'</div>';
 const label=(name,value)=>'<div class="gr2-mini"><span>'+e(name)+'</span><strong>'+e(value)+'</strong></div>';
 const panel=(id,subtitle,inner,extra='')=>'<section class="gr2-panel gr2-panel-'+e(id)+'" data-widget="'+e(id)+'"><div class="gr2-panel-title"><div><small>'+e(LABELS[id]||id)+'</small><h3>'+e({
  day_sales:'Revenue trend',channel_sales:'Sales by channel',sales:'Sales overview',company_sales:'Company performance',
  leads:'Lead sources',conversion:'Lead conversion funnel',salespeople:'Salesperson performance',
  telecaller:'Telecaller & conversion',attendance:'Team attendance',customers:'Customer insights',
  followups:'Follow-up priorities',order_status:'Sales order approvals',dispatch:'Dispatch pipeline',
  stock:'Products & stock',recent:'Latest sales orders',accounts:'Accounts & finance'
 }[id]||LABELS[id])+'</h3><p>'+e(subtitle)+'</p></div><span class="gr2-panel-icon" aria-hidden="true">'+e({
  sales:'₹',day_sales:'↗',channel_sales:'◉',company_sales:'▥',leads:'◎',conversion:'⇄',
  salespeople:'★',telecaller:'☎',attendance:'✓',customers:'♙',followups:'◷',
  order_status:'✓',dispatch:'↗',stock:'▣',recent:'≡',accounts:'₹'
 }[id]||'•')+'</span></div>'+inner+(extra?'<p class="gr2-foot">'+e(extra)+'</p>':'')+'</section>';
 const listBars=(items,colors=C,formatter=fmt,limit=7)=>{const rows=items.filter(x=>number(x[1])>=0).slice(0,limit),max=Math.max(1,...rows.map(x=>number(x[1])));return rows.length?'<div class="gr2-bars">'+rows.map(([key,value],i)=>'<div class="gr2-bar-row"><div class="gr2-bar-line"><span title="'+e(key)+'">'+e(key)+'</span><b>'+e(formatter(value))+'</b></div><div class="gr2-bar-track"><i style="width:'+(number(value)===0?0:Math.max(2,number(value)/max*100))+'%;background:'+colors[i%colors.length]+'"></i></div></div>').join('')+'</div>':note('No matching data for these filters')};
 const donut=items=>{const nonzero=items.filter(x=>number(x[1])>0).slice(0,8),total=sum(nonzero,x=>x[1]);let angle=0;const stops=nonzero.map(([_,v],i)=>{const start=angle;angle+=number(v)/total*100;return C[i%C.length]+' '+start+'% '+angle+'%'}).join(',');
  return total?'<div class="gr2-donut-wrap"><div class="gr2-donut" style="background:conic-gradient('+stops+')"><div><b>'+fmt(total)+'</b><small>Total</small></div></div><div class="gr2-legend">'+nonzero.map(([name,value],i)=>'<div><i style="background:'+C[i%C.length]+'"></i><span>'+e(name)+'</span><strong>'+fmt(value)+'</strong></div>').join('')+'</div></div>':note('No records for the selected period')};
 const trend=(rows,from,to)=>{const daily=new Map();for(const r of rows){const day=dateKey(r.date||r.order_date||r.created_at);if(day)daily.set(day,(daily.get(day)||0)+number(r.total))}const keys=[...daily.keys()].sort(),groups=new Map();const monthly=keys.length>55||(from&&to&&(new Date(to)-new Date(from))/86400000>65);
  for(const key of keys){const k=monthly?key.slice(0,7):key;groups.set(k,(groups.get(k)||0)+daily.get(key))}
  const a=[...groups].slice(-25),values=a.map(x=>x[1]);if(!values.length)return note('No sales orders match your selected filters');
  const top=Math.max(1,...values),w=670,h=220,pad=28,innerW=w-2*pad,innerH=h-2*pad;
  const coords=values.map((v,i)=>[pad+(values.length===1?innerW/2:i*innerW/(values.length-1)),pad+innerH-(v/top*innerH)]);
  const points=coords.map(x=>x.join(',')).join(' '),end=coords[coords.length-1];
  const fill='M'+coords[0][0]+','+(h-pad)+' L'+coords.map(p=>p.join(',')).join(' L')+' L'+end[0]+','+(h-pad)+' Z';
  return '<div class="gr2-chart-scroll"><svg class="gr2-line" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Revenue line chart for selected sales dates"><defs><linearGradient id="gr2Area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#5b8bfa" stop-opacity=".29"/><stop offset="100%" stop-color="#5b8bfa" stop-opacity="0"/></linearGradient></defs>'+
   [0,1,2,3,4].map(i=>'<line x1="'+pad+'" x2="'+(w-pad)+'" y1="'+(pad+i*innerH/4)+'" y2="'+(pad+i*innerH/4)+'" stroke="#e8eef8" stroke-dasharray="3 5"/>').join('')+
   '<path d="'+fill+'" fill="url(#gr2Area)"/><polyline points="'+points+'" fill="none" stroke="#3669e9" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'+
   coords.map(([x,y],i)=>'<circle cx="'+x+'" cy="'+y+'" r="4" fill="#fff" stroke="#3869e9" stroke-width="2"><title>'+e(a[i][0])+' · '+e(money(a[i][1]))+'</title></circle>').join('')+
   [0,Math.floor((a.length-1)/2),a.length-1].filter((x,i,b)=>b.indexOf(x)===i).map(i=>'<text x="'+coords[i][0]+'" y="'+(h-3)+'" text-anchor="middle" font-size="12" fill="#8291a8">'+e(a[i][0].slice(5))+'</text>').join('')+'</svg></div><div class="gr2-under"><span>Actual sales records</span><strong>'+money(sum(rows,'total'))+'</strong></div>'};
 const columns=(items,formatter=fmt)=>{const rows=items.filter(x=>number(x[1])>=0).slice(0,10),max=Math.max(1,...rows.map(x=>number(x[1])));return rows.length?'<div class="gr2-columns">'+rows.map(([k,v],i)=>'<div class="gr2-column"><span>'+e(formatter(v))+'</span><div class="gr2-column-track"><i style="height:'+(number(v)===0?0:Math.max(3,number(v)/max*100))+'%;background:'+C[i%C.length]+'"></i></div><small title="'+e(k)+'">'+e(k)+'</small></div>').join('')+'</div>':note('No matching revenue records')};
 function filters(){
  const p=val('#gr2-period')||'month',from=p==='custom'?val('#gr2-from'):periodStart(p),to=p==='custom'?val('#gr2-to'):p==='all'?'':today();
  return {period:p,from,to,company:val('#gr2-company')||'all',source:val('#gr2-source')||'all',channel:val('#gr2-channel')||'all',tag:val('#gr2-tag')||'all',product:val('#gr2-product')||'all',person:val('#gr2-person')||'all',stage:val('#gr2-stage')||'all',order:val('#gr2-order')||'all',dispatch:val('#gr2-dispatch')||'all',type:val('#gr2-type')||'all'};
 }
 function filtered(){
  const f=filters(),co=x=>f.company==='all'||x.company_id===f.company;
  const checkCustomer=x=>f.type==='all'||x.type===f.type;
  const customerIds=new Set(records.customers.filter(checkCustomer).map(x=>x.id));
  const matchLead=l=>co(l)&&(f.source==='all'||l.source===f.source)&&(f.tag==='all'||(l.tag_ids||[]).includes(f.tag))&&
   (f.stage==='all'||l.stage===f.stage)&&(f.person==='all'||l.assigned_to===f.person)&&
   (f.product==='all'||l.product_id===f.product||(l.product_interest_ids||[]).includes(f.product))&&
   (f.type==='all'||customerIds.has(l.customer_id));
  const eligibleLeads=records.leads.filter(matchLead),leads=eligibleLeads.filter(l=>inRange(l.created_at||l.date,f.from,f.to));
  const relatedOrders=new Set(eligibleLeads.filter(l=>l.won_order_id).map(l=>l.company_id+'|'+l.won_order_id));
  const restrictOrders=f.source!=='all'||f.tag!=='all'||f.stage!=='all'||f.person!=='all';
  const sales=records.sales.filter(s=>co(s)&&inRange(s.date||s.order_date,f.from,f.to)&&
   (f.channel==='all'||(s.channel_name||s.channel)===f.channel)&&(f.product==='all'||s.product_id===f.product)&&
   (f.order==='all'||s.status===f.order)&&(f.type==='all'||customerIds.has(s.customer_id))&&
   (!restrictOrders||relatedOrders.has(s.company_id+'|'+s.id)));
  const saleIds=new Set(sales.map(s=>s.company_id+'|'+s.id));
  const dispatch=records.dispatch.filter(d=>co(d)&&inRange(d.order_date||d.approved_at,f.from,f.to)&&
   (f.dispatch==='all'||d.status===f.dispatch)&&(f.channel==='all'||d.channel===f.channel)&&
   (f.product==='all'||d.sku===f.product||sales.some(s=>s.company_id===d.company_id&&s.id===d.source_sale_id&&s.product_id===f.product))&&
   (restrictOrders||f.order!=='all'||f.type!=='all'||f.product!=='all'?saleIds.has(d.company_id+'|'+d.source_sale_id):true));
  const linkedCustomerIds=new Set([...sales.map(s=>s.customer_id),...eligibleLeads.map(l=>l.customer_id)].filter(Boolean));
  const restrictedCustomer=f.company!=='all'||f.source!=='all'||f.tag!=='all'||f.stage!=='all'||f.channel!=='all'||f.person!=='all'||f.order!=='all'||f.product!=='all';
  const customers=records.customers.filter(c=>checkCustomer(c)&&(!restrictedCustomer||linkedCustomerIds.has(c.id)));
  const followups=eligibleLeads.filter(l=>l.stage!=='Won'&&l.stage!=='Lost'&&l.next_followup_at&&inRange(l.next_followup_at,f.from,f.to));
  const products=records.products.filter(p=>co(p)&&(f.product==='all'||p.id===f.product||p.sku===f.product));
  const attendance=records.attendance.filter(a=>inRange(a.date||a.attendance_date,f.from,f.to)&&(f.person==='all'||a.user_id===f.person));
  return {...f,leads,eligibleLeads,sales,dispatch,customers,followups,products,attendance};
 }
 function choices(id,label,items){
  const sel=query(id);if(!sel)return;const prior=sel.value;
  sel.innerHTML='<option value="all">'+e(label)+'</option>'+items.map(([v,name])=>'<option value="'+e(v)+'">'+e(name)+'</option>').join('');
  if([...sel.options].some(x=>x.value===prior))sel.value=prior;
 }
 function updateChoices(){
  choices('#gr2-source','All lead sources',[...new Set(records.leads.map(x=>x.source).filter(Boolean))].sort().map(x=>[x,x]));
  choices('#gr2-channel','All sales channels',[...new Set([...records.sales.map(x=>x.channel_name||x.channel),...records.dispatch.map(x=>x.channel)].filter(Boolean))].sort().map(x=>[x,x]));
  choices('#gr2-tag','All tags',records.tags.map(x=>[x.id,x.name]));
  choices('#gr2-product','All products',[...new Map(records.products.map(x=>[x.id||x.sku,[x.id||x.sku,x.name||x.sku||'Product']]).filter(x=>x[0])).values()]);
  choices('#gr2-person','All salespeople',[...new Map(staff.map(x=>[x.id,[x.id,x.full_name||'Employee']])).values()]);
  choices('#gr2-stage','All lead stages',['New','Contacted','Qualified','Quotation','Won','Lost'].map(x=>[x,x]));
  choices('#gr2-order','All order statuses',[...new Set(records.sales.map(x=>x.status).filter(Boolean))].map(x=>[x,x]));
  choices('#gr2-dispatch','All dispatch stages',[...new Set(records.dispatch.map(x=>x.status).filter(Boolean))].map(x=>[x,x]));
  choices('#gr2-type','All customer types',[...new Set(records.customers.map(x=>x.type).filter(Boolean))].map(x=>[x,x]));
 }
 function draw(){
  if(!isActive())return;
  const f=filtered(),sale=f.sales.filter(s=>!['Cancelled','Returned'].includes(s.status)),won=f.leads.filter(l=>l.stage==='Won');
  const orderCount=countUnique(sale,s=>s.company_id+'|'+(s.internal_order_id||s.order_id||s.id));
  const due=f.followups.filter(l=>new Date(l.next_followup_at).valueOf()<=Date.now());
  const awaiting=f.dispatch.filter(d=>!['Delivered','Shipped','Cancelled'].includes(d.status));
  const canId=id=>has(id);
  const kpis=[
   ['Revenue',money(sum(sale,'total')),'sales','blue'],
   ['Sales orders',fmt(orderCount),'sales','teal'],
   ['Customers',fmt(f.customers.length),'customers','violet'],
   ['Won conversion',pct(won.length,f.leads.length),'conversion','orange'],
   ['Follow-ups due',fmt(due.length),'followups','rose'],
   ['Dispatch queue',fmt(awaiting.length),'dispatch','sky'],
   ['Present days',fmt(f.attendance.filter(a=>/present|in|worked/i.test(a.status||'')).length),'attendance','green'],
   ['Stock alerts',fmt(f.products.filter(p=>p.stock!=null&&number(p.stock)<=5).length),'stock','amber']
  ].filter(k=>canId(k[2]));
  query('#gr2-kpis').innerHTML=kpis.map(([name,v,_,color],i)=>'<article class="gr2-kpi" data-color="'+color+'"><span class="gr2-kpi-symbol">'+['↗','▤','♙','◎','◷','↗','✓','!'][i%8]+'</span><small>'+e(name)+'</small><strong>'+e(v)+'</strong><p>'+e(f.period==='all'?'All accessible records':f.from&&f.to?f.from+' — '+f.to:'Current filter')+'</p></article>').join('')||note('Your administrator has not enabled dashboard widgets for this role.');
  const approved=sale.filter(s=>!!f.dispatch.find(d=>d.company_id===s.company_id&&d.source_sale_id===s.id)||s.approval_status==='Approved');
  const pending=sale.filter(s=>!approved.includes(s));
  const stages=['New','Contacted','Qualified','Quotation','Won','Lost'];
  const stageCounts=stages.map(x=>[x,f.leads.filter(l=>l.stage===x).length]);
  const bySource=group(f.leads,l=>l.source);
  const perStaff=group(f.leads,l=>staff.find(p=>p.id===l.assigned_to)?.full_name||'Unassigned');
  const owned=staff.map(p=>{
   const mine=f.leads.filter(l=>l.assigned_to===p.id),orders=new Set(mine.filter(l=>l.stage==='Won'&&l.won_order_id).map(l=>l.company_id+'|'+l.won_order_id));
   return {name:p.full_name||'Employee',all:mine.length,won:mine.filter(l=>l.stage==='Won').length,
    orderValue:sum(sale.filter(x=>orders.has(x.company_id+'|'+x.id)),'total')};
  }).filter(x=>x.all).sort((a,b)=>b.orderValue-a.orderValue||b.won-a.won||b.all-a.all).slice(0,8);
  const content={
   day_sales:()=>panel('day_sales','Sales date · income by day or month',trend(sale,f.from,f.to)),
   channel_sales:()=>panel('channel_sales','Revenue distribution by recorded order channel',donut(group(sale,s=>s.channel_name||s.channel,s=>s.total))),
   sales:()=>panel('sales','Filtered sales orders and amount',label('Revenue',money(sum(sale,'total')))+label('Order count',fmt(orderCount))+label('Units sold',fmt(sum(sale,s=>s.qty||s.quantity)))+label('Average order',orderCount?money(sum(sale,'total')/orderCount):'₹0')+listBars([['GST',sum(sale,s=>s.tax_amount||s.tax_total)],['Taxable value',sum(sale,s=>s.taxable||s.subtotal)]],C,money,2)),
   company_sales:()=>panel('company_sales','Both GreenRich companies · order values',columns(group(sale,s=>company(s.company_id),s=>s.total),money)),
   leads:()=>panel('leads','Lead creation date · recorded marketing source',
     '<div class="gr2-split"><div><h4>Enquiries by source</h4>'+listBars(bySource,C,fmt,9)+'</div><div><h4>Product enquiries</h4>'+
     listBars(group(f.leads,l=>records.products.find(p=>p.id===l.product_id&&p.company_id===l.company_id)?.name||l.product_interest||l.product_id||'Unspecified'),C,fmt,7)+'</div></div>',
     'Sources and product interests from accessible lead records'),
   conversion:()=>panel('conversion','Stages and customer conversions',donut(stageCounts)+label('Conversion rate',pct(won.length,f.leads.length))+label('Won leads',fmt(won.length))),
   salespeople:()=>panel('salespeople','Won leads versus assigned enquiries',owned.length?'<div class="gr2-leader">'+owned.map((p,i)=>'<div><span class="gr2-place">'+(i+1)+'</span><span class="gr2-person">'+e(p.name)+'</span><div class="gr2-leader-track"><i style="width:'+Math.round(100*p.won/Math.max(1,p.all))+'%"></i></div><strong>'+fmt(p.won)+' / '+fmt(p.all)+'<small>'+money(p.orderValue)+'</small></strong></div>').join('')+'</div>':note('No assigned leads in this period')),
   telecaller:()=>{const calls=f.leads.filter(l=>/telecall|telephone|phone call/i.test(l.source||'')||/telecall/i.test(staff.find(p=>p.id===l.assigned_to)?.role||''));return panel('telecaller','Source or owner identified as telecalling',label('Telecalling leads',fmt(calls.length))+label('Won',fmt(calls.filter(l=>l.stage==='Won').length))+label('Conversion',pct(calls.filter(l=>l.stage==='Won').length,calls.length))+label('Calls today','Not tracked')+listBars(group(calls,l=>staff.find(p=>p.id===l.assigned_to)?.full_name||'Unassigned'),C,fmt,6),'Calls today remain Not tracked until a call-log or dialer integration is connected.')},
   attendance:()=>panel('attendance','Recorded attendance in the selected date range',donut(group(f.attendance,a=>a.status||'Unknown'))+label('Entries',fmt(f.attendance.length))+(errors.attendance?note('Attendance is unavailable for this account: '+errors.attendance):''),'Attendance is employee-based, not attributed to a company.'),
   customers:()=>panel('customers','Shared customer directory · linked-company scope',label('Customers',fmt(f.customers.length))+label('New in period',fmt(f.customers.filter(c=>inRange(c.created_at,f.from,f.to)).length))+listBars(group(f.customers,c=>c.type||'Unspecified'),C,fmt,6)),
   followups:()=>panel('followups','Scheduled dates · overdue and due now',label('Due / overdue',fmt(due.length))+label('Scheduled in range',fmt(f.followups.length))+
     (f.followups.length?'<div class="gr2-activity">'+f.followups.slice().sort((a,b)=>new Date(a.next_followup_at)-new Date(b.next_followup_at)).slice(0,6).map(l=>'<div><span class="gr2-dot"></span><div><strong>'+e(l.contact||l.title||'Lead')+'</strong><small>'+e(l.stage||'')+' · '+e(dateKey(l.next_followup_at))+'</small></div><b>'+e(new Date(l.next_followup_at).getTime()<=Date.now()?'Due':'Upcoming')+'</b></div>').join('')+'</div>':note('No follow-ups in this period'))),
   order_status:()=>panel('order_status','Pending, approved and cancelled orders',donut([['Approved',approved.length],['Pending',pending.length],['Cancelled / returned',f.sales.filter(s=>['Cancelled','Returned'].includes(s.status)).length]])),
   dispatch:()=>panel('dispatch','Latest recorded delivery and courier stages',listBars(group(f.dispatch,d=>d.status||'Pending'),C,fmt,8)+label('Total dispatch orders',fmt(f.dispatch.length))),
   stock:()=>panel('stock','Current stock · date filters do not change stock snapshot',label('Products',fmt(f.products.length))+label('Low stock (≤5)',fmt(f.products.filter(p=>p.stock!=null&&number(p.stock)<=5).length))+
     listBars(f.products.slice().sort((a,b)=>number(a.stock)-number(b.stock)).slice(0,7).map(p=>[p.name||p.sku||'Product',number(p.stock)]),C,fmt,7)),
   recent:()=>panel('recent','Recent orders matching the selected filters',sale.length?'<div class="gr2-table-wrap"><table class="gr2-table"><thead><tr><th>Sales order ID</th><th>Customer</th><th>Company</th><th>Channel</th><th>Date</th><th>Status</th><th>Value</th></tr></thead><tbody>'+sale.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,12).map(s=>'<tr><td><strong>'+e(s.internal_order_id||s.order_id||s.id)+'</strong></td><td>'+e(s.customer_name||'—')+'</td><td>'+e(company(s.company_id))+'</td><td>'+e(s.channel_name||'—')+'</td><td>'+e(dateKey(s.date))+'</td><td><span class="gr2-status">'+e(s.status||'Recorded')+'</span></td><td><b>'+e(money(s.total))+'</b></td></tr>').join('')+'</tbody></table></div>':note('No matching sales orders')),
   accounts:()=>panel('accounts','Accounting ledger connection status',note('Accounts ledger tables are not installed. Receivables, payables and cash balances cannot be reported yet.'),'Connect and authorize the Accounts posting tables to enable verified financial figures.')
  };
  query('#gr2-content').innerHTML=ORDER.filter(id=>has(id)&&content[id]).map(id=>content[id]()).join('')||note('No dashboard widgets are enabled. Ask an administrator to enable access in Settings → Dashboard Access.');
  query('#gr2-active').textContent=fmt(ORDER.filter(has).length)+' available widgets';
  query('#gr2-stamp').textContent=stamp?'Last updated '+new Date(stamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'Waiting for data';
  query('#gr2-summary').textContent=(f.from||'All time')+' → '+(f.to||'Today')+' · '+(f.company==='all'?'Assigned companies':company(f.company));
 }
 const asyncLoad=async(fn,field,defaultValue=[])=>{try{const d=await fn();if(d.error)throw Error(d.error.message);return d.data||defaultValue}catch(err){errors[field]=err.message;return defaultValue}};
 async function paged(name,make){const result=[];for(let i=0;i<10000;i+=750){const r=await make(i,i+749);if(r.error)throw Error(r.error.message);result.push(...(r.data||[]));if(!r.data||r.data.length<750)break}return result}
 async function refresh(){
  if(!isActive()||loading)return;
  loading=true;const token=epoch,button=query('#gr2-refresh');
  if(button){button.disabled=true;button.textContent='Refreshing…'}
  errors={};
  try{
   const companyIds=config.companyIds||[],access={
    sales:userCan('sales'),stock:userCan('stock'),leads:userCan('leads'),customers:userCan('customers'),
    dispatch:userCan('dispatch'),attendance:userCan('attendance')
   };
   const tasks=[
    asyncLoad(()=>client.from('gr_dashboard_preferences').select('widgets').eq('user_id',config.userId).maybeSingle(),'preferences',null),
    access.sales||access.stock||access.leads?
     asyncLoad(()=>paged('CRM',(a,b)=>client.from('gr_crm_records').select('company_id,kind,record_id,payload').in('company_id',companyIds).in('kind',['sales','products','leads','channels']).range(a,b)).then(data=>({data})),'crm') : Promise.resolve([]),
    access.leads?asyncLoad(()=>paged('Leads',(a,b)=>client.from('gr_lead_pipeline').select('*').in('company_id',companyIds).range(a,b)).then(data=>({data})),'leads'):Promise.resolve([]),
    access.dispatch?asyncLoad(()=>paged('Dispatch',(a,b)=>client.from('gr_dispatch_orders').select('*').in('company_id',companyIds).range(a,b)).then(data=>({data})),'dispatch'):Promise.resolve([]),
    access.customers?asyncLoad(()=>paged('Customers',(a,b)=>client.from('gr_crm_customers').select('id,name,type,tag_ids,created_at').range(a,b)).then(data=>({data})),'customers'):Promise.resolve([]),
    access.attendance?asyncLoad(()=>paged('Attendance',(a,b)=>client.from('grm_attendance').select('user_id,date,status,check_in,check_out').is('deleted_at',null).range(a,b)).then(data=>({data})),'attendance'):Promise.resolve([]),
    access.leads?Promise.all(companyIds.map(c=>client.rpc('gr_pipeline_staff',{p_company:c}))).catch(()=>[]):Promise.resolve([]),
    access.leads?asyncLoad(()=>client.from('gr_crm_tags').select('id,name').limit(750),'tags'):Promise.resolve([])
   ];
   const [pref,crm,leads,dispatch,customers,attendance,staffData,tags]=await Promise.all(tasks);
   if(token!==epoch||!isActive())return;
   const fresh=emptyRecords();
   for(const r of crm||[]){if(!r.payload||!fresh[r.kind])continue;fresh[r.kind].push({...r.payload,id:r.payload.id||r.record_id,company_id:r.company_id})}
   const storedLeads=new Map(fresh.leads.map(l=>[l.company_id+'|'+l.id,l]));
   fresh.leads=(leads||[]).map(l=>({...storedLeads.get(l.company_id+'|'+l.lead_id),...l,id:l.lead_id}));
   fresh.dispatch=dispatch||[];fresh.customers=customers||[];fresh.attendance=attendance||[];fresh.tags=tags||[];
   records=fresh;staff=[...new Map((staffData||[]).flatMap(x=>x.data||[]).map(x=>[x.id,x])).values()];
   visible=Array.isArray(pref?.widgets)?pref.widgets:W.map(x=>x[0]);
   stamp=new Date().toISOString();
   updateChoices();draw();
   const loadingEl=query('#gr2-loading');if(loadingEl)loadingEl.hidden=true;
   if(Object.keys(errors).length)window.GreenRichNotify?.('Some dashboard modules could not be loaded. Check your access settings.','warning');
  }catch(err){if(token!==epoch||!isActive())return;const el=query('#gr2-loading');if(el){el.hidden=false;el.textContent='Dashboard could not refresh: '+err.message}window.GreenRichNotify?.(err.message,'error')}
  finally{loading=false;if(button?.isConnected){button.disabled=false;button.textContent='↻ Refresh'}}
 }
 function sheetData(){
  const f=filtered(),sections=[],hasAny=visible.some(has);
  if(!hasAny)return sections;
  const allow=id=>has(id);
  sections.push(['Filters',[{Period:f.period,From:f.from||'All time',To:f.to||'All time',Company:f.company,Source:f.source,Channel:f.channel,Tag:f.tag,Product:f.product,Salesperson:f.person,Stage:f.stage,OrderStatus:f.order,DispatchStatus:f.dispatch,CustomerType:f.type}]]);
  const s=f.sales.filter(x=>!['Cancelled','Returned'].includes(x.status));
  if(['sales','day_sales','channel_sales','company_sales','recent','order_status'].some(allow))
   sections.push(['Sales Orders',f.sales.map(x=>({Company:company(x.company_id),OrderId:x.internal_order_id||x.order_id||x.id,Date:dateKey(x.date),Customer:x.customer_name,Product:x.product_name,Channel:x.channel_name||x.channel,Status:x.status,Value:x.total,GST:x.tax_amount}))]);
  if(['leads','conversion','followups','telecaller','salespeople'].some(allow))
   sections.push(['Leads',f.leads.map(l=>({Company:company(l.company_id),Lead:l.contact||l.title,Stage:l.stage,Source:l.source,Owner:staff.find(p=>p.id===l.assigned_to)?.full_name||'Unassigned',Created:dateKey(l.created_at),NextFollowup:dateKey(l.next_followup_at),WonOrder:l.won_order_id}))]);
  if(allow('dispatch'))sections.push(['Dispatch',f.dispatch.map(d=>({Company:company(d.company_id),Order:d.order_id||d.source_sale_id,Customer:d.customer_name,Channel:d.channel,Date:dateKey(d.order_date),Status:d.status,Amount:d.order_total}))]);
  if(allow('stock'))sections.push(['Stock',f.products.map(p=>({Company:company(p.company_id),Product:p.name||p.sku,SKU:p.sku,Available:p.stock}))]);
  if(allow('customers'))sections.push(['Customers',f.customers.map(c=>({Customer:c.name,Type:c.type,Created:dateKey(c.created_at)}))]);
  if(allow('attendance'))sections.push(['Attendance',f.attendance.map(a=>({Date:dateKey(a.date),Employee:staff.find(p=>p.id===a.user_id)?.full_name||a.user_id,Status:a.status}))]);
  sections.splice(1,0,['Summary',[
   ...(allow('sales')?[{Metric:'Sales revenue',Value:sum(s,'total')},{Metric:'Sales orders',Value:countUnique(s,x=>x.company_id+'|'+(x.internal_order_id||x.id))}]:[]),
   ...(allow('customers')?[{Metric:'Customers',Value:f.customers.length}]:[]),
   ...(allow('conversion')?[{Metric:'Won rate',Value:pct(f.leads.filter(l=>l.stage==='Won').length,f.leads.length)}]:[]),
   ...(allow('followups')?[{Metric:'Follow-ups due',Value:f.followups.filter(l=>new Date(l.next_followup_at).valueOf()<=Date.now()).length}]:[])
  ]]);
  return sections;
 }
 const library=async(url,fn)=>{if(fn())return;await new Promise((yes,no)=>{const s=document.createElement('script');s.src=url;s.onload=yes;s.onerror=()=>no(Error('Export library could not be loaded'));document.head.append(s)});if(!fn())throw Error('Export library unavailable')};
 async function exportFile(kind){
  if(!config.canExport){window.GreenRichNotify?.('Dashboard export permission required','error');return}
  const sheets=sheetData();
  if(!sheets.length){window.GreenRichNotify?.('There are no permitted dashboard sections to export','warning');return}
  const btn=query(kind==='excel'?'#gr2-excel':'#gr2-pdf');if(btn)btn.disabled=true;
  try{
   if(kind==='excel'){
    await library('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',()=>!!window.XLSX);
    const wb=window.XLSX.utils.book_new();
    for(const [name,rows] of sheets){
     const ws=window.XLSX.utils.json_to_sheet(rows.length?rows:[{Status:'No matching records'}]);
     window.XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));
    }
    window.XLSX.writeFile(wb,'greenrich-dashboard-'+today()+'.xlsx');
   }else{
    await library('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',()=>!!window.jspdf?.jsPDF);
    const doc=new window.jspdf.jsPDF({format:'a4',unit:'mm'});let y=17;
    const line=(str,size=9)=>{const lines=doc.splitTextToSize(String(str??''),186);doc.setFontSize(size);for(const txt of lines){if(y>280){doc.addPage();y=17}doc.text(txt,12,y);y+=Math.max(4,size*.47)}};
    doc.setFillColor(40,84,185);doc.rect(0,0,210,34,'F');doc.setTextColor(255,255,255);doc.setFontSize(17);doc.text('GREENRICH ONE  |  Business Dashboard',12,17);doc.setFontSize(9);doc.text('Filtered report · '+new Date().toLocaleString('en-IN'),12,25);
    y=43;doc.setTextColor(25,48,85);
    for(const [name,rows] of sheets){
     if(y>257){doc.addPage();y=17}
     doc.setFontSize(13);doc.setTextColor(38,90,182);line(name+'  ('+rows.length+' entries)',13);y+=2;doc.setTextColor(35,54,77);
     const maxRows=name==='Sales Orders'||name==='Leads'?65:30;
     for(const row of rows.slice(0,maxRows)){const entries=Object.entries(row).filter(([_,value])=>value!==''&&value!=null).slice(0,7);line(entries.map(([key,value])=>key+': '+value).join('   |   '),8);y+=1}
     if(rows.length>maxRows)line('Showing '+maxRows+' of '+rows.length+' records. Download Excel for the complete table.',8);
     if(!rows.length)line('No matching records',8);y+=6;
    }
    doc.save('greenrich-dashboard-'+today()+'.pdf');
   }
   window.GreenRichNotify?.('Dashboard '+(kind==='excel'?'Excel':'PDF')+' exported successfully','success');
  }catch(err){window.GreenRichNotify?.('Export failed: '+err.message,'error')}finally{if(btn)btn.disabled=false}
 }
 function reset(){
  for(const x of host.querySelectorAll('.gr2-filter select'))x.value=x.id==='gr2-period'?'month':'all';
  for(const x of host.querySelectorAll('.gr2-filter input[type=date]'))x.value='';
  query('#gr2-advanced').open=false;draw();
 }
 function stop(){
  // Invalidate any in-flight fetch *before* another page replaces #content.
  epoch++;viewRoot=null;
  if(timer)clearInterval(timer);timer=null;
  if(debounce)clearTimeout(debounce);debounce=null;
  if(subscription&&client?.removeChannel)void client.removeChannel(subscription);
  subscription=null;
 }
 async function mount(container,cfg){
  stop();host=container;client=cfg.db;config=cfg;records=emptyRecords();visible=W.map(x=>x[0]);staff=[];stamp='';errors={};
  host.innerHTML='<div class="gr2"><div class="gr2-heading"><div><span class="gr2-eyebrow"><i></i> GREENRICH ONE · BUSINESS INTELLIGENCE</span><h2>Business overview</h2><p>Sales, customers, employees and operations — one connected workspace</p></div><div class="gr2-heading-end"><span class="gr2-live"><i></i> Connected CRM</span><small id="gr2-stamp">Loading data…</small></div></div>'+
   '<div class="gr2-toolbar"><div class="gr2-toolbar-heading"><strong>Dashboard filters</strong><span id="gr2-summary">Current month</span></div><div class="gr2-filter gr2-quick">'+
   '<label>Reporting period<select id="gr2-period"><option value="today">Today</option><option value="week">This week</option><option value="month" selected>This month</option><option value="last30">Last 30 days</option><option value="last90">Last 90 days</option><option value="all">All time</option><option value="custom">Custom range</option></select></label>'+
   '<label>Company<select id="gr2-company"><option value="all">All assigned companies</option>'+(cfg.companyIds||[]).map(id=>'<option value="'+e(id)+'">'+e(company(id))+'</option>').join('')+'</select></label>'+
   '<label>Salesperson<select id="gr2-person"><option value="all">All salespeople</option></select></label>'+
   '<label>Sales channel<select id="gr2-channel"><option value="all">All sales channels</option></select></label></div>'+
   '<details id="gr2-advanced" class="gr2-advanced"><summary>More filters <span>Sources · Tags · Products · Stages · Statuses · Customer types · Dates</span></summary><div class="gr2-filter gr2-expanded">'+
   '<label>Lead source<select id="gr2-source"><option value="all">All lead sources</option></select></label>'+
   '<label>Tag<select id="gr2-tag"><option value="all">All tags</option></select></label>'+
   '<label>Product<select id="gr2-product"><option value="all">All products</option></select></label>'+
   '<label>Lead stage<select id="gr2-stage"><option value="all">All lead stages</option></select></label>'+
   '<label>Order status<select id="gr2-order"><option value="all">All order statuses</option></select></label>'+
   '<label>Dispatch stage<select id="gr2-dispatch"><option value="all">All dispatch stages</option></select></label>'+
   '<label>Customer type<select id="gr2-type"><option value="all">All customer types</option></select></label>'+
   '<label>From date<input id="gr2-from" type="date"></label><label>To date<input id="gr2-to" type="date"></label></div></details>'+
   '<div class="gr2-buttons"><span id="gr2-active">Loading widgets</span><button id="gr2-reset" type="button">Reset filters</button><button id="gr2-refresh" type="button">↻ Refresh</button>'+
   (cfg.canExport?'<button class="gr2-excel" id="gr2-excel" type="button">↓ Export Excel</button><button class="gr2-pdf" id="gr2-pdf" type="button">↓ Export PDF</button>':'')+'</div></div>'+
   '<div id="gr2-loading" class="gr2-loading">Loading authorized, real-time CRM information…</div><div class="gr2-kpis" id="gr2-kpis"></div><div class="gr2-panels" id="gr2-content"></div><div class="gr2-disclaimer">Figures reflect records you are permitted to view. Date filters use lead creation date and sales order date; follow-ups use their due date. Stock is current, and attendance belongs to employees rather than individual companies. Salesperson sales value uses Won leads linked to order IDs. Data refreshes automatically and when CRM changes are received.</div></div>';
  viewRoot=host.querySelector('.gr2');
  if(cfg.companyIds?.length===1){query('#gr2-company').value=cfg.companyIds[0];query('#gr2-company').disabled=true}
  else if((cfg.companyIds||[]).includes(cfg.selectedCompany))query('#gr2-company').value=cfg.selectedCompany;
  host.addEventListener('change',event=>{
   if(!event.target.matches('.gr2-filter input,.gr2-filter select'))return;
   if(['gr2-from','gr2-to'].includes(event.target.id))query('#gr2-period').value='custom';
   draw();
  });
  query('#gr2-reset').onclick=reset;
  query('#gr2-refresh').onclick=()=>void refresh();
  if(cfg.canExport){query('#gr2-excel').onclick=()=>void exportFile('excel');query('#gr2-pdf').onclick=()=>void exportFile('pdf')}
  await refresh();
  // Navigation may have removed this dashboard while its initial query ran.
  if(!isActive())return;
  timer=setInterval(()=>{if(isActive()&&document.visibilityState!=='hidden')void refresh()},45000);
  if(client?.channel){
   try{subscription=client.channel('gr2-bi-'+Date.now()).on('postgres_changes',{event:'*',schema:'public',table:'gr_crm_records'},()=>{
    if(debounce)clearTimeout(debounce);
    debounce=setTimeout(()=>{if(isActive())void refresh()},750);
   }).subscribe()}catch(err){console.warn('Dashboard realtime channel unavailable; polling remains active',err)}
  }
 }
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&isActive())void refresh()});
 window.GreenRichExecutiveDashboard={...previous,mount,widgets:W,periodStart:previous.periodStart||periodStart};
 window.GreenRichDashboardV2={filtered,filters,refresh,stop,isActive};
})();
