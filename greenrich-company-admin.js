'use strict';
/* Company administration in GreenRich ONE. No privileged key or unauthenticated writes. */
(()=>{
 const KEY='gr-current-company-';
 let latest=[],currentUser='';
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const selected=userId=>localStorage.getItem(KEY+(userId||currentUser))||'grow-india';
 const name=userId=>latest.find(c=>c.id===selected(userId))?.name||(selected(userId)==='enviro-solutions'?'GreenRich Enviro Solutions Pvt Ltd':'GreenRich Grow India Pvt Ltd');
 async function mount(root,ctx){
  if(ctx.role!=='Admin')throw Error('Only the GreenRich Administrator can manage company settings');
  currentUser=ctx.user.id;
  const response=await ctx.db.from('gr_companies').select('id,name,active').order('id');
  if(response.error)throw Error('Unable to load company details: '+response.error.message);
  latest=response.data||[];
  if(!latest.some(c=>c.id===selected(ctx.user.id)&&c.active))localStorage.setItem(KEY+ctx.user.id,'grow-india');
  let currentTab='companies';
  const tabDefinitions=[['companies','Company Profiles'],['channels','Sales Channels'],['reports','Import & Export'],['dashboard','Sales Reports']];
  root.innerHTML='<div id="gr-company-admin"><div class="panel"><h2>Company & CRM Settings</h2><p>Manage the two GreenRich companies and administrator-only CRM tools from one place.</p><div class="gr-settings-tabs">'+tabDefinitions.map(([v,label])=>'<button type="button" data-settings-tab="'+v+'" class="secondary">'+label+'</button>').join('')+'</div></div><div id="gr-company-settings-content"></div></div>';
  const host=root.querySelector('#gr-company-settings-content');
  const notice=message=>{ctx.notify(message)};
  async function showCompanyCards(){
   latest=(await ctx.db.from('gr_companies').select('id,name,active').order('id')).data||latest;
   host.innerHTML='<div class="panel"><h2>Manage Company Details</h2><p>Select the active company before working in Sales & CRM. Company names are shared across employee logins. Sales, customers and products are currently stored separately for each company in this browser.</p><div class="gr-company-cards">'+latest.map(company=>'<form class="gr-company-card" data-company="'+escape(company.id)+'"><div class="gr-company-card-head"><strong>'+escape(company.id==='grow-india'?'GreenRich Grow India':'GreenRich Enviro Solutions')+'</strong><span class="pill">'+(company.active?'Active':'Inactive')+'</span></div><label>Registered company name<input name="name" value="'+escape(company.name)+'" minlength="4" maxlength="130" required></label><div class="gr-company-actions"><button class="blue" type="submit">Save Name</button><button class="secondary" type="button" data-select-company="'+escape(company.id)+'" '+(!company.active||company.id===selected(ctx.user.id)?'disabled':'')+'>'+(company.id===selected(ctx.user.id)?'Currently Selected':'Work With This Company')+'</button></div></form>').join('')+'</div><div class="notice">Company profiles are saved centrally. CRM customer, sales and product records remain on this device only, separated by company. Other devices do not yet share those CRM records.</div></div>';
   host.querySelectorAll('[data-company]').forEach(form=>form.onsubmit=async event=>{
    event.preventDefault();
    const id=form.dataset.company,companyName=form.elements.namedItem('name').value.trim();
    if(companyName.length<4)return notice('Enter a valid company name');
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
     const {data,error}=await ctx.db.from('gr_companies').update({name:companyName,updated_at:new Date().toISOString()}).eq('id',id).select('id,name').single();
     if(error)throw Error(error.message);
     latest=latest.map(company=>company.id===id?{...company,...data}:company);
     if(ctx.onCompanyChange)ctx.onCompanyChange(selected(ctx.user.id),name());
     notice('Company name saved to shared GreenRich settings');
     await showCompanyCards();
    }catch(e){notice('Unable to save company: '+e.message)}finally{button.disabled=false}
   });
   host.querySelectorAll('[data-select-company]').forEach(button=>button.onclick=()=>{
    const id=button.dataset.selectCompany;if(!latest.some(c=>c.id===id&&c.active))return;
    localStorage.setItem(KEY+ctx.user.id,id);
    if(ctx.onCompanyChange)ctx.onCompanyChange(id,name());
    notice('Active company changed to '+name());
    void showCompanyCards();
   });
  }
  async function activate(tab){
   currentTab=tab;
   root.querySelectorAll('[data-settings-tab]').forEach(button=>button.classList.toggle('gr-current-settings-tab',button.dataset.settingsTab===tab));
   if(tab==='companies'){await showCompanyCards();return}
   if(!['channels','reports','dashboard'].includes(tab))return;
   host.innerHTML='<div class="panel">Opening Admin tools...</div>';
   try{await ctx.openCRM(host,tab,true)}catch(e){host.innerHTML='<div class="notice">'+escape(e.message)+'</div>'}
  }
  root.querySelectorAll('[data-settings-tab]').forEach(button=>button.onclick=()=>{void activate(button.dataset.settingsTab)});
  await activate(currentTab);
 }
 window.GreenRichCompanies={selected,name,mount};
})();
