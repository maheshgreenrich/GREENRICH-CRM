'use strict';
/* Local SVG charts: authorized dashboard data only; exact values remain available. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const colors=['#0c956f','#4e83ee','#9462ed','#f4a640','#ee6f9b','#2ab6c1','#64748b'];
 const fmt=n=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:1,notation:'compact'}).format(n);
 const exact=n=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n);
 const empty=()=>'<div class="gr2-empty">Not enough matching data for this chart.</div>';
 const table=(headers,rows)=>'<details class="gr3-data"><summary>View chart data</summary><div class="gr2-table-wrap"><table class="gr2-table"><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>';
 const svg=(title,body)=>'<svg class="gr3-chart" viewBox="0 0 560 280" role="img" aria-label="'+esc(title)+'"><title>'+esc(title)+'</title>'+body+'</svg>';
 const text=(x,y,label,anchor='middle')=>'<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'">'+esc(label)+'</text>';
 const axes=(max,xLabel,yLabel)=>[0,1,2,3,4].map(i=>{const y=225-i*45;return '<path d="M64 '+y+'H536" class="gr3-grid"/>'+text(55,y+4,fmt(max*i/4),'end')}).join('')+text(300,275,xLabel)+text(64,16,yLabel,'start');
 function series(items,{area=false,yLabel='Count',xLabel='Date'}={}){
  if(!items.length)return empty();const max=Math.max(1,...items.map(x=>x[1]));
  const points=items.map((r,i)=>[64+(items.length===1?236:i*472/(items.length-1)),225-r[1]/max*180]);
  let body=axes(max,xLabel,yLabel);
  if(area)body+='<path d="M'+points[0][0]+' 225 L'+points.map(p=>p.join(' ')).join(' L')+' L'+points.at(-1)[0]+' 225Z" fill="#0c956f" opacity=".14"/>';
  body+='<polyline points="'+points.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#0c956f" stroke-width="3" stroke-linejoin="round"/>';
  points.forEach(([x,y],i)=>{body+='<circle cx="'+x+'" cy="'+y+'" r="4" fill="#fff" stroke="#0c956f" stroke-width="2"><title>'+esc(items[i][0]+': '+exact(items[i][1]))+'</title></circle>'});
   body+='<line class="gr3-guideline" x1="64" x2="64" y1="45" y2="225"/>';
   const hitWidth=items.length>1?472/(items.length-1):180;
   points.forEach(([x,y],i)=>{const tip=items[i][0]+' · '+exact(items[i][1])+' '+yLabel;body+='<rect class="gr3-hover-zone" x="'+Math.max(64,x-hitWidth/2)+'" y="45" width="'+Math.min(hitWidth,536-Math.max(64,x-hitWidth/2))+'" height="180" fill="transparent" role="button" tabindex="0" data-gr3-x="'+x+'" data-gr3-tooltip="'+esc(tip)+'" aria-label="'+esc(tip)+'"/>'});
  [...new Set([0,Math.floor((items.length-1)/2),items.length-1])].forEach(i=>body+=text(points[i][0],247,items[i][0].length===10?items[i][0].slice(5):items[i][0],i===0?'start':i===items.length-1?'end':'middle'));
  return svg(yLabel+' by '+xLabel,body)+table([xLabel,yLabel],items.map(r=>[r[0],exact(r[1])]));
 }
 function daily(rows,date,value,from,to){
  const totals=new Map();for(const r of rows){const k=date(r);if(/^\d{4}-\d{2}-\d{2}$/.test(k))totals.set(k,(totals.get(k)||0)+value(r))}
  const keys=[...totals.keys()].sort();if(!keys.length)return [];
  const start=from||keys[0],end=to||keys.at(-1),monthly=(new Date(end)-new Date(start))/86400000>62,result=[];
  if(monthly){const grouped=new Map();for(const [k,v] of totals){const m=k.slice(0,7);grouped.set(m,(grouped.get(m)||0)+v)}let d=new Date(start.slice(0,7)+'-01T00:00:00Z');while(d.toISOString().slice(0,7)<=end.slice(0,7)&&result.length<1200){const k=d.toISOString().slice(0,7);result.push([k,grouped.get(k)||0]);d.setUTCMonth(d.getUTCMonth()+1)}}
  else{let d=new Date(start+'T00:00:00Z');while(d.toISOString().slice(0,10)<=end&&result.length<63){const k=d.toISOString().slice(0,10);result.push([k,totals.get(k)||0]);d.setUTCDate(d.getUTCDate()+1)}}return result;
 }
 function pie(items){const all=items.filter(r=>r[1]>0).sort((a,b)=>b[1]-a[1]);if(!all.length)return empty();const rows=all.length>6?[...all.slice(0,5),['Other',all.slice(5).reduce((n,r)=>n+r[1],0)]]:all,total=rows.reduce((n,r)=>n+r[1],0);let end=0;const stops=rows.map((r,i)=>{const start=end;end+=r[1]/total*100;return colors[i]+' '+start+'% '+end+'%'});
  return '<div class="gr3-pie-wrap"><div class="gr3-pie" role="img" aria-label="Customer type shares; exact values below" style="background:conic-gradient('+stops.join(',')+')"></div><div class="gr2-legend">'+rows.map((r,i)=>'<div tabindex="0" data-tip="'+esc(r[0])+' · '+exact(r[1])+' · '+(r[1]/total*100).toFixed(1)+'%"><i style="background:'+colors[i]+'"></i><span>'+esc(r[0])+'</span><strong>'+exact(r[1])+' · '+(r[1]/total*100).toFixed(1)+'%</strong></div>').join('')+'</div></div>'+table(['Type','Customers'],all);
 }
 function orderTotals(rows){const m=new Map();for(const r of rows){const key=r.company_id+'|'+(r.internal_order_id||r.order_id||r.id);m.set(key,(m.get(key)||0)+(Number(r.total)||0))}return [...m.values()].filter(v=>Number.isFinite(v)&&v>=0)}
 function bins(values){if(!values.length)return [];const lo=Math.min(...values),hi=Math.max(...values);if(lo===hi)return [{lo,hi,count:values.length}];const n=Math.min(6,Math.max(2,Math.ceil(Math.sqrt(values.length)))),width=(hi-lo)/n,rows=Array.from({length:n},(_,i)=>({lo:lo+i*width,hi:lo+(i+1)*width,count:0}));for(const v of values)rows[Math.min(n-1,Math.floor((v-lo)/width))].count++;return rows}
 function histogram(values){const rows=bins(values);if(!rows.length)return empty();const max=Math.max(1,...rows.map(r=>r.count)),width=472/rows.length;let body=axes(max,'Order value (₹)','Number of orders');rows.forEach((r,i)=>{body+='<rect x="'+(64+i*width+1)+'" y="'+(225-r.count/max*180)+'" width="'+(width-2)+'" height="'+(r.count/max*180)+'" rx="5" fill="#2355c6" tabindex="0" role="button" data-gr3-tooltip="'+esc(exact(r.lo)+' – '+exact(r.hi)+' · '+r.count+' orders')+'" aria-label="'+esc(exact(r.lo)+' to '+exact(r.hi)+': '+r.count+' orders')+'"><title>'+esc(exact(r.lo)+' to '+exact(r.hi)+': '+r.count+' orders')+'</title></rect>';body+=text(64+i*width+width/2,247,fmt(r.lo))});return svg('Order value distribution',body)+table(['From ₹ (inclusive)','To ₹ (last inclusive)','Orders'],rows.map(r=>[exact(r.lo),exact(r.hi),r.count]));}
 function scatter(products){const rows=products.filter(p=>p.price!=null&&p.price!==''&&p.stock!=null&&p.stock!==''&&Number.isFinite(Number(p.price))&&Number.isFinite(Number(p.stock))&&Number(p.price)>=0&&Number(p.stock)>=0);if(rows.length<2)return empty();const maxX=Math.max(1,...rows.map(p=>Number(p.price))),maxY=Math.max(1,...rows.map(p=>Number(p.stock)));let body=axes(maxY,'Product price (₹)','Available stock (units)');[0,1,2,3,4].forEach(i=>body+=text(64+i*118,247,fmt(maxX*i/4),i===0?'start':i===4?'end':'middle'));for(const p of rows){body+='<circle cx="'+(64+Number(p.price)/maxX*472)+'" cy="'+(225-Number(p.stock)/maxY*180)+'" r="6" fill="'+(Number(p.stock)<=5?'#d97706':'#2355c6')+'" fill-opacity=".75" stroke="#fff" tabindex="0" role="button" data-gr3-tooltip="'+esc((p.name||p.sku||'Product')+' · ₹'+exact(p.price)+' · '+exact(p.stock)+' in stock')+'" aria-label="'+esc((p.name||p.sku||'Product')+' · ₹'+exact(p.price)+' · '+exact(p.stock)+' in stock')+'"><title>'+esc((p.name||p.sku||'Product')+' · ₹'+exact(p.price)+' · '+exact(p.stock)+' in stock')+'</title></circle>'}return svg('Product price versus current stock',body)+'<p class="gr3-caption">Each dot is a product. Amber indicates stock of 5 or fewer. Products without price or stock are excluded.</p>'+table(['Product','Price ₹','Stock'],rows.map(p=>[p.name||p.sku,exact(p.price),exact(p.stock)]));}

 /* The revenue chart is intentionally separate from generic green/blue charts.
    It keeps all data sourced from authorized CRM sales, never sample values. */
 function revenueTrend(items,{total=0,orders=0,previousTotal=null,period='month'}={}){
  const values=items.map(([label,value])=>[String(label),Math.max(0,Number(value)||0)]);
  const indian=new Intl.NumberFormat('en-IN',{maximumFractionDigits:2});
  const money=n=>'₹'+indian.format(Number(n)||0);
  const highest=values.length?Math.max(...values.map(x=>x[1])):0;
  const lowest=values.length?Math.min(...values.map(x=>x[1])):0;
  const prev=previousTotal==null?null:Number(previousTotal);
  const delta=prev!==null&&prev>0?(Number(total)-prev)/prev*100:null;
  const sign=delta===null?'':delta>0?'+':'';
  const deltaLabel=delta!==null?sign+delta.toFixed(1)+'%':prev===0&&total>0?'New revenue':'—';
  const deltaDetail=delta!==null?'vs. previous period':prev===0?'No revenue in previous period':'No comparable previous period';
  const changeClass=delta===null?'neutral':delta>=0?'positive':'negative';
  const periodOptions=[['today','Today'],['week','This week'],['month','This month'],['last30','Last 30 days'],['last90','Last 90 days'],['all','All time'],['custom','Custom range']];
  const periodPicker='<label class="gr4-picker"><span class="gr4-sr">Revenue trend period</span><select class="gr4-period-select" aria-label="Revenue trend reporting period">'+periodOptions.map(([id,label])=>'<option value="'+id+'"'+(id===period?' selected':'')+'>'+label+'</option>').join('')+'</select></label>';
  const top='<div class="gr4-metrics"><div class="gr4-total"><span class="gr4-metric-caption">Selected period revenue</span><div class="gr4-total-value">'+money(total)+'</div><div class="gr4-change '+changeClass+'"><strong>'+esc(deltaLabel)+'</strong><span>'+esc(deltaDetail)+'</span></div></div><div class="gr4-facts"><div><span>High</span><strong class="gr4-high">'+money(highest)+'</strong></div><div><span>Low</span><strong class="gr4-low">'+money(lowest)+'</strong></div><div><span>Change</span><strong class="gr4-change-number '+changeClass+'">'+esc(deltaLabel)+'</strong></div></div></div>';
  const footer='<div class="gr4-footer"><div class="gr4-table">'+table(['Date','Revenue (₹)'],values.map(([day,val])=>[day,indian.format(val)]))+'</div><div class="gr4-order-facts"><span>Total orders: <strong>'+indian.format(orders)+'</strong></span><span>Avg. order value: <strong>'+money(orders?Number(total)/orders:0)+'</strong></span></div></div>';
  if(!values.length)return '<div class="gr4-revenue"><div class="gr4-controls">'+periodPicker+'<span class="gr4-chart-key">● &nbsp;Revenue</span></div>'+top+'<div class="gr4-empty">No recorded sales in this period. Choose another date range to view revenue trends.</div>'+footer+'</div>';
  const W=980,H=360,L=82,R=942,T=47,B=292,plotW=R-L,plotH=B-T;
  const target=Math.max(1,highest)/4;
  const pow=Math.pow(10,Math.floor(Math.log10(target)));
  const step=Math.max(1,Math.ceil(target/pow)*pow);
  const ceiling=step*4;
  const coords=values.map(([key,val],i)=>({key,val,x:values.length===1?(L+R)/2:L+plotW*i/(values.length-1),y:B-Math.min(1,val/ceiling)*plotH}));
  const tangent=(a,b)=>a&&b&&Math.sign(a)===Math.sign(b)?2*a*b/(a+b):0;
  const slopes=coords.slice(1).map((p,i)=>(p.y-coords[i].y)/(p.x-coords[i].x));
  const smooth=coords.map((p,i)=>i===0?'M '+p.x.toFixed(2)+' '+p.y.toFixed(2):(()=>{
   const before=coords[i-1],dx=p.x-before.x;
   const m1=i===1?slopes[0]:tangent(slopes[i-2],slopes[i-1]);
   const m2=i===coords.length-1?slopes[i-1]:tangent(slopes[i-1],slopes[i]);
   return 'C '+(before.x+dx/3).toFixed(2)+' '+(before.y+m1*dx/3).toFixed(2)+' '+(p.x-dx/3).toFixed(2)+' '+(p.y-m2*dx/3).toFixed(2)+' '+p.x.toFixed(2)+' '+p.y.toFixed(2);
  })()).join(' ');
  const line=coords.length===1?'M '+L+' '+coords[0].y+' L '+R+' '+coords[0].y:smooth;
  const fill=line+' L '+coords[coords.length-1].x.toFixed(2)+' '+B+' L '+coords[0].x.toFixed(2)+' '+B+' Z';
  const ticks=Array.from({length:5},(_,i)=>{const val=ceiling-i*step,y=T+i*plotH/4;return '<line class="gr4-grid" x1="'+L+'" x2="'+R+'" y1="'+y+'" y2="'+y+'"/><text class="gr4-tick" x="'+(L-17)+'" y="'+(y+5)+'" text-anchor="end">'+esc(fmt(val))+'</text>'}).join('');
  const marks=[...new Set([0,Math.floor((coords.length-1)/2),coords.length-1])].map(i=>{const p=coords[i];const label=/^\d{4}-\d{2}-\d{2}$/.test(p.key)?p.key.slice(5):/^\d{4}-\d{2}$/.test(p.key)?p.key.slice(5)+'/'+p.key.slice(0,4):p.key;return '<text class="gr4-date" x="'+p.x+'" y="'+(B+29)+'" text-anchor="'+(i===0?'start':i===coords.length-1?'end':'middle')+'">'+esc(label)+'</text>'}).join('');
  const peaks=coords.filter(p=>p.val>0).map(p=>'<circle class="gr4-positive-dot" cx="'+p.x+'" cy="'+p.y+'" r="4.8"/>').join('');
  const width=coords.length>1?plotW/(coords.length-1):plotW;
  const hover=coords.map((p,i)=>{
   const x1=coords.length===1?L:Math.max(L,p.x-width/2),x2=coords.length===1?R:Math.min(R,p.x+width/2);
   return '<rect class="gr4-hover-zone" tabindex="0" role="button" aria-label="'+esc(p.key+' · Revenue '+money(p.val))+'" data-gr4-date="'+esc(p.key)+'" data-gr4-value="'+esc(money(p.val))+'" data-gr4-x="'+p.x+'" data-gr4-y="'+p.y+'" x="'+x1+'" y="'+T+'" width="'+Math.max(1,x2-x1)+'" height="'+plotH+'" fill="transparent"/>';
  }).join('');
  const graph='<div class="gr4-chart-scroll"><div class="gr4-plot" role="group" aria-label="Interactive revenue by date, hover or focus a date to see exact revenue"><svg class="gr4-svg" viewBox="0 0 '+W+' '+H+'" aria-label="Revenue trend graph in Indian rupees" role="img"><defs><linearGradient id="gr4-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a4cef" stop-opacity=".24"/><stop offset=".55" stop-color="#9a4cef" stop-opacity=".085"/><stop offset="1" stop-color="#9a4cef" stop-opacity="0"/></linearGradient></defs><text class="gr4-axis-name" x="'+L+'" y="25">Revenue (₹)</text>'+ticks+'<path d="'+fill+'" fill="url(#gr4-area-gradient)" class="gr4-area"/><path d="'+line+'" class="gr4-line"/>'+peaks+marks+'<text class="gr4-axis-bottom" x="'+(W/2)+'" y="'+(H-5)+'" text-anchor="middle">Date</text><line class="gr4-cursor" x1="'+L+'" x2="'+L+'" y1="'+T+'" y2="'+B+'"/><circle class="gr4-active-dot" cx="'+L+'" cy="'+B+'" r="7"/>'+hover+'</svg><div class="gr4-tooltip" hidden><span class="gr4-tooltip-date"></span><div>Revenue: <strong class="gr4-tooltip-value"></strong></div></div></div></div>';
  return '<div class="gr4-revenue"><div class="gr4-controls">'+periodPicker+'<span class="gr4-chart-key"><i></i> Revenue by date</span></div>'+top+graph+footer+'</div>';
 }

 const paths={sales:'M4 19V5m0 14h16M8 15l4-5 4 2 4-7',customers:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8',stock:'M3 7l9-4 9 4v10l-9 4-9-4V7m0 0 9 4 9-4m-9 4v10',followups:'M12 8v5l3 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',conversion:'M3 4h18l-7 8v7l-4 2v-9L3 4',attendance:'M5 4h14v17H5V4m4-2v4m6-4v4m-7 8 3 3 5-6',dispatch:'M3 5h11v12H3V5m11 5h4l3 4v3h-7M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4m10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4'};
 const icon=id=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[id]||paths[({day_sales:'sales',company_sales:'sales',channel_sales:'sales',leads:'customers',salespeople:'customers',telecaller:'customers',recent:'attendance',order_status:'attendance',accounts:'sales'})[id]]||paths.sales)+'"/></svg>';
 window.GreenRichDashboardCharts={series,revenueTrend,daily,pie,scatter,histogram,bins,orderTotals,icon};
})();
