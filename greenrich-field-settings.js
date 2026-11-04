'use strict';
/* Admin-only, company-scoped employee location consent and visit rules. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const types=[['sales','Sales Visit'],['service','Service Visit'],['site','Site Visit'],['installation','Installation']];
 const photoDefaults={sales:true,service:false,site:true,installation:false};
 const style='<style>.gr-gps-head{display:flex;gap:18px;flex-wrap:wrap;align-items:end;justify-content:space-between}.gr-gps-head h2{margin:0 0 8px}.gr-gps-head p{max-width:780px}.gr-gps-head label{font-size:13px;display:grid;gap:5px}.gr-gps-head select{min-width:210px}.gr-gps-caption{font-size:13px;line-height:1.55;color:#50647b}.gr-gps-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin:18px 0}.gr-gps-toolbar input{max-width:300px}.gr-gps-stats{font-weight:700;color:#1f4c8a}.gr-gps-grid{display:grid;gap:9px}.gr-gps-person{display:flex;align-items:center;gap:18px;justify-content:space-between;padding:14px;border:1px solid #dae4f2;border-radius:12px;background:#fff}.gr-gps-person strong{display:block;font-size:14px}.gr-gps-person small{display:block;margin-top:4px;color:#5e718c}.gr-gps-switch{display:flex;align-items:center;gap:9px;cursor:pointer;white-space:nowrap;font-size:13px;font-weight:650}.gr-gps-switch input{width:20px;height:20px;accent-color:#2555be;cursor:pointer}.gr-gps-switch input:disabled{opacity:.5;cursor:wait}.gr-gps-help{border:1px solid #dbe6f6;background:#f6f9ff;border-radius:12px;padding:14px;margin-top:17px;color:#466080;font-size:13px}.gr-fs-section{margin-top:16px}.gr-fs-section input[type=number]{width:90px}@media(max-width:620px){.gr-gps-person{align-items:start;flex-direction:column}.gr-gps-switch{align-self:flex-start}}</style>';
 async function mount(root,{db,companies,notify,mode='access'}){
  if(!db)throw Error('CRM database unavailable');
  const allowed=(companies||[]).filter(c=>c==='grow-india'||c==='enviro-solutions');
  if(!allowed.length)throw Error('No company access');
  const access=mode==='access';
  root.innerHTML=style+'<section class="panel">'+
   '<div class="gr-gps-head"><div><h2>'+(access?'Field Location Access Panel':'Visit Completion Rules')+'</h2>'+
   '<p class="gr-gps-caption">'+(access?
   'Admin controls exactly which employees must share location when using the top-header attendance Check In / Check Out. Everyone else records date and time only.':
   'Customize required visit photos and minimum notes for sales, service, site and installation visits.')+'</p></div>'+
   '<label>Company<select id="gr-gps-company">'+allowed.map(x=>'<option value="'+esc(x)+'">'+(x==='grow-india'?'GreenRich Grow India':'GreenRich Enviro Solutions')+'</option>').join('')+'</select></label></div>'+
   '<div id="gr-gps-panel" aria-live="polite">Loading…</div></section>';
  const box=root.querySelector('#gr-gps-panel'),company=root.querySelector('#gr-gps-company');
  async function rpc(name,args){const r=await db.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data}
  async function load(){
   box.textContent='Loading '+(access?'employee GPS access…':'visit completion rules…');
   try{
    const data=await rpc('gr_field_admin_config',{p_company:company.value});
    if(access){
     const staff=(data.staff||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
     box.innerHTML='<div class="gr-gps-toolbar"><input type="search" id="gr-gps-search" placeholder="Search employee" aria-label="Search employee">'+
      '<span class="gr-gps-stats" id="gr-gps-counter">'+staff.filter(x=>x.enabled).length+' / '+staff.length+' GPS enabled</span></div>'+
      '<div class="gr-gps-grid">'+staff.map(x=>'<div class="gr-gps-person" data-person="'+esc(x.name.toLowerCase())+'">'+
       '<div><strong>'+esc(x.name)+'</strong><small class="gr-gps-state">'+(x.enabled?'Field staff · Time + GPS':'Office / untracked · Date & time only')+'</small></div>'+
       '<label class="gr-gps-switch"><input type="checkbox" data-staff-id="'+esc(x.id)+'" '+(x.enabled?'checked':'')+
       ' aria-label="Require GPS attendance for '+esc(x.name)+'"><span>Capture GPS</span></label></div>').join('')+'</div>'+
      '<div class="gr-gps-help"><b>How it works:</b> ON = location required at header attendance Check In and Check Out, with a field tracking session created automatically. While GreenRich ONE remains open and visible, the device can send a GPS snapshot about every 30 minutes. OFF = header attendance captures only the date and time, and no GPS session is started. Device permission is always required. Background/locked-phone tracking is not supported.</div>';
     const search=box.querySelector('#gr-gps-search');
     search.oninput=()=>{const term=search.value.trim().toLowerCase();box.querySelectorAll('[data-person]').forEach(el=>{el.hidden=!el.dataset.person.includes(term)})};
     box.querySelectorAll('[data-staff-id]').forEach(toggle=>toggle.onchange=async()=>{
      const intended=toggle.checked;toggle.disabled=true;
      try{
       await rpc('gr_field_assign_staff',{p_company:company.value,p_user:toggle.dataset.staffId,p_enabled:intended});
       const person=staff.find(x=>x.id===toggle.dataset.staffId);if(person)person.enabled=intended;
       const el=toggle.closest('.gr-gps-person').querySelector('.gr-gps-state');
       el.textContent=intended?'Field staff · Time + GPS':'Office / untracked · Date & time only';
       box.querySelector('#gr-gps-counter').textContent=staff.filter(x=>x.enabled).length+' / '+staff.length+' GPS enabled';
       notify?.(intended?'GPS attendance enabled for '+(person?.name||'employee'):'GPS attendance disabled for '+(person?.name||'employee'));
      }catch(err){toggle.checked=!intended;notify?.('GPS setting not saved: '+err.message)}
      finally{toggle.disabled=false}
     });
    }else{
     const rules=Object.fromEntries((data.rules||[]).map(x=>[x.type,x]));
     box.innerHTML='<section class="gr-fs-section"><h3>Visit close requirements</h3>'+
      '<p class="gr-gps-caption">GPS and service/sales notes are required for every completed visit. Photos can be required or optional by visit type.</p>'+
      '<div class="tablewrap"><table><thead><tr><th>Visit type</th><th>Photos</th><th>Minimum notes</th><th>Action</th></tr></thead><tbody>'+
      types.map(([id,label])=>{const x=rules[id]||{photos:photoDefaults[id],min_notes:10};return '<tr data-rule="'+id+'"><td>'+esc(label)+'</td>'+
       '<td><select aria-label="Photo setting for '+esc(label)+'"><option value="true" '+(x.photos?'selected':'')+'>Required</option><option value="false" '+(!x.photos?'selected':'')+'>Optional</option></select></td>'+
       '<td><input type="number" min="10" max="500" value="'+Number(x.min_notes||10)+'" aria-label="Minimum note characters"></td>'+
       '<td><button type="button" class="secondary" data-save-rule="'+id+'">Save</button></td></tr>'}).join('')+
      '</tbody></table></div></section>';
     box.querySelectorAll('[data-save-rule]').forEach(button=>button.onclick=async()=>{
      const tr=button.closest('tr');button.disabled=true;
      try{await rpc('gr_field_update_visit_rule',{p_company:company.value,p_type:button.dataset.saveRule,p_photos:tr.querySelector('select').value==='true',p_min_notes:Number(tr.querySelector('input').value)});notify?.('Visit requirements saved')}
      catch(err){notify?.('Unable to save visit requirements: '+err.message)}
      finally{button.disabled=false}
     });
    }
   }catch(err){box.innerHTML='<div class="notice">Unable to load settings: '+esc(err.message)+'</div>'}
  }
  company.onchange=load;await load();
 }
 const mountAccess=(root,opts)=>mount(root,{...opts,mode:'access'});
 const mountRules=(root,opts)=>mount(root,{...opts,mode:'rules'});
 window.GreenRichFieldSettings={mount:mountAccess,mountAccess,mountRules};
})();
