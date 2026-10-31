'use strict';
/* CRM-led WhatsApp handoff, not a replacement for SocialBerries.
   No network calls to undocumented provider endpoints and no simulated sends. */
(()=>{
 let app=null,root=null,scope='all',kind='all',source='all',tag='all',owner='all',needle='',provider='all',current='audience',rows={},selected=new Set();
 let startDate='',endDate='',product='all',leadStage='all',inboundNeedle='',serviceCompany='all',serviceSource='all',serviceTag='all',serviceProduct='all',serviceOrder='all',serviceDelivery='all',serviceType='all',serviceStart='',serviceEnd='',serviceNeedle='',serviceSelected=new Set(),campaignReportPage=1,sendBusy=false,lastPrepared=null,campaignImage=null;
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
 const tmpl=t=>t.name+' · '+t.language+' · '+(t.body?'Preview recorded':'Metadata only')+' · '+(t.provider_source==='admin_confirmed'?'Admin-confirmed approved':t.provider_approval==='approved'?'Provider verified':t.provider_preview?.status==='APPROVED'?'Screenshot · API unverified':'Unverified');
 const templateOptions=(c,connectionId='')=>templates(c).filter(t=>t.category==='marketing'&&(!connectionId||t.connection_id===connectionId)).map(t=>[t.id,t.name+' · '+t.language+' · '+(t.provider_approval==='approved'&&t.provider_source==='verified_provider'?'Verified via Meta':t.provider_approval==='approved'&&t.provider_source==='admin_confirmed'?'Admin-confirmed':t.body&&Array.isArray(t.provider_preview?.components)?'JSON imported · not verified':t.provider_preview?.status==='APPROVED'?'Meta approved reported · body missing':'Approval not confirmed')]);
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
  const [connections,templatesList,campaigns,recurring,inbound,welcomes,leads,customers,tags,profiles,sheets,providerLeads,dispatches,consents,products,messages]=await Promise.all([
   read('gr_wa_connections'),read('gr_wa_templates'),read('gr_wa_campaigns'),read('gr_wa_recurring_rules'),
   read('gr_wa_inbound_rules'),read('gr_wa_lead_welcome'),
   app.canLeads?read('gr_lead_pipeline','company_id,lead_id,contact,title,mobile,email,source,tag_ids,assigned_to,stage,customer_id,product_id,created_at'):Promise.resolve([]),
   app.canCustomers?db.from('gr_crm_customers').select('id,name,mobile,mobile2,email,source,type,owner,tag_ids,created_at').limit(2000).then(r=>{if(r.error)throw r.error;return r.data||[]}):Promise.resolve([]),
   db.from('gr_crm_tags').select('id,name').limit(500).then(r=>r.data||[]),
   app.admin?db.from('gr_profiles').select('id,full_name,company_ids,active').eq('active',true).limit(300).then(r=>r.data||[]):Promise.resolve([]),
   app.admin?read('gr_sheet_connections'):Promise.resolve([]),
   app.admin?read('gr_wa_provider_leads'):Promise.resolve([]),
   optional('gr_dispatch_orders','id,company_id,source_sale_id,order_id,order_date,customer_id,customer_name,customer_mobile,product_name,sku,status,dispatched_at,delivered_at,customer_email'),
   optional('gr_wa_contacts','id,company_id,customer_id,lead_id,mobile,consent_status,consent_source,consent_at,opt_out_at'),
   optional('gr_pilot_products','id,company_id,crm_product_id,name,sku'),
   optional('gr_wa_messages','id,company_id,campaign_id,delivery_status,phone')
  ]);
  rows={connections,templates:templatesList,campaigns,recurring,inbound,welcomes,leads,customers,tags,profiles,sheets,providerLeads,dispatches,consents,products,messages};
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
  stage:'',product_id:'',created_at:c.created_at||'',products:ordersFor(c).map(o=>o.product_name),
  orders:ordersFor(c)});
 const leadTarget=l=>({id:'L:'+l.company_id+':'+l.lead_id,type:'Lead',name:l.contact||l.title||'Lead',
  mobile:l.mobile||'',email:l.email||'',source:l.source||'',tags:l.tag_ids||[],
  company_id:l.company_id,owner:l.assigned_to||'',customer_id:l.customer_id,lead_id:l.lead_id,
  stage:l.stage||'',product_id:l.product_id||'',created_at:l.created_at||'',
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
 '<nav class="grwc-tabs">'+[['audience','Audience & Campaign'],['sync','Incoming Leads'],['welcome','Lead Welcome'],['recurring','Repeat Service']].map(([id,title])=>'<button data-view="'+id+'" class="'+(id===current?'active':'')+'">'+title+'</button>').join('')+'</nav>';
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
   '<div class="grwc-selection-toolbar"><button type="button" data-select-all-matching>Select all loaded matches</button><button type="button" data-clear-all-matching>Clear selection</button></div>'+
   '<div class="grwc-tablewrap"><table><thead><tr><th><input type="checkbox" id="grwc-all"></th><th>Name</th><th>Type</th><th>Mobile</th><th>Source</th><th>Assigned to</th></tr></thead><tbody>'+
   list.slice(0,250).map(x=>'<tr><td><input type="checkbox" data-select-contact="'+esc(x.id)+'" '+(selected.has(x.id)?'checked':'')+'></td><td>'+esc(x.name)+'</td><td>'+x.type+'</td><td>'+esc(x.mobile)+'</td><td>'+esc(x.source)+'</td><td>'+esc(rows.profiles.find(p=>p.id===x.owner)?.full_name||'—')+'</td></tr>').join('')+'</tbody></table></div>'+
   '<p class="grwc-muted">Company is an optional filter. Previously unassigned customers can be selected. Showing the first 250 of '+list.length+' matching contacts. Selections are kept across filters; use Clear selection to start over. Valid numbers, sender-company leads and marketing permission are checked before sending.</p></section>'+
   '<section class="grwc-panel">'+headers('Send WhatsApp campaign','Choose an approved marketing template and optional image.')+
   '<form id="grwc-audience-form" class="grwc-form">'+
   '<label>WhatsApp provider<select name="connection_id" required>'+options(rows.connections.filter(c=>app.companies.includes(c.company_id)).map(c=>[c.id,c.display_name+' · '+name(c.company_id)]),'Choose WhatsApp provider')+'</select></label>'+
   '<label>Approved marketing template<select name="template_id" required>'+options([], 'Choose provider first')+'</select></label>'+
   '<label>Campaign image (required when template has IMAGE header)<input type="file" name="image" accept="image/png,image/jpeg,image/webp"><small data-campaign-image-status>'+(campaignImage?'Selected for sending: '+esc(campaignImage.name):'No image selected')+'</small></label>'+
   '<p class="grwc-muted grwc-span">Only approved templates with complete message content and opted-in contacts can be sent. A screenshot reference must first be synced once in Settings → WhatsApp Integration.</p>'+
   '<button type="submit" class="grwc-primary" data-send-campaign>Send Campaign</button></form></section>'+campaignReports();
 }
 function campaignReports(){
  const relevant=rows.campaigns.filter(x=>scope==='all'||x.company_id===scope).slice(0,100);
  const messages=rows.messages||[],completed=relevant.filter(x=>!!x.provider_batch_id);
  const tracked=messages.filter(m=>relevant.some(c=>c.id===m.campaign_id));
  return '<section class="grwc-panel">'+headers('Campaign reports & delivery tracking',
   'Provider acceptance is not WhatsApp delivery. Actual deliveries depend on reported provider events.')+
   '<div class="grwc-grid grwc-kpis">'+
   [['Campaigns',relevant.length],['Local attempts',tracked.length],
    ['Awaiting provider delivery',tracked.filter(x=>x.delivery_status==='queued').length],
    ['Failed / uncertain',tracked.filter(x=>x.delivery_status==='failed').length],
    ['Provider batches linked',completed.length]].map(x=>'<div class="grwc-feature"><small>'+esc(x[0])+'</small><h3>'+esc(x[1])+'</h3></div>').join('')+'</div>'+
   (relevant.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Campaign</th><th>Company</th><th>Template</th><th>Selected</th><th>Attempts</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+
   relevant.map(x=>{
    const attempts=messages.filter(m=>m.campaign_id===x.id);
    return '<tr><td>'+esc(x.name)+'</td><td>'+esc(name(x.company_id))+'</td><td>'+esc(rows.templates.find(t=>t.id===x.template_id)?.name||'—')+'</td><td>'+esc(x.audience?.selected_count||0)+'</td><td>'+attempts.length+'</td><td>'+esc(x.status==='draft'?'Draft · not sent':x.status)+'</td><td><button type="button" data-review-campaign="'+esc(x.id)+'">Send remaining</button></td></tr>';
   }).join('')+'</tbody></table></div>':empty('No CRM marketing campaigns saved yet.'))+
   '<p class="grwc-muted">Every send attempt is saved once to prevent duplicates. Pending means not yet verified delivered. Uncertain sends are not automatically retried. Provider READ may not prove a human saw the message.</p>'+
   (app.admin?'<button type="button" data-provider-report>View SocialBerries native bulk statistics</button>':'')+
   '</section>';
 }
 function welcomeView(){
  const rules=scoped(rows.welcomes),co=cd();
  return '<section class="grwc-panel">'+headers('Optional Welcome Template for New Leads','Choose a template while creating a lead, importing Excel/CSV, or mapping a Google Sheet. Blank means no welcome message.')+
   '<div class="grwc-notice">If no welcome template is selected, no message preference is saved. Template choices are read from GreenRich provider references and can be refreshed; automatic SocialBerries Get Templates sync still needs the provider endpoint.</div>'+
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
   '<p class="grwc-muted">Showing 250 of '+matches.length+' loaded matches. Customers without a unique company assignment cannot be bulk-targeted. Saving a repeat rule does not send any WhatsApp messages.</p></section>'+
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
   '<div class="grwc-notice"><b>Automatic inbound lead creation is not active.</b> The supplied SocialBerries API documents message lookup by known number, but not the signed webhook payload for discovering new incoming senders. No incoming enquiry is silently lost or fabricated; configure verified events before switching it on.</div></section>'+
   '<section class="grwc-panel">'+headers('Incoming lead assignment rules',
    'Select company, source, tags and assigned salesperson under Settings → WhatsApp Integration. Common queue is allowed.')+
   (rules.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Company</th><th>Event</th><th>Source</th><th>Salesperson</th><th>State</th></tr></thead><tbody>'+
    rules.map(r=>'<tr><td>'+esc(name(r.company_id))+'</td><td>'+esc(r.event_type)+'</td><td>'+esc(r.source_name)+'</td><td>'+esc(rows.profiles.find(p=>p.id===r.assigned_to)?.full_name||'Common sales queue')+'</td><td>Draft · webhook not connected</td></tr>').join('')+'</tbody></table></div>':
    empty('No incoming WhatsApp assignment rules have been saved.'))+
   '<button type="button" data-open-settings>Configure incoming lead assignment</button></section>';
 }
 function marketingDraw(){
  if(!root?.isConnected)return;
  const previous=root.querySelector('#grwc-audience-form');
  const remembered=previous?{
   connection:previous.elements.connection_id?.value||'',
   template:previous.elements.template_id?.value||''
  }:null;
  root.innerHTML='<div class="grwc">'+header()+(current==='audience'?audienceView():current==='welcome'?welcomeView():current==='recurring'?recurringView():inboundView())+'</div>';
  const form=root.querySelector('#grwc-audience-form');
  if(form&&remembered){
   const prov=form.elements.connection_id;
   if(Array.from(prov.options).some(o=>o.value===remembered.connection)){
    prov.value=remembered.connection;
    const company=campaignConnection(remembered.connection)?.company_id||'';
    const tpl=form.elements.template_id;
    tpl.innerHTML=options(templateOptions(company,remembered.connection),'Choose a template for this provider');
    if(Array.from(tpl.options).some(o=>o.value===remembered.template))tpl.value=remembered.template;
   }
   // Campaign name is created automatically.
  }
 }
 const input=(label,key,value='',type='text')=>'<label>'+esc(label)+'<input name="'+esc(key)+'" type="'+type+'" value="'+esc(value)+'"></label>';
 const note=(label,key,v='')=>'<label class="grwc-span">'+esc(label)+'<textarea name="'+esc(key)+'" rows="3">'+esc(v)+'</textarea></label>';
 const field=(label,key,opts,required=false)=>'<label>'+esc(label)+'<select name="'+esc(key)+'" '+(required?'required':'')+'>'+opts+'</select></label>';
 function dialog(title,body,submit,buttonLabel='Save draft',successText='Saved successfully'){
  const d=document.createElement('dialog');d.className='grwc-dialog';d.innerHTML='<form><div class="grwc-dialog-head"><h3>'+esc(title)+'</h3><button type="button" data-dismiss>×</button></div><div class="grwc-dialog-fields">'+body+'</div><div class="grwc-dialog-foot"><button type="button" data-dismiss>Cancel</button><button type="submit" class="grwc-primary">'+esc(buttonLabel)+'</button></div></form>';
  document.body.append(d);d.querySelectorAll('[data-dismiss]').forEach(b=>b.onclick=()=>d.close());
  d.onclose=()=>d.remove();
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();let b=d.querySelector('[type=submit]');b.disabled=true;
    try{await submit(new FormData(e.currentTarget));d.close();alert(successText,'success');await fetchAll();if(root?.isConnected)marketingDraw()}
    catch(error){alert('Not saved: '+error.message,'error')}finally{b.disabled=false}};
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
  const providers=rows.connections.filter(p=>p.company_id===c),templ=rows.templates.filter(t=>t.company_id===c),sheetRows=rows.sheets.filter(s=>s.company_id===c),opted=rows.consents.filter(w=>w.company_id===c&&w.consent_status==='opted_in'&&w.consent_source&&w.consent_at&&!w.opt_out_at).length,approved=templ.filter(t=>t.category==='marketing'&&t.provider_approval==='approved'&&['verified_provider','admin_confirmed'].includes(t.provider_source)).length;
  container.innerHTML='<div class="grwc">'+
   '<div class="grwc-hero"><div><small>SETTINGS / WHATSAPP</small><h2>WhatsApp Integration Settings</h2><p>Connect SocialBerries, sync existing templates, assign leads and configure service rules.</p></div><span class="grwc-chip">Admin only</span></div>'+
   '<div class="grwc-notice"><b>WhatsApp Marketing setup:</b> '+opted+' recorded opt-in(s) · '+approved+' confirmed MARKETING template(s) for '+esc(name(c))+'. Complete these one-time setup steps below. Marketing stays a simple Send Campaign page. API credentials stay in Supabase Secrets.</div>'+
   sel('Company','grwc-settings-company',app.companies.map(c=>[c,name(c)]),c,null)+
   '<section class="grwc-panel">'+headers('1 · Your WhatsApp providers','GreenRich uses SocialBerries for existing templates and delivery. The second provider is optional.')+
   '<div class="grwc-grid">'+[1,2].map(slot=>{
    const p=providers.find(p=>p.slot===slot),label=p?.display_name||(slot===1?'SocialBerries':'Second provider');
    return '<div class="grwc-feature"><b>Tool '+slot+': '+esc(label)+'</b><p>Sender: '+esc(p?.sender_phone||'Not set')+'</p><p>Authentication: Server-side Basic Auth · Not verified</p>'+
      '<button type="button" data-edit-provider="'+slot+'">Edit details</button> '+
      (p&&p.provider.toLowerCase()==='socialberries'?'<button type="button" data-test-provider="'+esc(p.id)+'">Test Connection (read-only)</button> <button type="button" data-batches-provider="'+esc(p.id)+'">Read Campaign Status</button> <button type="button" data-messages-provider="'+esc(p.id)+'">View Message History</button>':'')+
      '</div>';
   }).join('')+'</div>'+
   '<div class="grwc-steps"><b>Connection instructions — SocialBerries</b><ol>'+
   '<li>SocialBerries → Developers → Add New Key → Name <b>GreenRich ONE CRM</b>. Choose an expiry and save the credential securely. For Allowed IPs, do not guess a Supabase IP; ask SocialBerries whether blank is permitted or a static egress IP is required.</li>'+
   '<li>The API specification says <code>Authorization: Basic base64(username:password)</code>. Confirm with SocialBerries whether Developer API keys replace this password or use a separate authentication method.</li>'+
   '<li>Supabase → Edge Functions → Secrets: enter server-side <b>BASE_URL</b>, <b>BASIC_USERNAME</b>, <b>BASIC_PASSWORD</b> for this company/provider. Use an HTTPS API host, not the documentation URL. Set API_VERSION (default v1). Never enter credentials in CRM or GitHub.</li>'+
   '<li>Environment variable prefix for tool 1: <code>'+esc(c==='grow-india'?'SB_GROW_INDIA_SLOT1':'SB_ENVIRO_SOLUTIONS_SLOT1')+'</code> (tool 2 uses SLOT2). Example: <code>..._BASE_URL</code>.</li>'+
   '<li>Press <b>Test Connection</b> after configuration. It calls only <code>GET /api/v1/users/?page=1</code>. No WhatsApp message is sent.</li>'+
   '<li>Existing templates: import their full provider-approved JSON until SocialBerries supplies a Get Templates endpoint. A guarded campaign-sending function is deployed but remains blocked without credentials, approved template details, marketing opt-in and server activation. Inbound webhooks are not active.</li>'+
   '</ol></div></section>'+
   '<section class="grwc-panel">'+headers('2 · Existing SocialBerries templates','Do not recreate your approved templates in the CRM. Template names should be fetched from the provider API when connected.')+
   '<p class="grwc-muted">Template catalog: '+templ.length+' reference(s). Template content and approval verification are separate. Importing JSON saves message content but not a verified approval. Verify through your authorized Meta WABA or compare the JSON with the approved SocialBerries template and confirm it below.</p>'+
   '<button type="button" disabled title="No Get Templates API was included in the supplied documentation">Auto-sync Templates (provider endpoint needed)</button> '+
   '<button type="button" data-import-template-metadata>Link existing template by ID</button> '+
   '<button type="button" data-import-provider-template>Import Existing Template JSON (one or multiple)</button>'+
   (templ.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Template</th><th>ID</th><th>Category</th><th>Provider</th><th>Language</th><th>CRM status</th></tr></thead><tbody>'+templ.map(t=>'<tr><td>'+esc(t.name)+'</td><td>'+esc(t.provider_template_id||'—')+'</td><td>'+esc(t.category)+'</td><td>'+esc(connectionLabel(t.connection_id))+'</td><td>'+esc(t.language)+'</td><td>'+esc(t.provider_source==='verified_provider'?'Verified directly with Meta':t.provider_source==='admin_confirmed'?'Admin-confirmed approved':t.body&&Array.isArray(t.provider_preview?.components)?'JSON imported · approval not yet verified':t.provider_preview?.status==='APPROVED'?'Meta APPROVED reported · body missing':'Awaiting verification')+(t.category==='marketing'?' <button type="button" data-verify-meta-template="'+esc(t.id)+'">Verify with Meta</button>':'')+'</td></tr>').join('')+'</tbody></table></div>':empty('No template references added. Copy an approved template preview JSON from SocialBerries and import it above.'))+'</section>'+
   '<section class="grwc-panel">'+headers('Marketing readiness — one-time setup','Complete only when actual customer permission and approved Meta template details are available.')+
    '<div class="grwc-grid"><div class="grwc-feature"><b>Customer marketing permission</b><p>'+opted+' recorded opt-in(s) for '+esc(name(c))+'.</p><button type="button" data-settings-optin>Record genuine opt-in</button></div>'+
    '<div class="grwc-feature"><b>Approved Meta template</b><p>'+approved+' confirmed approved marketing template(s).</p><button type="button" data-settings-confirm-template>Confirm existing approved template</button></div></div>'+
    '<p class="grwc-muted">CRM contacts and Meta leads are not automatically opted in. Record genuine permission once for the correct sending company; future campaigns reuse it.</p></section>'+
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
   '<section class="grwc-panel">'+headers('4 · WhatsApp and website enquiry → CRM Lead','Choose source, tags and salesperson for each inbound enquiry type. OTP-only login events must not create marketing leads.', '<button type="button" data-new-inbound>+ Mapping</button>')+
   (rows.inbound.filter(r=>r.company_id===c).length?rows.inbound.filter(r=>r.company_id===c).map(r=>'<div class="grwc-feature"><b>'+esc(r.event_type)+'</b><p>Source: '+esc(r.source_name)+' · Person: '+esc(rows.profiles.find(p=>p.id===r.assigned_to)?.full_name||'Common')+'</p><small>Awaiting verified webhook</small></div>').join(''):empty('No inbound assignment mappings.'))+'</section>'+
   '<section class="grwc-panel">'+headers('5 · Google Sheet default welcome templates','Each Sheet already has a salesperson. Choose which template belongs to newly imported leads; leave blank for no welcome.')+
   (sheetRows.length?sheetRows.map(sh=>'<div class="grwc-sheet"><div><b>'+esc(sh.tab_name)+'</b><small>'+esc(sh.source_name)+' · '+esc(rows.profiles.find(p=>p.id===sh.assigned_to)?.full_name||'Common queue')+'</small></div><select data-sheet-template="'+esc(sh.id)+'">'+options(templateOptions(c))+'</select><button type="button" data-save-sheet="'+esc(sh.id)+'">Save</button></div>').join(''):empty('No connected Sheets for this company. Configure them under Settings → Google Sheet Leads.'))+'</section>'+
   '<section class="grwc-panel">'+headers('6 · Security & sending status','API credentials belong exclusively in secure server-side secrets. Verify opt-in before any campaign.')+
   '<div class="grwc-grid"><div class="grwc-feature"><b>API connectivity & history</b><p>Read-only GET users, campaign batches and phone-specific WhatsApp messages. No messages sent.</p></div><div class="grwc-feature"><b>Template sending / bulk</b><p>Endpoints documented; production dispatch intentionally disabled until approved-template checks and consent mapping.</p></div><div class="grwc-feature"><b>Webhook lead capture</b><p>No authenticated webhook signature/payload specification supplied yet.</p></div><div class="grwc-feature"><b>Repeat follow-ups</b><p>Draft-only until provider and opt-in verification.</p></div></div></section></div>';
  container.querySelectorAll('[data-sheet-template]').forEach(x=>{const sh=sheetRows.find(r=>r.id===x.dataset.sheetTemplate);x.value=sh?.welcome_template_id||''});
  container.querySelector('#grwc-settings-company').onchange=e=>{scope=e.target.value;settingsDraw(container)};
  container.onclick=async e=>{
   const edit=e.target.closest('[data-edit-provider]'),add=e.target.closest('[data-new-inbound]'),sheet=e.target.closest('[data-save-sheet]');
   const check=e.target.closest('[data-test-provider]'),batches=e.target.closest('[data-batches-provider]'),messages=e.target.closest('[data-messages-provider]');
   if(check)return await checkProvider(check.dataset.testProvider,'test');
   if(batches)return await checkProvider(batches.dataset.batchesProvider,'batches');
   if(messages)return openMessageHistory(messages.dataset.messagesProvider);
   const sync=e.target.closest('[data-sync-provider-leads]'),importLead=e.target.closest('[data-import-provider-lead]');
   if(sync)return await syncProviderLeads(sync.dataset.syncProviderLeads,container);
   if(importLead)return importStagedLead(importLead.dataset.importProviderLead,container);
   const verify=e.target.closest('[data-verify-meta-template]');if(verify)return verifyMetaTemplate(c,verify.dataset.verifyMetaTemplate,container);
   if(e.target.closest('[data-settings-optin]'))return settingsConsent(c,container);
   if(e.target.closest('[data-settings-confirm-template]'))return settingsTemplateApproval(c,container);
   if(e.target.closest('[data-import-template-metadata]'))return importTemplateMetadata(c,container);
   if(e.target.closest('[data-import-provider-template]'))return importProviderTemplate(c,container);
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
 async function checkProvider(id,action){
   const provider=rows.connections.find(x=>x.id===id);
   if(!provider)return alert('Save provider details first.','warning');
   try{
    const result=await app.db.functions.invoke('greenrich-socialberries',{body:{connection_id:id,action}});
    if(result.error)throw Error(result.error.message||'Could not contact secure gateway');
    const data=result.data||{};
    if(!data.ok){
      const missing=Array.isArray(data.missing)?' Missing: '+data.missing.join(', '):'';
      alert((data.message||data.error||'Provider check failed')+missing,'warning');return;
    }
    if(action==='test')return alert('SocialBerries read-only API authentication succeeded. User count: '+(data.users_count??'not returned')+'. Marketing sending additionally requires a confirmed approved template, customer opt-ins and server activation.','success');
    const d=document.createElement('dialog');d.className='grwc-dialog';
    d.innerHTML='<div class="grwc-dialog-head"><h3>SocialBerries campaign reports</h3><button type="button" data-close>×</button></div>'+
      '<div class="grwc-dialog-fields"><p class="grwc-muted grwc-span">'+esc(data.count||0)+' provider batches · Page '+esc(data.page||1)+'. Provider batches are not automatically linked to GreenRich CRM campaign drafts.</p>'+
      '<div class="grwc-tablewrap grwc-span"><table><thead><tr><th>Campaign</th><th>Status</th><th>Recipients</th><th>Details</th></tr></thead><tbody>'+
      (data.batches||[]).map(b=>'<tr><td>'+esc(b.name||'—')+'</td><td>'+esc(b.status||'—')+'</td><td>'+esc(b.total_clients_count??'—')+'</td><td><button type="button" data-batch-stats="'+esc(b.id)+'">Read status</button></td></tr>').join('')+
      '</tbody></table></div><div class="grwc-feature grwc-span" id="grwc-batch-detail">Select a batch to view sent, delivered, read and failed counts. Replies are not measured by this endpoint.</div></div>'+
      '<div class="grwc-dialog-foot"><button type="button" data-close>Close</button></div>';
    document.body.append(d);
    d.onclose=()=>d.remove();
    d.querySelectorAll('[data-close]').forEach(x=>x.onclick=()=>d.close());
    d.onclick=async ev=>{
     const b=ev.target.closest('[data-batch-stats]');if(!b)return;
     const box=d.querySelector('#grwc-batch-detail');
     box.textContent='Loading provider batch statistics…';
     try{
      const r=await app.db.functions.invoke('greenrich-socialberries',{
       body:{connection_id:id,action:'batch_detail',batch_id:b.dataset.batchStats}});
      if(r.error||!r.data?.ok)throw Error(r.error?.message||r.data?.message||'Provider report unavailable');
      const p=r.data,stats=p.statistics||{};
      box.innerHTML='<b>'+esc(p.name)+'</b><p>Provider status: '+esc(p.status)+'</p>'+
       '<div class="grwc-grid">'+['total_messages','pending','sent','delivered','read','failed'].map(key=>
         '<div class="grwc-feature"><small>'+esc(key.replace('_',' '))+'</small><b>'+esc(stats[key]??'—')+'</b></div>').join('')+'</div>'+
       '<p class="grwc-muted">READ status is not guaranteed to mean a person opened the message. Responded / Not responded are unavailable until inbound events are connected.</p>';
     }catch(error){box.textContent='Could not load batch detail: '+error.message}
    };
    d.showModal();
   }catch(err){alert('Connection test failed: '+err.message,'error')}
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
  if(!choices.length)return alert('First save a SocialBerries provider for this company.','warning');
  dialog('Import existing SocialBerries template JSON',
   field('SocialBerries provider','connection_id',options(choices.map(x=>[x.id,x.display_name]),'Choose connection'),true)+
   '<p class="grwc-notice grwc-span">Use the actual approved template JSON from SocialBerries, with exact ID, name, language, category and components. Screenshot-created JSON must still be checked against the provider-approved template, especially button types and URLs.</p>'+
   '<label class="grwc-span">Choose a JSON file<input name="json_file" type="file" accept=".json,application/json"></label>'+
   note('Or paste complete JSON (single template or array)','preview_json'),
   async fd=>{
    const connectionId=String(fd.get('connection_id')||'');
    if(!choices.some(x=>x.id===connectionId))throw Error('Choose the correct SocialBerries provider');
    const file=fd.get('json_file');let content=String(fd.get('preview_json')||'').trim();
    if(file&&typeof file.text==='function'&&file.size){
     if(file.size>100000)throw Error('JSON file must be smaller than 100 KB');
     content=await file.text();
    }
    let parsed;try{parsed=JSON.parse(content)}catch{throw Error('Choose a valid JSON file or paste valid JSON')}
    const list=Array.isArray(parsed)?parsed:[parsed];
    if(!list.length||list.length>50)throw Error('Import 1–50 templates at once');
    const existing=rows.templates.filter(t=>t.company_id===company&&t.connection_id===connectionId);
    for(const item of list){
     const t=item?.preview_template?.components?item.preview_template:item;
     if(!t||typeof t!=='object'||!t.id||!t.name||!Array.isArray(t.components))
      throw Error('Template JSON must contain id, name and components');
     const prior=existing.find(x=>String(x.provider_template_id)===String(t.id));
     if(prior&&prior.name!==t.name)
      throw Error('Template ID '+t.id+' is already linked to "'+prior.name+'". Imported JSON says "'+t.name+'". Correct the name to match the approved provider template.');
     if(prior&&['verified_provider','admin_confirmed'].includes(prior.provider_source))
      throw Error('Template '+prior.name+' is already verified. Do not overwrite its approved content with unverified JSON.');
    }
    let imported=0;
    for(const item of list){
     const t=item?.preview_template?.components?item.preview_template:item;
     const out=await app.db.rpc('gr_wa_import_template_preview',{p_connection:connectionId,p_preview:t});
     if(out.error)throw Error('Imported '+imported+' templates. '+out.error.message);
     imported++;
    }
    await fetchAll();settingsDraw(container);
    alert(imported+' JSON record(s) imported with message content. They still require confirmation against the approved provider template.','success');
   },'Import JSON','Template JSON imported. See template status below.');
 }
 function editProvider(c,slot,container){
  // A provider slot belongs permanently to one company. The former form
  // exposed company_id as an editable dropdown, allowing an Enviro row to be
  // reassigned to Grow India's already-occupied slot (Postgres 23505).
  if(!app.admin||!app.companies.includes(c)||![1,2].includes(slot))
   return alert('You do not have permission to edit this company/provider slot.','error');
  const old=rows.connections.find(p=>p.company_id===c&&p.slot===slot);
  dialog('Configure WhatsApp Tool '+slot,
   '<div class="grwc-feature grwc-span"><b>Company (fixed for Tool '+slot+')</b><p>'+esc(name(c))+'</p>'+
   '<p>To edit another company, close this form and change the Company selector in WhatsApp Settings.</p></div>'+
   input('Provider name','display_name',old?.display_name||(slot===1?'SocialBerries':''))+
   input('Provider identifier','provider',old?.provider||(slot===1?'socialberries':''))+
   input('WhatsApp number','sender_phone',old?.sender_phone||'')+
   note('API documentation link / integration notes (no API keys)','notes',old?.notes||''),
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
   field('Incoming event','event_type',options([['whatsapp_enquiry','WhatsApp customer enquiry'],['website_enquiry','Website enquiry']]),true)+
   input('CRM source label','source_name','WhatsApp Enquiry')+
   field('Salesperson','assigned_to',options(rows.profiles.filter(p=>p.company_ids?.includes(c)).map(p=>[p.id,p.full_name]),'Common sales queue'))+
   input('Tags (approved tag IDs, comma-separated)','tag_ids','')+
   '<p class="grwc-muted grwc-span">Draft only: provider webhook receiver must be configured and authenticated before it can create CRM leads.</p>',
   async fd=>{
    const x=Object.fromEntries(fd);x.assigned_to=x.assigned_to||null;x.tag_ids=x.tag_ids.split(',').map(v=>v.trim()).filter(Boolean);x.status='draft';
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
   alert('SocialBerries accepted '+result.accepted+' / '+result.attempted+' messages; '+result.remaining+' eligible customers remain. Acceptance is not delivery.','success');
   await fetchAll();marketingDraw();
  }catch(e){alert(e.message,'error')}
 }
 async function mountMarketing(element,ctx){
  app=ctx;root=element;scope=ctx.selectedCompany&&ctx.companies.includes(ctx.selectedCompany)?ctx.selectedCompany:'all';
  current='audience';kind='all';source='all';tag='all';owner='all';needle='';provider='all';selected=new Set();campaignImage=null;
  startDate='';endDate='';product='all';leadStage='all';inboundNeedle='';serviceCompany=scope;serviceSelected.clear();
  root.innerHTML='<p>Loading CRM audience…</p>';
  try{await fetchAll();marketingDraw()}
  catch(e){root.innerHTML='<div class="grwc-empty">WhatsApp Marketing data unavailable: '+esc(e.message)+'</div>'}
  element.onclick=async e=>{
   const send=e.target.closest('[data-review-campaign]');if(send){const row=rows.campaigns.find(x=>x.id===send.dataset.reviewCampaign);if(row)await reviewCampaign(row);return}
   const v=e.target.closest('[data-view]');if(v){current=v.dataset.view;marketingDraw();return}
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
   if(e.target.closest('[data-provider-report]')){
    if(!app.admin)return alert('Admin permission required for provider reporting.','warning');
    if(scope==='all')return alert('Select one company to check its SocialBerries campaigns.','warning');
    const conn=rows.connections.find(c=>c.company_id===scope&&c.provider.toLowerCase()==='socialberries');
    if(!conn)return alert('No SocialBerries provider configured for this company.','warning');
    return await checkProvider(conn.id,'batches');
   }
   if(e.target.closest('[data-select-all-matching]')){
    const members=audience();
    selected=new Set(members.map(x=>x.id));
    marketingDraw();
    alert(members.length+' currently loaded matching contacts selected.','info');
    return;
   }
   if(e.target.closest('[data-clear-all-matching]')){selected.clear();marketingDraw();return}
   const selectItem=e.target.closest('[data-select-contact]');if(selectItem){if(selectItem.checked)selected.add(selectItem.dataset.selectContact);else selected.delete(selectItem.dataset.selectContact);const n=element.querySelector('[data-grwc-selected-count]');if(n)n.textContent=String(selectedStatus().total);return}
   if(e.target.id==='grwc-all'){element.querySelectorAll('[data-select-contact]').forEach(x=>{x.checked=e.target.checked;if(x.checked)selected.add(x.dataset.selectContact);else selected.delete(x.dataset.selectContact)});const n=element.querySelector('[data-grwc-selected-count]');if(n)n.textContent=String(selectedStatus().total);return}
  };
  element.onchange=e=>{
   const form=e.target.closest?.('#grwc-audience-form');
   if(form&&e.target.name==='image'){
    campaignImage=e.target.files?.[0]||null;
    const status=form.querySelector('[data-campaign-image-status]');
    if(status)status.textContent=campaignImage?'Selected for sending: '+campaignImage.name:'No image selected';
    return;
   }
   if(form&&e.target.name==='connection_id'){
    const connectionId=e.target.value,c=campaignConnection(connectionId)?.company_id||'';
    const tpl=form.querySelector('[name=template_id]');
    if(tpl)tpl.innerHTML=options(templateOptions(c,connectionId),'Choose a template for this provider');
    return;
   }
   const map={'grwc-company':'scope','grwc-kind':'kind','grwc-source':'source','grwc-tag':'tag','grwc-owner':'owner',
     'grwc-product':'product','grwc-stage':'leadStage','grwc-date-from':'startDate','grwc-date-to':'endDate',
     'grwc-service-company':'serviceCompany','grwc-service-type':'serviceType','grwc-service-source':'serviceSource',
     'grwc-service-tag':'serviceTag','grwc-service-product':'serviceProduct','grwc-service-order':'serviceOrder',
     'grwc-service-delivery':'serviceDelivery','grwc-service-from':'serviceStart','grwc-service-to':'serviceEnd'};
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
   }
   marketingDraw();
  };
  element.oninput=e=>{
   const ids={'grwc-search':'needle','grwc-service-search':'serviceNeedle','grwc-inbound-lookup':'inboundNeedle'};
   if(!ids[e.target.id])return;
   const field=e.target.id,pos=e.target.selectionStart;
   if(field==='grwc-search')needle=e.target.value.toLowerCase();
   if(field==='grwc-service-search')serviceNeedle=e.target.value.toLowerCase();
   if(field==='grwc-inbound-lookup')inboundNeedle=e.target.value.toLowerCase();
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
   const excluded=selected.size-matches.length;
   const file=campaignImage||f.get('image');
   const hasFile=!!file&&typeof file.size==='number'&&file.size>0;
   const allowed={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
   if(hasFile&&(!allowed[file.type]||file.size>5*1024*1024))
    return alert('Choose a JPG, PNG or WebP campaign image under 5 MB.','warning');
   if(hasFile&&!app.admin)
    return alert('Only company Admin can upload a private campaign image.','warning');
   const consent=rows.consents||[];
   const eligible=matches.filter(x=>consent.some(w=>w.company_id===companyId&&
    sameMobile(w.mobile,x.mobile)&&w.consent_status==='opted_in'&&!!w.consent_source&&!!w.consent_at&&!w.opt_out_at));
   // The server validates all sending requirements in one read-only request before any draft is created.
   const signature=JSON.stringify([companyId,connectionId,templateId,matches.map(x=>x.id).sort(),
    hasFile?[file.name,file.size,file.lastModified]:null]);
   let record=lastPrepared?.signature===signature?lastPrepared.record:null;
   sendBusy=true;
   const clicked=e.target.querySelector('[data-send-campaign]');if(clicked){clicked.disabled=true;clicked.textContent='Sending…'}
   try{
    const readiness=await secureSend('preflight_marketing',{
     connection_id:connectionId,template_id:templateId,crm_ids:matches.map(x=>x.id),has_image:hasFile
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
  try{await fetchAll();settingsDraw(element)}catch(e){element.textContent='WhatsApp settings unavailable: '+e.message}
 }
 const configure=ctx=>{app=ctx};
 window.GreenRichWhatsAppWorkflows={configure,mountMarketing,mountSettings,welcomeOptions,saveLeadWelcome,openCustomerRule,openCustomerHistory};
})();
