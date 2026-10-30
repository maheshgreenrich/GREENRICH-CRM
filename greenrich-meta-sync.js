/* GreenRich ONE — Admin-only Meta Google Sheets connection wizard.
 * The 256-bit import token is generated server-side and shown once.
 * Never store it in localStorage, public configuration or GitHub. */
window.GreenRichMetaSync=(function(){
 const SOURCE_URL='https://docs.google.com/spreadsheets/d/1oyrt_jUpmOCoHDJYecdvipyHGL0BKeeG00jVOqs3GdI/edit';
 const SCRIPT_URL='https://github.com/maheshgreenrich/GREENRICH-CRM/blob/main/integrations/meta-google-sheets/Code.gs';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const opts=(rows)=>rows.map(x=>'<option value="'+esc(x[0])+'">'+esc(x[1])+'</option>').join('');
 async function open(ctx){
  const companies=ctx.companyIds||[];
  if(!companies.length)throw Error('No company access');
  // Read-only authorization preflight. Do not trust a stale UI role flag.
  // The database RPC authorizes only active Admin users in this company.
  const access=await ctx.db.rpc('gr_meta_sheet_status',{p_company:companies[0]});
  if(access.error)throw Error('Meta Leads Sync requires company Admin permission: '+access.error.message);
  const d=document.createElement('dialog');d.className='gl-dialog';
  d.style.cssText='width:min(650px,94vw);max-height:89vh;overflow:auto;padding:23px';
  d.innerHTML='<h3>Connect Meta Ads Google Sheet</h3>'+
   '<p>This will import <b>new rows only</b> from the selected Meta sheet into the assigned salesperson\'s New leads stage.</p>'+
   '<p><a target="_blank" rel="noopener noreferrer" href="'+SOURCE_URL+'">Open meta leads Google Sheet</a></p>'+
   '<form id="gr-meta-setup">'+
   '<label>GreenRich company<select name="company">'+opts(companies.map(c=>[c,ctx.companyNames?.[c]||c]))+'</select></label>'+
   '<label>Assign every new Meta lead to<select name="assignee" required></select></label>'+
   '<div id="gr-meta-status" style="margin:12px 0;padding:10px;border:1px solid #d4e2ef;border-radius:9px" role="status">Checking connection…</div>'+
   '<button type="submit">Generate connection token / Save assignment</button></form>'+
   '<div id="gr-meta-secret" hidden style="padding:10px;background:#f0f6ff;border-radius:10px;margin-top:12px">'+
   '<h4>One-time integration credentials</h4><p>Copy these into the Google Sheet\'s Apps Script → Project Settings → Script Properties. Keep the import token private.</p>'+
   '<label>GREENRICH_SUPABASE_URL<textarea name="url" rows="2" readonly></textarea></label>'+
   '<label>GREENRICH_PUBLISHABLE_KEY<textarea name="key" rows="2" readonly></textarea></label>'+
   '<label>GREENRICH_IMPORT_TOKEN<textarea name="token" rows="2" readonly></textarea></label>'+
   '<button type="button" id="gr-meta-copy">Copy property values</button></div>'+
   '<p><b>Finish setup in Google Sheets:</b> Extensions → Apps Script → paste <a target="_blank" rel="noopener noreferrer" href="'+SCRIPT_URL+'">Code.gs</a> → set the three Script Properties above → run <code>greenrichInstallTrigger</code> → approve permissions.</p>'+
   '<p>Runs every 5 minutes. Existing test rows are skipped when you install the trigger. Import only starts after the sheet receives new rows.</p>'+
   '<div style="display:flex;justify-content:flex-end"><button type="button" id="gr-meta-close">Close</button></div>';
  document.body.append(d);
  const form=d.querySelector('#gr-meta-setup'),company=form.elements.company,person=form.elements.assignee,status=d.querySelector('#gr-meta-status'),secrets=d.querySelector('#gr-meta-secret');
  d.onclose=()=>d.remove();d.querySelector('#gr-meta-close').onclick=()=>d.close();
  const refresh=async()=>{
    const team=(ctx.staff||[]).filter(p=>p.company_id===company.value);
    person.innerHTML=opts([...new Map(team.map(p=>[p.id,[p.id,p.full_name]])).values()]);
    const {data,error}=await ctx.db.rpc('gr_meta_sheet_status',{p_company:company.value});
    if(error){status.textContent='Unable to read sync status: '+error.message;return}
    if(data?.configured){
      const assigned=team.find(x=>x.id===data.assigned_to);
      if(assigned)person.value=assigned.id;
      status.textContent=(data.enabled?'Connected in CRM':'Disabled')+' · Assigned to: '+(assigned?.full_name||'Unavailable')+
       ' · Imported: '+Number(data.total_imported||0)+' · Last sync: '+(data.last_import_at?new Date(data.last_import_at).toLocaleString('en-IN'):'Not yet');
    }else status.textContent='Not yet configured. Choose an employee and generate a token.';
  };
  company.addEventListener('change',()=>{secrets.hidden=true;void refresh()});
  form.onsubmit=async ev=>{
    ev.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;
    try{
      if(!person.value)throw Error('Choose a salesperson first.');
      const {data,error}=await ctx.db.rpc('gr_meta_sheet_configure',{
        p_company:company.value,p_assignee:person.value,p_enabled:true
      });
      if(error)throw error;
      const cfg=window.GREENRICH_PUBLIC_CONFIG||{};
      secrets.hidden=false;
      secrets.querySelector('[name=url]').value=cfg.supabaseUrl||'';
      secrets.querySelector('[name=key]').value=cfg.publishableKey||'';
      secrets.querySelector('[name=token]').value=data.token||'';
      status.textContent='CRM connection generated. IMPORTANT: Add the script and run greenrichInstallTrigger in Google Sheets before sync starts.';
    }catch(error){status.textContent=error.message}finally{b.disabled=false}
  };
  d.querySelector('#gr-meta-copy').onclick=async()=>{
    const propNames=['GREENRICH_SUPABASE_URL','GREENRICH_PUBLISHABLE_KEY','GREENRICH_IMPORT_TOKEN'];
    const keys=['url','key','token'];
    const text=propNames.map((key,i)=>key+'='+secrets.querySelector('[name='+keys[i]+']').value).join('\n');
    try{await navigator.clipboard.writeText(text);status.textContent='Property values copied. Paste them into secure Apps Script Properties, never into source code.'}
    catch{status.textContent='Copy the three fields manually into Apps Script Properties.'}
  };
  d.showModal();void refresh();
 }
 return {open};
})();
