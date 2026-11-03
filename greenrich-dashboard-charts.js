'use strict';
/* Local SVG charts: authorized dashboard data only; exact values remain available. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const colors=['#2355c6','#19a79b','#8b6bd9','#e6a13c','#d75a8c','#4599c9','#64748b'];
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
  if(area)body+='<path d="M'+points[0][0]+' 225 L'+points.map(p=>p.join(' ')).join(' L')+' L'+points.at(-1)[0]+' 225Z" fill="#2355c6" opacity=".12"/>';
  body+='<polyline points="'+points.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#2355c6" stroke-width="3" stroke-linejoin="round"/>';
  points.forEach(([x,y],i)=>{body+='<circle cx="'+x+'" cy="'+y+'" r="4" fill="#fff" stroke="#2355c6" stroke-width="2"><title>'+esc(items[i][0]+': '+exact(items[i][1]))+'</title></circle>'});
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
  return '<div class="gr3-pie-wrap"><div class="gr3-pie" role="img" aria-label="Customer type shares; exact values below" style="background:conic-gradient('+stops.join(',')+')"></div><div class="gr2-legend">'+rows.map((r,i)=>'<div><i style="background:'+colors[i]+'"></i><span>'+esc(r[0])+'</span><strong>'+exact(r[1])+' · '+(r[1]/total*100).toFixed(1)+'%</strong></div>').join('')+'</div></div>'+table(['Type','Customers'],all);
 }
 function orderTotals(rows){const m=new Map();for(const r of rows){const key=r.company_id+'|'+(r.internal_order_id||r.order_id||r.id);m.set(key,(m.get(key)||0)+(Number(r.total)||0))}return [...m.values()].filter(v=>Number.isFinite(v)&&v>=0)}
 function bins(values){if(!values.length)return [];const lo=Math.min(...values),hi=Math.max(...values);if(lo===hi)return [{lo,hi,count:values.length}];const n=Math.min(6,Math.max(2,Math.ceil(Math.sqrt(values.length)))),width=(hi-lo)/n,rows=Array.from({length:n},(_,i)=>({lo:lo+i*width,hi:lo+(i+1)*width,count:0}));for(const v of values)rows[Math.min(n-1,Math.floor((v-lo)/width))].count++;return rows}
 function histogram(values){const rows=bins(values);if(!rows.length)return empty();const max=Math.max(1,...rows.map(r=>r.count)),width=472/rows.length;let body=axes(max,'Order value (₹)','Number of orders');rows.forEach((r,i)=>{body+='<rect x="'+(64+i*width+1)+'" y="'+(225-r.count/max*180)+'" width="'+(width-2)+'" height="'+(r.count/max*180)+'" rx="3" fill="#2355c6"><title>'+esc(exact(r.lo)+' to '+exact(r.hi)+': '+r.count+' orders')+'</title></rect>';body+=text(64+i*width+width/2,247,fmt(r.lo))});return svg('Order value distribution',body)+table(['From ₹ (inclusive)','To ₹ (last inclusive)','Orders'],rows.map(r=>[exact(r.lo),exact(r.hi),r.count]));}
 function scatter(products){const rows=products.filter(p=>p.price!=null&&p.price!==''&&p.stock!=null&&p.stock!==''&&Number.isFinite(Number(p.price))&&Number.isFinite(Number(p.stock))&&Number(p.price)>=0&&Number(p.stock)>=0);if(rows.length<2)return empty();const maxX=Math.max(1,...rows.map(p=>Number(p.price))),maxY=Math.max(1,...rows.map(p=>Number(p.stock)));let body=axes(maxY,'Product price (₹)','Available stock (units)');[0,1,2,3,4].forEach(i=>body+=text(64+i*118,247,fmt(maxX*i/4),i===0?'start':i===4?'end':'middle'));for(const p of rows){body+='<circle cx="'+(64+Number(p.price)/maxX*472)+'" cy="'+(225-Number(p.stock)/maxY*180)+'" r="6" fill="'+(Number(p.stock)<=5?'#d97706':'#2355c6')+'" fill-opacity=".75" stroke="#fff"><title>'+esc((p.name||p.sku||'Product')+' · ₹'+exact(p.price)+' · '+exact(p.stock)+' in stock')+'</title></circle>'}return svg('Product price versus current stock',body)+'<p class="gr3-caption">Each dot is a product. Amber indicates stock of 5 or fewer. Products without price or stock are excluded.</p>'+table(['Product','Price ₹','Stock'],rows.map(p=>[p.name||p.sku,exact(p.price),exact(p.stock)]));}
 const paths={sales:'M4 19V5m0 14h16M8 15l4-5 4 2 4-7',customers:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8',stock:'M3 7l9-4 9 4v10l-9 4-9-4V7m0 0 9 4 9-4m-9 4v10',followups:'M12 8v5l3 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',conversion:'M3 4h18l-7 8v7l-4 2v-9L3 4',attendance:'M5 4h14v17H5V4m4-2v4m6-4v4m-7 8 3 3 5-6',dispatch:'M3 5h11v12H3V5m11 5h4l3 4v3h-7M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4m10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4'};
 const icon=id=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[id]||paths[({day_sales:'sales',company_sales:'sales',channel_sales:'sales',leads:'customers',salespeople:'customers',telecaller:'customers',recent:'attendance',order_status:'attendance',accounts:'sales'})[id]]||paths.sales)+'"/></svg>';
 window.GreenRichDashboardCharts={series,daily,pie,scatter,histogram,bins,orderTotals,icon};
})();
