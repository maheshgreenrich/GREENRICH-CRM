'use strict';
/* CRM-led WhatsApp handoff, not a replacement for SocialBerries.
   No network calls to undocumented provider endpoints and no simulated sends. */
(()=>{
 let app=null,root=null,scope='all',kind='all',source='all',tag='all',owner='all',needle='',provider='all',current='audience',rows={},selected=new Set(),inboxNeedle='',guidanceCompany='grow-india',guidanceProduct='all';
 let startDate='',endDate='',product='all',leadStage='all',inboundNeedle='',serviceCompany='all',serviceSource='all',serviceTag='all',serviceProduct='all',serviceOrder='all',serviceDelivery='all',serviceType='all',serviceStart='',serviceEnd='',serviceNeedle='',serviceSelected=new Set(),campaignReportPage=1,sendBusy=false,lastPrepared=null,campaignImage=null,campaignParamValues={};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const companies={'grow-india':'GreenRich Grow India Pvt Ltd','enviro-solutions':'GreenRich Enviro Solutions Pvt Ltd'};
 const name=id=>companies[id]||id;
 const date=x=>x?new Date(x).toLocaleDateString('en-IN'):'—';
 const alert=(msg,type='info')=>app?.notify?.(msg,type);
 const cd=()=>scope==='all'?(app?.selectedCompany&&app.companies.includes(app.selectedCompany)?app.selectedCompany:app.companies[0]):scope;
 const can=a=>app?.admin||app?.permission?.(a)===true;
 const sel=(label,id,items,selectedValue='',empty='All')=>'<label>'+esc(label)+'<select id="'+id+'">'+(empty===null?'':'<option value="all">'+esc(empty)+'</option>')+items.map(x=>'<option value="'+esc(x[0])+'" '+(String(selectedValue)===String(x[0])?'selected':'')+'>'+esc(x[1])+'</option>').join('')+'</select></label>';
 const options=(items,blank='None — do not send')=>'<option value="">'+esc(blank)+'</option>'+items.map(x=>'<option value="'+esc(x[0])+'">'+esc(x[1])+'</option>').join('');
 const templates=c=>rows.templates.filter(t=>t.company_id===c);
 const connectionLabel=id=>rows.connections.find(c=>c.id===id)?.display_name||'Not connected';
 const tmpl=t=>t.name+' · '+t.language+' · '+(t.body?'Preview recorded':'Metadata only')+' · '+(t.provider_approval!=='approved'?'Not verified for sending':t.provider_source==='admin_confirmed'?'Admin-confirmed approved':t.provider_source==='verified_provider'?'Verified directly with Meta':'Unverified');
 const validMarketingTemplate=t=>t.category==='marketing'&&t.provider_approval==='approved'&&
   ['verified_provider','admin_confirmed'].includes(t.provider_source)&&
   !!String(t.body||'').trim()&&Array.isArray(t.provider_preview?.components)&&t.provider_preview.components.some(c=>String(c.type).toUpperCase()==='BODY');
 const templateOptions=(c,connectionId='')=>templates(c).filter(t=>
   validMarketingTemplate(t)&&(!connectionId||t.connection_id===connectionId))
   .map(t=>[t.id,t.name+' · '+t.language+' · Ready']);
 // Pending references are visible to explain why they cannot yet be sent.
 // Disabled options cannot be selected as a campaign template.
 const templateSelectHtml=(company,connectionId)=>'<option value="">Choose an approved template</option>'+
   templates(company).filter(t=>t.category==='marketing'&&t.connection_id===connectionId)
    .map(t=>'<option value="'+esc(t.id)+'"'+(validMarketingTemplate(t)?'':' disabled')+'>'+
     esc(t.name+' · '+t.language+(validMarketingTemplate(t)?' · Ready':' · Pending manual sync / missing approved components'))+'</option>').join('');
 function updateCampaignTemplateSelect(form,keepValue=''){
  if(!form)return;
  const conn=form.elements.connection_id?.value||'',company=campaignConnection(conn)?.company_id||'';
  const input=form.elements.template_id;
  if(input){
   input.innerHTML=templateSelectHtml(company,conn);
   if(keepValue&&Array.from(input.options).some(o=>o.value===keepValue&&!o.disabled))input.value=keepValue;
  }
  const list=rows.templates.filter(t=>t.connection_id===conn&&t.category==='marketing');
  const ready=list.filter(validMarketingTemplate).length;
  const status=form.querySelector('[data-marketing-sync-status]');
  if(status)status.textContent=ready+' ready · '+(list.length-ready)+' pending full approved template details. Pending templates are shown but cannot be sent. Use Admin → WhatsApp Settings → Manual Sync Approved Template.';
 }
 function templateRequirements(t){
  const comps=Array.isArray(t?.provider_preview?.components)?t.provider_preview.components:[];
  const body=comps.find(x=>String(x.type).toUpperCase()==='BODY');
  const header=comps.find(x=>String(x.type).toUpperCase()==='HEADER');
  const buttons=comps.find(x=>String(x.type).toUpperCase()==='BUTTONS')?.buttons||[];
  const tags=text=>[...String(text||'').matchAll(/\{\{([^{}]+)\}\}/g)].map(m=>m[1].trim().toLowerCase());
  const fields=[];
  if(String(header?.format).toUpperCase()==='TEXT')for(const tag of tags(header.text))fields.push({key:'header:'+tag,label:'Header '+tag});
  for(const tag of [...new Set(tags(body?.text))]){
   fields.push({key:'body:'+tag,label:'Message variable '+tag,tag});
  }
  if(!Array.isArray(buttons))return {fields,unsupported:['Invalid approved button definitions'],format:''};
  buttons.forEach((b,i)=>{
   const type=String(b.type||'').toUpperCase();
   if(type==='COPY_CODE')fields.push({key:'coupon:'+i,label:'Coupon code · '+(b.text||'Copy code')});
   if(type==='URL'&&tags(b.url).length)fields.push({key:'url:'+i,label:'Website button URL suffix · '+(b.text||'Website')});
  });
  const format=String(header?.format||'').toUpperCase();
  const unsupported=[];
  if(['VIDEO','DOCUMENT'].includes(format))unsupported.push(format+' headers are not yet supported for CRM campaign sending');
  if(comps.some(x=>['CAROUSEL','LIMITED_TIME_OFFER'].includes(String(x.type).toUpperCase())))
   unsupported.push('Complex carousel / limited-time template content needs provider-specific support');
  if(buttons.some(b=>!['COPY_CODE','URL','PHONE_NUMBER','QUICK_REPLY'].includes(String(b.type||'').toUpperCase())))
   unsupported.push('This template includes an unsupported button type');
  return {fields,format,unsupported,body};
 }
 function drawTemplateRequirements(form){
  const region=form?.querySelector('[data-wa-required-fields]');if(!region)return;
  const id=form.elements.template_id?.value;
  const template=rows.templates.find(t=>t.id===id);
  if(!template){region.innerHTML='<p class="grwc-muted">Choose a template to see its required message variables, media and buttons.</p>';return}
  if(!validMarketingTemplate(template)){
   region.innerHTML='<div class="grwc-notice"><b>Template not ready.</b> CRM has only a name/reference, not the approved full content. Use Sync Approved Templates; no repeat approval is needed.</div>';
   const button=form.querySelector('[data-send-campaign]');if(button)button.disabled=true;return;
  }
  const spec=templateRequirements(template);
  const stored=campaignParamValues[id]||{};
  const hints=[];
  if(template.provider_source!=='verified_provider')
   hints.push('This template was manually confirmed by an administrator; check that every approved component is accurate before sending.');
  if(spec.format==='IMAGE')hints.push('IMAGE header required. Choose a file above; a stored image preview is not sufficient unless its media is attached.');
  if(spec.body?.text)hints.push('BODY template variables: '+[...String(spec.body.text).matchAll(/\{\{([^{}]+)\}\}/g)].map(m=>m[1]).join(', ')+'. Numeric 1–3 / named client fields are mapped from each contact.');
  region.innerHTML='<h4>Required fields for '+esc(template.name)+' · '+esc(template.language)+'</h4>'+
   (hints.length?'<p class="grwc-notice">'+hints.map(esc).join(' ')+'</p>':'')+
   (spec.unsupported.length?'<p class="grwc-notice">'+spec.unsupported.map(esc).join(' · ')+'</p>':'')+
   '<div class="grwc-grid">'+spec.fields.map(f=>{
      const selected=stored[f.key]||(f.tag==='1'||f.tag==='clientname'?'@crm:name':f.tag==='2'||f.tag==='clientemail'?'@crm:email':f.tag==='3'||f.tag==='clientmobile'?'@crm:mobile':'');
      if(!f.tag)return '<label>'+esc(f.label)+'<input type="text" name="wa_parameter" data-wa-field="'+esc(f.key)+'" required maxlength="200" value="'+esc(selected)+'" placeholder="Required for approved template"></label>';
      const preset=['@crm:name','@crm:mobile','@crm:email'];
      const mode=preset.includes(selected)?selected:'custom';
      return '<label>'+esc(f.label)+'<select data-wa-field="'+esc(f.key)+'">'+
       [['@crm:name','Customer name'],['@crm:mobile','Customer mobile'],['@crm:email','Customer email'],['custom','Enter my own text / order number']].map(([v,label])=>
        '<option value="'+esc(v)+'" '+(v===mode?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select>'+
       '<input data-wa-custom="'+esc(f.key)+'" maxlength="200" placeholder="Type the value" value="'+esc(mode==='custom'?selected:'')+'" '+(mode==='custom'?'required':'hidden')+'></label>';
     }).join('')+'</div>'+
   (!spec.fields.length?'<p class="grwc-muted">No additional custom text or button values are required by the saved template JSON.</p>':'');
  const button=form.querySelector('[data-send-campaign]');
  if(button)button.disabled=!!spec.unsupported.length;
 }
 const headers=(title,sub,action='')=>'<div class="grwc-title"><div><h3>'+esc(title)+'</h3><p>'+esc(sub)+'</p></div>'+action+'</div>';
 const empty=(message)=>'<div class="grwc-empty">'+esc(message)+'</div>';
 const scoped=(a)=>a.filter(x=>scope==='all'||x.company_id===scope);
 const campaignConnection=id=>rows.connections.find(c=>c.id===id&&app.companies.includes(c.company_id));
 async function fetchAll(){
  if(!app?.db)return;
  const db=app.db,cs=app.companies,read=async(table,cols='*',filter='company_id')=>{
   const q=db.from(table).select(cols).in(filter,cs).limit(1200),r=await q;
   if(r.error)throw Error(table+': '+r.error.message);
   return r.data||[];
  };
  const optional=async(table,cols='*',filter='company_id')=>{try{return await read(table,cols,filter)}catch{return []}};
  const [connections,templatesList,campaigns,recurring,inbound,welcomes,leads,customers,tags,sources,profiles,sheets,providerLeads,dispatches,consents,products,messages,guidance,batches,inboundEvents]=await Promise.all([
   read('gr_wa_connections'),read('gr_wa_templates'),read('gr_wa_campaigns'),read('gr_wa_recurring_rules'),
   read('gr_wa_inbound_rules'),read('gr_wa_lead_welcome'),
   app.canLeads?read('gr_lead_pipeline','company_id,lead_id,contact,title,mobile,email,source,tag_ids,assigned_to,stage,customer_id,product_id,created_at,notes,next_followup'):Promise.resolve([]),
   app.canCustomers?db.from('gr_crm_customers').select('id,name,mobile,mobile2,email,source,type,owner,tag_ids,created_at,notes').limit(2000).then(r=>{if(r.error)throw r.error;return r.data||[]}):Promise.resolve([]),
   db.from('gr_crm_tags').select('id,name').limit(500).then(r=>r.data||[]),
   db.from('gr_crm_sources').select('name,active').eq('active',true).order('name').limit(500).then(r=>{if(r.error)throw Error('CRM sources: '+r.error.message);return r.data||[]}),
   app.admin?db.from('gr_profiles').select('id,full_name,company_ids,active').eq('active',true).limit(300).then(r=>r.data||[]):Promise.resolve([]),
   app.admin?read('gr_sheet_connections'):Promise.resolve([]),
   app.admin?read('gr_wa_provider_leads'):Promise.resolve([]),
   optional('gr_dispatch_orders','id,company_id,source_sale_id,order_id,order_date,customer_id,customer_name,customer_mobile,product_name,sku,status,dispatched_at,delivered_at,customer_email'),
   optional('gr_wa_contacts','id,company_id,customer_id,lead_id,mobile,consent_status,consent_source,consent_at,opt_out_at'),
   optional('gr_pilot_products','id,company_id,crm_product_id,name,sku'),
   optional('gr_wa_messages','id,company_id,connection_id,campaign_id,direction,body,delivery_status,phone,provider_message_id,provider_error_code,provider_error_message,event_at,created_at'),
   optional('gr_wa_guidance_steps'),optional('gr_wa_bulk_batches'),optional('gr_wa_inbound_events')
  ]);
  rows={connections,templates:templatesList,campaigns,recurring,inbound,welcomes,leads,customers,tags,sources,profiles,sheets,providerLeads,dispatches,consents,products,messages,guidance,batches,inboundEvents};
 }
 const byType=()=>{
  const sourceVals=[...new Set([...rows.leads.map(l=>l.source),...rows.customers.map(c=>c.source)].filter(Boolean))];
  return sourceVals.map(x=>[x,x]);
 };
 const digits=n=>String(n||'').replace(/\D/g,'').replace(/^91(?=[6-9]\d{9}$)/,'');
 const sameMobile=(a,b)=>digits(a).length===10&&digits(a)===digits(b);
 const ordersFor=c=>rows.dispatches.filter(d=>(c.customer_id&&d.customer_id===c.customer_id)||
  (c.id&&d.customer_id===c.id)||
  (c.mobile&&sameMobile(d.customer_mobile,c.mobile)));
 const customerCompany=c=>{
  const links=rows.consents.filter(w=>w.customer_id===c.id);
  const orders=ordersFor(c);
  const found=[...new Set([...links.map(w=>w.company_id),...orders.map(o=>o.company_id)])];
  return found.length===1?found[0]:'';
 };
 const customerTarget=c=>({id:'C:'+c.id,type:'Customer',name:c.name||'Unnamed customer',
  mobile:/^[6-9][0-9]{9}$/.test(digits(c.mobile))?c.mobile:(/^[6-9][0-9]{9}$/.test(digits(c.mobile2))?c.mobile2:(c.mobile||c.mobile2||'')),email:c.email||'',source:c.source||'',tags:c.tag_ids||[],
  company_id:customerCompany(c),owner:c.owner||'',customer_id:c.id,lead_id:null,
  stage:'',product_id:'',created_at:c.created_at||'',notes:c.notes||'',next_followup:'',products:ordersFor(c).map(o=>o.product_name),
  orders:ordersFor(c)});
 const leadTarget=l=>({id:'L:'+l.company_id+':'+l.lead_id,type:'Lead',name:l.contact||l.title||'Lead',
  mobile:l.mobile||'',email:l.email||'',source:l.source||'',tags:l.tag_ids||[],
  company_id:l.company_id,owner:l.assigned_to||'',customer_id:l.customer_id,lead_id:l.lead_id,
  stage:l.stage||'',product_id:l.product_id||'',created_at:l.created_at||'',notes:l.notes||'',next_followup:l.next_followup||'',
  products:rows.products.filter(p=>p.crm_product_id===l.product_id||p.id===l.product_id).map(p=>p.name),
  orders:[]});
 const targets=()=>[...rows.leads.map(leadTarget),...rows.customers.map(customerTarget)];
 const dateMatch=(d,from,to)=>{const day=String(d||'').slice(0,10);return (!from||day>=from)&&(!to||day<=to)};
 const productMatch=(x,selected)=>selected==='all'||String(x.product_id)===selected||
  x.products.some(p=>p.toLowerCase()===String(selected).toLowerCase());
 const productChoices=()=>[...new Set([...rows.products.map(p=>p.name),...rows.dispatches.map(o=>o.product_name)].filter(Boolean))].sort().map(x=>[x,x]);
 const stageChoices=()=>[...new Set(rows.leads.map(l=>l.stage).filter(Boolean))].sort().map(x=>[x,x]);
 function audience(){
  return targets().filter(x=>
   (scope==='all'||x.company_id===scope)&&(kind==='all'||x.type===kind)&&
   (source==='all'||x.source===source)&&(tag==='all'||x.tags.includes(tag))&&
   (owner==='all'||x.owner===owner)&&
   (leadStage==='all'||x.type==='Lead'&&x.stage===leadStage)&&
   productMatch(x,product)&&dateMatch(x.created_at,startDate,endDate)&&
   (!needle||[x.name,x.mobile,x.email,x.source,x.type,x.stage].some(v=>String(v||'').toLowerCase().includes(needle)))
  );
 }
 // CRM customers can be shared across both companies, including older unassigned records.
 // Provider determines sender company; leads stay company-scoped.
 // Campaign selection must be independent of the visible audience filters.
 const campaignTargets=companyId=>targets().filter(x=>selected.has(x.id)&&
  (x.type==='Customer'||x.company_id===companyId)&&/^[6-9][0-9]{9}$/.test(digits(x.mobile)));
 const selectedStatus=()=>{const loaded=targets().filter(x=>selected.has(x.id));return {total:loaded.length,missing:selected.size-loaded.length};};
 const header=()=>
 '<div class="grwc-hero"><div><small>GREENRICH ONE / MARKETING</small><h2>WhatsApp Marketing</h2><p>Filter CRM audiences, prepare provider templates, review enquiries and plan after-sales service.</p></div><span class="grwc-chip">Delivery verification pending</span></div>'+
 '<div class="grwc-notice">Select customers, the WhatsApp provider, an approved marketing template and an optional image. Click <b>Send Campaign</b>. The server checks marketing permission and sending readiness automatically.</div>'+
 '<nav class="grwc-tabs">'+[['audience','Audience & Campaign'],['reports','Campaign History'],['inbox','WhatsApp Inbox'],['sync','Lead Assignment'],['welcome','Lead Welcome'],['recurring','After-Sales'],['guidance','Product Guidance']].map(([id,title])=>'<button data-view="'+id+'" class="'+(id===current?'active':'')+'">'+title+'</button>').join('')+'</nav>';
 function audienceView(){
  const list=audience(),tags=rows.tags,chosen=selectedStatus();
  return '<section class="grwc-panel">'+headers('CRM audience selection','Filter Leads and Customers from GreenRich ONE; no contact upload required to build an audience.')+
   '<div class="grwc-filters">'+
   sel('Company','grwc-company',app.companies.map(c=>[c,name(c)]),scope,'Both companies')+
   sel('Contact type','grwc-kind',[['Lead','Lead'],['Customer','Customer']],kind,'Both leads & customers')+
   sel('Source','grwc-source',byType(),source,'All sources')+
   sel('Customer/Lead tag','grwc-tag',tags.map(t=>[t.id,t.name]),tag,'All tags')+
   sel('Salesperson','grwc-owner',rows.profiles.map(p=>[p.id,p.full_name]),owner,'All salespeople')+
   sel('Product','grwc-product',productChoices(),product,'All products')+
   sel('Lead stage','grwc-stage',stageChoices(),leadStage,'All lead stages')+
   '<label>From date<input id="grwc-date-from" type="date" value="'+esc(startDate)+'"></label>'+
   '<label>To date<input id="grwc-date-to" type="date" value="'+esc(endDate)+'"></label>'+
   '<label>Name / phone / email<input id="grwc-search" type="search" value="'+esc(needle)+'" placeholder="Search CRM records"></label></div>'+
   '<div class="grwc-audience-summary"><b>'+list.length+'</b> matching records · <b data-grwc-selected-count>'+chosen.total+'</b> selected across filters'+(chosen.missing?' · '+chosen.missing+' no longer in loaded CRM':'')+'. Your selections remain checked when filters change.</div>'+
   '<div class="grwc-selection-toolbar"><button type="button" data-select-all-matching>Select matching contacts (up to 500)</button><button type="button" data-clear-all-matching>Clear selection</button></div>'+
   '<div class="grwc-tablewrap"><table><thead><tr><th><input type="checkbox" id="grwc-all"></th><th>Name</th><th>Type</th><th>Mobile</th><th>Email</th><th>Source</th><th>Product</th><th>Tags</th><th>Assigned to</th></tr></thead><tbody>'+
   list.slice(0,250).map(x=>'<tr><td><input type="checkbox" data-select-contact="'+esc(x.id)+'" '+(selected.has(x.id)?'checked':'')+'></td><td>'+esc(x.name)+'</td><td>'+x.type+'</td><td>'+esc(x.mobile)+'</td><td>'+esc(x.email||'—')+'</td><td>'+esc(x.source)+'</td><td>'+esc(x.products.join(', ')||'—')+'</td><td>'+esc(x.tags.map(id=>rows.tags.find(t=>t.id===id)?.name||'').filter(Boolean).join(', ')||'—')+'</td><td>'+esc(rows.profiles.find(p=>p.id===x.owner)?.full_name||'—')+'</td></tr>').join('')+'</tbody></table></div>'+
   '<div class="grwc-selection-toolbar"><button type="button" data-select-all-matching>Select all filtered contacts (maximum 500)</button><button type="button" data-clear-all-matching>Clear selection</button><strong><span data-grwc-selected-count>'+chosen.total+'</span> selected</strong></div>'+ '<p class="grwc-muted">Company is an optional filter. Previously unassigned customers can be selected. Showing the first 250 of '+list.length+' matching contacts. Selections are kept across filters. Campaigns are limited to 500 recipients, with documented consent checked before sending.</p></section>'+
   '<section class="grwc-panel">'+headers('Send WhatsApp campaign','Choose an approved marketing template and optional image.')+
   '<form id="grwc-audience-form" class="grwc-form">'+
   '<label>WhatsApp provider<select name="connection_id" required>'+options(rows.connections.filter(c=>app.companies.includes(c.company_id)).map(c=>[c.id,c.display_name+' · '+name(c.company_id)]),'Choose WhatsApp provider')+'</select></label>'+
   '<label>Approved marketing template<select name="template_id" required>'+options([], 'Choose provider first')+'</select></label>'+
   '<label>Campaign image (required when template has IMAGE header)<input type="file" name="image" accept="image/png,image/jpeg"><small data-campaign-image-status>'+(campaignImage?'Selected for sending: '+esc(campaignImage.name):'No image selected')+'</small></label>'+
   '<div class="grwc-span" data-wa-required-fields></div>'+ 
   '<p class="grwc-muted grwc-span">Manual Sync is the primary method: Admin → WhatsApp Settings → Manual Sync Approved Template. No Meta token needed. Missing approved components remain pending until completed; No reapproval in Meta is needed.</p>'+
   '<div class="grwc-span"><button type="button" data-marketing-sync-templates>Refresh CRM template list</button> <small data-marketing-sync-status>Only templates with full approved content are selectable.</small></div>'+
   '<button type="submit" class="grwc-primary" data-send-campaign>Review & Send Campaign</button></form></section>';
 }
 function campaignReports(){
  const relevant=rows.campaigns.filter(x=>scope==='all'||x.company_id===scope).slice(0,100);
  const providerBatches=(rows.batches||[]).filter(x=>scope==='all'||x.company_id===scope)
    .slice().sort((a,b)=>String(b.synced_at).localeCompare(String(a.synced_at))).slice(0,100);
  const stat=(b,key)=>b.message_statistics?.[key]!==null&&b.message_statistics?.[key]!==undefined&&Number.isFinite(Number(b.message_statistics[key]))?Number(b.message_statistics[key]):'—';
  const messages=rows.messages||[],completed=relevant.filter(x=>!!x.provider_batch_id);
  const tracked=messages.filter(m=>relevant.some(c=>c.id===m.campaign_id));
  return '<section class="grwc-panel">'+headers('Campaign reports & delivery tracking',
   'Provider acceptance is not WhatsApp delivery. Actual deliveries depend on reported provider events.')+
   '<div class="grwc-grid grwc-kpis">'+
   [['Campaigns',relevant.length],['Local attempts',tracked.length],
    ['Delivered (confirmed)',tracked.filter(x=>['delivered','read'].includes(x.delivery_status)).length],
    ['Read (confirmed)',tracked.filter(x=>x.delivery_status==='read').length],
    ['Awaiting delivery status',tracked.filter(x=>['queued','sent'].includes(x.delivery_status)).length],
    ['Failed / uncertain',tracked.filter(x=>x.delivery_status==='failed').length],
    ['Provider batches linked',completed.length]].map(x=>'<div class="grwc-feature"><small>'+esc(x[0])+'</small><h3>'+esc(x[1])+'</h3></div>').join('')+'</div>'+
   (relevant.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Campaign</th><th>Company</th><th>Template</th><th>Selected</th><th>Attempts</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+
   relevant.map(x=>{
    const attempts=messages.filter(m=>m.campaign_id===x.id);
    const failures=attempts.filter(m=>m.delivery_status==='failed');
    const last=failures.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];
    const reason=last?.provider_error_message||last?.provider_error_code||'The provider rejection was not captured for this older attempt';
    const state=attempts.length&&failures.length===attempts.length?'Not accepted · '+failures.length+' failed':x.status==='draft'?'Draft · not sent':x.status;
    const allAttempted=attempts.length>0&&attempts.length>=Number(x.audience?.selected_count||0);
    return '<tr><td>'+esc(x.name)+'</td><td>'+esc(name(x.company_id))+'</td><td>'+esc(rows.templates.find(t=>t.id===x.template_id)?.name||'—')+'</td><td>'+esc(x.audience?.selected_count||0)+'</td><td>'+attempts.length+'</td><td>'+esc(state)+(last?'<div class="grwc-muted">Reason: '+esc(reason)+'</div>':'')+'</td><td>'+(allAttempted?'<small>Already attempted · do not automatically retry</small>':'<button type="button" data-review-campaign="'+esc(x.id)+'">Send remaining</button>')+'</td></tr>';
   }).join('')+'</tbody></table></div>':empty('No CRM marketing campaigns saved yet.'))+
   '<p class="grwc-muted">Delivered and Read counts require provider-reported status. Meta website CTA click metrics are not yet available in this CRM API; zero is not displayed as a made-up click count. Uncertain attempts are never auto-retried. Read receipts can be disabled by recipients.</p>'+
   (providerBatches.length?'<h4>SocialBerries provider campaign batches</h4><div class="grwc-tablewrap"><table><thead><tr><th>Campaign</th><th>Provider status</th><th>Audience</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failed</th><th>Button clicks</th></tr></thead><tbody>'+
    providerBatches.map(b=>'<tr><td>'+esc(b.name)+'</td><td>'+esc(b.status)+'</td><td>'+esc(b.total_clients_count)+'</td><td>'+esc(stat(b,'sent'))+'</td><td>'+esc(stat(b,'delivered'))+'</td><td>'+esc(stat(b,'read'))+'</td><td>'+esc(stat(b,'failed'))+'</td><td>Not reported by available API</td></tr>').join('')+'</tbody></table></div>':
    '<p class="grwc-muted">No synchronized provider batches. Use the read-only batch sync below for reports from SocialBerries.</p>')+
   (app.admin?'<button type="button" data-provider-report>Sync SocialBerries Bulk Batches</button> <button type="button" data-provider-history>Saved Bulk Campaign History</button><p class="grwc-muted">SocialBerries reports are read-only snapshots. Campaign completed does not necessarily mean delivered; provider-reported Delivered/Read counts are labeled separately.</p>':'')+
   '</section>';
 }
 function welcomeView(){
  const rules=scoped(rows.welcomes),co=cd();
  return '<section class="grwc-panel">'+headers('Optional Welcome Template for New Leads','Choose a template while creating a lead, importing Excel/CSV, or mapping a Google Sheet. Blank means no welcome message.')+
   '<div class="grwc-notice">If no welcome template is selected, no message preference is saved. Approved templates are managed using Manual Sync in WhatsApp Settings. Automatic Meta sync is optional.</div>'+
   '<button type="button" data-refresh-crm>Refresh available template references</button>'+
   '<div class="grwc-grid"><div class="grwc-feature"><b>1 · Manual Lead</b><p>Leads & CRM → New Lead → Assign salesperson → Welcome template (optional).</p></div>'+
   '<div class="grwc-feature"><b>2 · Excel / CSV</b><p>Leads & CRM → Import → Default welcome template or optional per-row template ID/name.</p></div>'+
   '<div class="grwc-feature"><b>3 · Google Sheet</b><p>Settings → Google Sheet Leads → Select salesperson and default welcome template for each Sheet.</p></div></div></section>'+
   '<section class="grwc-panel">'+headers('Lead welcome selections','Stored lead-level preferences; none have been sent until the provider API is connected.')+
   (rules.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Lead ID</th><th>Template</th><th>State</th><th>Created</th></tr></thead><tbody>'+rules.slice(0,100).map(x=>
     '<tr><td>'+esc(x.lead_id)+'</td><td>'+esc(rows.templates.find(t=>t.id===x.template_id)?.name||'Unknown')+'</td><td>Awaiting provider</td><td>'+date(x.created_at)+'</td></tr>').join('')+'</tbody></table></div>':empty('No welcome templates have been selected yet.'))+'</section>';
 }
 function serviceTargets(){
  return targets().filter(x=>{
   const orderRecords=x.orders||[];
   const orderDateFiltered=orderRecords.filter(o=>dateMatch(o.delivered_at||o.dispatched_at||o.order_date,serviceStart,serviceEnd));
   const appropriateOrders=orderRecords.filter(o=>
    (serviceOrder==='all'||o.order_id===serviceOrder||o.source_sale_id===serviceOrder)&&
    (serviceDelivery==='all'||o.status===serviceDelivery)&&
    (serviceProduct==='all'||String(o.product_name||'').toLowerCase()===serviceProduct.toLowerCase())&&
    dateMatch(o.delivered_at||o.dispatched_at||o.order_date,serviceStart,serviceEnd));
   const orderConstraint=serviceOrder!=='all'||serviceDelivery!=='all'||serviceProduct!=='all'||!!serviceStart||!!serviceEnd;
   return (serviceCompany==='all'||x.company_id===serviceCompany)&&
    (serviceType==='all'||x.type===serviceType)&&
    (serviceSource==='all'||x.source===serviceSource)&&
    (serviceTag==='all'||x.tags.includes(serviceTag))&&
    (!orderConstraint||appropriateOrders.length>0)&&
    (!serviceNeedle||[x.name,x.mobile,x.email,x.source,...orderRecords.map(o=>o.order_id)].some(y=>String(y||'').toLowerCase().includes(serviceNeedle)));
  });
 }
 function recurringView(){
  const list=scoped(rows.recurring),matches=serviceTargets(),keys=new Set(matches.map(x=>x.id));
  serviceSelected=new Set([...serviceSelected].filter(x=>keys.has(x)));
  const orderChoices=[...new Set(rows.dispatches.map(x=>x.order_id).filter(Boolean))].sort().map(x=>[x,x]);
  const statusChoices=[...new Set(rows.dispatches.map(x=>x.status).filter(Boolean))].sort().map(x=>[x,x]);
  return '<section class="grwc-panel">'+headers('After-sales & repeat service',
   'Filter customers by order, product or delivery stage; choose recipients for delivery updates, service reminders, offers or cross-sell messages.')+
   '<div class="grwc-filters">'+
   sel('Company','grwc-service-company',app.companies.map(c=>[c,name(c)]),serviceCompany,'Both companies')+
   sel('Contact type','grwc-service-type',[['Customer','Customer'],['Lead','Lead']],serviceType,'Both')+
   sel('Source','grwc-service-source',byType(),serviceSource,'All sources')+
   sel('Tags','grwc-service-tag',rows.tags.map(t=>[t.id,t.name]),serviceTag,'All tags')+
   sel('Products','grwc-service-product',productChoices(),serviceProduct,'All products')+
   sel('Sales Order ID','grwc-service-order',orderChoices,serviceOrder,'All orders')+
   sel('Delivery status','grwc-service-delivery',statusChoices,serviceDelivery,'All delivery statuses')+
   '<label>Order / dispatch from<input id="grwc-service-from" type="date" value="'+esc(serviceStart)+'"></label>'+
   '<label>Order / dispatch to<input id="grwc-service-to" type="date" value="'+esc(serviceEnd)+'"></label>'+
   '<label>Name / mobile / order<input id="grwc-service-search" type="search" placeholder="Search customer or order" value="'+esc(serviceNeedle)+'"></label></div>'+
   '<div class="grwc-audience-summary"><b>'+matches.length+'</b> matching CRM records · <b>'+serviceSelected.size+'</b> selected. Only customers reliably linked to the chosen company may receive after-sales rules.</div>'+
   '<div class="grwc-selection-toolbar"><button type="button" data-service-all>Select all loaded matching customers</button><button type="button" data-service-clear>Clear selection</button>'+
   (can('create')?'<button type="button" data-service-bulk class="grwc-primary">Create repeat service drafts</button>':'')+
   (can('create')?'<button data-create-service>+ Individual follow-up</button>':'')+'</div>'+
   '<div class="grwc-tablewrap"><table><thead><tr><th>Select</th><th>Name</th><th>Type</th><th>Company</th><th>Mobile</th><th>Sales Order</th><th>Delivery</th></tr></thead><tbody>'+
   matches.slice(0,250).map(x=>'<tr><td><input type="checkbox" data-service-select="'+esc(x.id)+'" '+(serviceSelected.has(x.id)?'checked':'')+' '+(x.type!=='Customer'||!x.company_id?'disabled title="Link the customer to one company first"':'')+'></td><td>'+esc(x.name)+'</td><td>'+esc(x.type)+'</td><td>'+esc(name(x.company_id)||'Unassigned')+'</td><td>'+esc(x.mobile)+'</td><td>'+esc(x.orders.map(y=>y.order_id).slice(0,3).join(', ')||'—')+'</td><td>'+esc(x.orders.map(y=>y.status).slice(0,3).join(', ')||'—')+'</td></tr>').join('')+'</tbody></table></div>'+
   '<p class="grwc-muted">Showing 250 of '+matches.length+' loaded matches. Customers without a unique company assignment cannot be bulk-targeted. Saving a repeat rule does not send any WhatsApp messages. Use Product Guidance for day-specific instructions.</p></section>'+
   '<section class="grwc-panel">'+headers('Scheduled after-sales rules','Company-scoped drafts; intervals are retained as days, weeks or calendar months for future scheduling.')+
   (list.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Customer</th><th>Purpose</th><th>Template</th><th>Every</th><th>Next date</th><th>State</th></tr></thead><tbody>'+
   list.slice(0,200).map(r=>'<tr><td>'+esc(rows.customers.find(c=>c.id===r.customer_id)?.name||r.customer_id)+'</td><td>'+esc(r.service_reason||'service')+'</td><td>'+esc(rows.templates.find(t=>t.id===r.template_id)?.name||'—')+'</td><td>'+esc(r.interval_value||r.interval_days)+' '+esc(r.interval_unit||'days')+'</td><td>'+esc(date(r.next_due))+'</td><td>Draft · not sending</td></tr>').join('')+'</tbody></table></div>':empty('No after-sales follow-up rules saved yet.'))+
   '<div class="grwc-notice">Automated sending needs approved templates, WhatsApp consent, a verified provider API and a scheduled processing function. These rules are safe drafts until those requirements are met.</div></section>';
 }
 function inboundView(){
  const rules=scoped(rows.inbound);
  const lookupDigits=inboundNeedle.replace(/\D/g,'');
  const matches=inboundNeedle?targets().filter(x=>
   (lookupDigits.length>=4&&String(x.mobile||'').replace(/\D/g,'').includes(lookupDigits))||
   x.name.toLowerCase().includes(inboundNeedle.toLowerCase())):[];
  return '<section class="grwc-panel">'+headers('Incoming WhatsApp enquiries',
   'Match a WhatsApp number to an existing CRM contact and open its provider chat history. New inbound events require an authenticated SocialBerries webhook.')+
   '<div class="grwc-filters"><label>Search customer or lead by WhatsApp number / name<input id="grwc-inbound-lookup" type="search" placeholder="+91 mobile or customer name" value="'+esc(inboundNeedle)+'"></label></div>'+
   (inboundNeedle?(matches.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Contact</th><th>Record</th><th>Company</th><th>Mobile</th><th>Messages</th></tr></thead><tbody>'+
   matches.slice(0,30).map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.type)+'</td><td>'+esc(x.company_id?name(x.company_id):'Company not linked')+'</td><td>'+esc(x.mobile)+'</td><td>'+
   (app.admin&&x.company_id?'<button type="button" data-inbound-history="'+esc(x.id)+'">View SocialBerries chat</button>':'Company assignment or Admin required')+
   '</td></tr>').join('')+'</tbody></table></div>':empty('No existing CRM contact matches. A verified incoming-message event can create a new WhatsApp-source lead after duplicate checking.')):
   empty('Search by mobile number to identify an existing lead or customer.'))+
   '<div class="grwc-grid"><div class="grwc-feature"><b>Existing contact</b><p>Match mobile → customer / lead record → view provider chat. Customer 360 also has an on-demand read-only chat lookup.</p></div>'+
   '<div class="grwc-feature"><b>New WhatsApp enquiry</b><p>Signed webhook → deduplicate mobile → create a WhatsApp-source lead → assign salesperson or common queue.</p></div></div>'+
   '<div class="grwc-notice"><b>Trusted inbound gateway deployed, source connection pending.</b> Website WhatsApp OTP and new-message lead assignment can run only after the server-to-server signing secret and the corresponding website / SocialBerries relay are configured. Messages cannot be discovered merely by listing contacts.</div></section>'+
   '<section class="grwc-panel">'+headers('Incoming lead assignment rules',
    'Select company, source, tags and assigned salesperson under Settings → WhatsApp Integration. Common queue is allowed.')+
   (rules.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Company</th><th>Event</th><th>Source</th><th>Salesperson</th><th>State</th></tr></thead><tbody>'+
    rules.map(r=>'<tr><td>'+esc(name(r.company_id))+'</td><td>'+esc(r.event_type)+'</td><td>'+esc(r.source_name)+'</td><td>'+esc(rows.profiles.find(p=>p.id===r.assigned_to)?.full_name||'Common sales queue')+'</td><td>Draft · webhook not connected</td></tr>').join('')+'</tbody></table></div>':
    empty('No incoming WhatsApp assignment rules have been saved.'))+
   '<button type="button" data-open-settings>Configure incoming lead assignment</button></section>'+
   '<section class="grwc-panel">'+headers('Trusted incoming WhatsApp / website OTP event log',
     'Signed server events are deduplicated, linked to existing customers/leads or assigned to the selected salesperson. No login OTP means marketing consent.')+
   (scoped(rows.inboundEvents||[]).length?'<div class="grwc-tablewrap"><table><thead><tr><th>Received</th><th>Type</th><th>WhatsApp</th><th>Lead ID</th><th>Routing</th><th>Status</th></tr></thead><tbody>'+
    scoped(rows.inboundEvents).slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,100).map(e=>
     '<tr><td>'+esc(date(e.created_at))+'</td><td>'+esc(e.event_type)+'</td><td>'+esc(e.mobile)+'</td><td>'+esc(e.lead_id||e.customer_id||'—')+'</td><td>'+esc(e.source_name||'Waiting for active assignment rule')+'</td><td>'+esc(e.status)+'</td></tr>').join('')+
    '</tbody></table></div>':empty('No verified server events received yet. SocialBerries webhook relay / website OTP backend needs the authenticated inbound event endpoint and signing secret.'))+
   '<p class="grwc-muted">This event log does not prove Meta has delivered messages. No inbound contacts are automatically opted in to marketing campaigns.</p></section>';
 }
 function inboxView(){
  const source=scoped(rows.messages||[]).slice().sort((a,b)=>String(b.event_at||b.created_at).localeCompare(String(a.event_at||a.created_at)));
  const chats=new Map();
  for(const m of source){
   const phone=digits(m.phone),key=m.company_id+':'+phone;
   if(phone.length!==10)continue;
   const entry=chats.get(key)||{company_id:m.company_id,connection_id:m.connection_id,phone:m.phone,latest:m,events:0,inbound:0};
   entry.events++;
   if(m.direction==='inbound')entry.inbound++;
   chats.set(key,entry);
  }
  const all=targets();
  const chatsFiltered=[...chats.values()].filter(c=>{
   const contact=all.find(t=>t.company_id===c.company_id&&sameMobile(t.mobile,c.phone));
   c.contact=contact;
   return !inboxNeedle||[c.phone,contact?.name,contact?.type].some(x=>String(x||'').toLowerCase().includes(inboxNeedle));
  });
  return '<section class="grwc-panel">'+headers('WhatsApp Inbox & Conversation History',
   'CRM-saved inbound/outbound events are shown below. For more history, open the connected SocialBerries provider conversation by phone.')+
   '<div class="grwc-notice">Not all historical WhatsApp messages are currently stored in GREENRICH ONE. On-demand provider history is read-only and subject to the SocialBerries response. New-message notifications and automatic inbound lead creation require an authenticated provider webhook; this page does not claim live sync.</div>'+
   '<div class="grwc-filters"><label>Find a contact / WhatsApp number<input id="grwc-inbox-lookup" type="search" value="'+esc(inboxNeedle)+'" placeholder="Customer name or mobile"></label></div>'+
   '<div class="grwc-audience-summary"><b>'+chatsFiltered.length+'</b> conversations with local events · <b>'+source.filter(x=>x.direction==='inbound').length+'</b> recorded inbound events · <b>'+source.filter(x=>x.direction==='outbound').length+'</b> outbound events</div>'+
   (chatsFiltered.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Contact</th><th>WhatsApp mobile</th><th>Company</th><th>Last recorded event</th><th>Status</th><th>History</th></tr></thead><tbody>'+
    chatsFiltered.slice(0,250).map(c=>{
     const conn=rows.connections.find(x=>x.company_id===c.company_id&&x.provider.toLowerCase()==='socialberries');
     return '<tr><td>'+esc(c.contact?.name||'Not linked to CRM')+'</td><td>'+esc(c.phone)+'</td><td>'+esc(name(c.company_id))+'</td><td>'+esc(date(c.latest.event_at||c.latest.created_at))+
      '</td><td>'+esc(c.latest.delivery_status||'unknown')+'</td><td>'+(app.admin&&conn?
      '<button type="button" data-inbox-history="'+esc(conn.id)+'" data-inbox-phone="'+esc(c.phone)+'">Open provider chat history</button>':'Admin/provider access required')+'</td></tr>';
    }).join('')+'</tbody></table></div>':empty('No recorded WhatsApp events match this search. Use Incoming Leads to locate an existing CRM contact; historical provider events cannot be invented.'))+
   '<p class="grwc-muted">Customer consent, owner and tags remain managed in Leads & CRM / Customers. Provider chat lookup does not automatically import contacts or enable message sending.</p></section>';
 }
 function guidanceView(){
  if(!app.companies.includes(guidanceCompany))guidanceCompany=app.companies[0];
  const steps=(rows.guidance||[]).filter(x=>x.company_id===guidanceCompany&&
   (guidanceProduct==='all'||x.product_label===guidanceProduct)).sort((a,b)=>a.day_offset-b.day_offset);
  const products=[...new Set((rows.guidance||[]).filter(x=>x.company_id===guidanceCompany).map(x=>x.product_label))].sort().map(x=>[x,x]);
  const due=[];
  for(const order of rows.dispatches.filter(o=>o.company_id===guidanceCompany&&o.delivered_at)){
   for(const step of steps){
    if(String(step.product_label).trim().toLowerCase()!==String(order.product_name||'').trim().toLowerCase())continue;
    const d=new Date(order.delivered_at);if(Number.isNaN(d.getTime()))continue;
    d.setDate(d.getDate()+step.day_offset);
    due.push({order,step,due:d.toISOString().slice(0,10)});
   }
  }
  due.sort((a,b)=>a.due.localeCompare(b.due));
  return '<section class="grwc-panel">'+headers('Product-wise WhatsApp Composting Guidance',
   'Create an editable instruction plan for each product, with days counted from confirmed delivery. Guidance is saved as draft content only.')+
   '<div class="grwc-notice"><b>Draft planner — not automatically sending.</b> Order dispatch/delivery dates are in GreenRich CRM, but scheduled WhatsApp delivery still requires an approved matching service template, documented opt-in where required, and an authenticated scheduler/provider delivery integration. Message content is not auto-approved by Meta.</div>'+
   '<div class="grwc-filters">'+sel('Company','grwc-guide-company',app.companies.map(c=>[c,name(c)]),guidanceCompany,null)+
   sel('Product guide','grwc-guide-product',products,guidanceProduct,'All products')+'</div>'+
   (app.admin?'<div class="grwc-selection-toolbar"><button type="button" data-new-guide class="grwc-primary">+ Add instruction day</button></div>':'')+
   (steps.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Product</th><th>When</th><th>Instruction</th><th>Media</th><th>Approved template</th><th>State</th><th></th></tr></thead><tbody>'+
    steps.map(x=>'<tr><td>'+esc(x.product_label)+'</td><td>Delivery + '+esc(x.day_offset)+' days</td>'+
     '<td><b>'+esc(x.title)+'</b><p>'+esc(x.instructions).slice(0,350)+'</p></td><td>'+esc(x.video_url?'Link saved':'—')+'</td>'+
     '<td>'+esc(rows.templates.find(t=>t.id===x.template_id)?.name||'Not linked')+'</td><td>Draft — not sent</td><td>'+
     (app.admin?'<button type="button" data-guide-edit="'+esc(x.id)+'">Edit</button>':'')+'</td></tr>').join('')+'</tbody></table></div>':
    empty('No product guidance steps saved. Add instructions for installation, adding waste, microbes, bin switching and manure harvesting at the day offsets appropriate for each product.'))+
   '<p class="grwc-muted">Suggested planning checkpoints to customize (not automatic composting claims): delivery day, day 1, 10, 15, 20, 30, 33, 45, 60. Delivery + N is a draft scheduling rule; use actual product guidance and approved templates before activation.</p></section>'+
   '<section class="grwc-panel">'+headers('Guidance schedule preview from delivered orders',
    'Preview dates calculated from real GreenRich dispatch delivered timestamps. These are not WhatsApp sends or scheduled jobs.')+
   (due.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Instruction</th><th>Due date</th><th>State</th></tr></thead><tbody>'+
    due.slice(0,100).map(x=>'<tr><td>'+esc(x.order.order_id)+'</td><td>'+esc(x.order.customer_name||'—')+'</td>'+
     '<td>'+esc(x.order.product_name)+'</td><td>'+esc(x.step.title)+'</td><td>'+esc(x.due)+'</td><td>Draft, not sent</td></tr>').join('')+
    '</tbody></table></div>':empty('No matching delivered orders and guidance steps. Confirm that guidance product name exactly matches the dispatch product name, and that a delivery date is recorded.'))+
   '</section>';
 }
 function guidanceDialog(id=''){
  if(!app.admin)return alert('Admin permission required to manage product guidance.','warning');
  const old=(rows.guidance||[]).find(x=>x.id===id);
  const company=old?.company_id||guidanceCompany;
  const templatesFor=rows.templates.filter(x=>x.company_id===company&&['marketing','utility'].includes(x.category)&&x.provider_approval==='approved'&&['verified_provider','admin_confirmed'].includes(x.provider_source)&&Array.isArray(x.provider_preview?.components));
  const productOptions=[...new Set([...rows.products.map(x=>x.name),...rows.dispatches.map(x=>x.product_name)].filter(Boolean))];
  const body='<div class="grwc-notice grwc-span">Save editable product instructions only. No WhatsApp message or timer is activated by this action.</div>'+
   '<div class="grwc-feature grwc-span"><b>Company:</b> '+esc(name(company))+'</div>'+
   '<label>Product name<input name="product_label" list="grwc-guidance-products" required maxlength="120" value="'+esc(old?.product_label||'')+'" placeholder="e.g. MyGreenBin 25 L PP"></label>'+
   '<datalist id="grwc-guidance-products">'+productOptions.map(x=>'<option value="'+esc(x)+'"></option>').join('')+'</datalist>'+
   input('Days after confirmed delivery','day_offset',String(old?.day_offset??0),'number')+
   input('Instruction title','title',old?.title||'')+
   note('Instruction message / steps','instructions',old?.instructions||'')+
   input('Installation or instruction video HTTPS URL (optional)','video_url',old?.video_url||'')+
   field('Approved provider template (optional until ready)','template_id',options(templatesFor.map(t=>[t.id,t.name+' · '+t.language]),'Not assigned yet'))+
   '<p class="grwc-muted grwc-span">Video links are stored for reference. WhatsApp media sending requires a compatible approved template and provider integration. Set dates/product instructions according to your actual bin guidance.</p>';
  const d=dialog(old?'Edit product instruction':'Add product instruction',body,async fd=>{
   const v=Object.fromEntries(fd),day=Number(v.day_offset);
   if(!Number.isInteger(day)||day<0||day>365)throw Error('Day offset must be between 0 and 365');
   if(String(v.product_label||'').trim().length<2||String(v.title||'').trim().length<2||
      String(v.instructions||'').trim().length<5)throw Error('Product, instruction title and message are required');
   const url=String(v.video_url||'').trim();
   if(url){try{const u=new URL(url);if(u.protocol!=='https:')throw Error()}catch{throw Error('Use a valid HTTPS video URL or leave blank')}}
   const templateId=String(v.template_id||'');
   if(templateId&&!templatesFor.some(t=>t.id===templateId))throw Error('Selected template is unavailable for this company');
   const payload={company_id:company,product_label:String(v.product_label).trim(),day_offset:day,
    title:String(v.title).trim(),instructions:String(v.instructions).trim(),video_url:url,
    template_id:templateId||null,status:'draft'};
   const q=old?await app.db.from('gr_wa_guidance_steps').update(payload).eq('id',old.id).eq('company_id',company):
    await app.db.from('gr_wa_guidance_steps').insert(payload);
   if(q.error)throw Error(q.error.message);
   await fetchAll();marketingDraw();
  },old?'Save instruction':'Save instruction draft','Product instruction saved as a draft. No message sent.');
  if(old){const field=d.querySelector('[name=template_id]');if(field)field.value=old.template_id||''}
 }
 function marketingDraw(){
  if(!root?.isConnected)return;
  const previous=root.querySelector('#grwc-audience-form');
  const remembered=previous?{
   connection:previous.elements.connection_id?.value||'',
   template:previous.elements.template_id?.value||''
  }:null;
  if(current!=='inbox')window.GreenRichInbox?.unmount();
  root.innerHTML='<div class="grwc">'+header()+(current==='audience'?audienceView():current==='reports'?campaignReports():current==='inbox'?'<div id="grwx-inbox-host"></div>':current==='welcome'?welcomeView():current==='recurring'?recurringView():current==='guidance'?guidanceView():inboundView())+'</div>';
  if(current==='inbox')window.GreenRichInbox?.mount(root.querySelector('#grwx-inbox-host'),{
   app,admin:app.admin,companies:app.companies,companyName:name,getRows:()=>rows,getTargets:targets,
   refresh:async()=>{await fetchAll()},notify:alert,
   openTemplateFor:person=>{
    const target=targets().find(x=>x.id===person.id);
    if(!target||!target.company_id||!app.companies.includes(target.company_id))
     return alert('This contact needs a matching CRM company assignment before preparing a WhatsApp template.','warning');
    scope=target.company_id;selected=new Set([target.id]);current='audience';window.GreenRichInbox?.unmount();marketingDraw();
    alert('Customer selected for a one-recipient campaign draft. Choose your approved template and review before sending.','info');
   }
  });
  const form=root.querySelector('#grwc-audience-form');
  if(form&&remembered){
   const prov=form.elements.connection_id;
   if(Array.from(prov.options).some(o=>o.value===remembered.connection)){
    prov.value=remembered.connection;
    updateCampaignTemplateSelect(form,remembered.template);
   }
   // Campaign name is created automatically.
  }
  if(form){
   if(!remembered)updateCampaignTemplateSelect(form);
   drawTemplateRequirements(form);
  }
 }
 const input=(label,key,value='',type='text')=>'<label>'+esc(label)+'<input name="'+esc(key)+'" type="'+type+'" value="'+esc(value)+'"></label>';
 const note=(label,key,v='')=>'<label class="grwc-span">'+esc(label)+'<textarea name="'+esc(key)+'" rows="3">'+esc(v)+'</textarea></label>';
 const field=(label,key,opts,required=false)=>'<label>'+esc(label)+'<select name="'+esc(key)+'" '+(required?'required':'')+'>'+opts+'</select></label>';
 function dialog(title,body,submit,buttonLabel='Save draft',successText='Saved successfully'){
  const d=document.createElement('dialog');d.className='grwc-dialog';d.innerHTML='<form><div class="grwc-dialog-head"><h3>'+esc(title)+'</h3><button type="button" data-dismiss>×</button></div><div class="grwc-dialog-fields">'+body+'</div><p role="alert" data-dialog-error hidden style="margin:12px 20px;padding:12px;border:1px solid #c53030;border-radius:8px;color:#9b1c1c;background:#fff1f1;white-space:pre-wrap"></p><div class="grwc-dialog-foot"><button type="button" data-dismiss>Cancel</button><button type="submit" class="grwc-primary">'+esc(buttonLabel)+'</button></div></form>';
  document.body.append(d);d.querySelectorAll('[data-dismiss]').forEach(b=>b.onclick=()=>d.close());
  d.onclose=()=>d.remove();
  const form=d.querySelector('form'),errorBox=d.querySelector('[data-dialog-error]');
  const showError=message=>{errorBox.textContent=message;errorBox.hidden=false;errorBox.scrollIntoView({block:'nearest',behavior:'auto'});};
  // Native required-field validation otherwise blocks submit with no visible CRM feedback.
  form.addEventListener('invalid',e=>{showError('Please complete the required field: '+(e.target.closest('label')?.textContent?.trim()||e.target.name||'required field'));},{capture:true});
  form.addEventListener('input',()=>{errorBox.hidden=true;});
  form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('[type=submit]'),original=b.textContent;
    b.disabled=true;b.textContent='Saving and checking approved template…';errorBox.hidden=true;
    try{await submit(new FormData(form));d.close();alert(successText,'success');await fetchAll();if(root?.isConnected)marketingDraw()}
    catch(error){showError('Template was not synced. '+(error instanceof Error?error.message:String(error))+'. Correct the fields above and try again. No WhatsApp message was sent.')}
    finally{b.disabled=false;b.textContent=original}
  };
  d.showModal();return d;
 }
 async function save(table,payload){
  const r=await app.db.from(table).insert(payload).select('id').single();
  if(r.error)throw Error(r.error.message);return r.data;
 }
 function serviceDialog({customer=null,companyId=null}={}){
  const c=companyId||cd(),customers=customer?[customer]:rows.customers;
  const customerOpts=customers.filter(x=>!!x.id).map(x=>[x.id,x.name]);
  if(!customerOpts.length)return alert('No customer available to configure.','warning');
  const f='<p class="grwc-notice grwc-span">Draft only — no WhatsApp delivery until the provider is connected and customer opt-in is confirmed.</p>'+
   companyFieldWith(c)+field('Customer','customer_id',options(customerOpts,'Choose customer'),true)+
   field('WhatsApp provider','connection_id',options(rows.connections.filter(x=>x.company_id===c).map(x=>[x.id,x.display_name]),'Choose provider'),true)+
   field('Existing provider template','template_id',options(templateOptions(c),'Choose template'),true)+
   input('Repeat every (number)','interval_value','7','number')+
   field('Interval unit','interval_unit',options([['days','Days'],['weeks','Weeks'],['months','Calendar months']],'Select unit'),true)+
   field('Message purpose','service_reason',options([['service','Service reminder'],['delivery','Delivery update'],['reminder','Follow-up reminder'],['offer','Offer'],['cross_sell','Related product promotion']],'Select purpose'),true)+
   input('First follow-up date','next_due',new Date().toISOString().slice(0,10),'date')+note('Service notes','notes');
  dialog('Recurring WhatsApp service follow-up',f,async fd=>{
   const x=Object.fromEntries(fd),count=Number(x.interval_value),unit=x.interval_unit;
   if(!x.customer_id||!x.connection_id||!x.template_id||!Number.isInteger(count)||count<1||count>365||!['days','weeks','months'].includes(unit))throw Error('Choose customer, provider, template and a valid 1–365 interval.');
   const t=rows.templates.find(t=>t.id===x.template_id),link=rows.connections.find(p=>p.id===x.connection_id);
   if(!t||!link||t.company_id!==x.company_id||link.company_id!==x.company_id||t.connection_id!==link.id)throw Error('Provider/template must belong to chosen company.');
   x.interval_days=Math.min(365,count*(unit==='weeks'?7:unit==='months'?30:1));x.interval_value=count;x.interval_unit=unit;x.status='draft';
   await save('gr_wa_recurring_rules',x);
  });
 }
 function bulkServiceDialog(){
  const members=serviceTargets().filter(x=>serviceSelected.has(x.id)&&x.type==='Customer'&&x.company_id);
  if(!members.length)return alert('Select linked customer records in one company first.','warning');
  const c=serviceCompany;
  if(c==='all'||members.some(x=>x.company_id!==c))
   return alert('Choose a single company before scheduling after-sales follow-ups.','warning');
  if(members.length>250)return alert('Please filter to 250 or fewer customers per batch to prevent accidental bulk scheduling.','warning');
  const links=rows.connections.filter(x=>x.company_id===c);
  if(!links.length)return alert('Configure WhatsApp provider for this company first.','warning');
  const form='<div class="grwc-notice grwc-span"><b>'+members.length+' selected customers.</b> These are draft service rules. No messages will be sent until approved integration and consent checks are enabled.</div>'+
   '<div class="grwc-feature grwc-span"><b>Company:</b> '+esc(name(c))+'</div>'+
   field('WhatsApp tool','connection_id',options(links.map(x=>[x.id,x.display_name]),'Choose provider'),true)+
   field('Existing template','template_id',options(templateOptions(c),'Choose template'),true)+
   field('Purpose','service_reason',options([['delivery','Delivery notification'],['reminder','Reminder'],['offer','Offer'],['cross_sell','Related product promotion'],['service','General service follow-up']],'Select purpose'),true)+
   input('Repeat every','interval_value','1','number')+
   field('Interval unit','interval_unit',options([['days','Days'],['weeks','Weeks'],['months','Calendar months']],'Choose time unit'),true)+
   input('First follow-up date','next_due',new Date().toISOString().slice(0,10),'date')+
   note('Notes / instructions','notes');
  dialog('After-sales repeat service · '+members.length+' customers',form,async fd=>{
   if(!can('create'))throw Error('Marketing create permission required');
   const conn=String(fd.get('connection_id')||''),template=String(fd.get('template_id')||'');
   const unit=String(fd.get('interval_unit')||''),num=Number(fd.get('interval_value'));
   if(!Number.isInteger(num)||num<1||num>365||!['days','weeks','months'].includes(unit))throw Error('Enter 1–365 days, weeks or months');
   const t=rows.templates.find(t=>t.id===template&&t.company_id===c&&t.connection_id===conn);
   if(!t)throw Error('Select a matching SocialBerries provider/template');
   const interval=Math.min(365,num*(unit==='weeks'?7:unit==='months'?30:1));
   const existing=new Set(rows.recurring.filter(r=>r.company_id===c&&r.connection_id===conn&&r.template_id===template)
     .map(r=>r.customer_id));
   const list=members.filter(m=>!existing.has(m.customer_id));
   if(!list.length)throw Error('All selected customers already have this provider/template rule');
   const data=list.map(m=>({
    company_id:c,customer_id:m.customer_id,connection_id:conn,template_id:template,
    interval_days:interval,interval_value:num,interval_unit:unit,
    service_reason:String(fd.get('service_reason')||'service'),
    next_due:String(fd.get('next_due')||new Date().toISOString().slice(0,10)),
    notes:String(fd.get('notes')||'').slice(0,2000),status:'draft'
   }));
   const r=await app.db.from('gr_wa_recurring_rules').insert(data);
   if(r.error)throw Error(r.error.message);
   alert(data.length+' after-sales draft rules saved; '+(members.length-data.length)+' duplicate rules skipped. No messages sent.','success');
   serviceSelected.clear();
  });
 }
 const companyFieldWith=(id)=>'<label>Company<select name="company_id">'+app.companies.map(c=>'<option value="'+c+'" '+(c===id?'selected':'')+'>'+name(c)+'</option>').join('')+'</select></label>';
 function settingsDraw(container){
  if(!container?.isConnected)return;
  // Settings owns its own company selector. "Both Companies" in the workspace
  // is not a valid provider record: always work with one explicitly shown company.
  let c=scope==='all'?(app.companies.includes('grow-india')?'grow-india':app.companies[0]):scope;
  const providers=rows.connections.filter(p=>p.company_id===c),templ=rows.templates.filter(t=>t.company_id===c),sheetRows=rows.sheets.filter(s=>s.company_id===c),opted=rows.consents.filter(w=>w.company_id===c&&w.consent_status==='opted_in'&&w.consent_source&&w.consent_at&&!w.opt_out_at).length,approved=templ.filter(validMarketingTemplate).length;
  container.innerHTML='<div class="grwc">'+
   '<div class="grwc-hero"><div><small>SETTINGS / WHATSAPP</small><h2>WhatsApp Accounts</h2><p>Connected accounts, manual approved-template sync and lead-assignment rules. Technical setup is optional.</p></div><span class="grwc-chip">Admin only</span></div>'+
   '<div class="grwc-notice"><b>WhatsApp Marketing setup:</b> '+opted+' recorded opt-in(s) · '+approved+' confirmed MARKETING template(s) for '+esc(name(c))+'. Complete these one-time setup steps below. Marketing stays a simple Send Campaign page. API credentials stay in Supabase Secrets.</div>'+
   sel('Company','grwc-settings-company',app.companies.map(c=>[c,name(c)]),c,null)+
   '<section class="grwc-panel">'+headers('1 · WhatsApp accounts','Manage an existing account or prepare a second business number.')+
   '<div class="grwc-grid">'+[1,2].map(slot=>{
    const p=providers.find(p=>p.slot===slot),label=p?.display_name||(slot===1?'SocialBerries':'Second provider');
    return '<div class="grwc-feature"><b>'+(slot===1?'Primary account':'Additional account')+': '+esc(label)+'</b><p>Sender: '+esc(p?.sender_phone||'Not connected')+'</p><p>Status: '+esc(p?.setup_state==='verified'&&p?.enabled?'Connected and enabled':'Setup required')+'</p>'+
      '<button type="button" data-edit-provider="'+slot+'">'+(p?'View / manage details':'Connect another WhatsApp account')+'</button> '+
      (p&&p.provider.toLowerCase()==='socialberries'?'<button type="button" data-diagnose-provider="'+esc(p.id)+'">Check Sending Setup</button> <button type="button" data-verify-provider="'+esc(p.id)+'">Verify & Enable Provider</button> <button type="button" data-test-provider="'+esc(p.id)+'">Test Connection (read-only)</button> <button type="button" data-batches-provider="'+esc(p.id)+'">Read Campaign Status</button> <button type="button" data-messages-provider="'+esc(p.id)+'">View Message History</button>':'')+
      '</div>';
   }).join('')+'</div>'+
   '<div class="grwc-steps"><b>Connection instructions — SocialBerries</b><ol>'+
   '<li>SocialBerries → Developers → Add New Key → Name <b>GreenRich ONE CRM</b>. Choose an expiry and save the credential securely. For Allowed IPs, do not guess a Supabase IP; ask SocialBerries whether blank is permitted or a static egress IP is required.</li>'+
   '<li>The API specification says <code>Authorization: Basic base64(username:password)</code>. Confirm with SocialBerries whether Developer API keys replace this password or use a separate authentication method.</li>'+
   '<li>Supabase → Edge Functions → Secrets: enter server-side <b>BASE_URL</b>, <b>BASIC_USERNAME</b>, <b>BASIC_PASSWORD</b> for this company/provider. Use an HTTPS API host, not the documentation URL. Set API_VERSION (default v1). Never enter credentials in CRM or GitHub.</li>'+
   '<li>Environment variable prefix for tool 1: <code>'+esc(c==='grow-india'?'SB_GROW_INDIA_SLOT1':'SB_ENVIRO_SOLUTIONS_SLOT1')+'</code> (tool 2 uses SLOT2). Example: <code>..._BASE_URL</code>.</li>'+
   '<li>Press <b>Test Connection</b> after configuration. It calls only <code>GET /api/v1/users/?page=1</code>. No WhatsApp message is sent.</li>'+
   '<li>After a successful read-only test, use <b>Verify &amp; Enable Provider</b>. This verifies the saved company sender connection without sending a message. You must separately verify your exact approved MARKETING template.</li>'+
   '<li><b>Bulk API documentation:</b> <code>POST /api/v1/whatsapp/messages/bulk/</code> requires multipart form fields and an uploaded CSV when using the file audience. The current CRM campaign sender uses the separate individual-message endpoint. Do not use the bulk code example as proof that an individual message succeeded. A bulk response with <code>status: pending</code> means queued, not delivered.</li>'+
   '<li>Existing templates: import their full provider-approved JSON until SocialBerries supplies a Get Templates endpoint. A guarded campaign-sending function is deployed but remains blocked without credentials, approved template details, marketing opt-in and server activation. Inbound webhooks are not active.</li>'+
   '</ol></div></section>'+
   '<section class="grwc-panel">'+headers('2 · Approved templates','Manual sync existing Meta-approved templates once, then use them in Marketing. Automatic Meta API import is optional.')+
   '<p class="grwc-muted">'+templ.length+' saved template reference(s). Use Manual Sync to save exact approved text, media type and buttons. No repeat approval is necessary.</p>'+
   '<button type="button" data-import-provider-template>Manual Sync Approved Template</button> '+
   '<button type="button" data-sync-approved-templates>Optional: Sync via Meta API</button> '+
   '<p class="grwc-muted">Manual sync is the primary setup: enter exact approved header, body and buttons in a guided form, or paste full JSON if available. Automatic Meta sync is optional. No Meta resubmission.</p>'+
   '<details class="grwc-span"><summary>Advanced · Template recovery tools</summary><p class="grwc-muted">Link metadata only if you do not have the approved template JSON.</p>'+
   '<button type="button" data-import-template-metadata>Link existing template by ID</button></details>'+
   (templ.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Template</th><th>ID</th><th>Category</th><th>Provider</th><th>Language</th><th>CRM status</th></tr></thead><tbody>'+templ.map(t=>'<tr><td>'+esc(t.name)+'</td><td>'+esc(t.provider_template_id||'—')+'</td><td>'+esc(t.category)+'</td><td>'+esc(connectionLabel(t.connection_id))+'</td><td>'+esc(t.language)+'</td><td>'+esc(validMarketingTemplate(t)?(t.provider_source==='verified_provider'?'Send-ready · Meta synced':'Send-ready · Admin confirmed'):t.provider_approval!=='approved'?'Not verified · manual sync required':t.body&&Array.isArray(t.provider_preview?.components)?'Incomplete approved template':'Missing approved components · manual sync required')+'</td></tr>').join('')+'</tbody></table></div>':empty('No templates loaded yet. Connect the company Meta WABA once, then Sync Approved Templates.'))+'</section>'+
   '<section class="grwc-panel">'+headers('Marketing readiness — one-time setup','Complete only when actual customer permission and approved Meta template details are available.')+
    '<div class="grwc-grid"><div class="grwc-feature"><b>Customer marketing permission</b><p>'+opted+' recorded opt-in(s) for '+esc(name(c))+'.</p><button type="button" data-settings-optin>Record genuine opt-in</button></div>'+
    '<div class="grwc-feature"><b>Approved Meta template</b><p>'+approved+' confirmed approved marketing template(s).</p><button type="button" data-sync-approved-templates>Refresh approved templates</button></div></div>'+
    '<p class="grwc-muted">CRM contacts, WhatsApp replies and website OTP logins are not automatically opted in to marketing. Record genuine permission for the appropriate company before sending campaigns.</p></section>'+
   '<section class="grwc-panel">'+headers('3 · SocialBerries Leads → GreenRich ONE','Sync provider leads into a secure review list, then import individual new leads into CRM. Existing leads and customers are checked for duplicate mobile numbers.')+
   '<div class="grwc-notice">Read-only SocialBerries API fetch. Synchronizing does not send WhatsApp messages and does not create GreenRich leads until an Admin reviews and imports each record.</div>'+
   '<div class="grwc-grid">'+providers.filter(p=>p.provider.toLowerCase()==='socialberries').map(p=>
     '<div class="grwc-feature"><b>'+esc(p.display_name)+'</b><p>Company: '+esc(name(p.company_id))+' · Tool '+p.slot+'</p>'+
     '<button type="button" data-sync-provider-leads="'+esc(p.id)+'">Sync SocialBerries Leads (up to 20 pages)</button></div>').join('')+'</div>'+
   (rows.providerLeads.filter(l=>l.company_id===c).length?'<div class="grwc-tablewrap"><table><thead><tr><th>Contact</th><th>Mobile</th><th>Source</th><th>Provider status</th><th>CRM</th><th>Action</th></tr></thead><tbody>'+
   rows.providerLeads.filter(l=>l.company_id===c).slice(0,250).map(l=>
    '<tr><td>'+esc(l.name||'Unnamed')+'<small> '+esc(l.email||'')+'</small></td><td>'+esc(l.mobile)+'</td><td>'+esc(l.source)+'</td><td>'+esc(l.provider_status)+'</td><td>'+esc(l.imported_lead_id?'Imported':'Needs review')+'</td><td>'+
    (l.imported_lead_id?'—':'<button type="button" data-import-provider-lead="'+esc(l.id)+'">Review & import</button>')+'</td></tr>').join('')+
    '</tbody></table></div>':empty('No staged SocialBerries leads yet. Configure the connection, then click Sync Leads.'))+
   '<p class="grwc-muted">The documented Get Leads API includes unusually required client fields in the GET request body. If its endpoint rejects page-only GET, ask SocialBerries for the correct GET request format; no records will be guessed or imported.</p></section>'+
   '<section class="grwc-panel">'+headers('4 · Incoming lead & website WhatsApp OTP assignment','Choose the employee and CRM tag for each event source. Activation only processes signed server events; no marketing opt-in is inferred.', '<button type="button" data-new-inbound>+ Assignment rule</button>')+
   (rows.inbound.filter(r=>r.company_id===c).length?rows.inbound.filter(r=>r.company_id===c).map(r=>'<div class="grwc-feature"><b>'+esc(r.event_type)+'</b><p>Source: '+esc(r.source_name)+' · Person: '+esc(rows.profiles.find(p=>p.id===r.assigned_to)?.full_name||'Common queue')+'</p><small>'+esc(r.status==='active'?'Active rule — signed source required':'Draft / paused')+'</small> <button type="button" data-inbound-rule-status="'+esc(r.id)+'" data-next-status="'+(r.status==='active'?'paused':'active')+'">'+(r.status==='active'?'Pause':'Activate')+'</button></div>').join(''):empty('No incoming lead assignment rules have been saved.'))+'</section>'+
   '<section class="grwc-panel">'+headers('5 · Google Sheet default welcome templates','Each Sheet already has a salesperson. Choose which template belongs to newly imported leads; leave blank for no welcome.')+
   (sheetRows.length?sheetRows.map(sh=>'<div class="grwc-sheet"><div><b>'+esc(sh.tab_name)+'</b><small>'+esc(sh.source_name)+' · '+esc(rows.profiles.find(p=>p.id===sh.assigned_to)?.full_name||'Common queue')+'</small></div><select data-sheet-template="'+esc(sh.id)+'">'+options(templateOptions(c))+'</select><button type="button" data-save-sheet="'+esc(sh.id)+'">Save</button></div>').join(''):empty('No connected Sheets for this company. Configure them under Settings → Google Sheet Leads.'))+'</section>'+
   '<section class="grwc-panel">'+headers('6 · Security & sending status','API credentials belong exclusively in secure server-side secrets. Verify opt-in before any campaign.')+
   '<div class="grwc-grid"><div class="grwc-feature"><b>API connectivity & history</b><p>Read-only GET users, campaign batches and phone-specific WhatsApp messages. No messages sent.</p></div><div class="grwc-feature"><b>Template sending / bulk</b><p>Endpoints documented; production dispatch intentionally disabled until approved-template checks and consent mapping.</p></div><div class="grwc-feature"><b>Webhook lead capture</b><p>No authenticated webhook signature/payload specification supplied yet.</p></div><div class="grwc-feature"><b>Repeat follow-ups</b><p>Draft-only until provider and opt-in verification.</p></div></div></section></div>';
  // Keep active account, template sync and lead routing visible. The rest is still
  // accessible under one Advanced panel instead of overwhelming daily operators.
  const panels=[...container.querySelectorAll('.grwc > .grwc-panel')];
  if(panels.length>=7){
   const providerHelp=panels[0].querySelector('.grwc-steps');
   const extra=document.createElement('details');
   extra.className='grwc-panel';extra.setAttribute('data-advanced-whatsapp','');
   extra.innerHTML='<summary><b>Advanced tools, API diagnostics & documentation</b></summary>'+
    '<p class="grwc-muted">Only use these settings for troubleshooting or connecting integrations. Current WhatsApp API credentials are stored securely in Supabase.</p>'+
    '<p><a target="_blank" rel="noopener noreferrer" href="https://app.apidog.com/web/project/1359210/apis/api-41806354-run">SocialBerries bulk messaging API documentation</a></p>';
   if(providerHelp)extra.append(providerHelp);
   [panels[2],panels[3],panels[5],panels[6]].forEach(x=>{if(x)extra.append(x)});
   container.querySelector('.grwc').append(extra);
  }
  container.querySelectorAll('[data-sheet-template]').forEach(x=>{const sh=sheetRows.find(r=>r.id===x.dataset.sheetTemplate);x.value=sh?.welcome_template_id||''});
  container.querySelector('#grwc-settings-company').onchange=e=>{scope=e.target.value;settingsDraw(container)};
  container.onclick=async e=>{
   const edit=e.target.closest('[data-edit-provider]'),add=e.target.closest('[data-new-inbound]'),sheet=e.target.closest('[data-save-sheet]');
   const verifyProvider=e.target.closest('[data-verify-provider]');
   if(verifyProvider)return await enableVerifiedProvider(verifyProvider.dataset.verifyProvider,container);
   const diagnose=e.target.closest('[data-diagnose-provider]');
   if(diagnose)return await diagnoseProvider(diagnose.dataset.diagnoseProvider);
   const check=e.target.closest('[data-test-provider]'),batches=e.target.closest('[data-batches-provider]'),messages=e.target.closest('[data-messages-provider]');
   if(check)return await checkProvider(check.dataset.testProvider,'test');
   if(batches)return await checkProvider(batches.dataset.batchesProvider,'batches');
   if(messages)return openMessageHistory(messages.dataset.messagesProvider);
   const sync=e.target.closest('[data-sync-provider-leads]'),importLead=e.target.closest('[data-import-provider-lead]');
   if(sync)return await syncProviderLeads(sync.dataset.syncProviderLeads,container);
   if(importLead)return importStagedLead(importLead.dataset.importProviderLead,container);
   if(e.target.closest('[data-sync-approved-templates]'))return await syncApprovedTemplates(c,container);
   const verify=e.target.closest('[data-verify-meta-template]');if(verify)return verifyMetaTemplate(c,verify.dataset.verifyMetaTemplate,container);
   if(e.target.closest('[data-settings-optin]'))return settingsConsent(c,container);
   if(e.target.closest('[data-settings-confirm-template]'))return settingsTemplateApproval(c,container);
   if(e.target.closest('[data-import-template-metadata]'))return importTemplateMetadata(c,container);
   if(e.target.closest('[data-import-provider-template]'))return importProviderTemplate(c,container);
   const ruleButton=e.target.closest('[data-inbound-rule-status]');
   if(ruleButton){
    const r=rows.inbound.find(x=>x.id===ruleButton.dataset.inboundRuleStatus&&x.company_id===c);
    const next=ruleButton.dataset.nextStatus;
    if(!app.admin||!r||!['active','paused'].includes(next))return alert('Invalid company assignment rule','error');
    try{
     const saved=await app.db.from('gr_wa_inbound_rules').update({status:next}).eq('id',r.id).eq('company_id',c);
     if(saved.error)throw Error(saved.error.message);
     await fetchAll();settingsDraw(container);
     alert(next==='active'?'Assignment rule activated for trusted signed events. Connect your website/backend webhook source to receive leads.':'Assignment rule paused.','success');
    }catch(error){alert(error.message,'error')}
    return;
   }
   if(edit)return editProvider(c,Number(edit.dataset.editProvider),container);
   if(add)return inboundDialog(c,container);
   if(sheet){
    const id=sheet.dataset.saveSheet,value=container.querySelector('[data-sheet-template="'+id+'"]')?.value||null;
    try{const r=await app.db.rpc('gr_wa_set_sheet_welcome',{p_sheet:id,p_template:value});if(r.error)throw r.error;alert('Sheet welcome preference saved. Blank = no template.','success');await fetchAll();settingsDraw(container)}catch(err){alert(err.message,'error')}
   }
  };
 }
 function openMessageHistory(connectionId,initialPhone=''){
  const provider=rows.connections.find(x=>x.id===connectionId&&x.provider.toLowerCase()==='socialberries');
  if(!provider)return alert('SocialBerries connection not found.','warning');
  const d=document.createElement('dialog');d.className='grwc-dialog';
  d.innerHTML='<div class="grwc-dialog-head"><h3>SocialBerries Message History</h3><button type="button" data-close>×</button></div>'+
   '<form class="grwc-dialog-fields" id="grwc-history-form">'+
   '<p class="grwc-notice grwc-span">Read-only provider lookup for a specific WhatsApp number. Available to company administrators. Messages are not saved into CRM. API credentials must be configured in Supabase Secrets.</p>'+
   '<label class="grwc-span">Customer / Lead WhatsApp mobile<input name="phone" type="tel" inputmode="tel" required autocomplete="off" placeholder="+91 98765 43210"></label>'+
   '<button type="submit" class="grwc-primary">Find messages</button></form>'+
   '<div class="grwc-dialog-fields" id="grwc-history-results" aria-live="polite"></div>'+
   '<div class="grwc-dialog-foot"><button type="button" data-previous disabled>Previous</button><button type="button" data-next disabled>Next</button><button type="button" data-close>Close</button></div>';
  document.body.append(d);
  d.onclose=()=>d.remove();
  d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>d.close());
  const results=d.querySelector('#grwc-history-results'),form=d.querySelector('#grwc-history-form');
  if(initialPhone)form.elements.phone.value=initialPhone;
  const prev=d.querySelector('[data-previous]'),next=d.querySelector('[data-next]');
  let page=1,lastNumber='',loading=false;
  async function loadHistory(targetPage){
   if(loading)return;
   const raw=String(form.elements.phone.value||'').trim();
   const digits=raw.replace(/[\s()+-]/g,'');
   const normalized=/^[6-9]\d{9}$/.test(digits)?'91'+digits:digits;
   if(!/^91[6-9]\d{9}$/.test(normalized)){
    results.innerHTML='<p class="grwc-muted">Enter a valid 10-digit Indian mobile number (or +91XXXXXXXXXX).</p>';
    return;
   }
   loading=true;results.innerHTML='<p class="grwc-muted">Checking SocialBerries messages…</p>';
   prev.disabled=true;next.disabled=true;
   try{
    const res=await app.db.functions.invoke('greenrich-socialberries',{
     body:{connection_id:connectionId,action:'messages',phone_number:normalized,page:targetPage}
    });
    if(res.error)throw Error(res.error.message||'Could not access secure provider API');
    const data=res.data||{};
    if(!data.ok){
     const missing=Array.isArray(data.missing)?' Missing server secrets: '+data.missing.join(', '):'';
     throw Error((data.message||data.error||'Message lookup failed')+missing);
    }
    page=targetPage;lastNumber=normalized;
    const list=Array.isArray(data.messages)?data.messages:[];
    results.innerHTML='<p class="grwc-muted grwc-span">Showing page '+esc(page)+' of message history for '+esc(lastNumber)+'. Only the latest 15 items per page are requested.</p>'+
     (!data.shape_known?'<p class="grwc-notice grwc-span">SocialBerries returned a different message list format. The provider response schema was not included in the supplied API docs. Nothing is displayed until it can be mapped safely.</p>':
      list.length?'<div class="grwc-tablewrap grwc-span"><table><thead><tr><th>Date</th><th>Direction</th><th>Type</th><th>Status</th><th>Text</th></tr></thead><tbody>'+
      list.map(m=>'<tr><td>'+esc(m.event_at)+'</td><td>'+esc(m.direction)+'</td><td>'+esc(m.type)+'</td><td>'+esc(m.status)+'</td><td>'+esc(m.text||'—')+'</td></tr>').join('')+'</tbody></table></div>':
      '<p class="grwc-muted grwc-span">No messages in this page for this number.</p>');
    prev.disabled=page<=1;
    next.disabled=!data.shape_known||list.length<15||(data.count!==null&&page*15>=data.count);
   }catch(err){
    results.innerHTML='<p class="grwc-notice grwc-span">Could not load message history: '+esc(err.message)+'</p>';
   }finally{loading=false}
  }
  form.onsubmit=e=>{e.preventDefault();void loadHistory(1)};
  prev.onclick=()=>{if(!prev.disabled)void loadHistory(page-1)};
  next.onclick=()=>{if(!next.disabled)void loadHistory(page+1)};
  d.showModal();
 }
 async function openCustomerHistory({customer,companyId}={}){
  if(!app?.admin)return alert('Company administrator access required for provider chat history.','warning');
  if(!customer?.mobile&&!customer?.mobile2)return alert('Customer WhatsApp number is missing.','warning');
  if(!app?.db)return alert('Sign in to GreenRich ONE first.','warning');
  const links=rows.connections?.filter(x=>x.company_id===companyId&&x.provider.toLowerCase()==='socialberries')||[];
  let connection=links[0];
  if(!connection){
   if(!companyId||!app.companies.includes(companyId))
    return alert('Choose the customer company before viewing WhatsApp messages.','warning');
   const r=await app.db.from('gr_wa_connections').select('id,company_id,provider,display_name')
     .eq('company_id',companyId).eq('provider','socialberries').limit(1).maybeSingle();
   if(r.error||!r.data)return alert('No configured SocialBerries provider for this company.','warning');
   connection=r.data;rows.connections=[...(rows.connections||[]),connection];
  }
  openMessageHistory(connection.id,customer.mobile||customer.mobile2);
 }
 async function enableVerifiedProvider(id,container){
  const record=rows.connections.find(x=>x.id===id&&app.companies.includes(x.company_id));
  if(!record)return alert('Save the SocialBerries provider details first.','warning');
  if(!window.confirm('Check SocialBerries API authentication and mark this company sender as verified? This does NOT send any WhatsApp messages or approve templates.'))return;
  try{
   const result=await secureSend('verify_provider_connection',{connection_id:id});
   if(!result.provider_verified)throw Error(result.message||'Provider verification was not confirmed');
   alert('SocialBerries API authenticated and provider enabled. Meta-approved marketing template and opted-in recipients must still be verified. No message was sent.','success');
   await fetchAll();
   if(container?.isConnected)settingsDraw(container);
  }catch(error){
   alert('SocialBerries verification failed: '+error.message,'error');
  }
 }
 async function diagnoseProvider(id){
  const conn=rows.connections.find(c=>c.id===id&&app.companies.includes(c.company_id));
  if(!conn)return alert('Select your saved WhatsApp provider first.','warning');
  try{
   const info=await secureSend('diagnose_connection',{connection_id:id});
   const d=document.createElement('dialog');d.className='grwc-dialog';
   const status=(value,successLabel='Ready',failureLabel='Needs setup')=>
    '<span class="grwc-chip">'+(value?esc(successLabel):esc(failureLabel))+'</span>';
   d.innerHTML='<div class="grwc-dialog-head"><h3>WhatsApp Sending Diagnosis</h3><button type="button" data-close>×</button></div>'+
    '<div class="grwc-dialog-fields">'+
    '<p class="grwc-muted grwc-span">Company: '+esc(name(conn.company_id))+
    ' · Tool '+esc(info.slot)+' · Read-only check (no message sent).</p>'+
    '<div class="grwc-feature">API credentials in Supabase: '+status(info.credentials_present,'Present','Missing')+'</div>'+
    '<div class="grwc-feature">Provider configured in CRM: '+status(info.provider_enabled,'Enabled','Not enabled')+'</div>'+
    '<div class="grwc-feature">Registered sender: '+status(info.sender_recorded,'Recorded','Missing')+'</div>'+
    '<div class="grwc-feature">Meta-verified marketing templates: <b>'+esc(info.verified_templates||0)+'</b></div>'+
    '<div class="grwc-feature">Admin-confirmed only (not independently verified): <b>'+esc(info.admin_confirmed_templates||0)+'</b></div>'+
    '<div class="grwc-feature">Documented marketing opt-ins: <b>'+esc(info.opted_in_contacts||0)+'</b></div>'+
    '<div class="grwc-feature">Server marketing-send switch: '+status(info.sending_enabled,'Enabled','Disabled')+'</div>'+
    '<div class="grwc-feature grwc-span"><b>Setup blockers</b><ol>'+
      (info.blockers?.length?info.blockers.map(x=>'<li>'+esc(x)+'</li>').join(''):'<li>No local configuration blockers. Provider authentication and a real internal test are still required.</li>')+
    '</ol></div>'+
    '<div class="grwc-feature grwc-span"><b>Latest recorded send failures</b><ul>'+
      (info.recent_failures?.length?info.recent_failures.map(x=>'<li>'+esc(x.code)+' — '+esc(x.reason)+' ('+esc(new Date(x.date).toLocaleDateString('en-IN'))+')</li>').join(''):
       '<li>No failed attempts stored for this provider.</li>')+
    '</ul></div><p class="grwc-muted grwc-span">'+esc(info.next_step)+'</p></div>'+
    '<div class="grwc-dialog-foot"><button type="button" data-close>Close</button></div>';
   document.body.append(d);d.onclose=()=>d.remove();
   d.querySelectorAll('[data-close]').forEach(x=>x.onclick=()=>d.close());d.showModal();
  }catch(e){alert('Could not diagnose WhatsApp connection: '+e.message,'error')}
 }
 async function checkProvider(id,action){
  const provider=rows.connections.find(x=>x.id===id&&app.companies.includes(x.company_id));
  if(!provider)return alert('Save provider details first.','warning');
  if(action==='test'){
   try{
    const info=await app.db.functions.invoke('greenrich-socialberries',{body:{connection_id:id,action:'test'}});
    if(info.error||!info.data?.ok)throw Error(info.data?.message||info.error?.message||'Provider test failed');
    return alert('SocialBerries API authentication succeeded (read-only). User count: '+(info.data.users_count??'not returned')+'.','success');
   }catch(e){return alert('Connection test failed: '+e.message,'error')}
  }
  const d=document.createElement('dialog');d.className='grwc-dialog grwc-bulk-dialog';
  d.innerHTML='<div class="grwc-dialog-head"><h3>SocialBerries Bulk Campaign Tracking</h3><button type="button" data-close>×</button></div>'+
    '<div class="grwc-dialog-fields"><p class="grwc-notice grwc-span">Read-only provider sync for '+esc(name(provider.company_id))+'. No WhatsApp messages are sent. <b>Completed = campaign processing</b>, not delivered.</p>'+
    '<div class="grwc-span" data-provider-batch-summary>Loading bulk campaigns…</div>'+
    '<div class="grwc-tablewrap grwc-span"><table><thead><tr><th>Campaign / Provider ID</th><th>Processing</th><th>Recipients</th><th>Processed</th><th>Linked CRM</th><th>Details</th></tr></thead><tbody data-provider-batch-rows></tbody></table></div>'+
    '<div class="grwc-feature grwc-span" id="grwc-batch-detail">Choose a campaign to see provider message statistics, not just processing status.</div></div>'+
    '<div class="grwc-dialog-foot"><button type="button" data-provider-prev disabled>Previous</button>'+
    '<button type="button" data-provider-next disabled>Next</button>'+
    '<button type="button" data-provider-live>Sync live page</button>'+
    '<button type="button" data-provider-saved>Saved history</button>'+
    '<button type="button" data-close>Close</button></div>';
  document.body.append(d);d.onclose=()=>d.remove();
  d.querySelectorAll('[data-close]').forEach(x=>x.onclick=()=>d.close());
  const summary=d.querySelector('[data-provider-batch-summary]'),tbody=d.querySelector('[data-provider-batch-rows]');
  const prev=d.querySelector('[data-provider-prev]'),next=d.querySelector('[data-provider-next]');
  const detail=d.querySelector('#grwc-batch-detail');
  let page=1,mode=action==='saved'?'batch_history':'batches',loading=false;
  const call=async(a,args={})=>{
   const result=await app.db.functions.invoke('greenrich-socialberries',{body:{connection_id:id,action:a,...args}});
   if(result.error||!result.data?.ok){
    let message=result.data?.message||result.data?.error||result.error?.message||'Provider request failed';
    if(result.error?.context?.json)try{
     const x=await result.error.context.json();message=x.message||x.error||message;
    }catch{}
    throw Error(message);
   }
   return result.data;
  };
  const load=async(requestedPage=1,requestedMode=mode)=>{
   if(loading)return;
   loading=true;prev.disabled=true;next.disabled=true;
   summary.textContent='Loading '+(requestedMode==='batches'?'live SocialBerries batches':'saved CRM batch history')+'…';
   try{
    const response=await call(requestedMode,{page:requestedPage});
    if(!d.isConnected)return;
    page=requestedPage;mode=requestedMode;
    const batches=response.batches||[],count=Number(response.count)||0;
    const pageSize=mode==='batches'?10:20;
    summary.textContent=(mode==='batches'?'Live provider sync':'Saved in CRM')+
     ' · '+count+' total · Page '+page+' · '+batches.length+' shown. No messages sent.';
    tbody.innerHTML=batches.length?batches.map(b=>{
      const bid=b.id||b.provider_batch_id,ref=b.crm_campaign_id||'—';
      return '<tr><td><strong>'+esc(b.name||'Unnamed campaign')+'</strong>'+
       '<small>'+esc(bid)+'</small></td>'+
       '<td>'+esc(b.status||'unknown')+'</td>'+
       '<td>'+esc(b.total_clients_count??'—')+'</td>'+
       '<td>'+esc(b.completed_clients_count??'—')+'</td>'+
       '<td>'+esc(ref)+'</td>'+
       '<td><button type="button" data-batch-stats="'+esc(bid)+'">View & Sync</button></td></tr>';
     }).join(''):'<tr><td colspan="6">No bulk campaign results on this page.</td></tr>';
    prev.disabled=page<=1;
    next.disabled=mode==='batches'?(!response.has_more):page*pageSize>=count;
    detail.textContent='Choose View & Sync to show individual batch message counts. Batch processing status is different from delivery.';
   }catch(err){summary.textContent='Could not sync provider batches: '+err.message;tbody.innerHTML='';detail.textContent='No messages sent. Check provider connection and the Batch List endpoint.'}
   finally{loading=false}
  };
  prev.onclick=()=>void load(page-1);
  next.onclick=()=>void load(page+1);
  d.querySelector('[data-provider-live]').onclick=()=>void load(1,'batches');
  d.querySelector('[data-provider-saved]').onclick=()=>void load(1,'batch_history');
  d.onclick=async ev=>{
   const button=ev.target.closest('[data-batch-stats]');if(!button||loading)return;
   button.disabled=true;detail.textContent='Reading provider batch detail and saving statistics…';
   try{
    const data=await call('batch_detail',{batch_id:button.dataset.batchStats});
    if(!d.isConnected)return;
    const stats=data.statistics||{},order=[
      ['Total',stats.total_messages],['Pending',stats.pending],['Sent',stats.sent],
      ['Delivered',stats.delivered],['Read',stats.read],['Failed',stats.failed]];
    const rates=[['Success rate',stats.success_rate],['Failure rate',stats.failure_rate],
      ['Effective success',stats.effective_success_rate],['Effective failure',stats.effective_failure_rate],
      ['Recovery retry',stats.recovery_retry_succeeded],['Recovery reengage',stats.recovery_reengage_succeeded]];
    detail.innerHTML='<b>'+esc(data.name||'Provider batch')+'</b> · '+esc(data.status||'unknown')+
      '<p class="grwc-muted">Provider ID: '+esc(data.id||'—')+' · Sender ID: '+esc(data.phone_number_id||'—')+
      ' · Recipients: '+esc(data.total_clients_count??'—')+' · Processed: '+esc(data.completed_clients_count??'—')+'</p>'+
      '<div class="grwc-grid grwc-kpis">'+order.map(([title,n])=>
       '<div class="grwc-feature"><small>'+esc(title)+'</small><h3>'+esc(n??'—')+'</h3></div>').join('')+'</div>'+
      '<div class="grwc-grid">'+rates.map(([title,n])=>
       '<div class="grwc-feature"><small>'+esc(title)+'</small><strong>'+esc(n??'—')+
        (title.toLowerCase().includes('rate')||title.toLowerCase().includes('success')&&title!=='Recovery retry'&&title!=='Recovery reengage'?'%':'')+
        '</strong></div>').join('')+'</div>'+
      '<p class="grwc-muted">Status and statistics saved to private CRM provider-batch history. Processing completed does not mean delivered. Recipient-specific history and replies are unavailable from this summary API.</p>';
   }catch(e){detail.textContent='Could not read batch detail: '+e.message}
   finally{button.disabled=false}
  };
  d.showModal();void load(1,mode);
 }
 async function syncProviderLeads(connectionId,container){
  const p=rows.connections.find(x=>x.id===connectionId&&x.provider.toLowerCase()==='socialberries');
  if(!p)return alert('Save a SocialBerries connection first.','warning');
  if(!app.admin)return alert('Only Admin can sync SocialBerries leads.','error');
  let count=0,pages=0;
  try{
   for(let page=1;page<=20;page++){
    const res=await app.db.functions.invoke('greenrich-socialberries',{
      body:{connection_id:connectionId,action:'sync_leads',page}});
    if(res.error)throw Error(res.error.message||'Secure connection unavailable');
    const info=res.data||{};
    if(!info.ok)throw Error(info.message||info.error||'SocialBerries Get Leads failed');
    count+=Number(info.synced)||0;pages++;
    if(!info.has_more)break;
   }
   alert('SocialBerries staging updated: '+count+' provider leads across '+pages+' page(s). Review the list before importing. No messages sent.','success');
   await fetchAll();settingsDraw(container);
  }catch(error){alert('Synced '+count+' staged records before stopping. '+error.message,'warning');await fetchAll();settingsDraw(container)}
 }
 function importStagedLead(id,container){
  const row=rows.providerLeads.find(x=>x.id===id),c=row?.company_id;
  if(!row||!c||!app.admin)return alert('No permission to import provider lead.','error');
  dialog('Review before CRM Lead import',
   '<div class="grwc-notice grwc-span">SocialBerries → GreenRich ONE. Existing CRM lead/customer mobile numbers will be checked to avoid duplicates. No welcome message is sent during import.</div>'+
   '<div class="grwc-feature grwc-span"><b>'+esc(row.name||'Unnamed lead')+'</b><p>'+esc(row.mobile||'No phone')+' · '+esc(row.email||'')+' · '+esc(row.source||'SocialBerries')+'</p></div>'+
   field('Assign to salesperson','assignee',options(rows.profiles.filter(p=>p.company_ids?.includes(c)).map(p=>[p.id,p.full_name]),'Common sales queue')),
   async fd=>{
    const res=await app.db.rpc('gr_wa_import_provider_lead',{
      p_staged_id:id,p_assignee:fd.get('assignee')||null});
    if(res.error)throw Error(res.error.message);
    const outcome=res.data||{};
    if(outcome.status==='imported')alert('Lead imported to GreenRich ONE successfully. Lead ID: '+outcome.lead_id,'success');
    else alert('No new lead created: '+String(outcome.status||'Unknown result')+'. Existing CRM record kept unchanged.','info');
    await fetchAll();settingsDraw(container);
   });
 }
 function settingsConsent(company,container){
  const connections=rows.connections.filter(x=>x.company_id===company&&x.provider==='socialberries');
  const contacts=[
   ...rows.customers.map(x=>({id:'C:'+x.id,label:(x.name||'Customer')+' · '+(customerTarget(x).mobile||'No phone')})),
   ...rows.leads.filter(x=>x.company_id===company).map(x=>({id:'L:'+company+':'+x.lead_id,label:(x.contact||x.title||'Lead')+' · '+(x.mobile||'No phone')}))
  ];
  if(!connections.length)return alert('Add a SocialBerries provider in this company first.','warning');
  if(!contacts.length)return alert('No customer or lead is available in this CRM.','warning');
  dialog('Record existing WhatsApp marketing permission',
   '<p class="grwc-muted grwc-span">Only record explicit permission the person has already given. Being in CRM or filling an enquiry form does not itself prove WhatsApp marketing permission.</p>'+
   field('SocialBerries provider','connection_id',options(connections.map(x=>[x.id,x.display_name]),'Choose provider'),true)+
   field('Customer / Lead','contact_key',options(contacts.map(x=>[x.id,x.label]),'Choose contact'),true)+
   field('Where did the customer give permission?','consent_source',options([
    ['WhatsApp conversation','WhatsApp conversation'],
    ['Website opt-in checkbox','Website opt-in checkbox'],
    ['Email confirmation','Email confirmation'],
    ['Signed consent form','Signed consent form'],
    ['Customer service phone call','Phone call (documented agreement)'],
    ['In-person consent form','In-person consent form'],
    ['Other documented opt-in','Other documented opt-in']
   ],'Select the actual permission source'),true)+
   '<label class="grwc-span">When and how did the customer agree? <small>(required, at least 10 characters)</small>'+
   '<textarea name="evidence_note" rows="3" required minlength="10" maxlength="500" placeholder="Describe the actual date and what the customer agreed to. Do not invent permission."></textarea></label>'+
   '<p class="grwc-muted grwc-span">Only record permission the person actually gave to receive WhatsApp marketing from this company. CRM membership alone is not consent.</p>'+
   '<label class="grwc-span"><input type="checkbox" name="attested" required> I confirm this person explicitly agreed to receive WhatsApp marketing</label>'+
   '<label class="grwc-span"><input type="checkbox" name="new_opt_in"> Only if applicable: the customer opted out before and gave new permission afterwards</label>',
   async f=>{
    const source=String(f.get('consent_source')||'').trim(),evidence=String(f.get('evidence_note')||'').trim();
    if(!f.has('attested'))throw Error('Confirm only genuine WhatsApp marketing permission that was actually given.');
    if(source.length<12)throw Error('Choose the actual permission source from the dropdown.');
    if(evidence.length<10)throw Error('Describe the real date and how the customer agreed (at least 10 characters). A value such as 1 is not evidence.');
    await secureSend('record_consent',{connection_id:String(f.get('connection_id')||''),
     contact_key:String(f.get('contact_key')||''),consent_source:source,
     evidence_note:evidence,attested:true,
     new_opt_in:f.has('new_opt_in')});
    await fetchAll();settingsDraw(container);
   },'Save permission','Marketing permission recorded for this sending company.');
 }
 async function verifyMetaTemplate(company,templateId,container){
  const item=rows.templates.find(t=>t.id===templateId&&t.company_id===company&&t.category==='marketing');
  if(!item)return alert('The selected marketing template was not found.','warning');
  try{
   const out=await secureSend('sync_meta_template',{connection_id:item.connection_id,template_id:item.id});
   if(!out.verified)throw Error('Meta did not verify the selected template.');
   await fetchAll();settingsDraw(container);
   alert(item.name+' was verified against the connected Meta WABA with approved message body and header.','success');
  }catch(error){
   alert('Meta verification unavailable: '+error.message+
    ' If SocialBerries manages your Meta WABA, request the full approved template JSON and use Confirm existing approved template below.','warning');
  }
 }
 async function syncApprovedTemplates(company,container,{quiet=false}={}){
  const connection=rows.connections.find(x=>x.company_id===company&&x.provider.toLowerCase()==='socialberries'&&x.slot===1)||
   rows.connections.find(x=>x.company_id===company&&x.provider.toLowerCase()==='socialberries');
  if(!connection){if(!quiet)alert('Save the company WhatsApp sender in Settings first.','warning');return}
  const button=container?.querySelector('[data-sync-approved-templates]');
  if(button)button.disabled=true;
  try{
   const result=await secureSend('sync_approved_templates',{connection_id:connection.id});
   if(!result.configured){
    if(!quiet)alert('One-time setup required: Ask your Meta / SocialBerries administrator to connect this company WABA ID and WhatsApp template management token to Supabase Secrets. CRM will then sync all approved templates automatically, with no JSON required.','warning');
    return result;
   }
   await fetchAll();
   if(container?.isConnected)settingsDraw(container);
   if(!quiet)alert('Approved templates synced from Meta. New: '+result.imported+
    ', updated: '+result.updated+'. Full header, body and buttons were imported. You will not need to approve them again.','success');
   return result;
  }catch(error){
   if(!quiet)alert('Template sync failed: '+error.message+'. Existing approved templates were not removed.','error');
   return null;
  }finally{if(button?.isConnected)button.disabled=false}
 }
 function settingsTemplateApproval(company,container){
  const list=rows.templates.filter(x=>x.company_id===company&&x.category==='marketing');
  if(!list.length)return alert('Import your existing approved marketing template under Templates first.','warning');
  const jsonOf=t=>Array.isArray(t?.provider_preview?.components)?JSON.stringify(t.provider_preview,null,2):'';
  const d=dialog('Confirm provider-approved MARKETING template',
   '<p class="grwc-muted grwc-span">The imported JSON is prefilled for you. Check it against the ACTUAL approved template in SocialBerries, including both buttons and their URLs. A screenshot-generated JSON is not proof of approval.</p>'+
   field('Existing marketing template','template_id',options(list.map(x=>[x.id,x.name+' · '+x.provider_template_id]),'Choose template'),true)+
   note('Full approved template JSON','approved_json',jsonOf(list[0]))+
   note('Approval evidence: who verified, where, when','confirmation_note','')+
   '<label class="grwc-span"><input type="checkbox" name="attested" required> I compared BODY, HEADER and BUTTONS with the exact approved template in SocialBerries</label>',
   async f=>{
    const id=String(f.get('template_id')||''),t=list.find(x=>x.id===id);
    if(!t)throw Error('Choose an existing marketing template');
    await secureSend('confirm_template',{connection_id:t.connection_id,template_id:id,
     approved_json:String(f.get('approved_json')||''),confirmation_note:String(f.get('confirmation_note')||''),
     attested:f.has('attested')});
    await fetchAll();settingsDraw(container);
   },'Confirm template','Approved marketing-template details confirmed. No message sent.');
  d.querySelector('select[name="template_id"]')?.addEventListener('change',e=>{
   const item=list.find(t=>t.id===e.target.value);
   const box=d.querySelector('textarea[name="approved_json"]');if(box)box.value=jsonOf(item);
  });
 }
 function importTemplateMetadata(company,container){
  const choices=rows.connections.filter(x=>x.company_id===company&&x.provider.toLowerCase()==='socialberries');
  if(!choices.length)return alert('Save a SocialBerries provider in this company first.','warning');
  dialog('Link an existing SocialBerries template by ID',
   '<div class="grwc-notice grwc-span">Use the exact ID, name, category and language from SocialBerries → WhatsApp → Templates. This links metadata only, not the actual message content. It does not send WhatsApp messages.</div>'+
   field('SocialBerries provider','connection_id',options(choices.map(x=>[x.id,x.display_name]),'Choose provider'),true)+
   input('Existing Template ID','provider_template_id','')+
   input('Existing Template Name','template_name','')+
   field('Category','category',options([['marketing','MARKETING'],['utility','UTILITY'],['authentication','AUTHENTICATION']],'Choose category'),true)+
   input('Language','language','en_US'),
   async fd=>{
    const conn=String(fd.get('connection_id')||'');
    if(!choices.some(x=>x.id===conn))throw Error('Select the SocialBerries provider for this company');
    const r=await app.db.rpc('gr_wa_import_template_metadata',{
     p_connection:conn,
     p_template_id:String(fd.get('provider_template_id')||'').trim(),
     p_name:String(fd.get('template_name')||'').trim(),
     p_category:String(fd.get('category')||'').trim(),
     p_language:String(fd.get('language')||'').trim()
    });
    if(r.error)throw Error(r.error.message);
    await fetchAll();
    settingsDraw(container);
   });
 }
 function importProviderTemplate(company,container){
  const choices=rows.connections.filter(x=>x.company_id===company&&x.provider.toLowerCase()==='socialberries');
  if(!app.admin)return alert('Only company administrators can manually sync approved templates.','warning');
  if(!choices.length)return alert('Save a SocialBerries connection for this company first.','warning');
  const known=rows.templates.filter(x=>x.company_id===company&&choices.some(c=>c.id===x.connection_id)&&x.category==='marketing');
  const d=dialog('Manual Sync — Existing Meta-Approved Template',
   '<div class="grwc-notice grwc-span"><b>No Meta token or reapproval required.</b> First choose your existing template; confirm the exact approved IMAGE/TEXT header, full message and CTA. Website button URLs must begin with https:// and match Meta exactly. Any validation or API failure appears in this form; no message is sent.</div>'+
   field('SocialBerries provider','connection_id',options(choices.map(x=>[x.id,x.display_name]),'Choose connection'),true)+
   field('Existing template (optional)','existing_template',options(known.map(t=>[t.id,t.name+' · '+t.language+' · '+t.provider_template_id]),'Enter a new existing-approved template below'))+
   input('Exact approved template ID','provider_template_id','')+
   input('Exact approved template name','template_name','')+
   input('Language','language','en_US')+
   field('Header type — as approved','header_type',options([['NONE','No header'],['IMAGE','Image'],['TEXT','Text header']],'Select exact header type'),true)+
   input('Approved text header (only when TEXT header)','header_text','')+
   note('Exact approved message BODY','approved_body','')+
   input('Approved footer (optional)','approved_footer','')+
   field('First approved button','button1_kind',options([['NONE','No first button'],['URL','Website URL'],['COPY_CODE','Copy offer code'],['QUICK_REPLY','Quick reply'],['PHONE_NUMBER','Call phone number']],'Select exact button type'),true)+
   input('First button label','button1_text','')+
   input('First button website URL or phone (if relevant)','button1_value','')+
   field('Second approved button','button2_kind',options([['NONE','No second button'],['URL','Website URL'],['COPY_CODE','Copy offer code'],['QUICK_REPLY','Quick reply'],['PHONE_NUMBER','Call phone number']],'Select exact button type'),true)+
   input('Second button label','button2_text','')+
   input('Second button website URL or phone (if relevant)','button2_value','')+
   '<details class="grwc-span"><summary>Advanced · Import complete approved template JSON instead</summary>'+
   '<label>Approved JSON file<input name="json_file" type="file" accept=".json,application/json"></label>'+
   note('Or paste the full approved template JSON','preview_json')+'</details>'+
   note('Approval evidence (source, status and date)','confirmation_note','')+
   '<label class="grwc-span"><input type="checkbox" name="attested" required> I checked the exact ID, language, full body, header and every button against the existing approved template in SocialBerries/Meta. This is an administrator confirmation, not live Meta API verification.</label>',
   async fd=>{
    const connectionId=String(fd.get('connection_id')||'');
    if(!choices.some(x=>x.id===connectionId))throw Error('Choose the correct SocialBerries connection');
    if(fd.get('attested')!=='on')throw Error('Confirm the existing Meta approval first');
    const noteText=String(fd.get('confirmation_note')||'').trim();
    if(noteText.length<10)throw Error('Provide at least 10 characters of approval evidence');
    const get=k=>String(fd.get(k)||'').trim();
    const file=fd.get('json_file');let content=get('preview_json');
    if(file&&typeof file.text==='function'&&file.size){
     if(file.size>100000)throw Error('JSON file must be smaller than 100 KB');
     content=await file.text();
    }
    let t;
    if(content){
     let raw;try{raw=JSON.parse(content)}catch{throw Error('Choose valid approved JSON or use the fields above')}
     if(!raw||Array.isArray(raw)||typeof raw!=='object')throw Error('Provide one approved template JSON object');
     t=raw.preview_template?.components?raw.preview_template:raw;
    }else{
     const name=get('template_name'),id=get('provider_template_id'),lang=get('language');
     const body=get('approved_body'),footer=get('approved_footer');
     const headerType=get('header_type');
     if(!/^[0-9]{5,25}$/.test(id)||!/^[a-z][a-z0-9_]{0,119}$/.test(name)||
       !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(lang)||!body)
      throw Error('Enter the exact numeric template ID, lower-case template name, language and complete body');
     if(!['NONE','IMAGE','TEXT'].includes(headerType))throw Error('Choose the exact approved header type');
     const components=[];
     if(headerType==='IMAGE')components.push({type:'HEADER',format:'IMAGE'});
     if(headerType==='TEXT'){
      if(!get('header_text'))throw Error('Enter the exact approved text header');
      components.push({type:'HEADER',format:'TEXT',text:get('header_text')});
     }
     components.push({type:'BODY',text:body});
     if(footer)components.push({type:'FOOTER',text:footer});
     const buttons=[];
     for(let i=1;i<=2;i++){
      const kind=get('button'+i+'_kind'),label=get('button'+i+'_text'),value=get('button'+i+'_value');
      if(!['NONE','URL','COPY_CODE','QUICK_REPLY','PHONE_NUMBER'].includes(kind))
       throw Error('Choose a valid button type');
      if(kind==='NONE'){if(label||value)throw Error('Remove unused button '+i+' fields');continue}
      if(!label)throw Error('Enter approved button '+i+' label');
      const b={type:kind,text:label};
      if(kind==='URL'){
       try{const url=new URL(value);if(url.protocol!=='https:'||!url.hostname)throw Error('HTTPS only')}
       catch{throw Error('Button '+i+' needs the exact full approved HTTPS URL (example format: https://example.com). A domain without https:// is not valid.')}
       b.url=value;
      }else if(kind==='PHONE_NUMBER'){
       if(!/^\+?[0-9]{7,15}$/.test(value))throw Error('Enter the exact approved call number for button '+i);
       b.phone_number=value;
      }else if(kind==='COPY_CODE'&&value)b.example=value;
      buttons.push(b);
     }
     if(buttons.length)components.push({type:'BUTTONS',buttons});
     t={id,name,language:lang,status:'APPROVED',category:'MARKETING',components};
    }
    if(!t||typeof t!=='object'||!/^[0-9]{5,25}$/.test(String(t.id||''))||
       !/^[a-z][a-z0-9_]{0,119}$/.test(String(t.name||''))||
       !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(String(t.language||''))||
       t.status!=='APPROVED'||String(t.category||'').toUpperCase()!=='MARKETING'||
       !Array.isArray(t.components)||!t.components.some(x=>String(x.type).toUpperCase()==='BODY'&&String(x.text||'').trim()))
     throw Error('Complete APPROVED MARKETING template details are required. Check the exact ID/name/language.');
    const existing=rows.templates.filter(x=>x.company_id===company&&x.connection_id===connectionId);
    const prior=existing.find(x=>String(x.provider_template_id)===String(t.id));
    const conflict=existing.find(x=>x.name===t.name&&x.language===t.language&&String(x.provider_template_id)!==String(t.id));
    if(conflict)throw Error('This name/language maps to another template ID. No changes saved.');
    if(prior&&prior.name!==t.name)throw Error('Template ID/name mismatch. No changes saved.');
    if(prior&&prior.provider_source==='verified_provider')throw Error('Already directly synced with Meta. No manual overwrite.');
    // Known template observations are evidence of required components; never allow an
    // incomplete manual entry to be marked send-ready by omitting them.
    const observed=prior?.provider_preview?.observed_from_meta_screenshot;
    if(observed){
     const header=t.components.find(x=>String(x.type).toUpperCase()==='HEADER');
     const buttons=t.components.find(x=>String(x.type).toUpperCase()==='BUTTONS')?.buttons||[];
     if(observed.header_format_observed&&String(header?.format||'').toUpperCase()!==String(observed.header_format_observed).toUpperCase())
      throw Error('This approved template has an IMAGE header. Select Image as the exact header type.');
     if(observed.button_text_observed&&!buttons.some(x=>String(x.text||'').toLowerCase()===String(observed.button_text_observed).toLowerCase()))
      throw Error('The approved Buy Now CTA is missing. Enter the exact website URL and button before sync.');
    }
    const out=await app.db.rpc('gr_wa_import_template_preview',{p_connection:connectionId,p_preview:t});
    if(out.error)throw Error('Template import failed: '+out.error.message);
    const q=await app.db.from('gr_wa_templates').select('id,name,language,provider_template_id')
      .eq('company_id',company).eq('connection_id',connectionId)
      .eq('provider_template_id',String(t.id)).limit(2);
    if(q.error||q.data?.length!==1||q.data[0].name!==t.name||q.data[0].language!==t.language)
     throw Error('Imported identity could not be verified. No message was sent.');
    await secureSend('confirm_template',{connection_id:connectionId,template_id:q.data[0].id,
      approved_json:JSON.stringify(t),confirmation_note:noteText,attested:true});
    await fetchAll();settingsDraw(container);
    alert('Manual sync saved: '+t.name+' ('+t.language+'). Review the campaign template then test one opted-in recipient. No Meta resubmission or message sent.','success');
   },'Sync Existing Approved Template','Admin-confirmed approved template recorded; no message sent.');
  const sel=d.querySelector('[name="existing_template"]');
  const populate=()=>{
   const t=known.find(x=>x.id===sel.value);
   if(!t)return;
   const set=(name,value)=>{const node=d.querySelector('[name="'+name+'"]');if(node)node.value=value||''};
   set('connection_id',t.connection_id);set('provider_template_id',t.provider_template_id);
   set('template_name',t.name);set('language',t.language);
   set('approved_body',t.body);
   const comps=t.provider_preview?.components||[];
   const header=comps.find(x=>String(x.type).toUpperCase()==='HEADER');
   const footer=comps.find(x=>String(x.type).toUpperCase()==='FOOTER');
   const observed=t.provider_preview?.observed_from_meta_screenshot||{};
   set('header_type',header?String(header.format||'').toUpperCase():observed.header_format_observed||'');
   set('header_text',header?.text);set('approved_footer',footer?.text||observed.footer_text_observed||'');
   const buttons=comps.find(x=>String(x.type).toUpperCase()==='BUTTONS')?.buttons||[];
   buttons.slice(0,2).forEach((b,i)=>{
    set('button'+(i+1)+'_kind',String(b.type||'').toUpperCase());
    set('button'+(i+1)+'_text',b.text);
    set('button'+(i+1)+'_value',b.url||b.phone_number||'');
   });
   // Prepopulate only details actually observed, not an invented approved URL.
   if(!buttons.length&&observed.button_text_observed){
    set('button1_kind',observed.button_kind_observed?.includes('URL')?'URL':'');
    set('button1_text',observed.button_text_observed);
    set('button1_value','');
   }
  };
  sel?.addEventListener('change',populate);
 }
 function editProvider(c,slot,container){
  // A provider slot belongs permanently to one company. The former form
  // exposed company_id as an editable dropdown, allowing an Enviro row to be
  // reassigned to Grow India's already-occupied slot (Postgres 23505).
  if(!app.admin||!app.companies.includes(c)||![1,2].includes(slot))
   return alert('You do not have permission to edit this company/provider slot.','error');
  const old=rows.connections.find(p=>p.company_id===c&&p.slot===slot);
  if(old&&old.setup_state==='verified'&&old.enabled){
   const d=document.createElement('dialog');d.className='grwc-dialog';
   d.innerHTML='<div class="grwc-dialog-head"><h3>Connected WhatsApp account</h3><button type="button" data-close>×</button></div>'+
    '<div class="grwc-dialog-fields"><p><b>Provider:</b> '+esc(old.display_name)+'</p>'+
    '<p><b>Business number:</b> '+esc(old.sender_phone)+'</p>'+
    '<p><b>Company:</b> '+esc(name(c))+'</p>'+
    '<p class="grwc-notice grwc-span">This account is already verified and connected. Editing it would reset a working provider setup. To add a different number use the second account slot. To change this number contact the provider administrator.</p></div>'+
    '<div class="grwc-dialog-foot"><button type="button" data-close>Close</button></div>';
   document.body.append(d);d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>d.close());
   d.onclose=()=>d.remove();d.showModal();return;
  }
  dialog(slot===2?'Connect additional WhatsApp business number':'Configure WhatsApp Tool '+slot,
   '<div class="grwc-feature grwc-span"><b>Company (fixed for Tool '+slot+')</b><p>'+esc(name(c))+'</p>'+
   '<p>To edit another company, close this form and change the Company selector in WhatsApp Settings.</p></div>'+
   input('Provider name','display_name',old?.display_name||(slot===1?'SocialBerries':''))+
   (slot===2?field('WhatsApp API provider','provider',options([['socialberries','SocialBerries / Workaxis'],['other','Other provider']],'Select provider'),true):input('Provider identifier','provider',old?.provider||'socialberries'))+
   input('Registered WhatsApp business sender (+91 followed by 10 digits)','sender_phone',old?.sender_phone||'')+
   '<p class="grwc-muted grwc-span">This registers the company/number in CRM only. API credentials remain in Supabase, and a new number is not active until its provider connection is verified.</p>'+
   note('Provider account reference / notes (do not paste API tokens)','notes',old?.notes||''),
   async fd=>{
    const x={
     company_id:c,slot,
     display_name:String(fd.get('display_name')||'').trim(),
     provider:String(fd.get('provider')||'').trim().toLowerCase(),
     sender_phone:String(fd.get('sender_phone')||'').trim(),
     notes:String(fd.get('notes')||'').trim(),
     enabled:false,setup_state:'not_configured'
    };
    if(!x.display_name||!x.provider)throw Error('Provider name and identifier are required');
    if(x.provider==='socialberries'){
     const raw=x.sender_phone.replace(/[\s()\-]/g,'');
     const digits=raw.replace(/^\+/,'');
     const normalized=/^[6-9]\d{9}$/.test(digits)?'91'+digits:digits;
     if(!/^91[6-9]\d{9}$/.test(normalized))
      throw Error('Enter the exact registered 10-digit Indian WhatsApp business sender with +91. Do not add extra digits.');
     x.sender_phone='+'+normalized;
    }
    // ON CONFLICT updates the same (company_id,slot) row without changing
    // its UUID or any dependent template/campaign references. No second row.
    const r=await app.db.from('gr_wa_connections').upsert(x,{
     onConflict:'company_id,slot',ignoreDuplicates:false
    }).select('id,company_id,slot').single();
    if(r.error){
     if(r.error.code==='23505')throw Error('This company already has a Tool '+slot+'. Refresh Settings and edit its existing record.');
     throw Error(r.error.message);
    }
    if(r.data?.company_id!==c||Number(r.data?.slot)!==slot)
     throw Error('Provider company/slot verification failed. Reload Settings.');
    await fetchAll();
    if(container?.isConnected){scope=c;settingsDraw(container)}
   });
 }
 function inboundDialog(c,container){
  const cons=rows.connections.filter(p=>p.company_id===c);
  dialog('Inbound lead assignment rule',companyFieldWith(c)+
   field('Provider','connection_id',options(cons.map(p=>[p.id,p.display_name]),'Choose provider'),true)+
   field('Incoming event','event_type',options([['whatsapp_enquiry','WhatsApp new incoming message'],['website_enquiry','Website enquiry'],['website_whatsapp_otp','Website WhatsApp OTP verified login']]),true)+
   field('Lead source','source_name',options((rows.sources||[]).filter(s=>s.active===true).map(s=>[s.name,s.name]),'Choose existing CRM source'),true)+
   field('Salesperson','assigned_to',options(rows.profiles.filter(p=>p.company_ids?.includes(c)).map(p=>[p.id,p.full_name]),'Common sales queue'))+
   '<p class="grwc-muted grwc-span">Lead tags can be added later after qualifying or converting the lead.</p>'+
   '<p class="grwc-muted grwc-span">Draft only: provider webhook receiver must be configured and authenticated before it can create CRM leads.</p>',
   async fd=>{
    const x=Object.fromEntries(fd);x.assigned_to=x.assigned_to||null;x.tag_ids=[];x.status='draft';
    if(!(rows.sources||[]).some(s=>s.active===true&&s.name===x.source_name))throw Error('Choose a source from CRM Settings → Lead Sources.');
    if(!cons.some(p=>p.id===x.connection_id))throw Error('Invalid company provider');
    const r=await app.db.from('gr_wa_inbound_rules').insert(x);if(r.error)throw Error(r.error.message);
   });
 }
 async function saveLeadWelcome(db,companyId,leadId,templateId){
  if(!templateId)return;
  const r=await db.from('gr_wa_lead_welcome').insert({company_id:companyId,lead_id:leadId,template_id:templateId,status:'awaiting_provider'});
  if(r.error)throw Error('Lead created, but welcome preference not saved: '+r.error.message);
 }
 async function welcomeOptions(db,companyId){
  const r=await db.from('gr_wa_templates').select('id,name,language,provider_approval,company_id')
   .eq('company_id',companyId).order('name').limit(150);
  if(r.error)throw Error(r.error.message);
  return (r.data||[]).map(t=>({id:t.id,name:tmpl(t)}));
 }
 async function openCustomerRule(ctx){
  if(!app?.db){alert('Open Marketing or refresh GreenRich ONE to initialize WhatsApp settings.','warning');return}
  await fetchAll();
  serviceDialog({customer:ctx.customer,companyId:ctx.companyId});
 }
 async function secureSend(action,args){
  const r=await app.db.functions.invoke('greenrich-whatsapp-send',{body:{action,...args}});
  if(r.error){
   // supabase-js masks 4xx/5xx JSON responses as "non-2xx status code".
   let detail='';
   try{
    const response=r.error.context;
    if(response&&typeof response.json==='function'){
     const body=await response.json();
     detail=typeof body?.error==='string'?body.error:
      Array.isArray(body?.blockers)?body.blockers.join('; '):'';
    }
   }catch{}
   throw Error(detail||r.error.message||'Secure WhatsApp backend unavailable');
  }
  if(!r.data?.ok)throw Error(r.data?.error||r.data?.blockers?.join('; ')||'WhatsApp request failed');
  return r.data;
 }
 async function reviewCampaign(campaign){
  if(!app.admin)return alert('Only administrators can send WhatsApp campaigns.','warning');
  const args={connection_id:campaign.connection_id,campaign_id:campaign.id};
  try{
   const status=await secureSend('check_campaign',args);
   if(!status.ready){
    const reasons=status.blockers||[];
    const message=reasons.some(x=>/opt-in/i.test(x))?'Selected customers have not recorded WhatsApp marketing permission.':
     reasons.some(x=>/template/i.test(x))?'Selected marketing template is not verified in SocialBerries.':
     reasons.some(x=>/SB_ENABLE_MARKETING_SEND/i.test(x))?'WhatsApp sending has not been activated in Settings.':
     reasons.join('; ');
    return alert('Cannot send: '+message,'warning');
   }
   if(!status.remaining)return alert('No remaining eligible customers for this campaign.','info');
   const result=await secureSend('send_campaign',{...args,confirm:true});
   const failed=(result.results||[]).filter(x=>x.result!=='accepted_by_provider');
   if(result.accepted===0){
    const reasons=[...new Set(failed.map(x=>(x.code?x.code+': ':'')+(x.reason||x.result)))];
    alert('No WhatsApp message was accepted. '+reasons.join(' | ')+'. See Campaign reports. Do not retry automatically.','error');
   }else if(failed.length){
    alert('SocialBerries accepted '+result.accepted+' of '+result.attempted+' attempts. '+failed.length+' failed or are uncertain. Delivery is not confirmed.','warning');
   }else alert('SocialBerries accepted '+result.accepted+' of '+result.attempted+' messages. Acceptance is not delivery.','success');
   await fetchAll();marketingDraw();
  }catch(e){alert(e.message,'error')}
 }
 async function mountMarketing(element,ctx){
  app=ctx;root=element;scope=ctx.selectedCompany&&ctx.companies.includes(ctx.selectedCompany)?ctx.selectedCompany:'all';
  current='audience';kind='all';source='all';tag='all';owner='all';needle='';provider='all';selected=new Set();campaignImage=null;campaignParamValues={};
  startDate='';endDate='';product='all';leadStage='all';inboundNeedle='';inboxNeedle='';guidanceCompany=app.companies.includes('grow-india')?'grow-india':app.companies[0];guidanceProduct='all';serviceCompany=scope;serviceSelected.clear();
  root.innerHTML='<p>Loading CRM audience…</p>';
  try{
   await fetchAll();marketingDraw();
   // Manual sync is primary. No unsolicited Meta API call on page load.
  }catch(e){root.innerHTML='<div class="grwc-empty">WhatsApp Marketing data unavailable: '+esc(e.message)+'</div>'}
  element.onclick=async e=>{
   const send=e.target.closest('[data-review-campaign]');if(send){const row=rows.campaigns.find(x=>x.id===send.dataset.reviewCampaign);if(row)await reviewCampaign(row);return}
   const v=e.target.closest('[data-view]');if(v){current=v.dataset.view;marketingDraw();return}
   if(e.target.closest('[data-new-guide]')){guidanceDialog();return}
   const editGuide=e.target.closest('[data-guide-edit]');
   if(editGuide){guidanceDialog(editGuide.dataset.guideEdit);return}
   const history=e.target.closest('[data-inbox-history]');
   if(history){if(!app.admin)return alert('Only Admin can look up provider chat history.','warning');
    openMessageHistory(history.dataset.inboxHistory,history.dataset.inboxPhone);return}
   if(e.target.closest('[data-marketing-sync-templates]')){
    const form=element.querySelector('#grwc-audience-form'),connectionId=form?.elements.connection_id?.value;
    const conn=campaignConnection(connectionId);
    if(!conn)return alert('Choose your company WhatsApp sender first.','warning');
    const button=e.target.closest('[data-marketing-sync-templates]');button.disabled=true;
    try{
     await fetchAll();marketingDraw();
     alert('CRM template list refreshed. To add an approved template, use Admin → WhatsApp Settings → Manual Sync Approved Template. No Meta token or approval is required for manual sync. No message sent.','success');
    }catch(error){alert('Could not refresh CRM template list: '+error.message,'error')}
    finally{if(button.isConnected)button.disabled=false}
    return;
   }
   if(e.target.closest('[data-open-settings]')){alert('Admin → Settings → WhatsApp Integration.','info');return}
   if(e.target.closest('[data-refresh-crm]')){try{await fetchAll();marketingDraw();alert('Latest GreenRich template references and CRM data loaded. SocialBerries automatic template API is not connected.','success')}catch(error){alert(error.message,'error')}return}
   if(e.target.closest('[data-create-service]')){serviceDialog();return}
   if(e.target.closest('[data-service-all]')){
    if(serviceCompany==='all')return alert('Choose one company before selecting all after-sales customers.','warning');
    const all=serviceTargets().filter(x=>x.type==='Customer'&&x.company_id===serviceCompany);
    serviceSelected=new Set(all.map(x=>x.id));marketingDraw();
    return alert(all.length+' loaded matching customers selected for draft (not sent).','info');
   }
   if(e.target.closest('[data-service-clear]')){serviceSelected.clear();marketingDraw();return}
   if(e.target.closest('[data-service-bulk]')){bulkServiceDialog();return}
   const serviceItem=e.target.closest('[data-service-select]');
   if(serviceItem){
    if(serviceItem.checked)serviceSelected.add(serviceItem.dataset.serviceSelect);
    else serviceSelected.delete(serviceItem.dataset.serviceSelect);
    return;
   }
   const incoming=e.target.closest('[data-inbound-history]');
   if(incoming){
    const x=targets().find(t=>t.id===incoming.dataset.inboundHistory);
    if(!app.admin||!x?.company_id)return alert('An Admin and linked company are required for provider chat history.','warning');
    const conn=rows.connections.find(c=>c.company_id===x.company_id&&c.provider.toLowerCase()==='socialberries');
    if(!conn)return alert('SocialBerries provider is not configured for this company.','warning');
    return openMessageHistory(conn.id,x.mobile);
   }
   if(e.target.closest('[data-provider-history]')){
    if(!app.admin)return alert('Admin permission required for provider history.','warning');
    if(scope==='all')return alert('Select one company to view its saved SocialBerries batch history.','warning');
    const conn=rows.connections.find(c=>c.company_id===scope&&c.provider.toLowerCase()==='socialberries');
    if(!conn)return alert('SocialBerries provider not configured for this company.','warning');
    return await checkProvider(conn.id,'saved');
   }
   if(e.target.closest('[data-provider-report]')){
    if(!app.admin)return alert('Admin permission required for provider reporting.','warning');
    if(scope==='all')return alert('Select one company to check its SocialBerries campaigns.','warning');
    const conn=rows.connections.find(c=>c.company_id===scope&&c.provider.toLowerCase()==='socialberries');
    if(!conn)return alert('No SocialBerries provider configured for this company.','warning');
    return await checkProvider(conn.id,'batches');
   }
   if(e.target.closest('[data-select-all-matching]')){
    const members=audience().filter(x=>!selected.has(x.id));
    const free=Math.max(0,500-selected.size);
    members.slice(0,free).forEach(x=>selected.add(x.id));
    marketingDraw();
    alert(Math.min(members.length,free)+' additional filtered contacts selected (maximum 500 per campaign).','info');
    return;
   }
   if(e.target.closest('[data-clear-all-matching]')){selected.clear();marketingDraw();return}
   const selectItem=e.target.closest('[data-select-contact]');if(selectItem){if(selectItem.checked)selected.add(selectItem.dataset.selectContact);else selected.delete(selectItem.dataset.selectContact);const n=element.querySelector('[data-grwc-selected-count]');if(n)n.textContent=String(selectedStatus().total);element.querySelectorAll('[data-grwc-selected-count]').forEach(x=>x.textContent=String(selectedStatus().total));return}
   if(e.target.id==='grwc-all'){element.querySelectorAll('[data-select-contact]').forEach(x=>{x.checked=e.target.checked;if(x.checked)selected.add(x.dataset.selectContact);else selected.delete(x.dataset.selectContact)});const n=element.querySelector('[data-grwc-selected-count]');if(n)n.textContent=String(selectedStatus().total);element.querySelectorAll('[data-grwc-selected-count]').forEach(x=>x.textContent=String(selectedStatus().total));return}
  };
  element.onchange=e=>{
   const form=e.target.closest?.('#grwc-audience-form');
   if(form&&e.target.name==='image'){
    campaignImage=e.target.files?.[0]||null;
    const status=form.querySelector('[data-campaign-image-status]');
    if(status)status.textContent=campaignImage?'Selected for sending: '+campaignImage.name:'No image selected';
    return;
   }
   if(form&&(e.target.dataset?.waField||e.target.dataset?.waCustom)){
    const key=e.target.dataset.waField||e.target.dataset.waCustom;
    const id=form.elements.template_id.value;
    if(!campaignParamValues[id])campaignParamValues[id]={};
    const select=[...form.querySelectorAll('select[data-wa-field]')].find(x=>x.dataset.waField===key);
    const input=[...form.querySelectorAll('[data-wa-custom]')].find(x=>x.dataset.waCustom===key);
    if(select){
     if(input){input.hidden=select.value!=='custom';input.required=select.value==='custom'}
     campaignParamValues[id][key]=select.value==='custom'?String(input?.value||''):select.value;
    }else campaignParamValues[id][key]=String(e.target.value||'');
    return;
   }
   if(form&&e.target.name==='template_id'){
    drawTemplateRequirements(form);
    return;
   }
   if(form&&e.target.name==='connection_id'){
    updateCampaignTemplateSelect(form);
    drawTemplateRequirements(form);
    return;
   }
   const map={'grwc-company':'scope','grwc-kind':'kind','grwc-source':'source','grwc-tag':'tag','grwc-owner':'owner',
     'grwc-product':'product','grwc-stage':'leadStage','grwc-date-from':'startDate','grwc-date-to':'endDate',
     'grwc-service-company':'serviceCompany','grwc-service-type':'serviceType','grwc-service-source':'serviceSource',
     'grwc-service-tag':'serviceTag','grwc-service-product':'serviceProduct','grwc-service-order':'serviceOrder',
     'grwc-service-delivery':'serviceDelivery','grwc-service-from':'serviceStart','grwc-service-to':'serviceEnd',
     'grwc-guide-company':'guidanceCompany','grwc-guide-product':'guidanceProduct'};
   if(!map[e.target.id])return;
   const v=e.target.value;
   switch(e.target.id){
    case 'grwc-company':scope=v;break;
    case 'grwc-kind':kind=v;break;
    case 'grwc-source':source=v;break;
    case 'grwc-tag':tag=v;break;
    case 'grwc-owner':owner=v;break;
    case 'grwc-product':product=v;break;
    case 'grwc-stage':leadStage=v;break;
    case 'grwc-date-from':startDate=v;break;
    case 'grwc-date-to':endDate=v;break;
    case 'grwc-service-company':serviceCompany=v;serviceSelected.clear();break;
    case 'grwc-service-type':serviceType=v;break;
    case 'grwc-service-source':serviceSource=v;break;
    case 'grwc-service-tag':serviceTag=v;break;
    case 'grwc-service-product':serviceProduct=v;break;
    case 'grwc-service-order':serviceOrder=v;break;
    case 'grwc-service-delivery':serviceDelivery=v;break;
    case 'grwc-service-from':serviceStart=v;break;
    case 'grwc-service-to':serviceEnd=v;break;
    case 'grwc-guide-company':guidanceCompany=v;guidanceProduct='all';break;
    case 'grwc-guide-product':guidanceProduct=v;break;
   }
   marketingDraw();
  };
  element.oninput=e=>{
   const ids={'grwc-search':'needle','grwc-service-search':'serviceNeedle','grwc-inbound-lookup':'inboundNeedle','grwc-inbox-lookup':'inboxNeedle'};
   if(!ids[e.target.id])return;
   const field=e.target.id,pos=e.target.selectionStart;
   if(field==='grwc-search')needle=e.target.value.toLowerCase();
   if(field==='grwc-service-search')serviceNeedle=e.target.value.toLowerCase();
   if(field==='grwc-inbound-lookup')inboundNeedle=e.target.value.toLowerCase();
   if(field==='grwc-inbox-lookup')inboxNeedle=e.target.value.toLowerCase();
   marketingDraw();
   const input=element.querySelector('#'+field);
   input?.focus();
   try{input?.setSelectionRange(pos,pos)}catch{}
  };
  element.onsubmit=async e=>{
   if(e.target.id!=='grwc-audience-form')return;e.preventDefault();
   if(sendBusy)return;
   if(!app.admin)return alert('Only administrators can send WhatsApp campaigns.','warning');
   if(!can('create'))return alert('Marketing create permission required','error');
   const f=new FormData(e.target),connectionId=String(f.get('connection_id')||''),templateId=String(f.get('template_id')||'');
   const sender=campaignConnection(connectionId);
   if(!sender)return alert('Choose an authorized WhatsApp provider.','error');
   const companyId=sender.company_id;
   const template=rows.templates.find(t=>t.id===templateId&&t.company_id===companyId&&t.connection_id===connectionId&&t.category==='marketing');
   if(!template)return alert('Choose an approved marketing template.','warning');
   const matches=campaignTargets(companyId);
   if(!selected.size)return alert('No customers selected. Tick at least one checkbox in the audience above.','warning');
   if(!matches.length){
    const chosen=targets().filter(x=>selected.has(x.id));
    const invalid=chosen.filter(x=>!/^[6-9][0-9]{9}$/.test(digits(x.mobile))).length;
    const otherLeads=chosen.filter(x=>x.type==='Lead'&&x.company_id!==companyId).length;
    return alert('None of the '+selected.size+' selected contacts can be sent by this provider. '+invalid+' invalid mobile number(s), '+otherLeads+' lead(s) from a different company.','warning');
   }
   const spec=templateRequirements(template);
   if(spec.unsupported.length)return alert('Cannot send this template: '+spec.unsupported.join(' · '),'warning');
   const templateFields={};
   for(const entry of spec.fields){
    const control=[...e.target.querySelectorAll('[data-wa-field]')].find(x=>x.dataset.waField===entry.key);
    const custom=[...e.target.querySelectorAll('[data-wa-custom]')].find(x=>x.dataset.waCustom===entry.key);
    const value=String(control?.value==='custom'?custom?.value:control?.value||'').trim();
    if(!value)return alert('Complete required template field: '+entry.label,'warning');
    templateFields[entry.key]=value;
   }
   const excluded=selected.size-matches.length;
   const file=campaignImage||f.get('image');
   const hasFile=!!file&&typeof file.size==='number'&&file.size>0;
   const allowed={'image/jpeg':'jpg','image/png':'png'};
   if(hasFile&&(!allowed[file.type]||file.size>5*1024*1024))
    return alert('Choose a JPEG or PNG campaign image under 5 MB; WebP is not accepted for this template header.','warning');
   if(hasFile&&!app.admin)
    return alert('Only company Admin can upload a private campaign image.','warning');
   const consent=rows.consents||[];
   const eligible=matches.filter(x=>consent.some(w=>w.company_id===companyId&&
    sameMobile(w.mobile,x.mobile)&&w.consent_status==='opted_in'&&!!w.consent_source&&!!w.consent_at&&!w.opt_out_at));
   // The server validates all sending requirements in one read-only request before any draft is created.
   const signature=JSON.stringify([companyId,connectionId,templateId,matches.map(x=>x.id).sort(),
    hasFile?[file.name,file.size,file.lastModified]:null,templateFields]);
   let record=lastPrepared?.signature===signature?lastPrepared.record:null;
   sendBusy=true;
   const clicked=e.target.querySelector('[data-send-campaign]');if(clicked){clicked.disabled=true;clicked.textContent='Sending…'}
   try{
    const readiness=await secureSend('preflight_marketing',{
     connection_id:connectionId,template_id:templateId,crm_ids:matches.map(x=>x.id),has_image:hasFile,template_fields:templateFields
    });
    if(!readiness.ready){
     const issues=readiness.blockers||[];
     alert('Nothing sent. '+issues.map((x,i)=>(i+1)+'. '+x).join(' | ')+
      '. Complete provider, approved template and customer permission setup once in Settings → WhatsApp Integration.','warning');
     return;
    }
    if(!record)record=await save('gr_wa_campaigns',{
      company_id:companyId,connection_id:connectionId,template_id:templateId,
      name:(rows.templates.find(t=>t.id===templateId)?.name||'WhatsApp campaign')+' · '+new Date().toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'}),
      audience:{crm_ids:matches.map(x=>x.id),selected_count:matches.length,
       selected_customers:matches.filter(x=>x.type==='Customer').length,
       selected_leads:matches.filter(x=>x.type==='Lead').length,
       crm_consent_checked_count:eligible.length,selection:'manual',source:'greenrich_crm',
       template_fields:templateFields,
       company_rule:'shared_customers_provider_sender_leads_company_scoped'},
      status:'draft',
      notes:'Not sent. Template requires verified approved components. Media images are private draft assets, not a provider-sent template header. Actual messaging requires opt-in and verified sender.'
    });
    if(hasFile&&lastPrepared?.signature!==signature){
     const path=companyId+'/'+record.id+'/marketing.'+allowed[file.type];
     const upload=await app.db.storage.from('gr-wa-campaign-images')
      .upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
     if(upload.error)throw Error('Campaign draft saved, but image upload failed: '+upload.error.message);
     const update=await app.db.from('gr_wa_campaigns')
      .update({attachment_path:path,attachment_mime:file.type}).eq('id',record.id).eq('company_id',companyId);
     if(update.error)throw Error('Campaign draft saved and image uploaded, but image link failed: '+update.error.message);
    }
    lastPrepared={signature,record:{id:record.id,connection_id:connectionId}};
    await reviewCampaign(lastPrepared.record);
    await fetchAll();marketingDraw();
   }catch(error){
    alert(error.message,'error');
    await fetchAll().catch(()=>{});
   }finally{sendBusy=false;const button=element.querySelector('[data-send-campaign]');if(button){button.disabled=false;button.textContent='Send Campaign'}}
  };
 }
 async function mountSettings(element,ctx){
  app=ctx;scope=ctx.selectedCompany&&ctx.companies.includes(ctx.selectedCompany)
   ?ctx.selectedCompany
   :(ctx.companies.includes('grow-india')?'grow-india':ctx.companies[0]);
  element.innerHTML='<p>Loading WhatsApp integration settings…</p>';
  try{
   await fetchAll();settingsDraw(element);
   // Manual sync is the primary path. Optional Meta refresh runs only when requested.
  }catch(e){element.textContent='WhatsApp settings unavailable: '+e.message}
 }
 const configure=ctx=>{app=ctx};
 window.GreenRichWhatsAppWorkflows={configure,mountMarketing,mountSettings,welcomeOptions,saveLeadWelcome,openCustomerRule,openCustomerHistory};
})();
