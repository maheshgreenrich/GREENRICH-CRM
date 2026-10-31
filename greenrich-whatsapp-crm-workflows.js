'use strict';
/* CRM-led WhatsApp handoff, not a replacement for SocialBerries.
   No network calls to undocumented provider endpoints and no simulated sends. */
(()=>{
 let app=null,root=null,scope='all',kind='all',source='all',tag='all',owner='all',needle='',provider='all',current='audience',rows={},selected=new Set();
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
 const tmpl=t=>t.name+' · '+t.language+' · '+(t.body?'Preview recorded':'Metadata only')+' · '+(t.provider_approval==='approved'?'Verified':'Not API-verified');
 const templateOptions=(c,connectionId='')=>templates(c).filter(t=>!connectionId||t.connection_id===connectionId).map(t=>[t.id,tmpl(t)]);
 const headers=(title,sub,action='')=>'<div class="grwc-title"><div><h3>'+esc(title)+'</h3><p>'+esc(sub)+'</p></div>'+action+'</div>';
 const empty=(message)=>'<div class="grwc-empty">'+esc(message)+'</div>';
 const scoped=(a)=>a.filter(x=>scope==='all'||x.company_id===scope);
 const companyField=(selected='')=>'<label>Company<select name="company_id" required>'+app.companies.map(c=>'<option value="'+c+'" '+(c===selected?'selected':'')+'>'+esc(name(c))+'</option>').join('')+'</select></label>';
 async function fetchAll(){
  if(!app?.db)return;
  const db=app.db,cs=app.companies,read=async(table,cols='*',filter='company_id')=>{
   const q=db.from(table).select(cols).in(filter,cs).limit(1200),r=await q;
   if(r.error)throw Error(table+': '+r.error.message);
   return r.data||[];
  };
  const [connections,templatesList,campaigns,recurring,inbound,welcomes,leads,customers,tags,profiles,sheets,providerLeads]=await Promise.all([
   read('gr_wa_connections'),read('gr_wa_templates'),read('gr_wa_campaigns'),read('gr_wa_recurring_rules'),
   read('gr_wa_inbound_rules'),read('gr_wa_lead_welcome'),
   app.canLeads?read('gr_lead_pipeline','company_id,lead_id,contact,title,mobile,email,source,tag_ids,assigned_to,stage,customer_id'):Promise.resolve([]),
   app.canCustomers?db.from('gr_crm_customers').select('id,name,mobile,email,source,type,tag_ids').limit(2000).then(r=>{if(r.error)throw r.error;return r.data||[]}):Promise.resolve([]),
   db.from('gr_crm_tags').select('id,name').limit(500).then(r=>r.data||[]),
   app.admin?db.from('gr_profiles').select('id,full_name,company_ids,active').eq('active',true).limit(300).then(r=>r.data||[]):Promise.resolve([]),
   app.admin?read('gr_sheet_connections'):Promise.resolve([]),
   app.admin?read('gr_wa_provider_leads'):Promise.resolve([])
  ]);
  rows={connections,templates:templatesList,campaigns,recurring,inbound,welcomes,leads,customers,tags,profiles,sheets,providerLeads};
 }
 const byType=()=>{
  const sourceVals=[...new Set([...rows.leads.map(l=>l.source),...rows.customers.map(c=>c.source)].filter(Boolean))];
  return sourceVals.map(x=>[x,x]);
 };
 const customerTarget=c=>({id:'C:'+c.id,type:'Customer',name:c.name||'Unnamed customer',mobile:c.mobile||'',email:c.email||'',source:c.source||'',tags:c.tag_ids||[],company_id:cd(),owner:'',customer_id:c.id,lead_id:null});
 const leadTarget=l=>({id:'L:'+l.company_id+':'+l.lead_id,type:'Lead',name:l.contact||l.title||'Lead',mobile:l.mobile||'',email:l.email||'',source:l.source||'',tags:l.tag_ids||[],company_id:l.company_id,owner:l.assigned_to||'',customer_id:l.customer_id,lead_id:l.lead_id});
 function audience(){
  const all=[...rows.leads.map(leadTarget),...rows.customers.map(customerTarget)];
  return all.filter(x=>
   (scope==='all'||x.company_id===scope)&&(kind==='all'||x.type===kind)&&
   (source==='all'||x.source===source)&&(tag==='all'||x.tags.includes(tag))&&
   (owner==='all'||x.owner===owner)&&
   (!needle||[x.name,x.mobile,x.email,x.source,x.type].some(v=>String(v||'').toLowerCase().includes(needle)))
  );
 }
 const header=()=>
 '<div class="grwc-hero"><div><small>GREENRICH ONE / MARKETING</small><h2>WhatsApp Campaign Handoff</h2><p>Your CRM is the audience source. SocialBerries remains the template and campaign delivery platform.</p></div><span class="grwc-chip">Provider API pending</span></div>'+
 '<div class="grwc-notice">No SocialBerries API credentials or verified template-sync endpoints are connected yet. Saved selections and schedules are <strong>drafts only</strong>. Nothing is sent automatically.</div>'+
 '<nav class="grwc-tabs">'+[['audience','Audience & Campaign'],['welcome','Lead Welcome'],['recurring','Repeat Service'],['sync','Incoming Leads']].map(([id,title])=>'<button data-view="'+id+'" class="'+(id===current?'active':'')+'">'+title+'</button>').join('')+'</nav>';
 function audienceView(){
  const list=audience(),co=cd(),tags=rows.tags,ids=new Set(list.map(x=>x.id));
  const chosen=[...selected].filter(x=>ids.has(x));selected=new Set(chosen);
  return '<section class="grwc-panel">'+headers('CRM audience selection','Filter Leads and Customers from GreenRich ONE; no contact upload required to build an audience.')+
   '<div class="grwc-filters">'+
   sel('Company','grwc-company',app.companies.map(c=>[c,name(c)]),scope,'Both companies')+
   sel('Contact type','grwc-kind',[['Lead','Lead'],['Customer','Customer']],kind,'Both leads & customers')+
   sel('Source','grwc-source',byType(),source,'All sources')+
   sel('Customer/Lead tag','grwc-tag',tags.map(t=>[t.id,t.name]),tag,'All tags')+
   sel('Salesperson','grwc-owner',rows.profiles.map(p=>[p.id,p.full_name]),owner,'All salespeople')+
   '<label>Name / phone / email<input id="grwc-search" type="search" value="'+esc(needle)+'" placeholder="Search CRM records"></label></div>'+
   '<div class="grwc-audience-summary"><b>'+list.length+'</b> loaded matching records · <b>'+chosen.length+'</b> selected · Marketing audience draft only. Sending requires provider verification and consent.</div>'+
   '<div class="grwc-selection-toolbar"><button type="button" data-select-all-matching>Select all loaded matches</button><button type="button" data-clear-all-matching>Clear selection</button></div>'+
   '<div class="grwc-tablewrap"><table><thead><tr><th><input type="checkbox" id="grwc-all"></th><th>Name</th><th>Type</th><th>Mobile</th><th>Source</th><th>Assigned to</th></tr></thead><tbody>'+
   list.slice(0,250).map(x=>'<tr><td><input type="checkbox" data-select-contact="'+esc(x.id)+'" '+(selected.has(x.id)?'checked':'')+'></td><td>'+esc(x.name)+'</td><td>'+x.type+'</td><td>'+esc(x.mobile)+'</td><td>'+esc(x.source)+'</td><td>'+esc(rows.profiles.find(p=>p.id===x.owner)?.full_name||'—')+'</td></tr>').join('')+'</tbody></table></div>'+
   '<p class="grwc-muted">Showing first 250 of '+list.length+' currently loaded matching contacts. The Select all action includes all '+list.length+' loaded matches, not just the first 250; additional CRM rows beyond this data load are not included. Choose one company before selecting everyone. No marketing consent is inferred from a CRM record.</p></section>'+
   '<section class="grwc-panel">'+headers('Choose existing SocialBerries template','Templates come from the provider catalog when the API connection is verified. Unverified CRM references cannot send messages.')+
   '<form id="grwc-audience-form" class="grwc-form">'+companyField(co)+
   '<label>WhatsApp tool<select name="connection_id" required>'+options(rows.connections.filter(x=>x.company_id===co).map(x=>[x.id,x.display_name]),'Select provider')+'</select></label>'+
   '<label>Existing template<select name="template_id" required>'+options([], 'Choose provider first')+'</select></label>'+
   '<label>Campaign reference<input name="name" maxlength="160" placeholder="e.g. Diwali offer - Chennai" required></label>'+
   '<p class="grwc-muted grwc-span">Select a company and opt-in eligible contacts, then choose the existing SocialBerries template. The selected template may be metadata-only until the full approved template is retrieved. Save creates a draft; it does NOT send messages.</p>'+
   '<button type="submit">Save audience & template draft</button><button type="button" data-open-settings>Configure WhatsApp</button></form></section>';
 }
 function welcomeView(){
  const rules=scoped(rows.welcomes),co=cd();
  return '<section class="grwc-panel">'+headers('Optional Welcome Template for New Leads','Choose a template while creating a lead, importing Excel/CSV, or mapping a Google Sheet. Blank means no welcome message.')+
   '<div class="grwc-grid"><div class="grwc-feature"><b>1 · Manual Lead</b><p>Leads & CRM → New Lead → Assign salesperson → Welcome template (optional).</p></div>'+
   '<div class="grwc-feature"><b>2 · Excel / CSV</b><p>Leads & CRM → Import → Default welcome template or optional per-row template ID/name.</p></div>'+
   '<div class="grwc-feature"><b>3 · Google Sheet</b><p>Settings → Google Sheet Leads → Select salesperson and default welcome template for each Sheet.</p></div></div></section>'+
   '<section class="grwc-panel">'+headers('Lead welcome selections','Stored lead-level preferences; none have been sent until the provider API is connected.')+
   (rules.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Lead ID</th><th>Template</th><th>State</th><th>Created</th></tr></thead><tbody>'+rules.slice(0,100).map(x=>
     '<tr><td>'+esc(x.lead_id)+'</td><td>'+esc(rows.templates.find(t=>t.id===x.template_id)?.name||'Unknown')+'</td><td>Awaiting provider</td><td>'+date(x.created_at)+'</td></tr>').join('')+'</tbody></table></div>':empty('No welcome templates have been selected yet.'))+'</section>';
 }
 function recurringView(){
  const list=scoped(rows.recurring),co=cd();
  return '<section class="grwc-panel">'+headers('Recurring service follow-ups','Save a WhatsApp template, customer, repeat interval and start date. Rules stay drafts until the provider is connected.',
   can('create')?'<button data-create-service>+ New service follow-up</button>':'')+
   (list.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Customer</th><th>Template</th><th>Every</th><th>Next due</th><th>State</th></tr></thead><tbody>'+list.map(r=>'<tr><td>'+esc(rows.customers.find(c=>c.id===r.customer_id)?.name||r.customer_id)+'</td><td>'+esc(rows.templates.find(t=>t.id===r.template_id)?.name||'—')+'</td><td>'+r.interval_days+' days</td><td>'+date(r.next_due)+'</td><td>Draft · not sending</td></tr>').join('')+'</tbody></table></div>':empty('No recurring service rules. Create one here or from a Customer 360 profile.'))+
   '<div class="grwc-feature"><b>Customer 360</b><p>Each customer detail page will have its own “WhatsApp service follow-up” option. 7, 15, 30 or custom days are supported.</p></div></section>';
 }
 function inboundView(){
  const rules=scoped(rows.inbound);
  return '<section class="grwc-panel">'+headers('Incoming WhatsApp & website leads','When a verified provider webhook receives an actual enquiry, CRM can create/update a lead with source, tags and assigned salesperson.')+
   '<div class="grwc-grid"><div class="grwc-feature"><b>WhatsApp enquiry</b><p>Customer message → Verified webhook → Match existing mobile → New/updated lead → Assigned salesperson.</p></div>'+
   '<div class="grwc-feature"><b>Website enquiry</b><p>Website form or meaningful registration enquiry → Verified source → CRM lead. OTP-only authentication events should not become marketing leads.</p></div></div>'+
   '<div class="grwc-notice">The inbound webhook endpoint is not enabled. A secure receiver requires SocialBerries payload examples and webhook authentication/signature details. These rules cannot ingest messages yet.</div></section>'+
   '<section class="grwc-panel">'+headers('Inbound lead assignment mapping','Admin selects provider + event type + CRM source + tags + default salesperson. Configure in Settings → WhatsApp.')+
   (rules.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Event</th><th>Provider</th><th>CRM source</th><th>Assigned employee</th><th>State</th></tr></thead><tbody>'+rules.map(r=>
     '<tr><td>'+esc(r.event_type)+'</td><td>'+esc(connectionLabel(r.connection_id))+'</td><td>'+esc(r.source_name)+'</td><td>'+esc(rows.profiles.find(p=>p.id===r.assigned_to)?.full_name||'Common queue')+'</td><td>Draft</td></tr>').join('')+'</tbody></table></div>':empty('No incoming lead mapping configured.'))+
   '<button type="button" data-open-settings>Open WhatsApp Settings</button></section>';
 }
 function marketingDraw(){
  if(!root?.isConnected)return;
  root.innerHTML='<div class="grwc">'+header()+(current==='audience'?audienceView():current==='welcome'?welcomeView():current==='recurring'?recurringView():inboundView())+'</div>';
 }
 const input=(label,key,value='',type='text')=>'<label>'+esc(label)+'<input name="'+esc(key)+'" type="'+type+'" value="'+esc(value)+'"></label>';
 const note=(label,key,v='')=>'<label class="grwc-span">'+esc(label)+'<textarea name="'+esc(key)+'" rows="3">'+esc(v)+'</textarea></label>';
 const field=(label,key,opts,required=false)=>'<label>'+esc(label)+'<select name="'+esc(key)+'" '+(required?'required':'')+'>'+opts+'</select></label>';
 function dialog(title,body,submit){
  const d=document.createElement('dialog');d.className='grwc-dialog';d.innerHTML='<form><div class="grwc-dialog-head"><h3>'+esc(title)+'</h3><button type="button" data-dismiss>×</button></div><div class="grwc-dialog-fields">'+body+'</div><div class="grwc-dialog-foot"><button type="button" data-dismiss>Cancel</button><button type="submit" class="grwc-primary">Save draft</button></div></form>';
  document.body.append(d);d.querySelectorAll('[data-dismiss]').forEach(b=>b.onclick=()=>d.close());
  d.onclose=()=>d.remove();
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();let b=d.querySelector('[type=submit]');b.disabled=true;
    try{await submit(new FormData(e.currentTarget));d.close();alert('Saved successfully','success');await fetchAll();if(root?.isConnected)marketingDraw()}
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
   field('Repeat frequency','interval_days',options([[7,'Weekly (7 days)'],[15,'Every 15 days'],[30,'Monthly (30 days)'],[60,'Every 60 days'],[90,'Every 90 days']], 'Choose interval'),true)+
   input('First follow-up date','next_due',new Date().toISOString().slice(0,10),'date')+note('Service notes','notes');
  dialog('Recurring WhatsApp service follow-up',f,async fd=>{
   const x=Object.fromEntries(fd),days=Number(x.interval_days);
   if(!x.customer_id||!x.connection_id||!x.template_id||days<1)throw Error('Choose customer, provider, template and interval.');
   const t=rows.templates.find(t=>t.id===x.template_id),link=rows.connections.find(p=>p.id===x.connection_id);
   if(!t||!link||t.company_id!==x.company_id||link.company_id!==x.company_id||t.connection_id!==link.id)throw Error('Provider/template must belong to chosen company.');
   x.interval_days=days;x.status='draft';
   await save('gr_wa_recurring_rules',x);
  });
 }
 const companyFieldWith=(id)=>'<label>Company<select name="company_id">'+app.companies.map(c=>'<option value="'+c+'" '+(c===id?'selected':'')+'>'+name(c)+'</option>').join('')+'</select></label>';
 function settingsDraw(container){
  if(!container?.isConnected)return;
  // Settings owns its own company selector. "Both Companies" in the workspace
  // is not a valid provider record: always work with one explicitly shown company.
  let c=scope==='all'?(app.companies.includes('grow-india')?'grow-india':app.companies[0]):scope;
  const providers=rows.connections.filter(p=>p.company_id===c),templ=rows.templates.filter(t=>t.company_id===c),sheetRows=rows.sheets.filter(s=>s.company_id===c);
  container.innerHTML='<div class="grwc">'+
   '<div class="grwc-hero"><div><small>SETTINGS / WHATSAPP</small><h2>WhatsApp Integration Settings</h2><p>Connect SocialBerries, sync existing templates, assign leads and configure service rules.</p></div><span class="grwc-chip">Admin only</span></div>'+
   '<div class="grwc-notice"><b>Documented API found:</b> SocialBerries supports HTTP Basic authorization and read-only users/batch endpoints, template messages and bulk campaigns. Connection test uses a read-only call. Provider host and credentials are still required in secure Supabase Secrets; sending and inbound webhooks remain disabled. Never enter passwords or API keys in this page.</div>'+
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
   '<li>Existing templates: import their preview JSON below until SocialBerries supplies its missing Get Templates endpoint. Message sending and inbound WhatsApp webhooks stay disabled until authentication, opt-in and webhook verification are implemented.</li>'+
   '</ol></div></section>'+
   '<section class="grwc-panel">'+headers('2 · Existing SocialBerries templates','Do not recreate your approved templates in the CRM. Template names should be fetched from the provider API when connected.')+
   '<p class="grwc-muted">Template catalog has '+templ.length+' CRM draft/reference record(s). An existing template can be linked by its exact provider ID, name, category and language, without recreating the message. Screenshot/manual references remain <b>not API-verified</b>; actual message content is not guessed.</p>'+
   '<button type="button" disabled title="No Get Templates API was included in the supplied documentation">Auto-sync Templates (provider endpoint needed)</button> '+
   '<button type="button" data-import-template-metadata>Link existing template by ID</button> '+
   '<button type="button" data-import-provider-template>Import Existing Template JSON (one or multiple)</button>'+
   (templ.length?'<div class="grwc-tablewrap"><table><thead><tr><th>Template</th><th>ID</th><th>Category</th><th>Provider</th><th>Language</th><th>CRM status</th></tr></thead><tbody>'+templ.map(t=>'<tr><td>'+esc(t.name)+'</td><td>'+esc(t.provider_template_id||'—')+'</td><td>'+esc(t.category)+'</td><td>'+esc(connectionLabel(t.connection_id))+'</td><td>'+esc(t.language)+'</td><td>'+esc(t.body?'Message preview recorded · Not API-verified':'Metadata only · Not API-verified')+'</td></tr>').join('')+'</tbody></table></div>':empty('No template references added. Copy an approved template preview JSON from SocialBerries and import it above.'))+'</section>'+
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
 function openMessageHistory(connectionId){
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
    if(action==='test')return alert('Read-only SocialBerries API connected. Authentication successful. User count: '+(data.users_count??'not returned')+'. Sending is still disabled.','success');
    const lines=(data.batches||[]).map(b=>[b.name,b.status,b.total_clients_count,b.completed_clients_count].join(' · '));
    dialog('SocialBerries Campaign Status (read-only)',
     '<p class="grwc-muted grwc-span">'+esc(data.count||0)+' total provider batches. Showing page '+esc(data.page||1)+'.</p>'+
     '<pre class="grwc-span" style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(lines.join('\n')||'No batches returned')+'</pre>',
     async()=>{});
    alert('Provider batch status received.','success');
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
   if(!choices.length)return alert('First save a SocialBerries provider for this company in Tool 1 or Tool 2.','warning');
   dialog('Import existing SocialBerries template reference',
     field('SocialBerries tool','connection_id',options(choices.map(x=>[x.id,x.display_name]),'Choose SocialBerries connection'),true)+
     '<div class="grwc-notice grwc-span">Copy the complete approved template JSON preview from SocialBerries, with id, name, language, category and components (including BODY text). This does not create a template in SocialBerries or send a message. Credentials do not belong here.</div>'+
     note('Paste one template JSON object or an array of template JSON objects (up to 50)','preview_json'),
     async fd=>{
       const connectionId=fd.get('connection_id');
       if(!choices.some(x=>x.id===connectionId))throw Error('Choose a matching company provider');
       let preview;try{preview=JSON.parse(String(fd.get('preview_json')||''))}catch{throw Error('Valid JSON is required')}
       const list=Array.isArray(preview)?preview:[preview];
       if(!list.length||list.length>50)throw Error('Use 1–50 templates in a JSON array.');
       let imported=0;
       for(const item of list){
        const t=item?.preview_template?.components?item.preview_template:item;
        const out=await app.db.rpc('gr_wa_import_template_preview',{p_connection:connectionId,p_preview:t});
        if(out.error)throw Error('Imported '+imported+' reference(s). '+out.error.message);
        imported++;
       }
       alert(imported+' existing provider template reference(s) saved as unverified. No messages sent.','success');
       await fetchAll();settingsDraw(container);
     });
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
 async function mountMarketing(element,ctx){
  app=ctx;root=element;scope=ctx.selectedCompany&&ctx.companies.includes(ctx.selectedCompany)?ctx.selectedCompany:'all';
  current='audience';kind='all';source='all';tag='all';owner='all';needle='';provider='all';selected=new Set();
  root.innerHTML='<p>Loading CRM audience…</p>';
  try{await fetchAll();marketingDraw()}
  catch(e){root.innerHTML='<div class="grwc-empty">WhatsApp Marketing data unavailable: '+esc(e.message)+'</div>'}
  element.onclick=async e=>{
   const v=e.target.closest('[data-view]');if(v){current=v.dataset.view;marketingDraw();return}
   if(e.target.closest('[data-open-settings]')){alert('Admin → Settings → WhatsApp Integration.','info');return}
   if(e.target.closest('[data-create-service]')){serviceDialog();return}
   if(e.target.closest('[data-select-all-matching]')){
    if(scope==='all')return alert('Choose one company above before selecting all contacts for a campaign.','warning');
    const members=audience();
    selected=new Set(members.map(x=>x.id));
    marketingDraw();
    alert(members.length+' currently loaded matching contacts selected for draft (not sent).','info');
    return;
   }
   if(e.target.closest('[data-clear-all-matching]')){selected.clear();marketingDraw();return}
   const selectItem=e.target.closest('[data-select-contact]');if(selectItem){if(selectItem.checked)selected.add(selectItem.dataset.selectContact);else selected.delete(selectItem.dataset.selectContact);return}
   if(e.target.id==='grwc-all'){element.querySelectorAll('[data-select-contact]').forEach(x=>{x.checked=e.target.checked;if(x.checked)selected.add(x.dataset.selectContact);else selected.delete(x.dataset.selectContact)});return}
  };
  element.onchange=e=>{
   const form=e.target.closest?.('#grwc-audience-form');
   if(form&&(e.target.name==='company_id'||e.target.name==='connection_id')){
    const c=form.querySelector('[name=company_id]')?.value||'';
    const prov=form.querySelector('[name=connection_id]');
    const tpl=form.querySelector('[name=template_id]');
    if(e.target.name==='company_id'){
     prov.innerHTML=options(rows.connections.filter(x=>x.company_id===c).map(x=>[x.id,x.display_name]),'Select provider');
     tpl.innerHTML=options([], 'Choose provider first');
    }else{
     tpl.innerHTML=options(templateOptions(c,prov.value),'Choose a template for this provider');
    }
    return;
   }
   const map={'grwc-company':'scope','grwc-kind':'kind','grwc-source':'source','grwc-tag':'tag','grwc-owner':'owner'};
   if(!map[e.target.id])return;
   const v=e.target.value;
   switch(e.target.id){case 'grwc-company':scope=v;break;case 'grwc-kind':kind=v;break;case 'grwc-source':source=v;break;case 'grwc-tag':tag=v;break;case 'grwc-owner':owner=v}
   marketingDraw();
  };
  element.oninput=e=>{if(e.target.id==='grwc-search'){needle=e.target.value.toLowerCase();const pos=e.target.selectionStart;marketingDraw();const inp=element.querySelector('#grwc-search');inp?.focus();inp?.setSelectionRange(pos,pos)}};
  element.onsubmit=async e=>{
   if(e.target.id!=='grwc-audience-form')return;e.preventDefault();
   if(!can('create'))return alert('Marketing create permission required','error');
   const f=new FormData(e.target),companyId=f.get('company_id'),connectionId=f.get('connection_id'),templateId=f.get('template_id');
   if(!rows.connections.some(c=>c.id===connectionId&&c.company_id===companyId)||!rows.templates.some(t=>t.id===templateId&&t.company_id===companyId&&t.connection_id===connectionId))return alert('Select a matching provider/template.','error');
   if(scope==='all')return alert('Choose one company in the audience filter before saving a campaign.','warning');
   if(companyId!==scope)return alert('Campaign company must match the audience company filter.','warning');
   const audienceIds=[...selected],matches=audience().filter(x=>audienceIds.includes(x.id)&&x.company_id===companyId);
   if(!matches.length)return alert('Select at least one CRM contact for this company.','warning');
   try{
    await save('gr_wa_campaigns',{company_id:companyId,connection_id:connectionId,template_id:templateId,
      name:String(f.get('name')||'').trim(),audience:{crm_ids:matches.map(x=>x.id),selection:'manual',source:'greenrich_crm'},status:'draft',
      notes:'CRM recipient selection. Provider dispatch not connected; marketing consent required before sending.'});
    alert('Campaign handoff draft saved ('+matches.length+' CRM contacts). Not sent.','success');await fetchAll();marketingDraw();
   }catch(e){alert(e.message,'error')}
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
 window.GreenRichWhatsAppWorkflows={configure,mountMarketing,mountSettings,welcomeOptions,saveLeadWelcome,openCustomerRule};
})();
