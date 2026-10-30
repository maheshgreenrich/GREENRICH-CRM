'use strict';
/* Live dashboard: RLS-scoped CRM, Dispatch, read-only Attendance.
   Each employee's visible charts are configured separately by an administrator. */
(()=>{
 const W=[['attendance','Attendance today'],['sales','Sales summary'],['day_sales','Day-wise sales'],['channel_sales','Sales channels'],['company_sales','Company-wise sales'],['leads','Leads and sources'],['order_status','Order approvals'],['dispatch','Dispatch pipeline'],['stock','Products and stock'],['telecaller','Telecaller activity']];
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
 let host=null,client=null,companyIds=[],selected='all',userId='',notice=()=>{},records={sales:[],products:[],leads:[],dispatch:[],attendance:[]},widgets=W.map(x=>x[0]),refreshing=false,refreshToken=0,interval=null;
 async function paged(table,build){const all=[];for(let i=0;i<10000;i+=1000){const response=await build(i,i+999);if(response.error)throw Error(table+': '+response.error.message);all.push(...(response.data||[]));if((response.data||[]).length<1000)break}return all}
 const input=id=>host?.querySelector(id)?.value||'';
 const inRange=(str,from,to)=>{const d=String(str||'').slice(0,10);return d&&(!from||d>=from)&&(!to||d<=to)};
 function filtered(){
  const period=input('#gr-exec-period')||'month',from=period==='custom'?input('#gr-exec-from'):periodStart(period),to=period==='custom'?input('#gr-exec-to'):period==='all'?'':today();
  const co=input('#gr-exec-company')||'all',source=input('#gr-exec-source')||'all',channel=input('#gr-exec-channel')||'all';
  const visible=r=>co==='all'||r.company_id===co;
  return {
   sales:records.sales.filter(r=>visible(r)&&inRange(r.date,from,to)&&(channel==='all'||r.channel_name===channel)),
   leads:records.leads.filter(r=>visible(r)&&inRange(r.created_at||r.date||r.followup,from,to)&&(source==='all'||r.source===source)),
   dispatch:records.dispatch.filter(r=>visible(r)&&inRange(r.approved_at||r.order_date,from,to)),
   products:records.products.filter(visible)
  };
 }
 function draw(){
  if(!host)return;const f=filtered(),sales=f.sales.filter(r=>!['Cancelled','Returned'].includes(r.status)),leads=f.leads,dispatch=f.dispatch;
  const salesCount=new Set(f.sales.map(r=>r.company_id+'|'+(r.internal_order_id||r.id))).size;
  const linked=s=>dispatch.some(d=>d.company_id===s.company_id&&d.source_sale_id===s.id);
  const approved=f.sales.filter(s=>linked(s)||s.approval_status==='Approved').length;
  const pending=f.sales.filter(s=>!linked(s)&&s.approval_status!=='Approved'&&!['Cancelled','Returned'].includes(s.status)).length;
  const calls=leads.filter(l=>/telecall|telephone|phone call/i.test(l.source||''));
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
   telecaller:()=>box('telecaller','Telecaller & conversions','Recorded leads classified as telecalling',stats([['Telecalling leads',fmt(calls.length)],['Won / converted',fmt(calls.filter(l=>l.stage==='Won').length)],['Calls today','Not tracked']])+bars([['Won',calls.filter(l=>l.stage==='Won').length],['Not yet won',calls.filter(l=>l.stage!=='Won').length]])+'<p class="gr-exec-foot">Calls spoken today cannot be measured until a call-log or dialer integration is connected.</p>')
  };
  host.querySelector('#gr-exec-panels').innerHTML=widgets.filter(id=>cards[id]).map(id=>cards[id]()).join('')||'<div class="gr-exec-empty">No charts enabled for your account. Ask the administrator to choose your dashboard widgets.</div>';
  host.querySelector('#gr-exec-count').textContent=fmt(f.sales.length)+' sales · '+fmt(leads.length)+' leads · '+fmt(dispatch.length)+' dispatch orders';
 }
 function fillChoices(id,label,values){const el=host.querySelector(id),before=el.value;el.innerHTML='<option value="all">'+e(label)+'</option>'+values.map(v=>'<option value="'+e(v)+'">'+e(v)+'</option>').join('');if([...el.options].some(o=>o.value===before))el.value=before}
 async function refresh(){
  if(!host?.isConnected||refreshing)return;refreshing=true;const seq=++refreshToken;
  try{
   const [crm,dispatch,att,prefs]=await Promise.all([
    paged('CRM',(a,b)=>client.from('gr_crm_records').select('company_id,kind,payload').in('company_id',companyIds).in('kind',['sales','products','leads']).range(a,b)),
    paged('Dispatch',(a,b)=>client.from('gr_dispatch_orders').select('company_id,source_sale_id,status,approved_at,order_date').in('company_id',companyIds).range(a,b)),
    client.from('gr_attendance').select('user_id,status').eq('attendance_date',today()),
    client.from('gr_dashboard_preferences').select('widgets').eq('user_id',userId).maybeSingle()
   ]);
   if(seq!==refreshToken)return;const fresh={sales:[],products:[],leads:[],dispatch,attendance:att.error?[]:att.data||[]};
   for(const row of crm)if(fresh[row.kind]&&row.payload)fresh[row.kind].push({...row.payload,company_id:row.company_id});
   records=fresh;widgets=Array.isArray(prefs.data?.widgets)?prefs.data.widgets:W.map(x=>x[0]);
   fillChoices('#gr-exec-source','All sources',[...new Set(records.leads.map(x=>x.source).filter(Boolean))].sort());
   fillChoices('#gr-exec-channel','All channels',[...new Set(records.sales.map(x=>x.channel_name).filter(Boolean))].sort());
   host.querySelector('#gr-exec-loading').hidden=true;draw();
   if(att.error)notice('Attendance summary unavailable to this role');
  }catch(error){const el=host?.querySelector('#gr-exec-loading');if(el){el.hidden=false;el.textContent='Unable to refresh dashboard: '+error.message}}
  finally{refreshing=false}
 }
 async function mount(container,config){
  if(interval)clearInterval(interval);host=container;client=config.db;companyIds=config.companyIds;selected=config.selectedCompany;userId=config.userId;notice=config.notify||(()=>{});
  container.innerHTML='<div class="gr-exec"><div class="gr-exec-heading"><div><span>GREENRICH ONE · BUSINESS INTELLIGENCE</span><h2>Performance overview</h2><p>Live operational charts from the shared GreenRich database</p></div><small id="gr-exec-count">Loading…</small></div>'+
   '<div class="gr-exec-filters"><label>Period<select id="gr-exec-period"><option value="today">Today</option><option value="week">This week</option><option value="month" selected>This month</option><option value="last30">Last 30 days</option><option value="all">All time</option><option value="custom">Custom dates</option></select></label>'+
   '<label>Company<select id="gr-exec-company"><option value="all">Both companies</option>'+companyIds.map(id=>'<option value="'+id+'">'+e(company(id))+'</option>').join('')+'</select></label>'+
   '<label>Lead source<select id="gr-exec-source"><option value="all">All sources</option></select></label><label>Sales channel<select id="gr-exec-channel"><option value="all">All channels</option></select></label>'+
   '<label>From<input type="date" id="gr-exec-from"></label><label>To<input type="date" id="gr-exec-to"></label><div class="gr-exec-actions"><button id="gr-exec-reset" type="button">Reset</button><button id="gr-exec-refresh" type="button">↻ Refresh</button></div></div>'+
   '<div class="gr-exec-loading" id="gr-exec-loading">Loading charts from GreenRich cloud…</div><div class="gr-exec-grid" id="gr-exec-panels"></div></div>';
  const co=host.querySelector('#gr-exec-company');if(companyIds.length===1){co.value=companyIds[0];co.disabled=true}else if(companyIds.includes(selected))co.value=selected;
  host.querySelectorAll('.gr-exec-filters input,.gr-exec-filters select').forEach(el=>el.addEventListener('change',()=>{if(el.type==='date')host.querySelector('#gr-exec-period').value='custom';draw()}));
  host.querySelector('#gr-exec-reset').onclick=()=>{host.querySelector('#gr-exec-period').value='month';co.value=companyIds.includes(selected)?selected:'all';for(const id of ['#gr-exec-source','#gr-exec-channel'])host.querySelector(id).value='all';for(const id of ['#gr-exec-from','#gr-exec-to'])host.querySelector(id).value='';draw()};
  host.querySelector('#gr-exec-refresh').onclick=()=>void refresh();
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
