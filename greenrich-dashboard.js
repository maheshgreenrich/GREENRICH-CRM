'use strict';
/* Live dashboard: RLS-scoped CRM, Dispatch, read-only Attendance.
   Each employee's visible charts are configured separately by an administrator. */
(()=>{
 const W=[['attendance','Attendance today'],['sales','Sales summary'],['day_sales','Day-wise sales'],['channel_sales','Sales channels'],['company_sales','Company-wise sales'],['leads','Leads and sources'],['order_status','Order approvals'],['dispatch','Dispatch pipeline'],['stock','Products and stock'],['telecaller','Telecaller activity'],['customers','Customers'],['followups','Follow-ups'],['conversion','Lead conversion'],['salespeople','Sales team'],['recent','Recent sales orders'],['accounts','Accounts status']];
 const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(Number(n)||0);
 const money=n=>'₹'+fmt(n);
 const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const company=id=>id==='grow-india'?'Grow India':'Enviro Solutions';
 const sum=(rows,key)=>rows.reduce((n,r)=>n+(Number(r[key])||0),0);
 const group=(rows,label,value)=>{const map=new Map();for(const item of rows){const name=label(item)||'Other';map.set(name,(map.get(name)||0)+(value?value(item):1))}return [...map.entries()].sort((a,b)=>b[1]-a[1])};
 const periodStart=p=>{const d=new Date(),v=new Date(d.getFullYear(),d.getMonth(),d.getDate());if(p==='today'){}else if(p==='week')v.setDate(v.getDate()-((v.getDay()+6)%7));else if(p==='month')v.setDate(1);else if(p==='last30')v.setDate(v.getDate()-29);else return '';return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0')};
 const box=(id,title,sub,content)=>'<section class="gr-exec-card" data-widget="'+id+'"><div class="gr-exec-card-head"><div><small>'+e(id.replaceAll('_',' '))+'</small><h2>'+e(title)+'</h2><p>'+e(sub)+'</p></div></div>'+content+'</section>';
 const bars=(items,formatter=fmt)=>{const good=items.filter(x=>x[1]>0).slice(0,12),max=Math.max(1,...good.map(x=>x[1]));return good.length?'<div class="gr-exec-bars">'+good.map(([name,n])=>'<div class="gr-exec-bar"><div><span>'+e(name)+'</span><b>'+e(formatter(n))+'</b></div><section><i style="width:'+Math.max(3,Math.round(n/max*100))+'%"></i></section></div>').join('')+'</div>':'<div class="gr-exec-empty">No matching records</div>'};
 const ring=items=>{const colors=['#295dd5','#55a4ed','#15a6a1','#ffa347','#9278dd'],total=items.reduce((n,x)=>n+x[1],0);let x=0;const stops=items.map(([_,n],i)=>{const start=x;x+=total?n/total*360:0;return colors[i%colors.length]+' '+start+'deg '+x+'deg'});return '<div class="gr-exec-ring-wrap"><div class="gr-exec-ring" style="background:'+(total?'conic-gradient('+stops.join(',')+')':'#e7eefb')+'"><div><b>'+fmt(total)+'</b><small>Total</small></div></div><div class="gr-exec-ring-legend">'+items.map(([name,n],i)=>'<div><span><i style="background:'+colors[i%colors.length]+'"></i>'+e(name)+'</span><strong>'+fmt(n)+'</strong></div>').join('')+'</div></div>'};
 const stats=items=>'<div class="gr-exec-stats">'+items.map(([name,value])=>'<div><small>'+e(name)+'</small><strong>'+e(value)+'</strong></div>').join('')+'</div>';
 let host=null,client=null,companyIds=[],selected='all',userId='',notice=()=>{},records={sales:[],products:[],leads:[],dispatch:[],attendance:[],customers:[]},widgets=W.map(x=>x[0]),staff=[],isAdmin=false,role='',canExport=false,refreshing=false,refreshToken=0,interval=null;
 async function paged(table,build){const all=[];for(let i=0;i<10000;i+=1000){const response=await build(i,i+999);if(response.error)throw Error(table+': '+response.error.message);all.push(...(response.data||[]));if((response.data||[]).length<1000)break}return all}
 const input=id=>host?.querySelector(id)?.value||'';
 const inRange=(str,from,to)=>{const d=String(str||'').slice(0,10);return d&&(!from||d>=from)&&(!to||d<=to)};
 function filtered(){
  const period=input('#gr-exec-period')||'month',from=period==='custom'?input('#gr-exec-from'):periodStart(period),
   to=period==='custom'?input('#gr-exec-to'):period==='all'?'':today();
  const co=input('#gr-exec-company')||'all',source=input('#gr-exec-source')||'all',
   channel=input('#gr-exec-channel')||'all',product=input('#gr-exec-product')||'all',
   tag=input('#gr-exec-tag')||'all',stage=input('#gr-exec-stage')||'all',
   person=input('#gr-exec-person')||'all',status=input('#gr-exec-order-status')||'all';
  const visible=r=>co==='all'||r.company_id===co;
  const leadOk=l=>visible(l)&&inRange(l.created_at||l.date||l.followup,from,to)&&
   (source==='all'||l.source===source)&&(stage==='all'||l.stage===stage)&&
   (tag==='all'||(l.tag_ids||[]).includes(tag))&&
   (product==='all'||l.product_id===product||(l.product_interest_ids||[]).includes(product))&&
   (person==='all'||l.assigned_to===person);
  const leads=records.leads.filter(leadOk);
  const hasLeadScope=source!=='all'||tag!=='all'||person!=='all'||stage!=='all';
  const permittedOrders=new Set(leads.filter(l=>l.won_order_id).map(l=>l.won_order_id));
  const assignedOrders=new Set(records.leads.filter(l=>l.won_order_id).map(l=>l.won_order_id));
  const restricted=['Sales','Telecaller'].includes(role);
  const sales=records.sales.filter(r=>visible(r)&&inRange(r.date,from,to)&&
   (channel==='all'||r.channel_name===channel)&&(status==='all'||r.status===status)&&
   (product==='all'||r.product_id===product)&&
   (!hasLeadScope||permittedOrders.has(r.id))&&(!restricted||assignedOrders.has(r.id)));
  return {sales,leads,dispatch:records.dispatch.filter(r=>visible(r)&&inRange(r.approved_at||r.order_date,from,to)),
   products:records.products.filter(r=>visible(r)&&(product==='all'||r.id===product||r.sku===product)),
   customers:records.customers,from,to,restricted};
 }
 function draw(){
  if(!host)return;const f=filtered(),sales=f.sales.filter(r=>!['Cancelled','Returned'].includes(r.status)),leads=f.leads,dispatch=f.dispatch;
  const salesCount=new Set(f.sales.map(r=>r.company_id+'|'+(r.internal_order_id||r.id))).size;
  const linked=s=>dispatch.some(d=>d.company_id===s.company_id&&d.source_sale_id===s.id);
  const approved=f.sales.filter(s=>linked(s)||s.approval_status==='Approved').length;
  const pending=f.sales.filter(s=>!linked(s)&&s.approval_status!=='Approved'&&!['Cancelled','Returned'].includes(s.status)).length;
  const calls=leads.filter(l=>/telecall|telephone|phone call/i.test(l.source||''));const followups=leads.filter(l=>l.stage!=='Won'&&l.next_followup_at);const now=Date.now();
  const cards={
   attendance:()=>box('attendance','Attendance today','Read-only live attendance totals',ring([['Present',records.attendance.filter(x=>x.status==='present').length],['Half day',records.attendance.filter(x=>x.status==='half_day').length],['Other',records.attendance.filter(x=>!['present','half_day'].includes(x.status)).length]])),
   sales:()=>box('sales','Sales summary','Revenue, orders and units',stats([['Total revenue',money(sum(sales,'total'))],['Orders',fmt(salesCount)],['Units sold',fmt(sum(sales,'qty'))],['Today sales',money(sum(sales.filter(s=>s.date===today()),'total'))]])+bars([['Taxable sales',sum(sales,'taxable')],['GST',sum(sales,'tax_amount')],['Shipping',sum(sales,'shipping_charge')]],money)),
   day_sales:()=>box('day_sales','Day-wise sales','Total revenue per sales date',bars(group(sales,s=>s.date||'Unknown',s=>Number(s.total)||0),money)),
   channel_sales:()=>box('channel_sales','Sales channels','Sales revenue by channel',bars(group(sales,s=>s.channel_name||'Other',s=>Number(s.total)||0),money)),
   company_sales:()=>box('company_sales','Company-wise sales','Revenue across assigned companies',bars(group(sales,s=>company(s.company_id),s=>Number(s.total)||0),money)),
   leads:()=>box('leads','Leads by source','New enquiries and qualified leads',stats([['Total leads',fmt(leads.length)],['Today',fmt(leads.filter(l=>String(l.created_at||l.date||'').slice(0,10)===today()).length)],['Won',fmt(leads.filter(l=>l.stage==='Won').length)]])+bars(group(leads,l=>l.source||'Unspecified'))),
   order_status:()=>box('order_status','Sales order approvals','From filtered sales orders',ring([['Pending',pending],['Approved',approved],['Cancelled / returned',f.sales.filter(s=>['Cancelled','Returned'].includes(s.status)).length]])),
   dispatch:()=>box('dispatch','Dispatch pipeline','Current courier stages',bars(['Pending','Packed','Shipped','Delivered'].map(status=>[status,dispatch.filter(d=>d.status===status||(status==='Pending'&&d.status==='Approved')).length]))),
   stock:()=>box('stock','Products & stock','Current inventory, regardless of selected dates',stats([['Products',fmt(f.products.length)],['Low stock ≤5',fmt(f.products.filter(p=>Number(p.stock)>=0&&Number(p.stock)<=5).length)],['Out of stock',fmt(f.products.filter(p=>Number(p.stock)===0).length)]])+bars(f.products.slice().sort((a,b)=>(Number(a.stock)||0)-(Number(b.stock)||0)).slice(0,7).map(p=>[(p.name||p.sku||'Product')+' · '+company(p.company_id),Number(p.stock)||0]))),
   telecaller:()=>box('telecaller','Telecaller & conversions','Recorded leads classified as telecalling',stats([['Telecalling leads',fmt(calls.length)],['Won / converted',fmt(calls.filter(l=>l.stage==='Won').length)],['Calls today','Not tracked']])+bars([['Won',calls.filter(l=>l.stage==='Won').length],['Not yet won',calls.filter(l=>l.stage!=='Won').length]])+'<p class="gr-exec-foot">Actual calls require logged CRM conversations or a dialer integration.</p>'),
   customers:()=>box('customers','Customer overview','Shared customer master · not divided by company',stats([['Customers',fmt(f.customers.length)],['New leads',fmt(leads.filter(l=>l.stage==='New').length)],['Converted leads',fmt(leads.filter(l=>l.stage==='Won').length)]])+ring(group(leads,l=>l.stage||'New'))),
   followups:()=>box('followups','Follow-up activity','Pending, due and overdue leads',stats([['Follow-up scheduled',fmt(followups.length)],
    ['Due now',fmt(followups.filter(l=>new Date(l.next_followup_at).getTime()<=now).length)],
    ['Today',fmt(followups.filter(l=>String(l.next_followup_at||'').slice(0,10)===today()).length)],
    ['No schedule',fmt(leads.filter(l=>l.stage!=='Won'&&!l.next_followup_at).length)]])+bars(group(followups,l=>l.stage))),
   conversion:()=>box('conversion','Lead conversion','Pipeline breakdown and won rate',stats([['Total leads',fmt(leads.length)],
    ['Won',fmt(leads.filter(l=>l.stage==='Won').length)],
    ['Conversion rate',(leads.length?(100*leads.filter(l=>l.stage==='Won').length/leads.length).toFixed(1):'0.0')+'%']])+ring(group(leads,l=>l.stage||'New'))),
   salespeople:()=>box('salespeople','Salesperson performance','CRM-recorded lead ownership and conversions',
    bars(group(leads,l=>staff.find(p=>p.id===l.assigned_to)?.full_name||'Common queue'))+
    stats([['Won by assigned staff',fmt(leads.filter(l=>l.stage==='Won'&&l.assigned_to).length)],['Qualified',fmt(leads.filter(l=>l.stage==='Qualified').length)]])),
   recent:()=>box('recent','Recent Sales Orders','Filtered order values and states',
    '<div class="gr-exec-recent">'+sales.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,8).map(r=>
    '<div><b>'+e(r.internal_order_id||r.order_id||r.id)+'</b><span>'+e(r.customer_name||'Customer')+' · '+e(r.status||'No status')+'</span><strong>'+money(r.total)+'</strong></div>').join('')+'</div>'),
   accounts:()=>box('accounts','Accounting overview','Financial posting module',
     '<div class="gr-exec-empty">Accounting totals are unavailable: the accounting ledger tables have not yet been installed. No financial numbers are estimated.</div>')
  };
  host.querySelector('#gr-exec-kpis').innerHTML=[
   ['Sales revenue',money(sum(sales,'total'))],['Sales orders',fmt(salesCount)],
   ['Visible leads',fmt(leads.length)],['Follow-ups due',fmt(followups.filter(l=>new Date(l.next_followup_at).getTime()<=now).length)]
  ].map(([label,value])=>'<div class="gr-kpi"><span>'+e(label)+'</span><strong>'+e(value)+'</strong></div>').join('');
  host.querySelector('#gr-exec-panels').innerHTML=widgets.filter(id=>cards[id]).map(id=>cards[id]()).join('')||'<div class="gr-exec-empty">No charts enabled for your account. Ask the administrator to choose your dashboard widgets.</div>';
  host.querySelector('#gr-exec-count').textContent=fmt(f.sales.length)+' sales · '+fmt(leads.length)+' leads · '+fmt(dispatch.length)+' dispatch orders';
 }
 function fillChoices(id,label,values){const el=host.querySelector(id),before=el.value;el.innerHTML='<option value="all">'+e(label)+'</option>'+values.map(v=>'<option value="'+e(v)+'">'+e(v)+'</option>').join('');if([...el.options].some(o=>o.value===before))el.value=before}
 function namedChoices(id,label,values){const el=host.querySelector(id);if(!el)return;const before=el.value;
   el.innerHTML='<option value="all">'+e(label)+'</option>'+values.map(([value,name])=>
    '<option value="'+e(value)+'">'+e(name)+'</option>').join('');
   if([...el.options].some(o=>o.value===before))el.value=before;
 }

 const loadScript=async(url,verify)=>{
  if(verify())return;
  await new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=url;script.async=true;script.onload=resolve;
   script.onerror=()=>reject(Error('Report export library unavailable. Check internet access.'));
   document.head.append(script);
  });
  if(!verify())throw Error('Export library failed to initialize');
 };
 const exportRows=()=>{
  const f=filtered(),out=[];
  const allow=(id)=>widgets.includes(id);
  if(allow('sales')||allow('recent')||allow('day_sales')||allow('channel_sales')||allow('company_sales'))
   out.push(['Sales Orders',f.sales.map(x=>({Company:company(x.company_id),'SO ID':x.internal_order_id||x.order_id,Date:x.date,
    Customer:x.customer_name,Product:x.product_name,Channel:x.channel_name,Status:x.status,Value:x.total,Tax:x.tax_amount}))]);
  if(allow('leads')||allow('conversion')||allow('followups')||allow('telecaller')||allow('salespeople'))
   out.push(['Leads',f.leads.map(x=>({Company:company(x.company_id),Name:x.name||x.contact||x.title,
    Source:x.source,Stage:x.stage,Salesperson:staff.find(p=>p.id===x.assigned_to)?.full_name||'Common',
    Product:x.product_interest||x.product_id,Created:x.created_at,NextFollowup:x.next_followup_at}))]);
  if(allow('stock'))out.push(['Stock',f.products.map(x=>({Company:company(x.company_id),Product:x.name||x.sku,
   SKU:x.sku,Available:x.stock}))]);
  if(allow('dispatch'))out.push(['Dispatch',f.dispatch.map(x=>({Company:company(x.company_id),
    Order:x.source_sale_id,Status:x.status,Date:x.order_date}))]);
  if(allow('customers'))out.push(['Customers',f.customers.map(x=>({Name:x.name,Type:x.type,Created:x.created_at}))]);
  return out;
 };
 async function exportExcel(){
  try{
   if(!canExport)throw Error('Dashboard Excel export requires export permission');
   const sheets=exportRows();if(!sheets.length)throw Error('No accessible widgets to export');
   await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',()=>!!window.XLSX);
   const book=XLSX.utils.book_new();
   for(const [name,rows] of sheets){
    const sheet=XLSX.utils.json_to_sheet(rows.length?rows:[{Notice:'No matching records'}]);
    XLSX.utils.book_append_sheet(book,sheet,name.slice(0,31));
   }
   XLSX.writeFile(book,'greenrich-one-dashboard-'+today()+'.xlsx');
   notice('Dashboard exported to Excel','success');
  }catch(err){notice(err.message,'error')}
 }
 async function exportPdf(){
  try{
   if(!canExport)throw Error('Dashboard PDF export requires export permission');
   await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',()=>!!window.jspdf?.jsPDF);
   const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'}),sheets=exportRows();
   const width=190;let y=17;
   const line=(str,size=9)=>{
    doc.setFontSize(size);const lines=doc.splitTextToSize(String(str||''),width);
    for(const t of lines){if(y>277){doc.addPage();y=17}doc.text(t,12,y);y+=size*.45}
   };
   line('GREENRICH ONE — BUSINESS DASHBOARD',16);y+=3;
   line('Generated: '+new Date().toLocaleString('en-IN')+' | Data based on currently accessible and filtered records',8);y+=7;
   for(const [name,rows] of sheets){
    if(y>260){doc.addPage();y=17}
    line(name+' ('+rows.length+' records)',12);y+=3;
    for(const row of rows.slice(0,200)){
      line(Object.entries(row).slice(0,8).map(([k,v])=>k+': '+(v??'')).join(' | '),8);y+=2;
    }
    if(rows.length>200)line('Remaining '+(rows.length-200)+' records: download Excel for complete detail',8);
    y+=7;
   }
   doc.save('greenrich-one-dashboard-'+today()+'.pdf');notice('Dashboard PDF exported','success');
  }catch(err){notice(err.message,'error')}
 }

 async function refresh(){
  if(!host?.isConnected||refreshing)return;refreshing=true;const seq=++refreshToken;
  try{
   const [crm,dispatch,att,prefs,customers,leadPipeline,staffRows,tagRows]=await Promise.all([
    paged('CRM',(a,b)=>client.from('gr_crm_records').select('company_id,kind,payload').in('company_id',companyIds).in('kind',['sales','products','leads']).range(a,b)),
    paged('Dispatch',(a,b)=>client.from('gr_dispatch_orders').select('company_id,source_sale_id,status,approved_at,order_date').in('company_id',companyIds).range(a,b)),
    client.from('gr_attendance').select('user_id,status').eq('attendance_date',today()),
    client.from('gr_dashboard_preferences').select('widgets').eq('user_id',userId).maybeSingle(),
    client.from('gr_crm_customers').select('id,name,type,created_at').limit(1000),
    paged('Pipeline',(a,b)=>client.from('gr_lead_pipeline').select('company_id,lead_id,stage,source,tag_ids,product_id,assigned_to,created_at,updated_at,next_followup_at,won_order_id').in('company_id',companyIds).range(a,b)),
    Promise.all(companyIds.map(c=>client.rpc('gr_pipeline_staff',{p_company:c}))),
    client.from('gr_crm_tags').select('id,name').limit(500)
   ]);
   if(seq!==refreshToken)return;const fresh={sales:[],products:[],leads:[],dispatch,attendance:att.error?[]:att.data||[],customers:customers.error?[]:customers.data||[]};
   for(const row of crm)if(fresh[row.kind]&&row.payload)fresh[row.kind].push({...row.payload,company_id:row.company_id});
   fresh.leads=leadPipeline.map(l=>({...fresh.leads.find(x=>x.company_id===l.company_id&&(x.id===l.lead_id||x.lead_id===l.lead_id))||{},...l}));
   records=fresh;staff=[...new Map(staffRows.flatMap(r=>r.data||[]).map(p=>[p.id,p])).values()];
   widgets=Array.isArray(prefs.data?.widgets)?prefs.data.widgets:W.map(x=>x[0]);
   fillChoices('#gr-exec-source','All sources',[...new Set(records.leads.map(x=>x.source).filter(Boolean))].sort());
   fillChoices('#gr-exec-channel','All channels',[...new Set(records.sales.map(x=>x.channel_name).filter(Boolean))].sort());
   namedChoices('#gr-exec-product','All products',[...new Map(records.products.filter(x=>x.id||x.sku).map(x=>[x.id||x.sku,[x.id||x.sku,x.name||x.sku||x.id]])).values()]);
   namedChoices('#gr-exec-tag','All tags',tagRows.error?[]:(tagRows.data||[]).map(x=>[x.id,x.name]));
   fillChoices('#gr-exec-stage','All stages',['New','Contacted','Qualified','Quotation','Won','Lost']);
   fillChoices('#gr-exec-order-status','All statuses',[...new Set(records.sales.map(x=>x.status).filter(Boolean))].sort());
   namedChoices('#gr-exec-person','All salespeople',isAdmin?staff.map(p=>[p.id,p.full_name]):[]);
   host.querySelector('#gr-exec-loading').hidden=true;draw();
   if(att.error)notice('Attendance summary unavailable to this role');
  }catch(error){const el=host?.querySelector('#gr-exec-loading');if(el){el.hidden=false;el.textContent='Unable to refresh dashboard: '+error.message}}
  finally{refreshing=false}
 }
 async function mount(container,config){
  if(interval)clearInterval(interval);host=container;client=config.db;companyIds=config.companyIds;selected=config.selectedCompany;userId=config.userId;notice=config.notify||(()=>{});isAdmin=!!config.admin;role=config.role||'';canExport=!!config.canExport;
  container.innerHTML='<div class="gr-exec"><div class="gr-exec-heading"><div><span>GREENRICH ONE · BUSINESS INTELLIGENCE</span><h2>Performance overview</h2><p>Live operational charts from the shared GreenRich database</p></div><small id="gr-exec-count">Loading…</small></div>'+
   '<div class="gr-exec-filters"><label>Period<select id="gr-exec-period"><option value="today">Today</option><option value="week">This week</option><option value="month" selected>This month</option><option value="last30">Last 30 days</option><option value="all">All time</option><option value="custom">Custom dates</option></select></label>'+
   '<label>Company<select id="gr-exec-company"><option value="all">Both companies</option>'+companyIds.map(id=>'<option value="'+id+'">'+e(company(id))+'</option>').join('')+'</select></label>'+
   '<label>Lead source<select id="gr-exec-source"><option value="all">All sources</option></select></label><label>Sales channel<select id="gr-exec-channel"><option value="all">All channels</option></select></label>'+
   '<label>Product<select id="gr-exec-product"><option value="all">All products</option></select></label>'+
   '<label>Tags<select id="gr-exec-tag"><option value="all">All tags</option></select></label>'+
   '<label>Lead stage<select id="gr-exec-stage"><option value="all">All stages</option></select></label>'+
   '<label>Sales Order status<select id="gr-exec-order-status"><option value="all">All statuses</option></select></label>'+
   (isAdmin?'<label>Salesperson<select id="gr-exec-person"><option value="all">All salespeople</option></select></label>':'')+
   '<label>From<input type="date" id="gr-exec-from"></label><label>To<input type="date" id="gr-exec-to"></label><div class="gr-exec-actions"><button id="gr-exec-reset" type="button">Reset</button><button id="gr-exec-refresh" type="button">↻ Refresh</button>'+(canExport?'<button id="gr-exec-excel" type="button">Export Excel</button><button id="gr-exec-pdf" type="button">Export PDF</button>':'')+'</div></div>'+
   '<div class="gr-exec-loading" id="gr-exec-loading">Loading charts from GreenRich cloud…</div><div class="gr-exec-kpis" id="gr-exec-kpis"></div><div class="gr-exec-grid" id="gr-exec-panels"></div><p class="gr-exec-note">All figures are based on accessible records. Company/module RLS and Admin-set widget visibility apply. Stock is current, not historical.</p></div>';
  const co=host.querySelector('#gr-exec-company');if(companyIds.length===1){co.value=companyIds[0];co.disabled=true}else if(companyIds.includes(selected))co.value=selected;
  host.querySelectorAll('.gr-exec-filters input,.gr-exec-filters select').forEach(el=>el.addEventListener('change',()=>{if(el.type==='date')host.querySelector('#gr-exec-period').value='custom';draw()}));
  host.querySelector('#gr-exec-reset').onclick=()=>{host.querySelector('#gr-exec-period').value='month';co.value=companyIds.includes(selected)?selected:'all';for(const id of ['#gr-exec-source','#gr-exec-channel','#gr-exec-product','#gr-exec-tag','#gr-exec-stage','#gr-exec-order-status','#gr-exec-person']){const el=host.querySelector(id);if(el)el.value='all'}for(const id of ['#gr-exec-from','#gr-exec-to'])host.querySelector(id).value='';draw()};
  host.querySelector('#gr-exec-refresh').onclick=()=>void refresh();
  if(canExport){
   host.querySelector('#gr-exec-excel').onclick=()=>void exportExcel();
   host.querySelector('#gr-exec-pdf').onclick=()=>void exportPdf();
  }
  void refresh();interval=setInterval(()=>{if(host?.isConnected)void refresh()},60000);
 }
 async function preferences(container,{db,people,notify}){
  const peopleActive=people.filter(p=>p.active);
  container.innerHTML='<div class="gr-exec-admin"><h2>Dashboard Access · Each Employee</h2><p>Choose exactly which charts each employee can see. Settings apply across all browsers and devices. Company and database permissions still apply.</p>'+
   '<label>Employee<select id="gr-exec-person">'+peopleActive.map(p=>'<option value="'+e(p.id)+'">'+e(p.full_name||p.id)+'</option>').join('')+'</select></label><div id="gr-exec-choices"></div>'+
   '<div class="gr-exec-admin-actions"><button type="button" id="gr-exec-all">Select all</button><button type="button" id="gr-exec-none">Hide all</button><button type="button" class="blue" id="gr-exec-save">Save dashboard access</button></div><p id="gr-exec-message"></p></div>';
  const person=container.querySelector('#gr-exec-person'),choices=container.querySelector('#gr-exec-choices'),message=container.querySelector('#gr-exec-message');
  const load=async()=>{const r=await db.from('gr_dashboard_preferences').select('widgets').eq('user_id',person.value).maybeSingle();if(r.error){message.textContent=r.error.message;return}const current=Array.isArray(r.data?.widgets)?r.data.widgets:W.map(x=>x[0]);choices.innerHTML=W.map(([id,label])=>'<label><input type="checkbox" value="'+id+'" '+(current.includes(id)?'checked':'')+'><span>'+e(label)+'</span></label>').join('');message.textContent='Select the widgets shown for this employee.'};
  person.onchange=()=>void load();
  container.querySelector('#gr-exec-all').onclick=()=>choices.querySelectorAll('input').forEach(x=>x.checked=true);
  container.querySelector('#gr-exec-none').onclick=()=>choices.querySelectorAll('input').forEach(x=>x.checked=false);
  container.querySelector('#gr-exec-save').onclick=async event=>{event.currentTarget.disabled=true;try{const widgets=[...choices.querySelectorAll('input:checked')].map(x=>x.value);const r=await db.from('gr_dashboard_preferences').upsert({user_id:person.value,widgets,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(r.error)throw Error(r.error.message);message.textContent='Saved '+person.selectedOptions[0].textContent+' dashboard access';notify?.(message.textContent)}catch(error){message.textContent=error.message}finally{event.currentTarget.disabled=false}};
  if(peopleActive.length)await load();else message.textContent='No active users';
 }
 window.GreenRichExecutiveDashboard={mount,preferences,widgets:W,periodStart};
})();
