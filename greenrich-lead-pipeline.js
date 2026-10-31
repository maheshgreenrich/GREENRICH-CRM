'use strict';
/* Integrated GreenRich Lead Pipeline — uses Supabase RLS and transactional RPCs.
 * It does not change Attendance, customers, or other CRM data models. */
(() => {
 const stages=['New','Contacted','Qualified','Quotation','Won','Lost'];
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(n)||0);
 const dates=x=>x?new Date(x).toLocaleString('en-IN'):'—';
 const contexts=new WeakMap();
 const notify=(ctx,s)=>ctx.notify?.(s);
 const celebrateWon=(name)=>{
  const cover=document.createElement('div');cover.className='gr-won-celebrate';
  cover.innerHTML='<div class="gr-won-message"><div style="font-size:39px">🏆🎉</div><strong>Fantastic sale!</strong><p>'+
    escape(name||'Customer')+' converted to Won</p><small>Keep up the great work!</small></div>';
  const palette=['#16a34a','#2563eb','#f59e0b','#f43f5e','#8b5cf6'];
  for(let i=0;i<60;i++){const p=document.createElement('span');p.className='gr-won-piece';
    p.style.left=(i*73%100)+'%';p.style.background=palette[i%palette.length];
    p.style.animationDelay=(i%8)*.08+'s';p.style.transform='rotate('+(i*42)+'deg)';cover.append(p)}
  document.body.append(cover);setTimeout(()=>cover.remove(),3500);
 };

 const styles=`

 .gl-lead-detail-inline{position:relative;display:block;width:100%;max-width:100%;min-width:0;min-height:72vh;overflow:visible;background:#f4f7fc;padding:clamp(12px,2vw,24px);border:1px solid #dee8f5;border-radius:16px}
 .gl-lead-detail-inline .grlp{max-width:100%;margin:0 auto}
 .gl-lead-detail-inline .grlp-full{width:100%;max-width:100%}
 .gr-lead-full-screen .grlp{max-width:1400px;margin:0 auto}
 .gl-won-search{display:grid;gap:7px;margin:9px 0}
 .gl-won-search input{width:100%;border:1px solid #cbd8e9;border-radius:8px;padding:10px}
 .gr-won-celebrate{position:fixed;inset:0;z-index:9999;pointer-events:none;display:grid;place-items:center;background:#0b245047;animation:grwonfade 3.4s forwards}
 .gr-won-message{padding:26px 42px;background:white;border:2px solid #67e8a5;border-radius:20px;box-shadow:0 24px 80px #092c4c66;text-align:center;color:#14532d;animation:grwonpop .4s ease-out}
 .gr-won-message strong{display:block;font-size:26px;line-height:1.3}
 .gr-won-piece{position:absolute;top:-30px;width:9px;height:16px;animation:grwonfall 2.9s linear forwards}
 @keyframes grwonfall{to{transform:translateY(110vh) rotate(840deg)}}
 @keyframes grwonpop{from{transform:scale(.72);opacity:0}to{transform:scale(1);opacity:1}}
 @keyframes grwonfade{0%,70%{opacity:1}100%{opacity:0}}
 .gl-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:13px}
 .gl-head h3{margin:0;font-size:18px;color:#102c55}.gl-caption{font-size:12px;color:#637791}
 .gl-row{display:flex;gap:9px;align-items:end;flex-wrap:wrap;margin:14px 0}
 .gl-row label{font-size:12px;color:#516b86;display:flex;flex-direction:column;gap:5px}
 .gl-row input,.gl-row select{height:36px;min-width:128px;border:1px solid #d3e0ef;border-radius:8px;padding:5px 9px;background:white}
 .gl-row button,.gl-head button,.gl-card button,.gl-dialog button{width:auto!important;font-size:12px!important;padding:8px 12px!important;min-height:34px!important;border-radius:8px!important}
 .gl-main{display:grid;grid-template-columns:repeat(4,minmax(145px,1fr));gap:11px;margin:8px 0 18px}
 .gl-stat{padding:15px;background:#fff;border:1px solid #dde6f2;border-radius:12px;display:flex;flex-direction:column;gap:5px}
 .gl-stat span{font-size:12px;color:#64748b}.gl-stat strong{font-size:21px;color:#17365c}
 .gl-board{display:flex;gap:13px;overflow-x:auto;padding:5px 2px 14px;scrollbar-width:thin;align-items:stretch}
 .gl-column{flex:0 0 290px;background:#f5f8fc;border:1px solid #dce5f0;border-radius:12px;padding:10px;min-height:300px}
 .gl-column.over{outline:2px dashed #315bb3;outline-offset:-2px}
 .gl-column h4{display:flex;justify-content:space-between;align-items:center;margin:0 0 12px;color:#163253;font-size:14px}
 .gl-count{background:#e6edf7;border-radius:20px;padding:4px 10px;color:#355580}
 .gl-list{display:flex;flex-direction:column;gap:9px;max-height:65vh;overflow-y:auto}
 .gl-card{background:#fff;border:1px solid #d9e2ee;border-radius:10px;padding:12px;box-shadow:0 2px 4px #102a4a10}
 .gl-card strong{display:block;font-size:13px;color:#152d4d;overflow-wrap:anywhere}
 .gl-card p{font-size:12px;color:#63758e;margin:8px 0}
 .gl-card-line{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin:7px 0}
 .gl-card-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
 .gl-card button{border:1px solid #d9e3f1;background:white;color:#265193}
 .gl-card .gl-name-link{border:0!important;padding:0!important;background:transparent!important;text-align:left;font-weight:700;font-size:14px!important;color:#17365e!important;cursor:pointer}
 .gl-icon-row{gap:7px!important;align-items:center}
 .gl-card .gl-icon-row .gl-action-icon{width:36px!important;height:36px!important;min-width:36px!important;display:inline-flex!important;align-items:center;justify-content:center;padding:0!important;border:1px solid #cbdbee!important;border-radius:9px!important;text-decoration:none;color:#24549b;background:#f9fbff;cursor:pointer}
 .gl-card .gl-icon-row .gl-action-icon:hover{background:#e8f1ff}
 .gl-first-interests input[type="checkbox"]{width:18px!important;height:18px!important;min-width:18px!important;padding:0!important;flex:0 0 18px!important}
 .gl-multi-options input[type="checkbox"]{width:17px!important;height:17px!important;min-width:17px!important;padding:0!important;flex:0 0 17px!important}
 .gl-multi{position:relative;min-width:137px;align-self:flex-end;font-size:12px}
 .gl-multi summary{height:36px;padding:8px 10px;background:#fff;border:1px solid #d3e0ef;border-radius:8px;cursor:pointer;list-style:none}
 .gl-multi summary:after{content:' ▾';float:right}.gl-multi-options{position:absolute;z-index:20;top:37px;left:0;width:max(190px,100%);max-height:220px;overflow:auto;background:white;border:1px solid #c7d9eb;border-radius:9px;box-shadow:0 9px 25px #142f5030;padding:9px}
 .gl-multi-options label{display:flex;flex-direction:row;align-items:center;gap:8px;padding:5px 2px}
 .gl-multi-options input{width:15px;height:15px;min-width:15px}
 .gl-first-interests fieldset{border:1px solid #dbe5f1;border-radius:8px;margin:9px 0;padding:11px;max-height:180px;overflow:auto}
 .gl-first-interests fieldset label{display:inline-flex;margin:4px 10px 4px 0;flex-direction:row;align-items:center;gap:6px}
 .gl-first-interests input{width:16px!important;height:16px!important}
  .gl-card button:focus-visible,.gl-row button:focus-visible{outline:3px solid #87aefa}
 .gl-note{padding:13px;border-radius:10px;background:#fff7e8;border:1px solid #efd9a6;color:#805b18;font-size:13px}
 .gl-dialog{border:1px solid #cfdbed;border-radius:14px;box-shadow:0 15px 60px #15355935;padding:23px;max-width:min(590px,94vw);max-height:90vh;overflow:auto}
 .gl-dialog::backdrop{background:#112f5280}.gl-dialog h3{margin:0 0 10px;font-size:19px}
 .gl-dialog label{display:flex;flex-direction:column;gap:5px;color:#526783;font-size:13px;margin:12px 0}
 .gl-dialog input,.gl-dialog select,.gl-dialog textarea{font:inherit;padding:10px;border-radius:9px;border:1px solid #ccd9e8;width:100%;box-sizing:border-box}
 .gl-dialog textarea{min-height:115px}.gl-dialog .actions{display:flex;justify-content:flex-end;gap:9px;margin-top:14px}

 .gl-customer-timeline{padding:20px!important;max-width:100%;overflow:hidden}
 .gl-customer-timeline>h3{font-size:17px!important;line-height:1.4!important;margin:0 0 5px!important}
 .gl-customer-timeline>article{font-size:12.5px!important;color:#4b6180}
 .gl-customer-timeline>article>b{font-size:13px!important;font-weight:700!important;color:#1c437d!important}
 .gl-customer-timeline .gl-hist{max-height:none!important;overflow:visible!important;display:grid;gap:5px}
 .gl-customer-timeline .gl-hist article{font-size:12px!important;padding:9px 11px!important;background:#f9fbff;border-radius:8px;border:1px solid #e4ebf5;line-height:1.5!important}
 .gl-customer-timeline .gl-hist strong{font-size:13px!important;line-height:1.4!important;font-weight:650!important;color:#28528a!important}
 .gl-customer-timeline .gl-hist p{font-size:12px!important;line-height:1.6!important;margin:4px 0 0!important}
 .gl-hist{max-height:250px;overflow:auto;margin-top:10px}.gl-hist article{border-bottom:1px solid #e2e8f0;padding:8px 0;font-size:12px}
 .gl-follow-table{width:100%;border-collapse:collapse;font-size:13px}.gl-follow-table th,.gl-follow-table td{padding:12px;text-align:left;border-bottom:1px solid #e5ebf5}
 @media(max-width:680px){.gl-main{grid-template-columns:repeat(2,1fr)}.gl-column{flex-basis:82vw}}
 `;
 async function allRows(db,table,select,where){
  const out=[];for(let i=0;i<100;i++){let q=db.from(table).select(select).order('created_at',{ascending:false}).range(i*500,i*500+499);
   if(where)q=where(q);const {data,error}=await q;if(error)throw error;out.push(...(data||[]));if((data||[]).length<500)break;
  }return out;
 }
 async function query(ctx){
  const cs=ctx.companyIds;
  const [leads,staff,orders,customers,products,sources,tags,leadData]=await Promise.all([
   allRows(ctx.db,'gr_lead_pipeline','*',q=>q.in('company_id',cs)),
   Promise.all(cs.map(async co=>{const {data,error}=await ctx.db.rpc('gr_pipeline_staff',{p_company:co});if(error)throw error;return (data||[]).map(p=>({...p,company_id:co}))})),
   ctx.db.from('gr_crm_records').select('company_id,record_id,payload').in('company_id',cs).eq('kind','sales').limit(1000),
   ctx.db.from('gr_crm_customers').select('id,name,mobile,mobile2,email').order('name').limit(1000),
   ctx.db.from('gr_crm_records').select('company_id,record_id,payload').in('company_id',cs).eq('kind','products').limit(1000),
   ctx.db.from('gr_crm_sources').select('id,name,active').eq('active',true).order('name'),
   ctx.db.from('gr_crm_tags').select('id,name').order('name'),
   ctx.db.from('gr_crm_records').select('company_id,record_id,payload').in('company_id',cs).eq('kind','leads').limit(1000)
  ]);
  if(orders.error)throw orders.error;if(customers.error)throw customers.error;if(products.error)throw products.error;if(sources.error)throw sources.error;if(tags.error)throw tags.error;if(leadData.error)throw leadData.error;
  ctx.leads=leads;ctx.staff=staff.flat();ctx.orders=orders.data||[];ctx.customers=customers.data||[];ctx.products=products.data||[];ctx.approvedSources=sources.data||[];ctx.approvedTags=tags.data||[];ctx.leadPayloads=new Map((leadData.data||[]).map(r=>[r.company_id+':'+r.record_id,r.payload||{}]));
  ctx.canViewTeam=ctx.staff.some(p=>p.id!==ctx.userId&&p.manager_id===ctx.userId)||ctx.admin||ctx.scope==='all'||ctx.scope==='team';
 }
 const normalizedSource=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/ads$/,'');
 const matchesApproved=(s,approved)=>normalizedSource(s)===normalizedSource(approved);
 const choiceMulti=(key,items,selected,label)=>'<details class="gl-multi"><summary>'+escape(label)+
   (selected?.length?' ('+selected.length+')':'')+'</summary><div class="gl-multi-options">'+
   (items.length?items.map(([value,caption])=>'<label><input type="checkbox" data-gl-multi="'+escape(key)+'" value="'+escape(value)+'" '+
     (selected?.includes(value)?'checked':'')+'>'+escape(caption)+'</label>').join(''):'<small>No approved choices</small>')+
   '</div></details>';
 const leadLink=(l,caption)=>'<button type="button" class="gl-name-link" data-gl-action="profile" data-id="'+escape(l.lead_id)+
   '" data-company="'+escape(l.company_id)+'">'+escape(caption||l.contact||l.title)+'</button>';
 const contactButtons=l=>{const m=String(l.mobile||'').replace(/[^+0-9]/g,''),digits=m.replace(/\D/g,'');
  return (digits.length>=10?'<a title="Call" href="tel:'+escape(m)+'">☎ Call</a>':'')+
   (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email||'')?'<a title="Email" href="mailto:'+escape(l.email)+'">✉ Email</a>':'')+
   (digits.length>=10&&digits.length<=15?'<a title="WhatsApp" rel="noopener noreferrer" target="_blank" href="https://wa.me/'+digits+'">WhatsApp</a>':'');
 };
 const icons={
  call:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.91.68 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.25a2 2 0 0 1 2.11-.45c.9.33 1.85.56 2.81.68A2 2 0 0 1 22 16.92z"/>',
  email:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  whatsapp:'<path d="M21 11.5a8.4 8.4 0 0 1-9 9 9.2 9.2 0 0 1-4-.9L3 21l1.4-4.6A9 9 0 1 1 21 11.5z"/><path d="M9 9c1 3 3 5 6 6"/>',
  stage:'<path d="m4 7 4-4 4 4M8 3v14m12 0-4 4-4-4m4 4V7"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/>',
  assign:'<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 12-5m5-2v8m-4-4h8"/>',
  quick:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  order:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8m-8 4h8m-8 4h4"/>'
 };
 const symbol=id=>'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[id]+'</svg>';
 const ico=(id,label,action,l)=>'<button type="button" class="gl-action-icon" title="'+escape(label)+'" aria-label="'+escape(label)+
   '" data-gl-action="'+action+'" data-id="'+escape(l.lead_id)+'" data-company="'+escape(l.company_id)+'">'+symbol(id)+'</button>';
 const contactIcons=l=>{const m=String(l.mobile||'').replace(/[^+0-9]/g,''),digits=m.replace(/\D/g,'');
  const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email||'');
  return (digits.length>=10?'<a class="gl-action-icon" title="Call" aria-label="Call" href="tel:'+escape(m)+'">'+symbol('call')+'</a>':'')+
   (email?'<a class="gl-action-icon" title="Email" aria-label="Email" href="mailto:'+escape(l.email)+'">'+symbol('email')+'</a>':'')+
   (digits.length>=10&&digits.length<=15?'<a class="gl-action-icon" target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="WhatsApp" href="https://wa.me/'+digits+'">'+symbol('whatsapp')+'</a>':'');
 };
 const companyText=(ctx,id)=>ctx.companyNames?.[id]||id;
 const name=(ctx,id)=>ctx.staff.find(p=>p.id===id)?.full_name||(!id?'Common sales queue':'Employee');
 const labelProduct=(ctx,lead)=>{
  const sku=ctx.products.find(p=>p.company_id===lead.company_id&&p.record_id===lead.product_id)?.payload?.name;
  const p=ctx.leadPayloads?.get(lead.company_id+':'+lead.lead_id)||{};
  return sku||p.product_interest||p.products||p.enquiry_details?.product_interest||p.enquiry_details?.requirement||lead.product_id||'—';
 };
 const saleTotal=(ctx,lead)=>Number(ctx.orders.find(o=>o.company_id===lead.company_id&&o.record_id===lead.won_order_id)?.payload?.total)||0;
 const picked=(ctx)=>ctx.leads.filter(l=>{
  const f=ctx.filters;const timestamp=Date.parse(l.created_at||'');
  const fromTime=f.from?new Date(f.from).getTime():null,toTime=f.to?new Date(f.to).getTime():null;
  return (f.company==='all'||l.company_id===f.company)&&
   (f.person==='all'||(f.person==='common'?l.assigned_to===null:l.assigned_to===f.person))&&
   (fromTime===null||timestamp>=fromTime)&&(toTime===null||timestamp<=toTime)&&
   (!f.product?.length||f.product.includes(l.product_id))&&
   (!f.source?.length||f.source.some(label=>matchesApproved(l.source,label)))&&
   (!f.tag?.length||f.tag.some(id=>l.tag_ids?.includes(id)))&&
   (!f.heat?.length||f.heat.includes(l.lead_heat||'Warm'))&&
   (!f.search||[l.title,l.contact,l.mobile,l.email,l.source,name(ctx,l.assigned_to)].join(' ').toLowerCase().includes(f.search.toLowerCase()));
 });
 const choices=(array,current)=>array.map(([v,t])=>'<option value="'+escape(v)+'" '+(v===current?'selected':'')+'>'+escape(t)+'</option>').join('');
 const button=(label,action,attrs='')=>'<button type="button" data-gl-action="'+escape(action)+'" '+attrs+'>'+escape(label)+'</button>';
 function buildFilters(ctx){
  const f=ctx.filters,people=[...new Map(ctx.staff.map(p=>[p.id,p])).values()];
  const currentCompany=f.company;
  const products=ctx.products.filter(p=>(currentCompany==='all'||p.company_id===currentCompany)&&p.payload?.active!==false);
  const uniqueProducts=[...new Map(products.map(p=>[p.record_id,p])).values()];
  return '<div class="gl-row" aria-label="Lead filters">'+
   '<label>From date & time<input type="datetime-local" data-gl-filter="from" value="'+escape(f.from)+'"></label>'+
   '<label>To date & time<input type="datetime-local" data-gl-filter="to" value="'+escape(f.to)+'"></label>'+
   '<label>Company<select data-gl-filter="company">'+choices([['all','All assigned companies'],...ctx.companyIds.map(id=>[id,companyText(ctx,id)])],f.company)+'</select></label>'+
   choiceMulti('product',uniqueProducts.map(p=>[p.record_id,p.payload?.name||p.record_id]),f.product,'All products')+
   choiceMulti('source',ctx.approvedSources.map(x=>[x.name,x.name]),f.source,'Approved sources')+
   choiceMulti('tag',ctx.approvedTags.map(x=>[x.id,x.name]),f.tag,'Approved tags')+
   choiceMulti('heat',[['Hot','Hot'],['Warm','Warm'],['Cold','Cold']],f.heat,'Lead priority')+
   (ctx.admin?'<label>Salesperson<select data-gl-filter="person">'+choices([['all','All active salespeople'],['common','Common queue'],...people.map(p=>[p.id,p.full_name])],f.person)+'</select></label>':'')+
   '<label>Search<input data-gl-filter="search" placeholder="Name, mobile, email…" value="'+escape(f.search)+'"></label>'+
   '</div>';
 }
 const showMessage=(ctx,e)=>notify(ctx,e?.message||String(e));
 async function refresh(ctx){await query(ctx);draw(ctx)}
 function draw(ctx){
  const root=ctx.root;if(!root?.isConnected||ctx.profileOpen)return;
  const rows=picked(ctx),wins=rows.filter(l=>l.stage==='Won'),quoted=rows.filter(l=>l.stage==='Quotation');
  const localDay=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
  const today=localDay(Date.now());
  const dueTime=l=>l.next_followup_at?new Date(l.next_followup_at).getTime():l.next_followup?new Date(l.next_followup+'T23:59:59+05:30').getTime():NaN;
  const due=rows.filter(l=>l.stage!=='Won'&&Number.isFinite(dueTime(l)));
  const todayDue=due.filter(l=>localDay(dueTime(l))===today).length;
  const overdue=due.filter(l=>dueTime(l)<Date.now()&&localDay(dueTime(l))!==today).length;
  const newToday=rows.filter(l=>localDay(l.created_at)===today).length;
  const stat=[['New leads today',newToday],['Not yet contacted',rows.filter(l=>l.stage==='New').length],
    ['Visible leads',rows.length],['Qualified',rows.filter(l=>l.stage==='Qualified').length],
    ['Follow-ups today',todayDue],['Overdue follow-ups',overdue],
    ['Won sales orders',wins.filter(l=>l.won_order_id).length],
    ['Won order value',money(wins.reduce((v,l)=>v+saleTotal(ctx,l),0))]];
  root.innerHTML='<div class="gl-head"><div><h3>Leads Pipeline</h3><div class="gl-caption">Assigned leads, quotation progress and sales history in one workspace</div></div><div class="gl-card-actions">'+button('+ New lead','new')+button('Import Leads Excel / CSV','import')+
    (ctx.companyIds.some(co=>localStorage.getItem('greenrich-crm-pipeline-legacy-backup:'+co))?button('Assign saved leads','legacy'):'')+
    button('Won sales history','history')+(ctx.admin?button('Sheet Integrations / Duplicates','metasync'):'')+'</div></div>'+
   '<div class="gl-main">'+stat.map(([a,b])=>'<div class="gl-stat"><span>'+escape(a)+'</span><strong>'+escape(b)+'</strong></div>').join('')+'</div>'+
   buildFilters(ctx)+
   '<div class="gl-board" aria-label="Lead stage board">'+stages.map(stage=>'<section class="gl-column" data-stage="'+escape(stage)+'"><h4>'+stage+' <span class="gl-count">'+rows.filter(x=>x.stage===stage).length+'</span></h4><div class="gl-list">'+
    rows.filter(x=>x.stage===stage).map(l=>'<article class="gl-card" draggable="true" data-lead="'+escape(l.lead_id)+'" data-company="'+escape(l.company_id)+'">'+leadLink(l,l.contact||l.title)+
     '<div class="gl-card-line"><span>Mobile</span><span>'+escape(l.mobile||'—')+'</span></div>'+
     '<div class="gl-card-line"><span>Email</span><span>'+escape(l.email||'—')+'</span></div>'+
     '<div class="gl-card-line"><span>Product enquiry</span><span>'+escape(labelProduct(ctx,l))+'</span></div>'+
     (l.import_duplicate_type&&l.import_duplicate_type!=='none'?'<div class="gl-card-line" style="background:#fff4df;padding:6px;border-radius:6px;color:#8a5611"><b>Possible duplicate '+escape(l.import_duplicate_type)+(l.import_duplicate_review==='pending'?' · Review pending':' · '+escape(l.import_duplicate_review))+'</b></div>':'')+
     '<div class="gl-card-line"><span>Salesperson</span><b>'+escape(name(ctx,l.assigned_to))+'</b></div>'+
     ''+
     ''+
     '<div class="gl-card-line"><span>Source</span><span>'+escape(l.source||'—')+'</span></div>'+
     ''+
     (l.next_followup_at&&l.stage!=='Won'?'<div class="gl-card-line"><span>Follow-up</span><b>'+escape(dates(l.next_followup_at))+'</b></div>':'')+
     (l.stage==='Won'?'':'<div class="gl-card-line"><span>Priority</span><b>'+escape(l.lead_heat||'Warm')+'</b></div>')+
     '<div class="gl-card-actions gl-icon-row">'+contactIcons(l)+
     ico('quick','Quick view','quick',l)+ico('stage','Move stage','move',l)+ico('history','History','detail',l)+
     (ctx.canViewTeam?ico('assign','Assign employee','assign',l):'')+
     (l.stage!=='Won'&&l.stage!=='Lost'?ico('order','Create Sales Order','order',l):'')+
     '</div></article>').join('')+'</div></section>').join('')+'</div>';
  root.querySelectorAll('[data-gl-filter]').forEach(el=>el.onchange=()=>{ctx.filters[el.dataset.glFilter]=el.value;
   if(el.dataset.glFilter==='company')ctx.filters.product=[];
   draw(ctx)});
  root.querySelectorAll('[data-gl-multi]').forEach(el=>el.onchange=()=>{
    const group=el.dataset.glMulti;
    ctx.filters[group]=[...root.querySelectorAll('[data-gl-multi="'+group+'"]:checked')].map(x=>x.value);
    draw(ctx);root.querySelector('.gl-multi [data-gl-multi="'+group+'"]')?.closest('details')?.setAttribute('open','');
  });
  root.querySelectorAll('button[data-gl-action]').forEach(el=>el.onclick=()=>act(ctx,el));
  root.querySelectorAll('.gl-multi').forEach(d=>d.ontoggle=()=>{if(d.open)root.querySelectorAll('.gl-multi').forEach(o=>{if(o!==d)o.open=false})});
  root.querySelectorAll('.gl-card').forEach(card=>card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',JSON.stringify({id:card.dataset.lead,company:card.dataset.company}));e.dataTransfer.effectAllowed='move'}));
  root.querySelectorAll('.gl-column').forEach(col=>{
    col.ondragover=e=>{e.preventDefault();col.classList.add('over')};
    col.ondragleave=()=>col.classList.remove('over');
    col.ondrop=e=>{e.preventDefault();col.classList.remove('over');try{const v=JSON.parse(e.dataTransfer.getData('text/plain'));const lead=ctx.leads.find(l=>l.company_id===v.company&&l.lead_id===v.id);if(lead&&lead.stage!==col.dataset.stage)void move(ctx,lead,col.dataset.stage)}catch(err){showMessage(ctx,err)}};
  });
 }
 async function followups(ctx,root){
  if(!root?.isConnected)return;
  const quoted=ctx.leads.filter(l=>l.stage==='Quotation');
  root.innerHTML='<div class="gl-head"><h3>Quotation Follow-ups ('+quoted.length+')</h3><span class="gl-caption">Active quotations only. Won and Lost leads disappear automatically.</span></div>'+
   '<div style="overflow:auto"><table class="gl-follow-table"><thead><tr><th>Lead</th><th>Salesperson</th><th>Company</th><th>Value</th><th>Due</th><th>History</th></tr></thead><tbody>'+
   (quoted.length?quoted.map(l=>'<tr><td>'+leadLink(l,l.contact||l.title)+'</td><td>'+escape(name(ctx,l.assigned_to))+'</td><td>'+escape(companyText(ctx,l.company_id))+'</td><td>'+money(l.expected_value)+'</td><td>'+escape(l.next_followup||'Not set')+'</td><td>'+button('View history','detail','data-id="'+escape(l.lead_id)+'" data-company="'+escape(l.company_id)+'"')+'</td></tr>').join(''):'<tr><td colspan="6">No active quotation follow-ups.</td></tr>')+
   '</tbody></table></div>';
  root.querySelectorAll('[data-gl-action]').forEach(b=>b.onclick=()=>act(ctx,b));
 }
 function dialog(ctx,title,body,onSave){
  const d=document.createElement('dialog');d.className='gl-dialog';d.innerHTML='<h3>'+escape(title)+'</h3><form method="dialog" class="gl-form">'+body+'<div class="actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save</button></div></form>';
  document.body.append(d);const form=d.querySelector('form');d.querySelector('[data-cancel]').onclick=()=>d.close();
  d.onclose=()=>d.remove();
  form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;try{const fd=new FormData(form);await onSave(fd);d.close();await refresh(ctx);if(ctx.followRoot)await followups(ctx,ctx.followRoot)}catch(err){showMessage(ctx,err)}finally{b.disabled=false}};
  d.showModal();return d;
 }
 const fld=(label,name,type='text',value='',required=false)=>'<label>'+escape(label)+'<input name="'+escape(name)+'" type="'+type+'" value="'+escape(value)+'" '+(required?'required':'')+'></label>';
 const selectFld=(label,name,items,required=true)=>'<label>'+escape(label)+'<select name="'+escape(name)+'" '+(required?'required':'')+'>'+choices(items,'')+'</select></label>';
 const noteFld=()=>'<label>Conversation details / reason (required)<textarea name="note" maxlength="4000" required placeholder="What was discussed? What is the next action?"></textarea></label>';
 const getLead=(ctx,id,company)=>ctx.leads.find(l=>l.lead_id===id&&l.company_id===company);
 function move(ctx,l,to){
  if(l.stage==='Won'){notify(ctx,'This lead has already been converted.');return}
   const allowed=stages.filter(stage=>stage!==l.stage);
   const next=allowed.includes(to)?to:(allowed.includes('Contacted')?'Contacted':allowed[0]),first=l.stage==='New';
   const digits=value=>String(value||'').replace(/[^0-9]/g,'').slice(-10);
   const leadNumber=digits(l.mobile),leadEmail=String(l.email||'').trim().toLowerCase();
   const orders=ctx.orders.filter(o=>{
     if(o.company_id!==l.company_id||!['Issued','Confirmed','Approved','Completed','Dispatched'].includes(o.payload?.status))return false;
     const c=ctx.customers.find(c=>c.id===o.payload?.customer_id);
     return (l.customer_id&&l.customer_id===o.payload?.customer_id)||
       (o.payload?.lead_id===l.lead_id&&o.payload?.company_id===l.company_id)||
       (leadNumber.length===10&&[c?.mobile,c?.mobile2,o.payload?.customer_mobile].some(n=>digits(n)===leadNumber))||
       (leadEmail&&[c?.email,o.payload?.customer_email].some(mail=>String(mail||'').trim().toLowerCase()===leadEmail));
   });
  const orderSelect='<div class="gl-won-search"><label>Search this lead’s Sales Orders by ID, customer or mobile<input type="search" name="order_search" placeholder="SO ID, customer name, mobile, amount…" autocomplete="off" aria-label="Search issued Sales Orders"></label></div>'+
   '<label>Issued Sales Order — required for Won<select name="order">'+
    '<option value="">Select matching Sales Order</option>'+orders.map(o=>{
      const customer=ctx.customers.find(c=>c.id===o.payload?.customer_id);
      const text=[o.payload?.internal_order_id||o.payload?.order_id||o.record_id,
        customer?.name||o.payload?.customer_name||'Customer not linked',
        customer?.mobile||o.payload?.customer_mobile||'',money(o.payload?.total),
        o.payload?.date||o.payload?.order_date||'',o.payload?.status||''].filter(Boolean).join(' · ');
      return '<option value="'+escape(o.record_id)+'">'+escape(text)+'</option>';
    }).join('')+'</select></label>';
  const products=ctx.products.filter(p=>p.company_id===l.company_id&&p.payload?.active!==false);
  const firstFields=first?'<div class="gl-first-interests"><h4>Optional when moving from New</h4>'+
   '<fieldset><legend>Interested products</legend>'+products.map(p=>'<label><input type="checkbox" name="products" value="'+escape(p.record_id)+'" '+
     (p.record_id===l.product_id?'checked':'')+'>'+escape(p.payload?.name||p.record_id)+'</label>').join('')+'</fieldset>'+
   '<fieldset><legend>Approved tags</legend>'+ctx.approvedTags.map(t=>'<label><input type="checkbox" name="tags" value="'+escape(t.id)+'" '+
     ((l.tag_ids||[]).includes(t.id)?'checked':'')+'>'+escape(t.name)+'</label>').join('')+'</fieldset></div>':'';
  const dateInput='<label>Next follow-up date and time *<input name="due" type="datetime-local" required value="'+
    escape(l.next_followup_at?new Date(l.next_followup_at).toLocaleString('sv-SE',{timeZone:'Asia/Kolkata'}).replace(' ','T').slice(0,16):'')+'"></label>';
  const body='<p class="gl-caption">'+escape(l.contact||l.title)+' · '+escape(l.stage)+' · choose any next stage</p>'+
   selectFld('Move to stage','stage',allowed.map(x=>[x,x]))+
   firstFields+noteFld()+
   '<div class="gl-move-heat">'+selectFld('Lead priority','heat',[['Hot','Hot'],['Warm','Warm'],['Cold','Cold']])+'</div>'+dateInput+orderSelect+
   '<p class="gl-note">Choose any next stage. Won requires a matching confirmed Sales Order, which also converts this lead into a customer. Lost closes follow-ups; other active stages require a future follow-up.</p>';
  const d=dialog(ctx,'Update lead stage',body,async fd=>{
   const stage=fd.get('stage'),products=first?fd.getAll('products'):[],tags=first?fd.getAll('tags'):[];
   // Product and tag interests are optional; when chosen, the server verifies them.
   if(stage==='Won'&&!fd.get('order'))throw Error('Choose a matching issued or completed Sales Order.');
   if(!['Won','Lost'].includes(stage)&&!fd.get('due'))throw Error('Next follow-up date and time required.');
   const due=fd.get('due')?new Date(fd.get('due')).toISOString():null;
   const {error}=stage==='Won'
     ?await ctx.db.rpc('gr_pipeline_win_with_order',{p_company:l.company_id,p_lead:l.lead_id,p_order:fd.get('order'),p_note:fd.get('note')})
     :await ctx.db.rpc('gr_pipeline_advance',{
        p_company:l.company_id,p_lead:l.lead_id,p_stage:stage,p_note:fd.get('note'),
        p_products:products,p_tags:tags,p_order:null,
        p_due_at:due,p_heat:fd.get('heat')
      });
   if(error)throw error;
   if(stage==='Won'){notify(ctx,'Lead converted to customer and Sales Order linked successfully.');setTimeout(()=>celebrateWon(l.contact||l.title),180);}
  });
  const stage=d.querySelector('[name=stage]');stage.value=next;
  const heat=d.querySelector('[name=heat]');heat.value=l.lead_heat||'Warm';
  const controls=()=>{
   if(!d.isConnected||!stage)return;
   const won=stage.value==='Won',due=d.querySelector('[name=due]'),order=d.querySelector('[name=order]');
   const dueLabel=due?.closest('label'),orderLabel=order?.closest('label');
   if(dueLabel)dueLabel.hidden=won||stage.value==='Lost';
   if(due)due.required=!won&&stage.value!=='Lost';
   if(orderLabel)orderLabel.hidden=!won;
   if(order)order.required=won;
   const heatPanel=d.querySelector('.gl-move-heat'),searchPanel=d.querySelector('.gl-won-search');
   if(heatPanel)heatPanel.hidden=won;
   if(searchPanel)searchPanel.hidden=!won;
  };if(stage){stage.onchange=controls;controls()}
  const search=d.querySelector('[name=order_search]');
  const orderPicker=d.querySelector('[name=order]');
  const allOrderOptions=[...orderPicker.options].map(option=>option.cloneNode(true));
  search?.addEventListener('input',()=>{
    const term=search.value.toLowerCase().trim(),selected=orderPicker.value;
    const matches=allOrderOptions.filter(option=>!option.value||option.textContent.toLowerCase().includes(term));
    orderPicker.replaceChildren(...matches.map(option=>option.cloneNode(true)));
    if(selected&&[...orderPicker.options].some(option=>option.value===selected))orderPicker.value=selected;
    else orderPicker.value='';
    if(matches.length===1&&term){
      const empty=document.createElement('option');empty.value='';empty.disabled=true;
      empty.textContent='No matching issued Sales Order';orderPicker.append(empty);
    }
  });
 }
 async function act(ctx,b){
  const action=b.dataset.glAction,l=getLead(ctx,b.dataset.id,b.dataset.company);
  if(action==='metasync'){
   if(!window.GreenRichSheetManager){notify(ctx,'Lead integrations module failed to load. Refresh GreenRich ONE.');return}
   void window.GreenRichSheetManager.open(ctx).catch(e=>notify(ctx,e.message));return;
  }
  if(action==='profile'||action==='quick'){
    if(!l)return;
    if(action==='quick'){await window.GreenRichLeadProfile.open({db:ctx.db,company:l.company_id,leadId:l.lead_id,quick:true});return}
    const page=document.createElement('section');page.className='gl-lead-detail-inline';
    page.setAttribute('role','region');page.setAttribute('aria-label','Lead 360 profile inside CRM');
    const previous=document.activeElement;
    ctx.profileOpen=true;
    ctx.root.replaceChildren(page);
    const close=()=>{
     ctx.profileOpen=false;
     page.remove();
     if(ctx.root.isConnected)draw(ctx);
     previous?.focus?.({preventScroll:true});
    };
    try{
     await window.GreenRichLeadProfile.open({db:ctx.db,company:l.company_id,leadId:l.lead_id,host:page,onClose:close});
     if(page.isConnected)page.scrollIntoView({block:'start'});
    }catch(error){close();notify(ctx,'Could not open lead profile: '+error.message)}
    return;
   }
  if(action==='move'){move(ctx,l);return}
  if(action==='order'){
   
   if(typeof window.GreenRichCRM?.createOrderForLead!=='function')throw Error('Sales Order editor is unavailable. Refresh the CRM.');
   window.GreenRichCRM.createOrderForLead({...ctx.leadPayloads?.get(l.company_id+':'+l.lead_id),...l});return;
  }
  if(action==='detail'){
    const {data,error}=await ctx.db.from('gr_lead_stage_history').select('*').eq('company_id',l.company_id).eq('lead_id',l.lead_id).order('created_at',{ascending:false}).limit(200);
    if(error)throw error;
    const d=dialog(ctx,'Lead discussion history', '<p>'+escape(l.title)+' · '+escape(name(ctx,l.assigned_to))+'</p><div class="gl-hist">'+
      (data||[]).map(v=>'<article><b>'+escape(v.event_type.replace('_',' '))+'</b> · '+escape(v.old_stage||'')+' → '+escape(v.new_stage||'')+'<p>'+escape(v.note)+'</p><small>'+escape(dates(v.created_at))+'</small></article>').join('')+'</div>',async()=>{});
    d.querySelector('[type=submit]').hidden=true;return;
  }
  if(action==='customer'){
   dialog(ctx,'Link existing customer',selectFld('Customer','customer',ctx.customers.map(c=>[c.id,c.name]),true)+noteFld(),async fd=>{
    const {error}=await ctx.db.rpc('gr_pipeline_link_customer',{p_company:l.company_id,p_lead:l.lead_id,p_customer:fd.get('customer'),p_note:fd.get('note')});if(error)throw error;
   });return;
  }
  if(action==='assign'){
   const people=ctx.staff.filter(p=>p.company_id===l.company_id);
   dialog(ctx,'Assign lead to employee',selectFld('Salesperson','person',[['','Common — any Sales user'],...people.map(p=>[p.id,p.full_name])])+noteFld(),async fd=>{
    const {error}=await ctx.db.rpc('gr_pipeline_assign',{p_company:l.company_id,p_lead:l.lead_id,p_employee:fd.get('person')||null,p_note:fd.get('note')});if(error)throw error;
   });return;
  }
  if(action==='history'){
   const wins=picked(ctx).filter(x=>x.stage==='Won').sort((a,b)=>(b.won_at||'').localeCompare(a.won_at||''));
   const d=dialog(ctx,'Won sales history','<div class="gl-hist">'+(wins.length?wins.map(l=>'<article><b>'+escape(l.title)+'</b> · '+escape(name(ctx,l.assigned_to))+' · '+escape(companyText(ctx,l.company_id))+'<p>Order: '+escape(ctx.orders.find(o=>o.record_id===l.won_order_id)?.payload?.internal_order_id||l.won_order_id)+' · '+money(saleTotal(ctx,l))+'</p><small>'+escape(dates(l.won_at))+'</small></article>').join(''):'No won sales orders recorded')+'</div>',async()=>{});
   d.querySelector('[type=submit]').hidden=true;return;
  }
  if(action==='legacy'){
   const companies=ctx.companyIds.filter(c=>!!localStorage.getItem('greenrich-crm-pipeline-legacy-backup:'+c));
   const first=companies[0];if(!first)throw Error('No saved legacy leads remain');
   const d=dialog(ctx,'Assign saved browser leads',
    '<p class="gl-note">These old browser-only leads were preserved before updating security. Choose the responsible employee. Existing IDs are retained, and successful imports are removed from the backup only after saving.</p>'+
    selectFld('Company','company',companies.map(c=>[c,companyText(ctx,c)]))+
    selectFld('Assign to salesperson','assignee',[['','Choose salesperson'],...ctx.staff.filter(p=>p.company_id===first).map(p=>[p.id,p.full_name])]),
    async fd=>{
     const company=fd.get('company'),person=fd.get('assignee');
     if(!person)throw Error('Choose a salesperson');
     const key='greenrich-crm-pipeline-legacy-backup:'+company;
     const raw=localStorage.getItem(key),records=JSON.parse(raw||'[]');
     if(!Array.isArray(records))throw Error('Saved browser backup is invalid');
     const remaining=[];let count=0;
     for(const record of records){
      const known=ctx.leads.some(l=>l.company_id===company&&l.lead_id===record.id);
      if(known){count++;continue}
      const {error}=await ctx.db.rpc('gr_pipeline_create',{
       p_company:company,p_title:record.title||record.name||'Enquiry',p_contact:record.contact||record.name||'',
       p_assignee:person,p_source:record.source||'',p_product:record.product_id||null,
       p_value:Number(record.value)||0,p_mobile:record.mobile||'',p_email:record.email||'',
       p_tags:record.tag_ids||[],p_customer:record.customer_id||null,p_note:record.notes||'Imported from saved browser records',
       p_legacy_id:record.id
      });
      if(error){remaining.push(record);continue}count++;
     }
     if(remaining.length)localStorage.setItem(key,JSON.stringify(remaining));else localStorage.removeItem(key);
     notify(ctx,'Imported '+count+' saved leads'+(remaining.length?'; '+remaining.length+' remain in protected browser backup':''));
    });
   const co=d.querySelector('[name=company]'),staff=d.querySelector('[name=assignee]');
   co.onchange=()=>{staff.innerHTML=choices([['','Choose salesperson'],...ctx.staff.filter(p=>p.company_id===co.value).map(p=>[p.id,p.full_name])],'')};co.onchange();return;
  }
  if(action==='new'||action==='import'){
   const companies=ctx.companyIds,defaultCompany=ctx.filters.company!=='all'?ctx.filters.company:companies[0];
   const staff=ctx.staff.filter(p=>p.company_id===defaultCompany);
   const assignee=selectFld('Assign to sales employee','assignee',[['','Common — all Sales users'],...staff.map(p=>[p.id,p.full_name])],false);
   const initialTemplates=await window.GreenRichWhatsAppWorkflows?.welcomeOptions?.(ctx.db,defaultCompany).catch(()=>[])||[];
   const welcomeSelect=list=>selectFld('Welcome WhatsApp template (optional)','welcome',[['','None — no message'],...list.map(t=>[t.id,t.name])],false);
   const common=selectFld('Company *','company',companies.map(c=>[c,companyText(ctx,c)]))+assignee+welcomeSelect(initialTemplates);
   const changeWelcome=async(c,dialog)=>{
    const f=dialog.querySelector('[name=welcome]');if(!f)return;
    const catalog=await window.GreenRichWhatsAppWorkflows?.welcomeOptions?.(ctx.db,c).catch(()=>[])||[];
    f.innerHTML=choices([['','None — no message'],...catalog.map(t=>[t.id,t.name])],'');
   };
   if(action==='new'){
    const products=ctx.products.filter(p=>p.company_id===defaultCompany);
    const fields=common+fld('Lead title *','title','text','',true)+fld('Contact name','contact')+fld('Mobile (+91)','mobile','tel')+
     fld('Email','email','email')+selectFld('Approved source','source',[['','Select approved source'],...ctx.approvedSources.map(s=>[s.name,s.name])],false)+
     selectFld('Product','product',[['','None'],...products.map(p=>[p.record_id,p.payload?.name||p.record_id])],false)+
     selectFld('Existing customer','customer',[['','Not linked'],...ctx.customers.map(c=>[c.id,c.name])],false)+
     fld('Expected value ₹','value','number','0')+
     '<fieldset class="gl-first-interests"><legend>Approved tags</legend>'+ctx.approvedTags.map(t=>
      '<label><input type="checkbox" name="tags" value="'+escape(t.id)+'">'+escape(t.name)+'</label>').join('')+'</fieldset>'+
     fld('Initial enquiry notes','note');
    const d=dialog(ctx,'Create and assign lead',fields,async fd=>{
     if(!fd.get('assignee')&&!ctx.admin)throw Error('Only Admin can create Common leads. Select yourself.');
     const {data:leadId,error}=await ctx.db.rpc('gr_pipeline_create',{p_company:fd.get('company'),p_title:fd.get('title'),p_contact:fd.get('contact'),p_assignee:fd.get('assignee')||null,
      p_source:fd.get('source'),p_product:fd.get('product')||null,p_customer:fd.get('customer')||null,p_value:fd.get('value')||0,p_mobile:fd.get('mobile'),
      p_email:fd.get('email'),p_tags:fd.getAll('tags'),p_note:fd.get('note')});if(error)throw error;
      if(leadId&&fd.get('welcome')){try{await window.GreenRichWhatsAppWorkflows.saveLeadWelcome(ctx.db,fd.get('company'),leadId,fd.get('welcome'))}
       catch(ex){window.GreenRichNotify?.(ex.message,'warning')}}
    });const comp=d.querySelector('[name=company]'),sel=d.querySelector('[name=assignee]'),prod=d.querySelector('[name=product]');
    comp.value=defaultCompany;const renderChoices=()=>{sel.innerHTML=choices([['','Common — all Sales users'],...ctx.staff.filter(p=>p.company_id===comp.value).map(p=>[p.id,p.full_name])],'');if(!ctx.admin)sel.value=ctx.userId;prod.innerHTML=choices([['','None'],...ctx.products.filter(p=>p.company_id===comp.value).map(p=>[p.record_id,p.payload?.name||p.record_id])],'')};comp.onchange=()=>{renderChoices();void changeWelcome(comp.value,d)};renderChoices();return;
   }
   const d=dialog(ctx,'Import leads (CSV)',common+
    '<p class="gl-note">CSV columns: title,contact,mobile,email,source,product_id,value,tags,notes,welcome_template. Choose a default welcome template or supply the exact template name/ID per row. Blank means no message.</p>'+
    '<label>Choose Excel or CSV file<input type="file" name="file" accept=".csv,.xlsx,.xls,text/csv" required></label>',async fd=>{
      const file=fd.get('file');if(!file?.size)throw Error('Choose an Excel or CSV file');
      if(file.size>3000000)throw Error('Import file must be below 3 MB');
      if(!fd.get('assignee')&&!ctx.admin)throw Error('Only Admin can import Common leads. Select your Sales login.');
      let items=[];
      if(/\.(xlsx|xls)$/i.test(file.name)){
       if(!window.GreenRichContacts?.readSheet)throw Error('Excel importer unavailable. Refresh GreenRich ONE.');
       const parsed=await window.GreenRichContacts.readSheet(file);
       items=parsed.map(p=>({
        title:p.title||p.products||p.enquiry_details||p.name||'Excel enquiry',
        contact:p.name||p.contact||'',mobile:p.mobile||'',email:p.email||'',
        source:p.source||'',product_id:p.product_id||'',value:p.value||'0',
        tags:p.tags||'',welcome_template:p.welcome_template||p.welcome_template_id||'',
         notes:[p.notes,p.enquiry_details,p.company,p.address1,p.city].filter(Boolean).join(' | ')
       }));
      }else{
       const raw=await file.text(),lines=parseCSV(raw),headers=(lines.shift()||[]).map(x=>x.toLowerCase().trim());
       if(!headers.includes('title'))throw Error('CSV requires a title column');
       items=lines.filter(x=>x.some(v=>v.trim())).map(cells=>Object.fromEntries(headers.map((h,i)=>[h,cells[i]||''])));
      }
      if(items.length>500)throw Error('Import a maximum of 500 leads');
      let success=0,errors=[];
      const catalog=await window.GreenRichWhatsAppWorkflows?.welcomeOptions?.(ctx.db,fd.get('company')).catch(()=>[])||[];
      for(const lead of items){
       const approved=ctx.approvedSources.find(src=>matchesApproved(src.name,lead.source))?.name||'';
       const product=ctx.products.some(p=>p.company_id===fd.get('company')&&p.record_id===lead.product_id)?lead.product_id:null;
       const ids=String(lead.tags||'').split(/[;,]/).map(t=>t.trim()).filter(Boolean).map(t=>
         ctx.approvedTags.find(tag=>tag.id===t||tag.name.toLowerCase()===t.toLowerCase())?.id).filter(Boolean);
       const {data:leadId,error}=await ctx.db.rpc('gr_pipeline_create',{
        p_company:fd.get('company'),p_title:lead.title||'Imported lead',p_contact:lead.contact||'',
        p_assignee:fd.get('assignee')||null,p_source:approved,p_product:product,
        p_value:Number(lead.value)||0,p_mobile:lead.mobile||'',p_email:lead.email||'',
        p_tags:ids,p_note:lead.notes||'Imported using CRM spreadsheet importer'
       });
       if(error){errors.push(error.message);if(errors.length>=15)break}
       else{
        success++;
        const ref=String(lead.welcome_template||'').trim();
        const chosen=catalog.find(t=>t.id===ref||t.name.split(' · ')[0].toLowerCase()===ref.toLowerCase());
        const templateId=chosen?.id||fd.get('welcome');
        if(templateId&&leadId){
         try{await window.GreenRichWhatsAppWorkflows.saveLeadWelcome(ctx.db,fd.get('company'),leadId,templateId)}
         catch(ex){errors.push('Welcome preference: '+ex.message)}
        }
       }
      }
      notify(ctx,'Imported '+success+' enquiries'+(errors.length?'; '+errors.length+' rejected. First: '+errors[0]:''));
    });const comp=d.querySelector('[name=company]'),sel=d.querySelector('[name=assignee]');comp.value=defaultCompany;
    comp.onchange=()=>{sel.innerHTML=choices([['','Common — all Sales users'],...ctx.staff.filter(p=>p.company_id===comp.value).map(p=>[p.id,p.full_name])],'');if(!ctx.admin)sel.value=ctx.userId;void changeWelcome(comp.value,d)};comp.onchange();return;
  }
 }
 function parseCSV(raw){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<raw.length;i++){const c=raw[i];
  if(quoted){if(c==='"'&&raw[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c}
  else if(c==='"')quoted=true;else if(c===','){row.push(field);field=''}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field=''}else field+=c;
 }if(field||row.length){row.push(field);rows.push(row)}return rows}
 async function mount(root,ctx){
  if(!root)return;
  let existing=contexts.get(root);if(existing){
   if(Date.now()-(existing.loadedAt||0)>2500){existing.loadedAt=Date.now();void refresh(existing).catch(e=>showMessage(existing,e))}
   return existing;
  }
  // The Leads template contains only a loading marker. Replace it with the actual board.
  root.replaceChildren();
  const style=document.createElement('style');style.textContent=styles;root.prepend(style);
  document.addEventListener('pointerdown',event=>{
    if(root.isConnected&&!event.target.closest?.('.gl-multi'))
      root.querySelectorAll('.gl-multi').forEach(d=>d.open=false);
  });
  const board=document.createElement('div');board.className='gl-workspace';root.append(board);
  const state={...ctx,root:board,filters:{company:ctx.companyIds.length===1?ctx.companyIds[0]:'all',person:'all',from:'',to:'',product:[],source:[],tag:[],heat:[],search:''},
   leads:[],staff:[],orders:[],products:[],customers:[],canViewTeam:false};
  contexts.set(root,state);
  try{await refresh(state);state.loadedAt=Date.now()}catch(e){board.innerHTML='<p class="gl-note">Pipeline is unavailable: '+escape(e.message)+'. Verify the lead pipeline migration and access permissions.</p>'}
  const reminded=new Set();
  const checkReminders=()=>{
   if(!board.isConnected){clearInterval(tick);return}
   const now=Date.now(),due=state.leads.filter(l=>l.stage!=='Won'&&l.next_followup_at&&
     new Date(l.next_followup_at).getTime()<=now&&new Date(l.next_followup_at).getTime()>now-86400000&&
     !reminded.has(l.company_id+':'+l.lead_id));
   due.forEach(l=>reminded.add(l.company_id+':'+l.lead_id));
   if(due.length)notify(state,due.length+' follow-up'+(due.length>1?'s are':' is')+' due. Open Leads & CRM to call.');
  };
  const tick=setInterval(checkReminders,60000);
  checkReminders();return state;
 }
 async function mountFollowups(root,ctx){
  if(!root)return;
  const state=await mountShared(ctx);
  state.followRoot=root;await query(state);await followups(state,root);
 }
 const cache=new Map();
 async function mountShared(ctx){
  const key=ctx.userId+'|'+ctx.companyIds.join(',');
  if(cache.has(key))return cache.get(key);
  const state={...ctx,filters:{company:'all',person:'all',from:'',to:'',product:[],source:[],tag:[],heat:[],search:''},leads:[],staff:[],orders:[],products:[],customers:[],canViewTeam:false,root:null};
  await query(state);cache.set(key,state);return state;
 }
 async function renderCustomerTimeline(root,db,customerId,companies,staffName){
  if(!root?.isConnected||!customerId)return;
  const [res,check]=await Promise.all([
    db.from('gr_lead_pipeline').select('company_id,lead_id,title,stage,assigned_to,updated_at').eq('customer_id',customerId).in('company_id',companies).order('updated_at',{ascending:false}).limit(100),
    Promise.resolve(true)
  ]);
  if(res.error)return;
  const holder=document.createElement('section');holder.className='gl-customer-timeline card';
  holder.style.marginTop='16px';
  holder.innerHTML='<h3>Lead stages & conversation history</h3><p class="gl-caption">Stage changes for leads linked to this customer.</p>';
  for(const l of res.data||[]){
   const {data,error}=await db.from('gr_lead_stage_history').select('event_type,old_stage,new_stage,note,created_at')
    .eq('company_id',l.company_id).eq('lead_id',l.lead_id).order('created_at',{ascending:false}).limit(30);
   if(error)continue;
   const article=document.createElement('article');article.style.padding='10px';article.style.borderBottom='1px solid #e2e8f0';
   article.innerHTML='<b>'+escape(l.title)+'</b> · '+escape(l.stage)+' · '+escape(staffName?.(l.assigned_to)||'Assigned employee')+
    '<div class="gl-hist">'+(data||[]).map(e=>'<article><strong>'+escape(e.old_stage||'')+' → '+escape(e.new_stage||'')+'</strong> · '+escape(dates(e.created_at))+
    '<p>'+escape(e.note)+'</p></article>').join('')+'</div>';
   holder.append(article);
  }
  if(root.isConnected){root.querySelectorAll('.gl-customer-timeline').forEach(e=>e.remove());root.append(holder)}
 }
 window.GreenRichLeadPipeline={mount,mountFollowups,renderCustomerTimeline,
   refreshRoot:async element=>{const ctx=contexts.get(element);if(ctx){await refresh(ctx);return true}return false},
   celebrateWon};
})();
