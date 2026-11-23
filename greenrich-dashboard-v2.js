'use strict';
/* GreenRich ONE Business Intelligence v2.
   All numbers are calculated from authorized Supabase records; no demo data.
   Existing per-employee gr_dashboard_preferences widget IDs are preserved. */
(()=>{
 const previous=window.GreenRichExecutiveDashboard;
 if(!previous)throw Error('Dashboard core must load before Business Intelligence v2');
 const charts=window.GreenRichDashboardCharts;
 const W=previous.widgets;
 const LABELS=Object.fromEntries(W);
 const C=['#178d77','#b36a4f','#739a90','#c99546','#8d78b0','#4189a2','#82a85a','#c87477'];
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
  leads:'Lead sources',conversion:'Lead stage distribution',salespeople:'Salesperson performance',
  telecaller:'Telecaller & conversion',attendance:'Team attendance',customers:'Customer insights',
  followups:'Follow-up priorities',order_status:'Sales order approvals',dispatch:'Dispatch pipeline',
  stock:'Stock & price insights',recent:'Latest sales orders',accounts:'Accounts & finance'
 }[id]||LABELS[id])+'</h3><p>'+e(subtitle)+'</p></div><span class="gr2-panel-icon" aria-hidden="true">'+charts.icon(id)+'</span></div>'+inner+(extra?'<p class="gr2-foot">'+e(extra)+'</p>':'')+'</section>';
 const listBars=(items,colors=C,formatter=fmt,limit=7)=>{const rows=items.filter(x=>number(x[1])>=0).slice(0,limit),max=Math.max(1,...rows.map(x=>number(x[1])));return rows.length?'<div class="gr2-bars">'+rows.map(([key,value],i)=>'<div class="gr2-bar-row gr2-hoverable" tabindex="0" data-tip="'+e(key)+' · '+e(formatter(value))+'"><div class="gr2-bar-line"><span title="'+e(key)+'">'+e(key)+'</span><b>'+e(formatter(value))+'</b></div><div class="gr2-bar-track"><i style="width:'+(number(value)===0?0:Math.max(2,number(value)/max*100))+'%;background:'+colors[i%colors.length]+'"></i></div></div>').join('')+'</div>':note('No matching data for these filters')};
 const donut=(items,formatter=fmt)=>{const all=items.filter(x=>number(x[1])>0),nonzero=all.length>8?[...all.slice(0,7),['Other',sum(all.slice(7),x=>x[1])]]:all,total=sum(nonzero,x=>x[1]);let angle=0;const stops=nonzero.map(([_,v],i)=>{const start=angle;angle+=number(v)/total*100;return C[i%C.length]+' '+start+'% '+angle+'%'}).join(',');
  return total?'<div class="gr2-donut-wrap"><div class="gr2-donut" style="background:conic-gradient('+stops+')"><div><b>'+formatter(total)+'</b><small>Total</small></div></div><div class="gr2-legend">'+nonzero.map(([name,value],i)=>'<div class="gr2-donut-entry gr2-hoverable" tabindex="0" data-tip="'+e(name)+' · '+e(formatter(value))+' · '+(number(value)/total*100).toFixed(1)+'%" data-slice="'+i+'"><i style="background:'+C[i%C.length]+'"></i><span>'+e(name)+'</span><strong>'+formatter(value)+'</strong></div>').join('')+'</div></div>':note('No records for the selected period')};

 // Channel revenue and distinct orders are calculated from the same authorized
 // filtered sales records as the dashboard; chart values are never mock data.
 let channelDisplayMode='revenue';
 const channelColors=['#356bec','#f6a249','#16a18c','#9667e7','#ec7596','#5a9ec9','#d4a149','#7889ae'];
 const channelChart=(sales)=>{
  const map=new Map();
  sales.forEach(order=>{
   const name=String(order.channel_name||order.channel||'Unspecified').trim()||'Unspecified';
   if(!map.has(name))map.set(name,{name,revenue:0,orders:new Set()});
   const row=map.get(name);
   row.revenue+=number(order.total);
   row.orders.add(String(order.company_id||'')+'|'+String(order.internal_order_id||order.order_id||order.id||'Unknown'));
  });
  const aggregate=[...map.values()].map(row=>({name:row.name,revenue:Math.max(0,row.revenue),orders:row.orders.size}));
  const metric=channelDisplayMode==='orders'?'orders':'revenue';
  aggregate.sort((a,b)=>b[metric]-a[metric]||a.name.localeCompare(b.name));
  const ranked=aggregate.length>8?[...aggregate.slice(0,7),{name:'Other channels',revenue:sum(aggregate.slice(7),'revenue'),orders:sum(aggregate.slice(7),'orders')}]:aggregate;
  const allRevenue=sum(aggregate,'revenue'),allOrders=countUnique(sales,row=>String(row.company_id||'')+'|'+String(row.internal_order_id||row.order_id||row.id||'Unknown'));
  const allValues=metric==='revenue'?allRevenue:sum(aggregate,'orders');
  const shownTotal=metric==='revenue'?money(allRevenue):fmt(allOrders);
  const buttons='<div class="gr5-channel-switch" role="group" aria-label="Sales channel chart metric">'+
   [['revenue','Revenue'],['orders','Orders']].map(([type,label])=>'<button type="button" data-gr5-mode="'+type+'" aria-pressed="'+String(metric===type)+'">'+label+'</button>').join('')+'</div>';
  if(!ranked.length||allValues<=0)return '<div class="gr5-channel"><div class="gr5-channel-toolbar"><div class="gr5-channel-overview"><span>Channel overview</span><strong>'+shownTotal+'</strong><small>Across '+fmt(aggregate.length)+' sales channels</small></div>'+buttons+'</div><div class="gr5-channel-empty">No recorded '+(metric==='orders'?'orders':'revenue')+' for these filters.</div></div>';
  const circumference=2*Math.PI*82;let offset=0;
  const chartSlices=ranked.map((row,i)=>{
   const value=number(row[metric]),ratio=allValues>0?value/allValues:0,length=Math.max(0,Math.min(circumference,ratio*circumference));
   const item='<circle class="gr5-channel-slice" cx="120" cy="120" r="82" fill="none" stroke="'+channelColors[i%channelColors.length]+'" stroke-width="25" stroke-dasharray="'+length.toFixed(4)+' '+Math.max(0,circumference-length).toFixed(4)+'" stroke-dashoffset="'+(-offset).toFixed(4)+'" transform="rotate(-90 120 120)" data-gr5-channel-index="'+i+'" tabindex="0" role="button" aria-label="'+e(row.name)+' · '+e(metric==='revenue'?money(value):fmt(value)+' orders')+' · '+(ratio*100).toFixed(1)+'%"><title>'+e(row.name)+': '+e(metric==='revenue'?money(value):fmt(value)+' orders')+'</title></circle>';
   offset+=length;return item;
  }).join('');
  const list=ranked.map((row,i)=>{
   const value=number(row[metric]),share=allValues>0?value/allValues*100:0;
   const displayValue=metric==='revenue'?money(value):fmt(value)+' orders';
   return '<button type="button" class="gr5-channel-item" data-gr5-channel-index="'+i+'" data-gr5-channel-name="'+e(row.name)+'" data-gr5-channel-value="'+e(displayValue)+'" data-gr5-channel-share="'+share.toFixed(1)+'%" aria-label="'+e(row.name)+' '+e(displayValue)+' '+share.toFixed(1)+' percent of total">'+
    '<span class="gr5-channel-item-head"><span class="gr5-channel-name"><i style="--gr5-color:'+channelColors[i%channelColors.length]+'"></i>'+e(row.name)+'</span><strong>'+e(displayValue)+'</strong></span>'+
    '<span class="gr5-channel-meter"><i style="--gr5-color:'+channelColors[i%channelColors.length]+';width:'+share.toFixed(2)+'%"></i></span>'+
    '<span class="gr5-channel-share">'+share.toFixed(1)+'% of '+(metric==='revenue'?'revenue':'orders')+'</span></button>';
  }).join('');
  const winner=ranked[0];
  return '<div class="gr5-channel" data-gr5-channel-mode="'+metric+'"><div class="gr5-channel-toolbar">'+
   '<div class="gr5-channel-overview"><span>Channel overview</span><strong>'+shownTotal+'</strong><small>Across '+fmt(aggregate.length)+' sales channel'+(aggregate.length===1?'':'s')+'</small></div>'+buttons+'</div>'+
   '<div class="gr5-channel-chart"><div class="gr5-channel-ringwrap">'+
   '<svg class="gr5-channel-ring" viewBox="0 0 240 240" role="group" aria-label="Interactive sales channels, hover over coloured ring segments to inspect the channel"><circle cx="120" cy="120" r="82" fill="none" stroke="#edf1f8" stroke-width="25"/>'+chartSlices+'</svg>'+
   '<div class="gr5-channel-center" aria-live="polite"><span class="gr5-channel-center-name">All channels</span><strong class="gr5-channel-center-value">'+shownTotal+'</strong><small class="gr5-channel-center-share">100% of '+(metric==='revenue'?'revenue':'orders')+'</small></div></div>'+
   '<div class="gr5-channel-breakdown"><div class="gr5-channel-breakdown-title"><span>Channel performance</span><small>'+fmt(ranked.length)+' categories</small></div>'+list+'</div></div>'+
   '<div class="gr5-channel-insight"><span class="gr5-channel-insight-dot"></span><span>Top channel: <strong>'+e(winner.name)+'</strong> · '+e(metric==='revenue'?money(winner.revenue):fmt(winner.orders)+' orders')+'</span></div></div>';
 };
 const trend=(rows,from,to,period,previousTotal,orders)=>charts.revenueTrend(charts.daily(rows,r=>dateKey(r.date||r.order_date||r.created_at),r=>number(r.total),from,to),{total:sum(rows,'total'),orders,previousTotal,period});
 const columns=(items,formatter=fmt)=>{const rows=items.filter(x=>number(x[1])>=0).slice(0,10),max=Math.max(1,...rows.map(x=>number(x[1])));return rows.length?'<div class="gr2-columns">'+rows.map(([k,v],i)=>'<div class="gr2-column gr2-hoverable" tabindex="0" data-tip="'+e(k)+' · '+e(formatter(v))+'"><span>'+e(formatter(v))+'</span><div class="gr2-column-track"><i style="height:'+(number(v)===0?0:Math.max(3,number(v)/max*100))+'%;background:'+C[i%C.length]+'"></i></div><small title="'+e(k)+'">'+e(k)+'</small></div>').join('')+'</div>':note('No matching revenue records')};

 /* Four reference-style KPI sparklines, using only date-stamped authorized CRM records. */
 const gr6Day=value=>{
  const d=dateKey(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(d)?Date.parse(d+'T00:00:00Z'):NaN;
 };
 const gr6Series=(rows,dateFn,valueFn,from,to,percentage=false)=>{
  const DAY=86400000;
  const dated=rows.map(row=>({row,time:gr6Day(dateFn(row))})).filter(item=>Number.isFinite(item.time));
  const start=from?Date.parse(from+'T00:00:00Z'):(dated.length?Math.min(...dated.map(item=>item.time)):Date.parse(today()+'T00:00:00Z'));
  const end=to?Date.parse(to+'T00:00:00Z'):Date.parse(today()+'T00:00:00Z');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return [];
  const days=Math.max(1,Math.floor((end-start)/DAY)+1),count=Math.min(14,days);
  const buckets=Array.from({length:count},(_,i)=>{
   const time=start+Math.floor((i*days)/count)*DAY;
   return {date:new Date(time).toISOString().slice(0,10),sum:0,count:0};
  });
  for(const item of dated){
   if(item.time<start||item.time>end)continue;
   const index=Math.min(count-1,Math.floor(((item.time-start)/DAY)/days*count));
   buckets[index].sum+=number(valueFn(item.row));
   buckets[index].count++;
  }
  return buckets.map(bucket=>({date:bucket.date,value:percentage?(bucket.count?bucket.sum/bucket.count*100:0):bucket.sum}));
 };
 const gr6Delta=(current,previous,points=false)=>{
  if(previous===null||previous===undefined)return {label:'—',detail:'No comparable period',kind:'neutral'};
  if(previous===0&&current>0&&!points)return {label:'New',detail:'vs previous period',kind:'positive'};
  if(previous===0&&current===0)return {label:'0.0%',detail:'vs previous period',kind:'neutral'};
  const difference=points?current-previous:(current-previous)/previous*100;
  return {label:(difference>0?'+':'')+difference.toFixed(1)+(points?' pp':'%'),detail:'vs previous period',kind:difference>0?'positive':difference<0?'negative':'neutral'};
 };
 const gr6Spark=(points,index,format)=>{
  const data=points.length?points:[{date:today(),value:0}];
  const highest=Math.max(1,...data.map(p=>number(p.value)));
  const x1=3,x2=142,yTop=7,yBottom=58;
  const coords=data.map((p,i)=>({...p,x:data.length===1?(x1+x2)/2:x1+i*(x2-x1)/(data.length-1),y:yBottom-Math.max(0,number(p.value))/highest*(yBottom-yTop)}));
  const curve=coords.map((p,i)=>{
   if(!i)return 'M '+p.x.toFixed(2)+' '+p.y.toFixed(2);
   const prev=coords[i-1],mid=(prev.x+p.x)/2;
   return ' C '+mid.toFixed(2)+' '+prev.y.toFixed(2)+' '+mid.toFixed(2)+' '+p.y.toFixed(2)+' '+p.x.toFixed(2)+' '+p.y.toFixed(2);
  }).join('');
  const fill=curve+' L '+coords[coords.length-1].x.toFixed(2)+' '+yBottom+' L '+coords[0].x.toFixed(2)+' '+yBottom+' Z';
  const grad='gr6-fill-'+index;
  const hits=coords.map((p,i)=>{
   const half=data.length===1?(x2-x1)/2:(x2-x1)/(data.length-1)/2;
   const start=Math.max(x1,p.x-half),end=Math.min(x2,p.x+half);
   const value=format(p.value);
   return '<rect class="gr6-spark-hit" x="'+start.toFixed(2)+'" y="0" width="'+Math.max(1,end-start).toFixed(2)+'" height="66" fill="transparent" data-gr6-date="'+e(p.date)+'" data-gr6-value="'+e(value)+'" data-gr6-x="'+p.x.toFixed(2)+'" data-gr6-y="'+p.y.toFixed(2)+'"><title>'+e(p.date+' · '+value)+'</title></rect>';
  }).join('');
  return '<div class="gr6-spark-box"><svg class="gr6-spark" viewBox="0 0 145 67" aria-hidden="true" focusable="false"><defs><linearGradient id="'+grad+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".34"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path class="gr6-spark-area" d="'+fill+'" fill="url(#'+grad+')"/><path class="gr6-spark-line" d="'+curve+'"/><line class="gr6-spark-guide" x1="0" x2="0" y1="4" y2="58"/><circle class="gr6-spark-dot" cx="0" cy="0" r="4.1"/>'+hits+'</svg><span class="gr6-spark-tip" hidden><span class="gr6-spark-tip-date"></span><strong class="gr6-spark-tip-value"></strong></span></div>';
 };

 function filters(){
  const p=val('#gr2-period')||'month',from=p==='custom'?val('#gr2-from'):periodStart(p),to=p==='custom'?val('#gr2-to'):p==='all'?'':today();
  return {period:p,from,to,company:val('#gr2-company')||'all',source:val('#gr2-source')||'all',channel:val('#gr2-channel')||'all',tag:val('#gr2-tag')||'all',product:val('#gr2-product')||'all',person:val('#gr2-person')||'all',stage:val('#gr2-stage')||'all',order:val('#gr2-order')||'all',dispatch:val('#gr2-dispatch')||'all',type:val('#gr2-type')||'all'};
 }
 function filtered(overrides){
  const f={...filters(),...(overrides||{})},co=x=>f.company==='all'||x.company_id===f.company;
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
  const f=filtered(),sale=f.sales.filter(s=>!['cancelled','canceled','returned'].includes(String(s.status||s.approval_status||'').trim().toLowerCase())),won=f.leads.filter(l=>l.stage==='Won');
  const orderCount=countUnique(sale,s=>s.company_id+'|'+(s.internal_order_id||s.order_id||s.id));
  const due=f.followups.filter(l=>new Date(l.next_followup_at).valueOf()<=Date.now());
  const awaiting=f.dispatch.filter(d=>!['Delivered','Shipped','Cancelled'].includes(d.status));
  const canId=id=>has(id);
  const previousWindow=(()=>{
   if(!f.from||!f.to)return null;
   const start=Date.parse(f.from+'T00:00:00Z'),end=Date.parse(f.to+'T00:00:00Z');
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return null;
   const length=end-start+86400000;
   return {from:new Date(start-length).toISOString().slice(0,10),to:new Date(start-86400000).toISOString().slice(0,10)};
  })();
  const prior=previousWindow?filtered(previousWindow):null;
  const priorSale=prior?prior.sales.filter(s=>!['cancelled','canceled','returned'].includes(String(s.status||s.approval_status||'').trim().toLowerCase())):[];
  const previousRevenue=prior?sum(priorSale,'total'):null;
  const orderKey=row=>String(row.company_id||'')+'|'+String(row.internal_order_id||row.order_id||row.id);
  const uniqueOrders=rows=>[...new Map(rows.map(row=>[orderKey(row),row])).values()];
  const newCustomers=f.customers.filter(c=>inRange(c.created_at,f.from,f.to));
  const priorNewCustomers=prior?prior.customers.filter(c=>inRange(c.created_at,previousWindow.from,previousWindow.to)):[];
  const rate=f.leads.length?won.length/f.leads.length*100:0;
  const previousRate=prior&&prior.leads.length?prior.leads.filter(l=>l.stage==='Won').length/prior.leads.length*100:null;
  const kpiCards=[];
  const addCard=(name,value,target,tone,kind,change,series,format)=>kpiCards.push({name,value,target,tone,kind,change,series,format});
  if(has('sales')){
   const revenue=sum(sale,'total');
   addCard('Total Revenue',money(revenue),'day_sales','amber','revenue',gr6Delta(revenue,previousRevenue),
     gr6Series(sale,s=>s.date||s.order_date||s.created_at,s=>number(s.total),f.from,f.to),money);
   addCard('Total Orders',fmt(orderCount),'sales','peach','orders',
     gr6Delta(orderCount,prior?countUnique(priorSale,orderKey):null),
     gr6Series(uniqueOrders(sale),s=>s.date||s.order_date||s.created_at,()=>1,f.from,f.to),fmt);
  }
  if(has('customers')){
   addCard('New Customers',fmt(newCustomers.length),'customers','gold','customers',
     gr6Delta(newCustomers.length,prior?priorNewCustomers.length:null),
     gr6Series(newCustomers,c=>c.created_at,()=>1,f.from,f.to),fmt);
  }
  if(has('conversion')){
   addCard('Conversion Rate',rate.toFixed(1)+'%','conversion','coral','conversion',
     gr6Delta(rate,previousRate,true),
     gr6Series(f.leads,l=>l.created_at||l.date,l=>l.stage==='Won'?1:0,f.from,f.to,true),
     v=>number(v).toFixed(1)+'%');
  }
  if(!kpiCards.length&&has('stock')){
   const low=f.products.filter(p=>p.stock!=null&&number(p.stock)<=5).length;
   addCard('Stock Alerts',fmt(low),'stock','gold','stock',
     {label:'Current',detail:'Stock snapshot',kind:'neutral'},[],fmt);
  }
  const cardIcon=kind=>kind==='orders'?'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M2 4h3l2.2 11h11.5l2.3-8H6"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>':charts.icon(kind==='revenue'?'sales':kind);
  const cardsMarkup=kpiCards.map((card,i)=>{
   const arrow=card.change.kind==='negative'?'↘':card.change.kind==='positive'?'↗':'—';
   const description=card.name+' '+card.value+'. '+card.change.label+' '+card.change.detail+'. View details.';
   return '<button type="button" class="gr6-card" data-gr6-kind="'+e(card.kind)+'" data-gr6-tone="'+e(card.tone)+'" data-gr6-delta="'+e(card.change.kind)+'" data-widget-target="'+e(card.target)+'" aria-label="'+e(description)+'">'+
    '<span class="gr6-card-head"><span class="gr6-icon">'+cardIcon(card.kind)+'</span><span class="gr6-options" aria-hidden="true">⋮</span></span>'+
    '<span class="gr6-card-name">'+e(card.name)+'</span>'+
    '<strong class="gr6-card-number">'+e(card.value)+'</strong>'+
    '<span class="gr6-card-change"><strong class="gr6-badge"><span aria-hidden="true">'+arrow+'</span> '+e(card.change.label)+'</strong><span class="gr6-change-period">'+e(card.change.detail)+'</span></span>'+
    gr6Spark(card.series,i,card.format)+'</button>';
  }).join('');
  query('#gr2-digest').innerHTML=kpiCards.length?'<div class="gr6-kpi-row" style="--gr6-count:'+kpiCards.length+'">'+cardsMarkup+'</div>':'';
  const operational=[
   ['Follow-ups due',fmt(due.length),'followups','rose'],
   ['Dispatch queue',fmt(awaiting.length),'dispatch','sky'],
   ['Present days',fmt(f.attendance.filter(a=>/present|in|worked/i.test(a.status||'')).length),'attendance','green'],
   ['Stock alerts',fmt(f.products.filter(p=>p.stock!=null&&number(p.stock)<=5).length),'stock','amber']
  ].filter(k=>canId(k[2]));
  query('#gr2-kpis').innerHTML=operational.map(([name,v,id,color])=>'<button type="button" class="gr2-kpi gr2-hoverable gr2-kpi-aligned" data-color="'+e(color)+'" data-widget-target="'+e(id)+'" aria-label="'+e(name)+' · '+e(v)+' · View details"><span class="gr2-kpi-head"><span class="gr2-kpi-name">'+e(name)+'</span><span class="gr2-kpi-symbol">'+charts.icon(id)+'</span></span><strong>'+e(v)+'</strong><span class="gr2-kpi-sub">'+e(f.period==='all'?'All accessible records':f.from&&f.to?f.from+' — '+f.to:'Current filter')+'</span><span class="gr2-kpi-action">View details ↗</span></button>').join('');
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
   day_sales:()=>panel('day_sales','Interactive revenue analytics · hover or focus any date for exact values',trend(sale,f.from,f.to,f.period,previousRevenue,orderCount)),
   channel_sales:()=>panel('channel_sales','Interactive channel mix · revenue and order distribution',channelChart(sale)),
   sales:()=>panel('sales','Filtered sales orders and amount',label('Revenue',money(sum(sale,'total')))+label('Order count',fmt(orderCount))+label('Units sold',fmt(sum(sale,s=>s.qty||s.quantity)))+label('Average order',orderCount?money(sum(sale,'total')/orderCount):'₹0')+'<h4 class="gr3-subheading">Order value distribution</h4>'+charts.histogram(charts.orderTotals(sale))),
   company_sales:()=>panel('company_sales','Both GreenRich companies · order values',columns(group(sale,s=>company(s.company_id),s=>s.total),money)),
   leads:()=>panel('leads','Lead creation date · recorded marketing source',
     charts.series(charts.daily(f.leads,l=>dateKey(l.created_at||l.date),()=>1,f.from,f.to),{yLabel:'New leads',xLabel:'Date'})+'<div class="gr2-split"><div><h4>Enquiries by source</h4>'+listBars(bySource,C,fmt,9)+'</div><div><h4>Product enquiries</h4>'+
     listBars(group(f.leads,l=>records.products.find(p=>p.id===l.product_id&&p.company_id===l.company_id)?.name||l.product_interest||l.product_id||'Unspecified'),C,fmt,7)+'</div></div>',
     'Sources and product interests from accessible lead records'),
   conversion:()=>panel('conversion','Stages and customer conversions',donut(stageCounts)+label('Conversion rate',pct(won.length,f.leads.length))+label('Won leads',fmt(won.length))),
   salespeople:()=>panel('salespeople','Won leads versus assigned enquiries',owned.length?'<div class="gr2-leader">'+owned.map((p,i)=>'<div><span class="gr2-place">'+(i+1)+'</span><span class="gr2-person">'+e(p.name)+'</span><div class="gr2-leader-track"><i style="width:'+Math.round(100*p.won/Math.max(1,p.all))+'%"></i></div><strong>'+fmt(p.won)+' / '+fmt(p.all)+'<small>'+money(p.orderValue)+'</small></strong></div>').join('')+'</div>':note('No assigned leads in this period')),
   telecaller:()=>{const calls=f.leads.filter(l=>/telecall|telephone|phone call/i.test(l.source||'')||/telecall/i.test(staff.find(p=>p.id===l.assigned_to)?.role||''));return panel('telecaller','Source or owner identified as telecalling',label('Telecalling leads',fmt(calls.length))+label('Won',fmt(calls.filter(l=>l.stage==='Won').length))+label('Conversion',pct(calls.filter(l=>l.stage==='Won').length,calls.length))+label('Calls today','Not tracked')+listBars(group(calls,l=>staff.find(p=>p.id===l.assigned_to)?.full_name||'Unassigned'),C,fmt,6),'Calls today remain Not tracked until a call-log or dialer integration is connected.')},
   attendance:()=>panel('attendance','Recorded attendance in the selected date range',donut(group(f.attendance,a=>a.status||'Unknown'))+label('Entries',fmt(f.attendance.length))+(errors.attendance?note('Attendance is unavailable for this account: '+errors.attendance):''),'Attendance is employee-based, not attributed to a company.'),
   customers:()=>panel('customers','Shared customer directory · linked-company scope',label('Customers',fmt(f.customers.length))+label('New in period',fmt(f.customers.filter(c=>inRange(c.created_at,f.from,f.to)).length))+charts.pie(group(f.customers,c=>c.type||'Unspecified'))),
   followups:()=>panel('followups','Scheduled dates · overdue and due now',label('Due / overdue',fmt(due.length))+label('Scheduled in range',fmt(f.followups.length))+
     (f.followups.length?'<div class="gr2-activity">'+f.followups.slice().sort((a,b)=>new Date(a.next_followup_at)-new Date(b.next_followup_at)).slice(0,6).map(l=>'<div><span class="gr2-dot"></span><div><strong>'+e(l.contact||l.title||'Lead')+'</strong><small>'+e(l.stage||'')+' · '+e(dateKey(l.next_followup_at))+'</small></div><b>'+e(new Date(l.next_followup_at).getTime()<=Date.now()?'Due':'Upcoming')+'</b></div>').join('')+'</div>':note('No follow-ups in this period'))),
   order_status:()=>panel('order_status','Pending, approved and cancelled orders',donut([['Approved',approved.length],['Pending',pending.length],['Cancelled / returned',f.sales.filter(s=>['Cancelled','Returned'].includes(s.status)).length]])),
   dispatch:()=>panel('dispatch','Latest recorded delivery and courier stages',listBars(group(f.dispatch,d=>d.status||'Pending'),C,fmt,8)+label('Total dispatch orders',fmt(f.dispatch.length))),
   stock:()=>panel('stock','Current stock · date filters do not change stock snapshot',label('Products',fmt(f.products.length))+label('Low stock (≤5)',fmt(f.products.filter(p=>p.stock!=null&&number(p.stock)<=5).length))+
     charts.scatter(f.products)+'<h4 class="gr3-subheading">Lowest stock products</h4>'+listBars(f.products.slice().sort((a,b)=>number(a.stock)-number(b.stock)).slice(0,7).map(p=>[p.name||p.sku||'Product',number(p.stock)]),C,fmt,7)),
   recent:()=>panel('recent','Recent orders matching the selected filters',sale.length?'<div class="gr2-table-wrap"><table class="gr2-table"><thead><tr><th>Sales order ID</th><th>Customer</th><th>Company</th><th>Channel</th><th>Date</th><th>Status</th><th>Value</th></tr></thead><tbody>'+sale.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,12).map(s=>'<tr><td><strong>'+e(s.internal_order_id||s.order_id||s.id)+'</strong></td><td>'+e(s.customer_name||'—')+'</td><td>'+e(company(s.company_id))+'</td><td>'+e(s.channel_name||'—')+'</td><td>'+e(dateKey(s.date))+'</td><td><span class="gr2-status">'+e(s.status||'Recorded')+'</span></td><td><b>'+e(money(s.total))+'</b></td></tr>').join('')+'</tbody></table></div>':note('No matching sales orders')),
   accounts:()=>panel('accounts','Accounting ledger connection status',note('Accounts ledger tables are not installed. Receivables, payables and cash balances cannot be reported yet.'),'Connect and authorize the Accounts posting tables to enable verified financial figures.')
  };
  query('#gr2-content').innerHTML=ORDER.filter(id=>has(id)&&content[id]).map(id=>content[id]()).join('')||note('No dashboard widgets are enabled. Ask an administrator to enable access in Settings → Dashboard Access.');
  query('#gr2-active').textContent=fmt(ORDER.filter(has).length)+' available widgets';
  query('#gr2-stamp').textContent=stamp?'Last updated '+new Date(stamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'Waiting for data';
  query('#gr2-summary').textContent=(f.from||'All time')+' → '+(f.to||'Today')+' · '+(f.company==='all'?'Assigned companies':company(f.company));
   if(isActive())viewRoot.querySelectorAll('[data-gr2-quick]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.gr2Quick===f.period)));
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
  host.innerHTML='<div class="gr2"><div class="gr2-heading"><div><span class="gr2-eyebrow"><i></i> GREENRICH ONE · BUSINESS INTELLIGENCE</span><h2>GreenRich Command Center <span class="gr2-interactive-tag">GLASS · LIVE</span></h2><p>Explore your business in motion — interactive sales, leads, inventory and operational intelligence</p></div><div class="gr2-heading-end"><span class="gr2-live"><i></i> Connected CRM</span><small id="gr2-stamp">Loading data…</small></div></div>'+
   '<div class="gr2-top-controls"><div class="gr2-period-pills" role="group" aria-label="Quick date filters"><button type="button" data-gr2-quick="today">Today</button><button type="button" data-gr2-quick="week">This week</button><button type="button" data-gr2-quick="month">This month</button><button type="button" data-gr2-quick="last90">90 days</button><button type="button" data-gr2-quick="all">All time</button></div></div>'+ 
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
   '<div id="gr2-loading" class="gr2-loading">Loading authorized, real-time CRM information…</div><div class="gr2-digest" id="gr2-digest"></div><div class="gr2-kpis" id="gr2-kpis"></div><div class="gr2-panels" id="gr2-content"></div><div class="gr2-disclaimer">Figures reflect records you are permitted to view. Date filters use lead creation date and sales order date; follow-ups use their due date. Stock is current, and attendance belongs to employees rather than individual companies. Salesperson sales value uses Won leads linked to order IDs. Data refreshes automatically and when CRM changes are received.</div></div>';
  viewRoot=host.querySelector('.gr2');
   viewRoot.dataset.gdTheme='light';
   viewRoot.addEventListener('click',event=>{
     const modeButton=event.target.closest('[data-gr5-mode]');
     if(modeButton){channelDisplayMode=modeButton.dataset.gr5Mode==='orders'?'orders':'revenue';draw();return}
     const channelButton=event.target.closest('.gr5-channel-item,.gr5-channel-slice');
     if(channelButton){const panel=channelButton.closest('.gr2-panel-channel_sales');if(panel){const current=panel.dataset.gr5Pinned;const id=channelButton.dataset.gr5ChannelIndex;panel.dataset.gr5Pinned=current===id?'':id;focusChannel(panel,panel.dataset.gr5Pinned)}return}
     const quick=event.target.closest('[data-gr2-quick]');
     if(quick){query('#gr2-period').value=quick.dataset.gr2Quick;draw();return}
     const target=event.target.closest('[data-widget-target]');
     if(target){const panel=viewRoot.querySelector('.gr2-panel[data-widget="'+target.dataset.widgetTarget+'"]');if(panel){panel.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});panel.classList.add('gr2-attention');setTimeout(()=>panel.classList.remove('gr2-attention'),1300)}}
   });

   const focusChannel=(panel,id)=>{
     if(!panel)return;
     const root=panel.querySelector('.gr5-channel'),value=root?.querySelector('.gr5-channel-center-value'),name=root?.querySelector('.gr5-channel-center-name'),share=root?.querySelector('.gr5-channel-center-share');
     if(!root||!value||!name||!share)return;
     root.querySelectorAll('[data-gr5-channel-index]').forEach(item=>item.classList.toggle('gr5-selected',String(item.dataset.gr5ChannelIndex)===String(id)));
     root.classList.toggle('gr5-is-focused',id!==''&&id!=null);
     const item=id===''||id==null?null:root.querySelector('.gr5-channel-item[data-gr5-channel-index="'+id+'"]');
     if(!item){
      const overview=root.querySelector('.gr5-channel-overview strong');
      name.textContent='All channels';value.textContent=overview?.textContent||'—';share.textContent='100% of '+(channelDisplayMode==='orders'?'orders':'revenue');
     }else{
      name.textContent=item.dataset.gr5ChannelName||'Channel';value.textContent=item.dataset.gr5ChannelValue||'—';share.textContent=item.dataset.gr5ChannelShare||'';
     }
   };
   viewRoot.addEventListener('pointerover',event=>{
     const target=event.target.closest('.gr5-channel-item,.gr5-channel-slice');
     if(target){const panel=target.closest('.gr2-panel-channel_sales');if(panel&&!panel.dataset.gr5Pinned)focusChannel(panel,target.dataset.gr5ChannelIndex)}
   });
   viewRoot.addEventListener('pointerout',event=>{
     const target=event.target.closest('.gr5-channel-item,.gr5-channel-slice');
     if(target){const panel=target.closest('.gr2-panel-channel_sales');if(panel&&!panel.dataset.gr5Pinned&&!event.relatedTarget?.closest?.('.gr5-channel-item,.gr5-channel-slice'))focusChannel(panel,'')}
   });
   viewRoot.addEventListener('focusin',event=>{
     const target=event.target.closest('.gr5-channel-item,.gr5-channel-slice');
     if(target){const panel=target.closest('.gr2-panel-channel_sales');if(panel&&!panel.dataset.gr5Pinned)focusChannel(panel,target.dataset.gr5ChannelIndex)}
   });
   viewRoot.addEventListener('focusout',event=>{
     const target=event.target.closest('.gr5-channel-item,.gr5-channel-slice');
     if(target){const panel=target.closest('.gr2-panel-channel_sales');if(panel&&!panel.dataset.gr5Pinned)focusChannel(panel,'')}
   });
   viewRoot.addEventListener('keydown',event=>{const card=event.target.closest('.gr2-feature-main[data-widget-target]');if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();card.click()}});
   const hideTip=()=>{const tip=viewRoot.querySelector('.gr2-chart-hover-tip');if(tip)tip.hidden=true;viewRoot.querySelectorAll('.gr3-guideline').forEach(line=>line.style.opacity='0')};
   const showTip=(target,evt)=>{const panel=target.closest('.gr2-panel'),svg=target.closest('svg');if(!panel)return;
     let tip=viewRoot.querySelector('.gr2-chart-hover-tip');if(!tip){tip=document.createElement('div');tip.className='gr2-chart-hover-tip';tip.hidden=true;viewRoot.appendChild(tip)}
     tip.textContent=target.dataset.gr3Tooltip||target.getAttribute('aria-label')||'';
     tip.hidden=false;
     const t=target.getBoundingClientRect(),outer=viewRoot.getBoundingClientRect(),x=evt?.clientX??(t.left+t.width/2),y=evt?.clientY??t.top;
     tip.style.left=Math.min(Math.max(105,x-outer.left),Math.max(110,outer.width-105))+'px';tip.style.top=Math.max(8,y-outer.top-56)+'px';
     if(svg&&target.dataset.gr3X){const line=svg.querySelector('.gr3-guideline');if(line){line.setAttribute('x1',target.dataset.gr3X);line.setAttribute('x2',target.dataset.gr3X);line.style.opacity='1'}}
   };
   viewRoot.addEventListener('pointerover',event=>{const point=event.target.closest('[data-gr3-tooltip]');if(point)showTip(point,event)});
   viewRoot.addEventListener('pointermove',event=>{const point=event.target.closest('[data-gr3-tooltip]');if(point)showTip(point,event)});
   viewRoot.addEventListener('pointerout',event=>{if(event.target.closest('[data-gr3-tooltip]'))hideTip()});
   viewRoot.addEventListener('focusin',event=>{const p=event.target.closest('[data-gr3-tooltip]');if(p)showTip(p)});
   viewRoot.addEventListener('focusout',event=>{if(event.target.closest('[data-gr3-tooltip]'))hideTip()});
   const showRevenuePoint=target=>{
     const plot=target.closest('.gr4-plot');if(!plot)return;
     const svg=plot.querySelector('svg'),cursor=svg?.querySelector('.gr4-cursor'),dot=svg?.querySelector('.gr4-active-dot'),tip=plot.querySelector('.gr4-tooltip');
     if(!svg||!cursor||!dot||!tip)return;
     const x=Number(target.dataset.gr4X),y=Number(target.dataset.gr4Y);
     if(!Number.isFinite(x)||!Number.isFinite(y))return;
     cursor.setAttribute('x1',String(x));cursor.setAttribute('x2',String(x));
     dot.setAttribute('cx',String(x));dot.setAttribute('cy',String(y));
     plot.classList.add('gr4-is-hovered');
     const parsed=target.dataset.gr4Date||'';
     let pretty=parsed;
     if(/^\d{4}-\d{2}-\d{2}$/.test(parsed)){const date=new Date(parsed+'T12:00:00Z');pretty=date.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}
     tip.querySelector('.gr4-tooltip-date').textContent=pretty;
     tip.querySelector('.gr4-tooltip-value').textContent=target.dataset.gr4Value||'₹0';
     const svgBox=svg.getBoundingClientRect(),plotBox=plot.getBoundingClientRect();
     const posX=(x/980)*svgBox.width+svgBox.left-plotBox.left;
     const posY=(y/360)*svgBox.height+svgBox.top-plotBox.top;
     const tipWidth=184,clampedX=Math.min(Math.max(tipWidth/2+6,posX),Math.max(tipWidth/2+6,plotBox.width-tipWidth/2-6));
     const below=posY<125;
     tip.style.left=clampedX+'px';tip.style.top=(below?posY+18:posY-17)+'px';
     tip.classList.toggle('gr4-tip-below',below);tip.hidden=false;
   };
   const hideRevenuePoint=()=>{const plot=viewRoot.querySelector('.gr4-plot');if(plot){plot.classList.remove('gr4-is-hovered');const tip=plot.querySelector('.gr4-tooltip');if(tip)tip.hidden=true}};
   viewRoot.addEventListener('pointerover',event=>{const p=event.target.closest('.gr4-hover-zone');if(p)showRevenuePoint(p)});
   viewRoot.addEventListener('pointermove',event=>{const p=event.target.closest('.gr4-hover-zone');if(p)showRevenuePoint(p)},{passive:true});
   viewRoot.addEventListener('pointerout',event=>{const p=event.target.closest('.gr4-hover-zone');if(p&&!event.relatedTarget?.closest?.('.gr4-hover-zone'))hideRevenuePoint()});
   viewRoot.addEventListener('focusin',event=>{const p=event.target.closest('.gr4-hover-zone');if(p)showRevenuePoint(p)});
   viewRoot.addEventListener('focusout',event=>{if(event.target.closest('.gr4-hover-zone'))hideRevenuePoint()});
   viewRoot.addEventListener('click',event=>{const p=event.target.closest('.gr4-hover-zone');if(p)showRevenuePoint(p)});
   viewRoot.addEventListener('pointermove',event=>{const rect=viewRoot.getBoundingClientRect();viewRoot.style.setProperty('--gr2-cursor-x',((event.clientX-rect.left)/Math.max(1,rect.width)*100).toFixed(1)+'%');viewRoot.style.setProperty('--gr2-cursor-y',Math.max(0,event.clientY-rect.top)+'px')},{passive:true});
  if(cfg.companyIds?.length===1){query('#gr2-company').value=cfg.companyIds[0];query('#gr2-company').disabled=true}
  else if((cfg.companyIds||[]).includes(cfg.selectedCompany))query('#gr2-company').value=cfg.selectedCompany;
  host.addEventListener('change',event=>{
   if(event.target.matches('.gr4-period-select')){query('#gr2-period').value=event.target.value;if(event.target.value==='custom')query('#gr2-advanced').open=true;draw();return}
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
