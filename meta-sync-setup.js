'use strict';
(function(){
 const status=document.getElementById('message'),button=document.getElementById('setup');
 const show=s=>{status.textContent=s};
 async function ready(){
  const cfg=window.GREENRICH_PUBLIC_CONFIG;
  if(!cfg?.supabaseUrl||!cfg?.publishableKey||!window.supabase)
    throw Error('CRM configuration is not available. Reload this page.');
  const db=window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey);
  const {data:auth,error:userError}=await db.auth.getUser();
  if(userError||!auth?.user)throw Error('Please sign in to GreenRich ONE first, then reopen this page.');
  const {data:profile,error:profileError}=await db.from('gr_profiles')
    .select('id,full_name,active,company_ids').eq('id',auth.user.id).single();
  if(profileError||!profile?.active||!Array.isArray(profile.company_ids)||!profile.company_ids.length)
    throw Error('No active employee/company profile is available.');
  const companyIds=profile.company_ids.filter(c=>c==='grow-india'||c==='enviro-solutions');
  if(!companyIds.length)throw Error('Your account is not assigned to a GreenRich company.');
  // The permission check is performed by a security-definer server function, not a UI role flag.
  const [access,staffRows]=await Promise.all([
   db.rpc('gr_meta_sheet_status',{p_company:companyIds[0]}),
   Promise.all(companyIds.map(async company_id=>{
    const {data,error}=await db.rpc('gr_pipeline_staff',{p_company:company_id});
    if(error)throw error;
    return (data||[]).map(p=>({...p,company_id}));
   }))
  ]);
  if(access.error)throw Error('Admin authorization failed: '+access.error.message);
  const staff=staffRows.flat();
  if(!staff.length)throw Error('No eligible sales employee found. Create or authorize a Sales user first.');
  if(!window.GreenRichMetaSync?.open)throw Error('Meta setup module could not load.');
  const ctx={db,companyIds,staff,admin:true,companyNames:{
    'grow-india':'GreenRich Grow India Pvt Ltd',
    'enviro-solutions':'GreenRich Enviro Solutions Pvt Ltd'
  },notify:show};
  show('Signed in as '+profile.full_name+'. Select a company and salesperson to configure automatic Meta lead import.');
  button.disabled=false;
  button.addEventListener('click',()=>{
   void window.GreenRichMetaSync.open(ctx).catch(e=>show('Unable to open setup: '+e.message));
  });
 }
 ready().catch(e=>{
  show(e.message+' Open the main CRM, sign in as Administrator, and return here.');
 });
})();