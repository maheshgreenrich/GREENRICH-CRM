'use strict';
/* GreenRich ONE WhatsApp Marketing | 2 independent provider slots per company.
 * CRM-side management is functional; third-party dispatch remains deliberately
 * disabled until verified provider API schemas, secrets and webhook signatures exist. */
(()=>{
 const TABLES={connections:'gr_wa_connections',contacts:'gr_wa_contacts',templates:'gr_wa_templates',
   campaigns:'gr_wa_campaigns',automations:'gr_wa_automations',messages:'gr_wa_messages'};
 const COMPANY={'grow-india':'GreenRich Grow India Pvt Ltd','enviro-solutions':'GreenRich Enviro Solutions Pvt Ltd'};
 const TYPES=['overview','campaigns','contacts','templates','inbox','automations','reports','providers'];
 const ICON={overview:'▦',campaigns:'✦',contacts:'♧',templates:'▤',inbox:'☏',automations:'⚡',reports:'◫',providers:'⚙'};
 let ctx=null,host=null,active='overview',company='all',provider='all',search='',consent='all',status='all',stats=null;
 let store={connections:[],contacts:[],templates:[],campaigns:[],automations:[],messages:[]},crm={customers:[],leads:[]};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dt=v=>v?new Date(v).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';
 const n=v=>new Intl.NumberFormat('en-IN').format(Number(v)||0);
 const value=(obj,key)=>obj?.[key]??'';
 const allowed=(act)=>ctx.admin||ctx.permission?.(act)===true;
 const notify=(str,type='info')=>ctx?.notify?.(str,type);
 const currentCompany=()=>company!=='all'?company:ctx.companies[0];
 const sql=async(name,columns='*')=>{const {data,error}=await ctx.db.from(TABLES[name]).select(columns).in('company_id',ctx.companies).order('created_at',{ascending:false}).limit(1500);if(error)throw Error(name+': '+error.message);return data||[]};
 const companyMatch=r=>company==='all'||r.company_id===company;
 const providerMatch=r=>provider==='all'||r.connection_id===provider;
 const matching=(...v)=>!search||v.some(x=>String(x||'').toLowerCase().includes(search));
 const filtered=(name)=>store[name].filter(x=>companyMatch(x)&&(name==='contacts'||providerMatch(x)));
 const companyName=id=>COMPANY[id]||id;
 const connectionName=id=>store.connections.find(c=>c.id===id)?.display_name||'Choose a provider';
 const templateName=id=>store.templates.find(t=>t.id===id)?.name||'Choose template';
 const pill=(text,tone='neutral')=>'<span class="grwa-pill" data-tone="'+esc(tone)+'">'+esc(text)+'</span>';
 const button=(label,action,extra='')=>'<button type="button" data-action="'+esc(action)+'" '+extra+'>'+esc(label)+'</button>';
 const empty=(title,detail)=>'<div class="grwa-empty"><span aria-hidden="true">✧</span><h4>'+esc(title)+'</h4><p>'+esc(detail)+'</p></div>';
 const table=(heads,rows)=>rows.length?'<div class="grwa-tablewrap"><table><thead><tr>'+heads.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>':empty('No records found','Adjust filters or create your first record.');
 const options=(rows,chosen='',label='Select')=>'<option value="">'+esc(label)+'</option>'+rows.map(([id,name])=>'<option value="'+esc(id)+'" '+(id===chosen?'selected':'')+'>'+esc(name)+'</option>').join('');
 const connectionOptions=(id='',c=currentCompany())=>options(store.connections.filter(x=>x.company_id===c).map(x=>[x.id,x.display_name+' · '+x.provider]),id,'Choose WhatsApp provider');
 const templateOptions=(id='',c=currentCompany())=>options(store.templates.filter(x=>x.company_id===c).map(x=>[x.id,x.name]),id,'Choose CRM template');
 const relevant=()=>filtered('contacts').filter(x=>(consent==='all'||x.consent_status===consent)&&matching(x.name,x.mobile,x.email,x.source,...(x.tags||[])));
 const selectedAudience=(draft)=>{
   const c=company==='all'?currentCompany():company,filters=draft||{},tags=String(filters.tag||'').trim().toLowerCase(),
     source=String(filters.source||'').trim().toLowerCase(),searchTerm=String(filters.search||'').toLowerCase();
   return store.contacts.filter(x=>x.company_id===c&&x.consent_status==='opted_in'&&
     (!tags||(x.tags||[]).some(t=>String(t).toLowerCase().includes(tags)))&&
     (!source||String(x.source||'').toLowerCase().includes(source))&&
     (!searchTerm||[x.name,x.mobile,x.email].some(t=>String(t||'').toLowerCase().includes(searchTerm))));
 };
 const kpi=(title,data,hint,color)=>'<article class="grwa-kpi" data-color="'+color+'"><span>'+esc(title)+'</span><strong>'+esc(data)+'</strong><small>'+esc(hint)+'</small></article>';
 function toolbar(){
  return '<div class="grwa-top"><div><span class="grwa-eyebrow">GREENRICH ONE · WHATSAPP WORKSPACE</span><h2>Marketing center</h2><p>Manage both WhatsApp providers, audiences and communication workflows in one place.</p></div><div class="grwa-top-actions">'+pill('Secure CRM data','green')+button('↻ Refresh','refresh')+'</div></div>'+
   '<div class="grwa-notice"><strong>Integration status:</strong> CRM marketing tools are ready. External WhatsApp sends, replies and delivery webhooks are disabled until the API documentation, authentication and webhook validation for each provider have been configured and tested. No live messages are being sent.</div>'+
   '<div class="grwa-filters"><label>Company<select id="grwa-company"><option value="all">Both assigned companies</option>'+
   ctx.companies.map(c=>'<option value="'+esc(c)+'" '+(company===c?'selected':'')+'>'+esc(companyName(c))+'</option>').join('')+'</select></label>'+
   '<label>Provider<select id="grwa-provider"><option value="all">Both WhatsApp tools</option>'+store.connections.filter(companyMatch).map(x=>'<option value="'+esc(x.id)+'" '+(provider===x.id?'selected':'')+'>'+esc(x.display_name)+'</option>').join('')+'</select></label>'+
   '<label>Search<input id="grwa-search" type="search" value="'+esc(search)+'" placeholder="Campaign, contact, mobile, template…"></label>'+
   '<label>Consent<select id="grwa-consent"><option value="all">All consent statuses</option>'+['opted_in','unknown','opted_out'].map(x=>'<option value="'+x+'" '+(consent===x?'selected':'')+'>'+x.replace('_',' ')+'</option>').join('')+'</select></label></div>'+
   '<nav class="grwa-tabs" aria-label="Marketing tools">'+TYPES.map(t=>'<button type="button" data-tab="'+t+'" aria-current="'+(active===t?'page':'false')+'" class="'+(active===t?'active':'')+'"><span>'+ICON[t]+'</span>'+t[0].toUpperCase()+t.slice(1)+'</button>').join('')+'</nav>';
 }
 function overview(){
  const contacts=relevant(),inbound=filtered('messages').filter(x=>x.direction==='inbound'),out=filtered('messages').filter(x=>x.direction==='outbound');
  const campaigns=filtered('campaigns'),connections=store.connections.filter(companyMatch),withConsent=contacts.filter(x=>x.consent_status==='opted_in');
  return '<div class="grwa-kpis">'+
   kpi('WhatsApp providers',n(connections.length),'2 possible per company','green')+
   kpi('Campaign drafts',n(campaigns.filter(c=>c.status==='draft').length),'Not yet launched','purple')+
   kpi('Opted-in contacts',n(withConsent.length),'Only eligible for audience','blue')+
   kpi('Incoming messages',n(inbound.length),'Webhook integration pending','amber')+
   '</div><div class="grwa-grid">'+
   '<section class="grwa-card"><div class="grwa-card-title"><div><h3>WhatsApp providers</h3><p>Independent connections for your two marketing tools</p></div>'+button('Manage','tab-providers')+'</div>'+
   providerCards(true)+'</section>'+
   '<section class="grwa-card"><div class="grwa-card-title"><div><h3>Campaign overview</h3><p>Real saved CRM marketing campaigns</p></div>'+button('New campaign','new-campaign')+'</div>'+
   '<div class="grwa-metrics">'+['draft','paused','archived'].map((k,i)=>'<div><span>'+k+'</span><strong>'+n(campaigns.filter(x=>x.status===k).length)+'</strong><i style="background:'+['#7e6be6','#f5aa3f','#94a3b8'][i]+'"></i></div>').join('')+'</div>'+
   '<div class="grwa-chart-title">Audience consent status</div>'+donut(contacts)+'</section>'+
   '<section class="grwa-card"><div class="grwa-card-title"><div><h3>Recent campaigns</h3><p>Created drafts by company and provider</p></div>'+button('View campaigns','tab-campaigns')+'</div>'+
   campaignTable(campaigns.slice(0,5))+'</section>'+
   '<section class="grwa-card"><div class="grwa-card-title"><div><h3>Recent WhatsApp activity</h3><p>Only webhook or API-confirmed messages</p></div>'+button('Open inbox','tab-inbox')+'</div>'+
   (inbound.concat(out).length?messageTable(filtered('messages').slice(0,5)):empty('No messages recorded','Provider webhooks must be verified before incoming and delivery events appear.'))+'</section></div>';
 }
 function donut(contacts){
  const counts=['opted_in','unknown','opted_out'].map(k=>contacts.filter(x=>x.consent_status===k).length),total=counts.reduce((a,b)=>a+b,0),width=counts.map(x=>total?(x/total*100):0);
  return '<div class="grwa-consent"><div class="grwa-donut" style="background:conic-gradient(#24b99a 0% '+width[0]+'%,#e7ad4b '+width[0]+'% '+(width[0]+width[1])+'%,#e76a83 '+(width[0]+width[1])+'% 100%)"><div><strong>'+n(total)+'</strong><small>Total</small></div></div><div>'+['Opted in','Unknown','Opted out'].map((t,i)=>'<p><i style="background:'+['#24b99a','#e7ad4b','#e76a83'][i]+'"></i>'+t+' <b>'+n(counts[i])+'</b></p>').join('')+'</div></div>';
 }
 function providerCards(compact=false){
  const companies=company==='all'?ctx.companies:[company];
  return '<div class="grwa-provider-grid">'+companies.flatMap(c=>[1,2].map(slot=>{
    const p=store.connections.find(x=>x.company_id===c&&x.slot===slot);
    return '<div class="grwa-provider-tile"><div class="grwa-provider-symbol">☏</div><div><small>'+esc(companyName(c))+' · Tool '+slot+'</small><strong>'+esc(p?.display_name|| (slot===1?'SocialBerries':'Second WhatsApp provider'))+'</strong><p>'+esc(p?.provider||'Not configured')+' · '+esc(p?.sender_phone||'Sender number not set')+'</p>'+pill('API setup required','amber')+'</div>'+
     (!compact&&ctx.admin?button(p?'Edit details':'Configure','edit-provider','data-company="'+esc(c)+'" data-slot="'+slot+'"'):'')+'</div>';
  })).join('')+'</div>';
 }
 function campaignTable(items){
  return table(['Campaign','Provider','Company','Audience','Status','Created','Action'],items.map(r=>'<tr><td><strong>'+esc(r.name)+'</strong><small>'+esc(r.notes||'')+'</small></td><td>'+esc(connectionName(r.connection_id))+'</td><td>'+esc(companyName(r.company_id))+'</td><td>'+n(selectedAudienceFor(r).length)+' opted-in</td><td>'+pill(r.status,'blue')+'</td><td>'+dt(r.created_at)+'</td><td>'+button('View','campaign-details','data-id="'+esc(r.id)+'"')+'</td></tr>'));
 }
 const selectedAudienceFor=r=>{
  const a=r.audience||{};
  return store.contacts.filter(x=>x.company_id===r.company_id&&x.consent_status==='opted_in'&&
   (!a.source||String(x.source||'').toLowerCase().includes(String(a.source).toLowerCase()))&&
   (!a.tag||(x.tags||[]).some(t=>String(t).toLowerCase().includes(String(a.tag).toLowerCase())))&&
   (!a.search||[x.name,x.mobile,x.email].some(t=>String(t||'').toLowerCase().includes(String(a.search).toLowerCase()))));
 };
 function campaigns(){
  return '<div class="grwa-card"><div class="grwa-card-title"><div><h3>WhatsApp campaigns</h3><p>Prepare audiences and templates for either provider. Sending remains locked until API verification.</p></div>'+
   (allowed('create')?button('+ Create campaign','new-campaign'):'')+'</div>'+
   campaignTable(filtered('campaigns').filter(x=>matching(x.name,x.notes,connectionName(x.connection_id))))+'</div>';
 }
 function contacts(){
  const rows=relevant();return '<div class="grwa-card"><div class="grwa-card-title"><div><h3>Marketing contacts & consent</h3><p>Customers and leads remain in CRM. Only documented, opted-in contacts qualify for marketing campaigns.</p></div><div>'+
   (allowed('create')?button('+ Add contact','new-contact')+button('Import CRM contacts','import-crm'):'')+
   (allowed('export')?button('↓ Export CSV','export-contacts'):'')+'</div></div>'+
   '<p class="grwa-help">Importing a CRM contact does not automatically grant marketing consent. Record how and when permission was obtained before using that contact in an audience.</p>'+
   table(['Name','Mobile','Type','Source / tags','WhatsApp consent','Actions'],rows.map(r=>'<tr><td><strong>'+esc(r.name)+'</strong><small>'+esc(r.email||'')+'</small></td><td>'+esc(r.mobile)+'</td><td>'+esc(r.customer_id?'Customer':r.lead_id?'Lead':'Contact')+'</td><td>'+esc(r.source||'—')+'<small>'+esc((r.tags||[]).join(', '))+'</small></td><td>'+pill(r.consent_status,r.consent_status==='opted_in'?'green':r.consent_status==='opted_out'?'red':'amber')+'</td><td>'+(allowed('edit')?button('Edit / consent','edit-contact','data-id="'+esc(r.id)+''):'')+'</td></tr>'))+'</div>';
 }
 function templates(){
  return '<div class="grwa-card"><div class="grwa-card-title"><div><h3>WhatsApp message templates</h3><p>Write CRM drafts, then approve/sync through the chosen provider when its API is configured.</p></div>'+
   (allowed('create')?button('+ New template','new-template'):'')+'</div>'+
   table(['Template','Company','Provider','Category','Approval','Preview','Actions'],filtered('templates').filter(t=>matching(t.name,t.body)).map(t=>
     '<tr><td><strong>'+esc(t.name)+'</strong></td><td>'+esc(companyName(t.company_id))+'</td><td>'+esc(connectionName(t.connection_id))+'</td><td>'+esc(t.category)+'</td><td>'+pill('Not verified','amber')+'</td><td><span class="grwa-clip">'+esc(t.body)+'</span></td><td>'+(allowed('edit')?button('Edit','edit-template','data-id="'+esc(t.id)+''):'')+'</td></tr>'))+'</div>';
 }
 function messageTable(items){
  return table(['When','Direction','Mobile','Provider','Status','Message'],items.map(x=>
    '<tr><td>'+dt(x.event_at)+'</td><td>'+pill(x.direction,x.direction==='inbound'?'green':'blue')+'</td><td>'+esc(x.phone)+'</td><td>'+esc(connectionName(x.connection_id))+'</td><td>'+pill(x.delivery_status)+'</td><td>'+esc(x.body.slice(0,150))+'</td></tr>'));
 }
 function inbox(){
  return '<div class="grwa-card"><div class="grwa-card-title"><div><h3>WhatsApp conversation inbox</h3><p>Incoming replies and outgoing messages will appear after secure provider webhook setup.</p></div>'+pill('Webhook not connected','amber')+'</div>'+
   (filtered('messages').length?messageTable(filtered('messages').filter(x=>matching(x.phone,x.body))):empty('Inbox awaiting both providers','No provider message API or webhook signature documentation has been connected. This inbox will not fabricate conversations.'))+'</div>';
 }
 function automations(){
  return '<div class="grwa-card"><div class="grwa-card-title"><div><h3>Automation workflow builder</h3><p>Create saved automation drafts. Actual sending requires a verified API, approved template and consent checks.</p></div>'+
   (allowed('create')?button('+ New workflow','new-automation'):'')+'</div>'+
   table(['Workflow','Trigger','Provider','Template','Delay','Status','Actions'],filtered('automations').filter(x=>matching(x.name,x.trigger_name)).map(x=>
    '<tr><td><strong>'+esc(x.name)+'</strong></td><td>'+esc(x.trigger_name.replaceAll('_',' '))+'</td><td>'+esc(connectionName(x.connection_id))+'</td><td>'+esc(templateName(x.template_id))+'</td><td>'+n(x.delay_minutes)+' min</td><td>'+pill(x.status,'amber')+'</td><td>'+(allowed('edit')?button('Edit','edit-automation','data-id="'+esc(x.id)+''):'')+'</td></tr>'))+'</div>';
 }
 function reports(){
  const messages=filtered('messages'),out=messages.filter(x=>x.direction==='outbound');
  return '<div class="grwa-kpis">'+
   kpi('Outbound messages',n(out.length),'From validated webhook/API data','blue')+
   kpi('Delivered',n(out.filter(x=>['delivered','read'].includes(x.delivery_status)).length),'Verified provider status','green')+
   kpi('Read',n(out.filter(x=>x.delivery_status==='read').length),'Verified provider status','purple')+
   kpi('Failed',n(out.filter(x=>x.delivery_status==='failed').length),'Verified provider status','rose')+'</div>'+
   '<div class="grwa-card"><div class="grwa-card-title"><div><h3>Campaign and provider reports</h3><p>No estimated deliveries, messages or read rates</p></div>'+(allowed('export')?button('↓ Export CSV','export-report'):'')+'</div>'+
   table(['Provider','Company','Outbound','Delivered','Read','Failed'],store.connections.filter(companyMatch).map(c=>{
    const rows=out.filter(m=>m.connection_id===c.id);
    return '<tr><td>'+esc(c.display_name)+'</td><td>'+esc(companyName(c.company_id))+'</td><td>'+n(rows.length)+'</td><td>'+n(rows.filter(m=>['delivered','read'].includes(m.delivery_status)).length)+'</td><td>'+n(rows.filter(m=>m.delivery_status==='read').length)+'</td><td>'+n(rows.filter(m=>m.delivery_status==='failed').length)+'</td></tr>';
   }))+'</div>';
 }
 function providers(){
  return '<div class="grwa-card"><div class="grwa-card-title"><div><h3>Connect two WhatsApp tools</h3><p>Provider 1: SocialBerries · Provider 2: your second WhatsApp marketing platform</p></div>'+pill('Admin configuration','blue')+'</div>'+
   providerCards()+'<div class="grwa-setup"><h4>Complete provider integration checklist</h4>'+
   '<p>These are independent provider slots for each GreenRich company. Enter provider name and phone for display; never paste API tokens or secrets into this page.</p>'+
   '<ol><li>Obtain API base URL, authentication method, message/template/campaign endpoints and rate limits.</li>'+
   '<li>Obtain incoming-message and delivery-status webhook payloads, signature verification method, and sample events.</li>'+
   '<li>Store API keys only in Supabase Edge Function secrets, test both connections securely and register callback URLs.</li>'+
   '<li>Enable sending only after approved templates, verified opt-in, deduplication and webhook security have passed testing.</li></ol>'+
   '<p class="grwa-help">SocialBerries: https://whatsapp.socialberries.in/home · Second provider details: not supplied. External messaging controls remain disabled until both APIs are mapped.</p></div></div>';
 }
 const views={overview,campaigns,contacts,templates,inbox,automations,reports,providers};
 function draw(){
  if(!host?.isConnected)return;host.innerHTML='<div class="grwa">'+toolbar()+'<div id="grwa-view">'+views[active]()+'</div><p class="grwa-footer">Company-restricted CRM records · Marketing role permissions · Consent-first audiences · No live WhatsApp messages sent without verified provider configuration.</p></div>';
 }
 async function load(){
  const fields=Object.keys(TABLES);
  const all=await Promise.all(fields.map(name=>sql(name)));
  if(!host?.isConnected)return;
  for(let i=0;i<fields.length;i++)store[fields[i]]=all[i];
  draw();
 }
 function modal(title,html,onSubmit){
  const d=document.createElement('dialog');d.className='grwa-dialog';d.innerHTML='<form><div class="grwa-dialog-head"><h3>'+esc(title)+'</h3><button type="button" data-close aria-label="Close">×</button></div><div class="grwa-form">'+html+'</div><div class="grwa-dialog-foot"><button type="button" data-close>Cancel</button><button class="grwa-primary" type="submit">Save</button></div></form>';
  document.body.append(d);d.querySelectorAll('[data-close]').forEach(x=>x.onclick=()=>d.close());d.addEventListener('close',()=>d.remove());
  const form=d.querySelector('form');form.onsubmit=async event=>{
   event.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;
   try{await onSubmit(new FormData(form),form);d.close();notify('Marketing record saved successfully','success');await load()}
   catch(error){notify(error.message,'error')}finally{btn.disabled=false}
  };d.showModal();return d;
 }
 const input=(label,name,type='text',v='',required=false)=>'<label>'+esc(label)+'<input name="'+esc(name)+'" type="'+type+'" value="'+esc(v)+'" '+(required?'required':'')+'></label>';
 const choice=(label,name,optionsHtml,required=false)=>'<label>'+esc(label)+'<select name="'+esc(name)+'" '+(required?'required':'')+'>'+optionsHtml+'</select></label>';
 const desc=(label,name,content)=>'<label class="wide">'+esc(label)+'<textarea name="'+esc(name)+'" rows="4">'+esc(content||'')+'</textarea></label>';
 const companySelect=(id)=>choice('Company','company_id',options(ctx.companies.map(x=>[x,companyName(x)]),id,'Choose company'),true);
 const save=async(table,data,id)=>{
  const query=ctx.db.from(TABLES[table]);
  const res=id?await query.update(data).eq('id',id).select().single():await query.insert(data).select().single();
  if(res.error)throw Error(res.error.message);return res.data;
 };
 function editProvider(c,slot){
  if(!ctx.admin)throw Error('Only Admin can edit provider settings');
  const prev=store.connections.find(x=>x.company_id===c&&x.slot===slot);
  modal('WhatsApp tool '+slot+' · '+companyName(c),
    '<div class="grwa-hint">Connection details only. API keys must be configured in Supabase Edge Function secrets; a name or number here does not activate WhatsApp sending.</div>'+
    input('Provider name','display_name','text',prev?.display_name|| (slot===1?'SocialBerries':''),true)+
    input('Provider type / identifier','provider','text',prev?.provider|| (slot===1?'socialberries':''),true)+
    input('WhatsApp sender number (+91…)','sender_phone','tel',prev?.sender_phone||'')+
    desc('Integration notes','notes',prev?.notes),
    async fd=>{const entry=Object.fromEntries(fd);entry.company_id=c;entry.slot=slot;
      entry.setup_state='not_configured';entry.enabled=false;
      await save('connections',entry,prev?.id)}
  );
 }
 function editContact(id){
  const c=store.contacts.find(x=>x.id===id),co=c?.company_id||currentCompany();
  modal(c?'Edit marketing contact':'Add marketing contact',
   companySelect(co)+input('Contact name','name','text',c?.name,true)+input('Mobile number (+91…)','mobile','tel',c?.mobile,true)+
   input('Email','email','email',c?.email)+input('Source','source','text',c?.source)+input('Tags (comma separated)','tags','text',(c?.tags||[]).join(', '))+
   choice('WhatsApp marketing consent','consent_status',options([['unknown','Unknown (no campaign messages)'],['opted_in','Opted in (permission recorded)'],['opted_out','Opted out']],c?.consent_status||'unknown'),true)+
   input('Consent source / evidence','consent_source','text',c?.consent_source)+
   desc('Notes','notes',c?.notes),
   async fd=>{
    const row=Object.fromEntries(fd);row.name=row.name.trim();row.mobile=row.mobile.replace(/[\s()-]/g,'');
    if(!/^\+?[0-9]{10,15}$/.test(row.mobile))throw Error('Enter a valid WhatsApp phone number');
    row.tags=row.tags.split(',').map(x=>x.trim()).filter(Boolean).slice(0,30);
    if(row.consent_status==='opted_in'){
      if(row.consent_source.trim().length<3)throw Error('Record how this contact explicitly agreed to WhatsApp marketing');
      row.consent_at=c?.consent_at||new Date().toISOString();row.opt_out_at=null;
    }else{row.consent_at=null;if(row.consent_status==='opted_out')row.opt_out_at=new Date().toISOString()}
    if(c){row.lead_id=c.lead_id;row.customer_id=c.customer_id}
    await save('contacts',row,c?.id);
   });
 }
 function editTemplate(id){
  const t=store.templates.find(x=>x.id===id),co=t?.company_id||currentCompany();
  const d=modal(t?'Edit CRM template':'New WhatsApp template draft',
   companySelect(co)+input('Template name','name','text',t?.name,true)+
   choice('WhatsApp provider','connection_id',connectionOptions(t?.connection_id,co))+
   choice('Category','category',options([['marketing','Marketing'],['utility','Utility'],['authentication','Authentication']],t?.category||'marketing'),true)+
   input('Language (e.g. en, en_US, hi)','language','text',t?.language||'en',true)+
   desc('WhatsApp message body / template text','body',t?.body)+
   '<p class="grwa-hint wide">CRM draft only. External provider must approve actual template before sending. Placeholders like {{1}} are not activated here.</p>',
   async fd=>{const row=Object.fromEntries(fd);if(!row.body.trim())throw Error('Enter message body');
    row.connection_id=row.connection_id||null;row.provider_approval='not_verified';await save('templates',row,t?.id)});
  d.querySelector('[name=company_id]').onchange=()=>{d.querySelector('[name=connection_id]').innerHTML=connectionOptions('',d.querySelector('[name=company_id]').value)};
 }
 function editCampaign(id){
  const c=store.campaigns.find(x=>x.id===id),co=c?.company_id||currentCompany(),a=c?.audience||{};
  const d=modal(c?'Edit campaign draft':'New campaign draft',companySelect(co)+
   input('Campaign name','name','text',c?.name,true)+
   choice('WhatsApp provider','connection_id',connectionOptions(c?.connection_id,co),true)+
   choice('CRM message template','template_id',templateOptions(c?.template_id,co),true)+
   '<div class="grwa-hint wide">Audience is always limited to contacts with documented marketing opt-in. This is a draft: creating it never sends messages.</div>'+
   input('Filter source (optional)','source','text',a.source)+input('Filter tag (optional)','tag','text',a.tag)+
   input('Filter name/mobile/email (optional)','search','text',a.search)+
   input('Planned date/time (optional)','scheduled_at','datetime-local',c?.scheduled_at?new Date(c.scheduled_at).toISOString().slice(0,16):'')+
   desc('Campaign notes','notes',c?.notes)+
   '<div class="grwa-audience-preview wide" id="grwa-audience-preview" role="status"></div>',
   async fd=>{const row=Object.fromEntries(fd);
    if(!row.connection_id||!row.template_id)throw Error('Choose a WhatsApp provider and template first');
    row.audience={source:row.source.trim(),tag:row.tag.trim(),search:row.search.trim()};delete row.source;delete row.tag;delete row.search;
    row.scheduled_at=row.scheduled_at?new Date(row.scheduled_at).toISOString():null;
    row.status=c?.status||'draft';await save('campaigns',row,c?.id);
   });
  const preview=()=>{
    const fd=new FormData(d.querySelector('form')),co=fd.get('company_id');
    const audience=store.contacts.filter(x=>x.company_id===co&&x.consent_status==='opted_in'&&
      (!fd.get('source')||x.source.toLowerCase().includes(String(fd.get('source')).toLowerCase()))&&
      (!fd.get('tag')||(x.tags||[]).some(t=>t.toLowerCase().includes(String(fd.get('tag')).toLowerCase())))&&
      (!fd.get('search')||[x.name,x.mobile,x.email].some(t=>String(t||'').toLowerCase().includes(String(fd.get('search')).toLowerCase()))));
    d.querySelector('#grwa-audience-preview').textContent=audience.length+' opted-in contacts match this draft (preview only; no messages sent).';
  };
  d.querySelector('[name=company_id]').onchange=()=>{const co=d.querySelector('[name=company_id]').value;d.querySelector('[name=connection_id]').innerHTML=connectionOptions('',co);d.querySelector('[name=template_id]').innerHTML=templateOptions('',co);preview()};
  d.querySelectorAll('[name=source],[name=tag],[name=search]').forEach(x=>x.oninput=preview);preview();
 }
 function editAutomation(id){
  const x=store.automations.find(a=>a.id===id),co=x?.company_id||currentCompany();
  const d=modal(x?'Edit automation draft':'New WhatsApp automation draft',
   companySelect(co)+input('Workflow name','name','text',x?.name,true)+
   choice('Trigger event','trigger_name',options([['new_lead','New lead'],['followup_due','Follow-up due'],['order_created','Sales Order created'],['order_approved','Sales Order approved'],['customer_birthday','Customer birthday'],['manual','Manual']],x?.trigger_name||'new_lead'),true)+
   choice('Provider','connection_id',connectionOptions(x?.connection_id,co),true)+
   choice('Message template','template_id',templateOptions(x?.template_id,co),true)+
   input('Delay in minutes','delay_minutes','number',x?.delay_minutes||0,true)+
   '<p class="grwa-hint wide">Saving an automation draft does not activate messaging. WhatsApp delivery requires verified APIs and opt-in checks.</p>',
   async fd=>{const row=Object.fromEntries(fd);row.delay_minutes=Number(row.delay_minutes);
    if(!Number.isInteger(row.delay_minutes)||row.delay_minutes<0||row.delay_minutes>43200)throw Error('Delay must be 0–43200 minutes');
    row.status=x?.status||'draft';await save('automations',row,x?.id)});
  d.querySelector('[name=company_id]').onchange=()=>{const co=d.querySelector('[name=company_id]').value;d.querySelector('[name=connection_id]').innerHTML=connectionOptions('',co);d.querySelector('[name=template_id]').innerHTML=templateOptions('',co)};
 }
 function campaignDetails(id){
  const c=store.campaigns.find(x=>x.id===id);if(!c)return;
  const list=selectedAudienceFor(c);
  const d=modal('Campaign · '+c.name,
    '<div class="grwa-hint wide">Status: '+esc(c.status)+' · '+esc(companyName(c.company_id))+' · '+esc(connectionName(c.connection_id))+'</div>'+
    '<div class="grwa-hint wide"><strong>'+list.length+'</strong> opted-in contact(s) match your saved audience rules.</div>'+
    '<p class="grwa-hint wide">Send is disabled until a provider is authenticated, its templates verified, and opt-in checks passed.</p>'+
    '<div class="wide">'+(allowed('edit')?button('Edit draft','open-campaign-edit','data-id="'+esc(c.id)+''):'')+'</div>',
    async()=>{throw Error('Campaign sending is not enabled without provider API verification')});
  d.querySelector('.grwa-dialog-foot [type=submit]').disabled=true;
  d.addEventListener('click',event=>{if(event.target.closest('[data-action=open-campaign-edit]')){d.close();editCampaign(id)}});
 }
 async function importCrm(){
  if(!allowed('create'))throw Error('Marketing create permission required');
  const records=[];
  if(ctx.crmPermissions?.customers){
    const r=await ctx.db.from('gr_crm_customers').select('id,name,mobile,email,source,tag_ids').limit(1500);
    if(r.error)throw Error('Customer import: '+r.error.message);
    for(const x of r.data||[])records.push({name:x.name,mobile:x.mobile,email:x.email,source:x.source,customer_id:x.id,company_id:currentCompany()});
  }
  if(ctx.crmPermissions?.leads){
    const r=await ctx.db.from('gr_lead_pipeline').select('company_id,lead_id,contact,title,mobile,email,source').in('company_id',ctx.companies).limit(1500);
    if(r.error)throw Error('Lead import: '+r.error.message);
    for(const x of r.data||[])records.push({name:x.contact||x.title,mobile:x.mobile,email:x.email,source:x.source,lead_id:x.lead_id,company_id:x.company_id});
  }
  const list=records.filter(x=>x.mobile&&ctx.companies.includes(x.company_id)),newList=list.filter(x=>!store.contacts.some(c=>c.company_id===x.company_id&&c.mobile===x.mobile));
  const d=modal('Import CRM contacts','<div class="grwa-hint wide">'+newList.length+' new contacts can be imported from the CRM you can access. Their consent will remain UNKNOWN; this does not authorize WhatsApp marketing.</div>'+
   '<div class="grwa-hint wide">Shared customers are imported into the currently selected company. Leads keep their original company. Duplicate company/mobile records are skipped.</div>'+
   '<label class="wide"><input type="checkbox" name="acknowledge" required> I understand importing does not mean WhatsApp opt-in.</label>',
   async fd=>{
    if(!fd.get('acknowledge'))throw Error('Confirm import conditions');
    if(!newList.length){notify('No new contacts to import','info');return}
    const rows=newList.slice(0,500).map(x=>({...x,mobile:String(x.mobile).replace(/[\s()-]/g,''),name:String(x.name||'Unknown').slice(0,200),
     consent_status:'unknown',tags:[],consent_source:'',consent_at:null}));
    const {error}=await ctx.db.from('gr_wa_contacts').upsert(rows,{onConflict:'company_id,mobile',ignoreDuplicates:true});
    if(error)throw Error(error.message);notify('Imported '+rows.length+' CRM contacts without marketing consent','success');
   });
  return d;
 }
 function exportCSV(rows,file){
  const cols=[...new Set(rows.flatMap(x=>Object.keys(x)))];if(!cols.length){notify('No matching records to export','warning');return}
  const quoted=v=>'"'+String(v==null?'':typeof v==='object'?JSON.stringify(v):v).replace(/"/g,'""')+'"';
  const body=[cols.join(','),...rows.map(r=>cols.map(k=>quoted(r[k])).join(','))].join('\r\n');
  const blob=new Blob(['\ufeff'+body],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  notify('Marketing CSV exported','success');
 }
 async function handle(event){
  const tab=event.target.closest('[data-tab]');if(tab){active=tab.dataset.tab;draw();return}
  const target=event.target.closest('[data-action]');if(!target)return;
  const act=target.dataset.action;
  try{
   if(act==='refresh'){await load();notify('Marketing data refreshed','success');return}
   if(act.startsWith('tab-')){active=act.slice(4);draw();return}
   if(act==='edit-provider')return editProvider(target.dataset.company,Number(target.dataset.slot));
   if(act==='new-contact'||act==='edit-contact')return allowed(act==='new-contact'?'create':'edit')?editContact(target.dataset.id):notify('Marketing permission required','error');
   if(act==='new-template'||act==='edit-template')return allowed(act==='new-template'?'create':'edit')?editTemplate(target.dataset.id):notify('Marketing permission required','error');
   if(act==='new-campaign'||act==='edit-campaign')return allowed(act==='new-campaign'?'create':'edit')?editCampaign(target.dataset.id):notify('Marketing permission required','error');
   if(act==='campaign-details')return campaignDetails(target.dataset.id);
   if(act==='new-automation'||act==='edit-automation')return allowed(act==='new-automation'?'create':'edit')?editAutomation(target.dataset.id):notify('Marketing permission required','error');
   if(act==='import-crm')return await importCrm();
   if(act==='export-contacts'&&allowed('export'))return exportCSV(relevant().map(({name,mobile,email,source,tags,consent_status,consent_source,consent_at})=>({name,mobile,email,source,tags,consent_status,consent_source,consent_at})),'greenrich-whatsapp-contacts.csv');
   if(act==='export-report'&&allowed('export'))return exportCSV(filtered('messages'),'greenrich-whatsapp-report.csv');
  }catch(e){notify(e.message,'error')}
 }
 async function mount(element,settings){
  if(!element||!settings?.db||!settings?.companies?.length)throw Error('Marketing requires authenticated CRM and assigned company access');
  if(!settings.admin&&!settings.permission?.('view'))throw Error('You do not have Marketing access. Ask your Admin.');
  ctx=settings;host=element;active='overview';provider='all';company=settings.companies.includes(settings.selectedCompany)?settings.selectedCompany:'all';
  search='';consent='all';host.classList.add('grwa-root');host.addEventListener('click',handle);
  host.addEventListener('change',event=>{if(event.target.id==='grwa-company'){company=event.target.value;provider='all';draw()}
    if(event.target.id==='grwa-provider'){provider=event.target.value;draw()}
    if(event.target.id==='grwa-consent'){consent=event.target.value;draw()}});
  host.addEventListener('input',event=>{if(event.target.id==='grwa-search'){search=event.target.value.toLowerCase().trim();const start=event.target.selectionStart;draw();const box=host.querySelector('#grwa-search');box?.focus();box?.setSelectionRange(start,start)}});
  host.innerHTML='<div class="grwa-loading">Loading WhatsApp marketing records…</div>';
  try{await load()}catch(error){host.innerHTML='<div class="grwa-error">Marketing is unavailable: '+esc(error.message)+'. Ask Admin to verify database migration and role access.</div>';notify(error.message,'error')}
 }
 window.GreenRichWhatsAppMarketing={mount};
})();
