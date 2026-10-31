'use strict';
/* Company selection belongs to each employee's own company access, not their role.
   Sales/stock remain browser-local. Attendance is deliberately untouched. */
(()=>{
 const KEY='gr-current-company-';
 const fallback=[{id:'grow-india',name:'GreenRich Grow India Pvt Ltd',active:true},{id:'enviro-solutions',name:'GreenRich Enviro Solutions Pvt Ltd',active:true}];
 let latest=fallback.slice(),currentUser='',access=['grow-india','enviro-solutions'];
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const allowed=()=>latest.filter(c=>c.active!==false&&access.includes(c.id)).map(c=>c.id);
 const selected=userId=>{
  const valid=allowed(),cached=localStorage.getItem(KEY+(userId||currentUser));
  return valid.includes(cached)||(cached==='all'&&valid.length===2)?cached:valid[0]||'grow-india';
 };
 const name=userId=>{
  const id=selected(userId);return id==='all'?'Both GreenRich Companies':latest.find(c=>c.id===id)?.name||fallback.find(c=>c.id===id)?.name||'GreenRich ONE';
 };
 const choose=(id,userId)=>{
  const valid=allowed();
  if(!(valid.includes(id)||(id==='all'&&valid.length===2)))throw Error('You do not have access to this company');
  localStorage.setItem(KEY+(userId||currentUser),id);return id;
 };
 async function configure({userId,companyIds,db}){
  currentUser=userId||currentUser;
  access=Array.isArray(companyIds)?[...new Set(companyIds.filter(c=>fallback.some(f=>f.id===c)))]:['grow-india','enviro-solutions'];
  if(!access.length)throw Error('No company access is assigned to this employee. Contact Admin.');
  if(db){const result=await db.from('gr_companies').select('id,name,active').order('id');if(result.error)throw Error('Unable to load companies: '+result.error.message);if(result.data?.length)latest=result.data}
  const current=selected(currentUser);choose(current,currentUser);return {selected:current,allowed:allowed()};
 }
 const list=()=>latest.slice();
 async function mount(root,ctx){
  if(ctx.role!=='Admin')throw Error('Only Admin may manage company settings');
  currentUser=ctx.user.id;
  if(!latest.length)await configure({userId:ctx.user.id,companyIds:access,db:ctx.db});
  let currentTab=['companies','branding','users','roles','tags','sheets','sources','invoices','channels','reports','dashboard','whatsapp'].includes(ctx.initialTab)?ctx.initialTab:'companies';
  const tabs=[['companies','Company Profiles'],['branding','Workspace Logo'],['users','User Management'],['roles','User Roles'],['tags','Customer Tags'],['sheets','Google Sheet Leads'],['sources','Lead Sources'],['invoices','Invoice Settings'],['dashboard','Dashboard Access'],['whatsapp','WhatsApp Integration'],['channels','Sales Channels'],['reports','Import & Export']];
  root.innerHTML='<div id="gr-company-admin"><div class="panel"><h2>Settings</h2><p>Manage the two companies, employee-specific company access, customer tags, roles and Admin tools.</p><div class="gr-settings-tabs">'+tabs.map(([v,label])=>'<button type="button" data-settings-tab="'+v+'" class="secondary">'+label+'</button>').join('')+'</div></div><div id="gr-company-settings-content"></div></div>';
  const host=root.querySelector('#gr-company-settings-content'),notice=ctx.notify;
  async function showCompanyCards(){
   const response=await ctx.db.from('gr_companies').select('id,name,active').order('id');
   if(response.error)throw Error(response.error.message);latest=response.data||latest;
   host.innerHTML='<div class="panel"><h2>Company Profiles</h2><p>Choose which company to work with from the selector at the top of GreenRich ONE. The Both Companies option appears only for employees assigned to both companies.</p><div class="gr-company-cards">'+latest.map(c=>'<form class="gr-company-card" data-company="'+escape(c.id)+'"><div class="gr-company-card-head"><strong>'+escape(c.name)+'</strong><span class="pill">'+(c.active?'Active':'Inactive')+'</span></div><label>Registered company name<input name="name" value="'+escape(c.name)+'" minlength="4" maxlength="130" required></label><div class="gr-company-actions"><button class="blue" type="submit">Save Company Name</button><button class="secondary" type="button" data-select-company="'+escape(c.id)+'" '+(!allowed().includes(c.id)||selected(ctx.user.id)===c.id?'disabled':'')+'>'+(selected(ctx.user.id)===c.id?'Selected':'Work With This Company')+'</button></div></form>').join('')+'</div><p class="notice">Customers and tags are shared. Sales, inventory, orders, leads and follow-ups are synchronized through GreenRich cloud for authorized employees.</p></div>';
   host.querySelectorAll('[data-company]').forEach(form=>form.onsubmit=async event=>{
    event.preventDefault();const id=form.dataset.company,newName=form.elements.namedItem('name').value.trim();
    if(newName.length<4)return notice('Enter a valid company name');
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{const {data,error}=await ctx.db.from('gr_companies').update({name:newName,updated_at:new Date().toISOString()}).eq('id',id).select('id,name').single();if(error)throw Error(error.message);
     latest=latest.map(c=>c.id===id?{...c,...data}:c);ctx.onCompanyChange?.(selected(ctx.user.id),name(ctx.user.id));notice('Company name updated');await showCompanyCards()
    }catch(e){notice('Unable to save company: '+e.message)}finally{button.disabled=false}
   });
   host.querySelectorAll('[data-select-company]').forEach(button=>button.onclick=()=>{
    try{choose(button.dataset.selectCompany,ctx.user.id);ctx.onCompanyChange?.(selected(ctx.user.id),name(ctx.user.id));notice('Selected '+name(ctx.user.id));void showCompanyCards()}
    catch(e){notice(e.message)}
   });
  }
  async function activate(tab){
   currentTab=tab;root.querySelectorAll('[data-settings-tab]').forEach(button=>button.classList.toggle('gr-current-settings-tab',button.dataset.settingsTab===tab));
   if(tab==='companies')return showCompanyCards();
   if(tab==='branding'){host.innerHTML='<div class="panel">Loading workspace logo settings…</div>';try{await ctx.openBranding(host)}catch(e){host.innerHTML='<div class="notice">'+escape(e.message)+'</div>'}return}
   if(tab==='users'||tab==='roles'){host.innerHTML='<div class="panel">Loading administrator settings...</div>';try{if(tab==='users')await ctx.openUsers(host);else await ctx.openRoles(host)}catch(e){host.innerHTML='<div class="notice">'+escape(e.message)+'</div>'}return}
   if(tab==='tags'){host.innerHTML='<div class="panel">Loading Customer Tags...</div>';try{await ctx.openTags(host,selected(ctx.user.id))}catch(e){host.innerHTML='<div class="notice">'+escape(e.message)+'</div>'}return}
   if(tab==='sheets'){host.innerHTML='<div class="panel">Loading Google Sheet leads…</div>';try{await ctx.openSheetIntegrations(host)}catch(e){host.innerHTML='<div class="notice">'+escape(e.message)+'</div>'}return}
   if(tab==='sources'){host.innerHTML='<div class="panel">Loading Lead Sources...</div>';try{await ctx.openSources(host)}catch(e){host.innerHTML='<div class="notice">'+escape(e.message)+'</div>'}return}
   if(tab==='dashboard'){host.innerHTML='<div class="panel">Loading dashboard access...</div>';try{await ctx.openDashboardAccess(host)}catch(e){host.innerHTML='<div class="notice">'+escape(e.message)+'</div>'}return}
   if(tab==='whatsapp'){host.innerHTML='<div class="panel">Loading WhatsApp settings...</div>';try{await ctx.openWhatsAppSettings(host)}catch(e){host.innerHTML='<div class="notice">'+escape(e.message)+'</div>'}return}
    if(tab==='invoices'){host.innerHTML='<div class="panel">Loading invoice settings...</div>';try{await ctx.openInvoiceSettings(host)}catch(e){host.innerHTML='<div class="notice">'+escape(e.message)+'</div>'}return}
   if(!['channels','reports'].includes(tab))return;
   host.innerHTML='<div class="panel">Opening Admin tools...</div>';try{await ctx.openCRM(host,tab,true)}catch(e){host.innerHTML='<div class="notice">'+escape(e.message)+'</div>'}
  }
  root.querySelectorAll('[data-settings-tab]').forEach(button=>button.onclick=()=>{void activate(button.dataset.settingsTab)});
  await activate(currentTab);
 }
 window.GreenRichCompanies={configure,allowed,selected,name,choose,list,mount};
})();
