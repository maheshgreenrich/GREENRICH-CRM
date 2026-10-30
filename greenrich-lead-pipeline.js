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
 const styles=`
 .gl-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:13px}
 .gl-head h3{margin:0;font-size:18px;color:#102c55}.gl-caption{font-size:12px;color:#637791}
 .gl-row{display:flex;gap:9px;align-items:end;flex-wrap:wrap;margin:14px 0}
 .gl-row label{font-size:12px;color:#516b86;display:flex;flex-direction:column;gap:5px}
 .gl-row input,.gl-row select{height:36px;min-width:128px;border:1px solid #d3e0ef;border-radius:8px;padding:5px 9px;background:white}
 .gl-row button,.gl-head button,.gl-card button,.gl-dialog button{width:auto!important;font-size:12px!important;padding:8px 12px!important;min-height:34px!important;border-radius:8px!important}
 .gl-main{display:grid;grid-template-columns:repeat(4,minmax(135px,1fr));gap:11px;margin:8px 0 18px}
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
 .gl-card button:focus-visible,.gl-row button:focus-visible{outline:3px solid #87aefa}
 .gl-note{padding:13px;border-radius:10px;background:#fff7e8;border:1px solid #efd9a6;color:#805b18;font-size:13px}
 .gl-dialog{border:1px solid #cfdbed;border-radius:14px;box-shadow:0 15px 60px #15355935;padding:23px;max-width:min(590px,94vw);max-height:90vh;overflow:auto}
 .gl-dialog::backdrop{background:#112f5280}.gl-dialog h3{margin:0 0 10px;font-size:19px}
 .gl-dialog label{display:flex;flex-direction:column;gap:5px;color:#526783;font-size:13px;margin:12px 0}
 .gl-dialog input,.gl-dialog select,.gl-dialog textarea{font:inherit;padding:10px;border-radius:9px;border:1px solid #ccd9e8;width:100%;box-sizing:border-box}
 .gl-dialog textarea{min-height:115px}.gl-dialog .actions{display:flex;justify-content:flex-end;gap:9px;margin-top:14px}
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
  const [leads,staff,orders,customers,products]=await Promise.all([
   allRows(ctx.db,'gr_lead_pipeline','*',q=>q.in('company_id',cs)),
   Promise.all(cs.map(async co=>{const {data,error}=await ctx.db.rpc('gr_pipeline_staff',{p_company:co});if(error)throw error;return (data||[]).map(p=>({...p,company_id:co}))})),
   ctx.db.from('gr_crm_records').select('company_id,record_id,payload').in('company_id',cs).eq('kind','sales').limit(1000),
   ctx.db.from('gr_crm_customers').select('id,name,mobile').order('name').limit(1000),
   ctx.db.from('gr_crm_records').select('company_id,record_id,payload').in('company_id',cs).eq('kind','products').limit(1000)
  ]);
  if(orders.error)throw orders.error;if(customers.error)throw customers.error;if(products.error)throw products.error;
  ctx.leads=leads;ctx.staff=staff.flat();ctx.orders=orders.data||[];ctx.customers=customers.data||[];ctx.products=products.data||[];
  ctx.canViewTeam=ctx.staff.some(p=>p.id!==ctx.userId&&p.manager_id===ctx.userId)||ctx.admin||ctx.scope==='all'||ctx.scope==='team';
 }
 const companyText=(ctx,id)=>ctx.companyNames?.[id]||id;
 const name=(ctx,id)=>ctx.staff.find(p=>p.id===id)?.full_name||(!id?'Unassigned':'Employee');
 const labelProduct=(ctx,lead)=>ctx.products.find(p=>p.company_id===lead.company_id&&p.record_id===lead.product_id)?.payload?.name||lead.product_id||'—';
 const saleTotal=(ctx,lead)=>Number(ctx.orders.find(o=>o.company_id===lead.company_id&&o.record_id===lead.won_order_id)?.payload?.total)||0;
 const picked=(ctx)=>ctx.leads.filter(l=>{
  const f=ctx.filters;const timestamp=Date.parse(l.created_at||'');
  const fromTime=f.from?new Date(f.from).getTime():null,toTime=f.to?new Date(f.to).getTime():null;
  return (f.company==='all'||l.company_id===f.company)&&
   (f.person==='all'||l.assigned_to===f.person)&&
   (fromTime===null||timestamp>=fromTime)&&(toTime===null||timestamp<=toTime)&&
   (!f.product||l.product_id===f.product)&&
   (!f.source||l.source===f.source)&&(!f.tag||l.tag_ids?.includes(f.tag))&&
   (!f.search||[l.title,l.contact,l.mobile,l.email,l.source,name(ctx,l.assigned_to)].join(' ').toLowerCase().includes(f.search.toLowerCase()));
 });
 const choices=(array,current)=>array.map(([v,t])=>'<option value="'+escape(v)+'" '+(v===current?'selected':'')+'>'+escape(t)+'</option>').join('');
 const button=(label,action,attrs='')=>'<button type="button" data-gl-action="'+escape(action)+'" '+attrs+'>'+escape(label)+'</button>';
 function buildFilters(ctx){
  const f=ctx.filters,persons=[...new Map(ctx.staff.map(p=>[p.id,p])).values()],owners=ctx.canViewTeam?persons:[];
  const products=[...new Map(ctx.products.map(p=>[p.record_id,p])).values()].filter(p=>ctx.leads.some(l=>l.product_id===p.record_id));
  const sources=[...new Set(ctx.leads.map(l=>l.source).filter(Boolean))].sort();
  const tags=[...new Set(ctx.leads.flatMap(l=>l.tag_ids||[]))].sort();
  return '<div class="gl-row" aria-label="Lead filters">'+
   '<label>From date & time<input type="datetime-local" data-gl-filter="from" value="'+escape(f.from)+'"></label>'+
   '<label>To date & time<input type="datetime-local" data-gl-filter="to" value="'+escape(f.to)+'"></label>'+
   '<label>Company<select data-gl-filter="company">'+choices([['all','All assigned companies'],...ctx.companyIds.map(id=>[id,companyText(ctx,id)])],f.company)+'</select></label>'+
   '<label>Product<select data-gl-filter="product">'+choices([['','All products'],...products.map(p=>[p.record_id,p.payload?.name||p.record_id])],f.product)+'</select></label>'+
   '<label>Source<select data-gl-filter="source">'+choices([['','All sources'],...sources.map(s=>[s,s])],f.source)+'</select></label>'+
   '<label>Tags<select data-gl-filter="tag">'+choices([['','All tags'],...tags.map(t=>[t,t])],f.tag)+'</select></label>'+
   (ctx.canViewTeam?'<label>Salesperson<select data-gl-filter="person">'+choices([['all','All visible salespeople'],...owners.map(p=>[p.id,p.full_name])],f.person)+'</select></label>':'')+
   '<label>Search<input data-gl-filter="search" placeholder="Name, phone, email…" value="'+escape(f.search)+'"></label>'+
   '</div>';
 }
 const showMessage=(ctx,e)=>notify(ctx,e?.message||String(e));
 async function refresh(ctx){await query(ctx);draw(ctx)}
 function draw(ctx){
  const root=ctx.root;if(!root?.isConnected)return;
  const rows=picked(ctx),wins=rows.filter(l=>l.stage==='Won'),quoted=rows.filter(l=>l.stage==='Quotation');
  const stat=[['Visible leads',rows.length],['Quotation follow-ups',quoted.length],['Won sales orders',wins.filter(l=>l.won_order_id).length],['Won order value',money(wins.reduce((v,l)=>v+saleTotal(ctx,l),0))]];
  root.innerHTML='<div class="gl-head"><div><h3>Leads Pipeline</h3><div class="gl-caption">Assigned leads, quotation progress and sales history in one workspace</div></div><div class="gl-card-actions">'+button('+ New lead','new')+button('Import leads CSV','import')+
    (ctx.companyIds.some(co=>localStorage.getItem('greenrich-crm-pipeline-legacy-backup:'+co))?button('Assign saved leads','legacy'):'')+
    button('Won sales history','history')+button('Meta Leads Sync','metasync')+'</div></div>'+
   '<div class="gl-main">'+stat.map(([a,b])=>'<div class="gl-stat"><span>'+escape(a)+'</span><strong>'+escape(b)+'</strong></div>').join('')+'</div>'+
   buildFilters(ctx)+
   '<div class="gl-board" aria-label="Lead stage board">'+stages.map(stage=>'<section class="gl-column" data-stage="'+escape(stage)+'"><h4>'+stage+' <span class="gl-count">'+rows.filter(x=>x.stage===stage).length+'</span></h4><div class="gl-list">'+
    rows.filter(x=>x.stage===stage).map(l=>'<article class="gl-card" draggable="true" data-lead="'+escape(l.lead_id)+'" data-company="'+escape(l.company_id)+'"><strong>'+escape(l.title)+'</strong><p>'+escape(l.contact||l.mobile||'No contact recorded')+'</p>'+
     '<div class="gl-card-line"><span>Salesperson</span><b>'+escape(name(ctx,l.assigned_to))+'</b></div>'+
     '<div class="gl-card-line"><span>Company</span><span>'+escape(companyText(ctx,l.company_id))+'</span></div>'+
     '<div class="gl-card-line"><span>Value</span><b>'+escape(money(l.expected_value))+'</b></div>'+
     '<div class="gl-card-line"><span>Source</span><span>'+escape(l.source||'—')+'</span></div>'+
     '<div class="gl-card-line"><span>Product</span><span>'+escape(labelProduct(ctx,l))+'</span></div>'+
     (l.stage==='Quotation'?'<div class="gl-card-line"><span>Follow-up</span><b>'+escape(l.next_followup||'Not set')+'</b></div>':'')+
     '<div class="gl-card-actions">'+button('Move stage','move','data-id="'+escape(l.lead_id)+'" data-company="'+escape(l.company_id)+'"')+
     button('History','detail','data-id="'+escape(l.lead_id)+'" data-company="'+escape(l.company_id)+'"')+
     button('Link customer','customer','data-id="'+escape(l.lead_id)+'" data-company="'+escape(l.company_id)+'"')+
     (l.stage==='Quotation'?button('Create Sales Order','order','data-id="'+escape(l.lead_id)+'" data-company="'+escape(l.company_id)+'"'):'')+
     (ctx.canViewTeam?button('Assign','assign','data-id="'+escape(l.lead_id)+'" data-company="'+escape(l.company_id)+'"'):'')+
     '</div></article>').join('')+'</div></section>').join('')+'</div>';
  root.querySelectorAll('[data-gl-filter]').forEach(el=>el.onchange=()=>{ctx.filters[el.dataset.glFilter]=el.value;draw(ctx)});
  root.querySelectorAll('button[data-gl-action]').forEach(el=>el.onclick=()=>act(ctx,el));
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
   (quoted.length?quoted.map(l=>'<tr><td>'+escape(l.title)+'</td><td>'+escape(name(ctx,l.assigned_to))+'</td><td>'+escape(companyText(ctx,l.company_id))+'</td><td>'+money(l.expected_value)+'</td><td>'+escape(l.next_followup||'Not set')+'</td><td>'+button('View history','detail','data-id="'+escape(l.lead_id)+'" data-company="'+escape(l.company_id)+'"')+'</td></tr>').join(''):'<tr><td colspan="6">No active quotation follow-ups.</td></tr>')+
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
  const next=to||stages[stages.indexOf(l.stage)+1]||'Contacted';
  const orders=ctx.orders.filter(o=>o.company_id===l.company_id&&o.payload?.customer_id===l.customer_id);
  const orderSelect='<label>Linked Sales Order (required to mark Won)<select name="order"><option value="">Select existing sales order</option>'+orders.map(o=>'<option value="'+escape(o.record_id)+'">'+escape(o.payload?.internal_order_id||o.record_id)+' · '+money(o.payload?.total)+'</option>').join('')+'</select></label>';
  const body='<p class="gl-caption">'+escape(l.title)+' · '+escape(l.stage)+' → '+escape(next)+'</p>'+
   selectFld('Move to stage','stage',stages.filter(s=>s!==l.stage).map(s=>[s,s]))+noteFld()+
   fld('Next follow-up date','due','date','',true)+orderSelect+
   '<p class="gl-note">For Won: create a Sales Order for the linked customer first, then select it here.</p>';
  const d=dialog(ctx,'Update lead stage',body,async fd=>{
   const stage=fd.get('stage');if(!stage)throw Error('Select a stage');
   if(stage==='Won'&&!l.customer_id)throw Error('This lead must be linked to an existing customer before Won.');
   const payload={p_company:l.company_id,p_lead:l.lead_id,p_stage:stage,p_note:fd.get('note'),p_order:stage==='Won'?fd.get('order')||null:null,p_due:stage==='Quotation'?fd.get('due')||null:null};
   if(stage==='Won'&&!payload.p_order)throw Error('Select an existing customer-linked sales order');
   const {error}=await ctx.db.rpc('gr_pipeline_move',payload);if(error)throw error;
  });
  const select=d.querySelector('select[name=stage]');select.value=next;
  const controls=()=>{const stage=select.value;const due=d.querySelector('input[name=due]');if(due){due.closest('label').hidden=stage!=='Quotation';due.required=stage==='Quotation'}const order=d.querySelector('select[name=order]');if(order){order.closest('label').hidden=stage!=='Won';order.required=stage==='Won'}};
  select.onchange=controls;controls();
 }
 async function act(ctx,b){
  const action=b.dataset.glAction,l=getLead(ctx,b.dataset.id,b.dataset.company);
  if(action==='metasync'){
   if(!window.GreenRichMetaSync){notify(ctx,'Meta connection module failed to load. Refresh GreenRich ONE.');return}
   void window.GreenRichMetaSync.open(ctx).catch(e=>notify(ctx,e.message));return;
  }
  if(action==='move'){move(ctx,l);return}
  if(action==='order'){
   if(!l.customer_id){notify(ctx,'Link this lead to an existing customer before creating its sales order.');return}
   if(typeof window.GreenRichCRM?.createOrderForLead!=='function')throw Error('Sales Order editor is unavailable. Refresh the CRM.');
   window.GreenRichCRM.createOrderForLead(l);return;
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
   dialog(ctx,'Assign lead to employee',selectFld('Salesperson','person',people.map(p=>[p.id,p.full_name]))+noteFld(),async fd=>{
    const {error}=await ctx.db.rpc('gr_pipeline_assign',{p_company:l.company_id,p_lead:l.lead_id,p_employee:fd.get('person'),p_note:fd.get('note')});if(error)throw error;
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
   const assignee=selectFld('Assign to sales employee *','assignee',[['','Choose a salesperson'],...staff.map(p=>[p.id,p.full_name])]);
   const common=selectFld('Company *','company',companies.map(c=>[c,companyText(ctx,c)]))+assignee;
   if(action==='new'){
    const products=ctx.products.filter(p=>p.company_id===defaultCompany);
    const fields=common+fld('Lead title *','title','text','',true)+fld('Contact name','contact')+fld('Mobile (+91)','mobile','tel')+
     fld('Email','email','email')+fld('Lead source','source')+
     selectFld('Product','product',[['','None'],...products.map(p=>[p.record_id,p.payload?.name||p.record_id])],false)+
     selectFld('Existing customer','customer',[['','Not linked'],...ctx.customers.map(c=>[c.id,c.name])],false)+
     fld('Expected value ₹','value','number','0')+fld('Tags (comma-separated)','tags')+fld('Initial enquiry notes','note');
    const d=dialog(ctx,'Create and assign lead',fields,async fd=>{
     if(!fd.get('assignee'))throw Error('A sales employee must be assigned before creating the lead');
     const {error}=await ctx.db.rpc('gr_pipeline_create',{p_company:fd.get('company'),p_title:fd.get('title'),p_contact:fd.get('contact'),p_assignee:fd.get('assignee'),
      p_source:fd.get('source'),p_product:fd.get('product')||null,p_customer:fd.get('customer')||null,p_value:fd.get('value')||0,p_mobile:fd.get('mobile'),
      p_email:fd.get('email'),p_tags:String(fd.get('tags')||'').split(',').map(x=>x.trim()).filter(Boolean),p_note:fd.get('note')});if(error)throw error;
    });const comp=d.querySelector('[name=company]'),sel=d.querySelector('[name=assignee]'),prod=d.querySelector('[name=product]');
    comp.value=defaultCompany;const renderChoices=()=>{sel.innerHTML=choices([['','Choose a salesperson'],...ctx.staff.filter(p=>p.company_id===comp.value).map(p=>[p.id,p.full_name])],'');prod.innerHTML=choices([['','None'],...ctx.products.filter(p=>p.company_id===comp.value).map(p=>[p.record_id,p.payload?.name||p.record_id])],'')};comp.onchange=renderChoices;renderChoices();return;
   }
   const d=dialog(ctx,'Import leads (CSV)',common+
    '<p class="gl-note">CSV columns: title,contact,mobile,email,source,product_id,value,tags,notes. Every imported row will be assigned to the selected salesperson. Import creates only New leads.</p>'+
    '<label>Choose CSV file<input type="file" name="file" accept=".csv,text/csv" required></label>',async fd=>{
      const file=fd.get('file');if(!file?.size)throw Error('Choose a CSV file');
      if(file.size>2000000)throw Error('CSV must be under 2 MB');
      const raw=await file.text(),rows=parseCSV(raw);if(rows.length>500)throw Error('Import a maximum of 500 leads per batch');
      const headers=rows.shift().map(x=>x.toLowerCase().trim()),titleIdx=headers.indexOf('title');
      if(titleIdx<0)throw Error('CSV must contain a title column');
      if(!fd.get('assignee'))throw Error('Choose a salesperson before importing');
      let success=0,errors=[];
      for(const cells of rows){if(!cells.some(x=>x.trim()))continue;const val=n=>cells[headers.indexOf(n)]||'';
       const {error}=await ctx.db.rpc('gr_pipeline_create',{p_company:fd.get('company'),p_title:val('title'),p_contact:val('contact'),
       p_assignee:fd.get('assignee'),p_source:val('source'),p_product:val('product_id')||null,p_value:val('value')||0,p_mobile:val('mobile'),
       p_email:val('email'),p_tags:val('tags').split(';').filter(Boolean),p_note:val('notes')});
       if(error){errors.push(error.message);if(errors.length>15)break}else success++;
      }
      notify(ctx,'Imported '+success+' leads'+(errors.length?'; '+errors.length+' errors. First: '+errors[0]:''));
    });const comp=d.querySelector('[name=company]'),sel=d.querySelector('[name=assignee]');comp.value=defaultCompany;
    comp.onchange=()=>{sel.innerHTML=choices([['','Choose a salesperson'],...ctx.staff.filter(p=>p.company_id===comp.value).map(p=>[p.id,p.full_name])],'')};comp.onchange();return;
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
  const board=document.createElement('div');board.className='gl-workspace';root.append(board);
  const state={...ctx,root:board,filters:{company:ctx.companyIds.length===1?ctx.companyIds[0]:'all',person:'all',from:'',to:'',product:'',source:'',tag:'',search:''},
   leads:[],staff:[],orders:[],products:[],customers:[],canViewTeam:false};
  contexts.set(root,state);
  try{await refresh(state);state.loadedAt=Date.now()}catch(e){board.innerHTML='<p class="gl-note">Pipeline is unavailable: '+escape(e.message)+'. Verify the lead pipeline migration and access permissions.</p>'}
  return state;
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
  const state={...ctx,filters:{company:'all',person:'all',from:'',to:'',product:'',source:'',tag:'',search:''},leads:[],staff:[],orders:[],products:[],customers:[],canViewTeam:false,root:null};
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
 window.GreenRichLeadPipeline={mount,mountFollowups,renderCustomerTimeline};
})();
