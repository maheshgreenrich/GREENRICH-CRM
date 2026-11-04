'use strict';
/* Admin-only, company-scoped employee location consent and visit rules. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const types=[['sales','Sales Visit'],['service','Service Visit'],['site','Site Visit'],['installation','Installation']];
 const photoDefaults={sales:true,service:false,site:true,installation:false};
 const style='<style>.gr-gps-head{display:flex;gap:18px;flex-wrap:wrap;align-items:end;justify-content:space-between}.gr-gps-head h2{margin:0 0 8px}.gr-gps-head p{max-width:780px}.gr-gps-head label{font-size:13px;display:grid;gap:5px}.gr-gps-head select{min-width:210px}.gr-gps-caption{font-size:13px;line-height:1.55;color:#50647b}.gr-gps-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin:18px 0}.gr-gps-toolbar input{max-width:300px}.gr-gps-stats{font-weight:700;color:#1f4c8a}.gr-gps-grid{display:grid;gap:9px}.gr-gps-person{display:flex;align-items:center;gap:18px;justify-content:space-between;padding:14px;border:1px solid #dae4f2;border-radius:12px;background:#fff}.gr-gps-person strong{display:block;font-size:14px}.gr-gps-person small{display:block;margin-top:4px;color:#5e718c}.gr-gps-switch{display:flex;align-items:center;gap:9px;cursor:pointer;white-space:nowrap;font-size:13px;font-weight:650}.gr-gps-switch input{width:20px;height:20px;accent-color:#2555be;cursor:pointer}.gr-gps-switch input:disabled{opacity:.5;cursor:wait}.gr-gps-help{border:1px solid #dbe6f6;background:#f6f9ff;border-radius:12px;padding:14px;margin-top:17px;color:#466080;font-size:13px}.gr-fs-section{margin-top:16px}.gr-fs-section input[type=number]{width:90px}@media(max-width:620px){.gr-gps-person{align-items:start;flex-direction:column}.gr-gps-switch{align-self:flex-start}}.gr-gps-company-section{margin:20px 0 0;border:1px solid #dae4f2;border-radius:12px;padding:18px;background:#fbfdff}.gr-gps-company-heading{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap;border-bottom:1px solid #e3ebf7;padding-bottom:12px}.gr-gps-company-heading h3{margin:0 0 4px;font-size:16px;color:#153b74}.gr-gps-company-heading p{margin:0}.gr-gps-company-tag{padding:5px 9px;background:#edf4ff;color:#355f9b;font-size:11px;border-radius:99px}.gr-gps-company-section .gr-gps-toolbar{margin:14px 0}.gr-gps-company-section .gr-fs-section{margin-top:10px}@media(max-width:620px){.gr-gps-company-section{padding:11px}.gr-gps-company-tag{display:none}}</style>';
 async function mount(root,{db,companies,notify,mode='access'}){
  if(!db)throw Error('CRM database unavailable');
  const allowed=[...new Set((companies||[]).filter(c=>c==='grow-india'||c==='enviro-solutions'))];
  if(!allowed.length)throw Error('No assigned companies found');
  const labels={'grow-india':'GreenRich Grow India Pvt Ltd','enviro-solutions':'GreenRich Enviro Solutions Pvt Ltd'};
  const access=mode==='access';
  root.innerHTML=style+'<section class="panel">'+
   '<div class="gr-gps-head"><div><h2>'+(access?'Field Location Access Panel':'Visit Completion Rules')+'</h2>'+
   '<p class="gr-gps-caption">'+(access?
   'Choose which employees require GPS at top-header attendance Check In / Check Out. Everyone else records date and time only.':
   'Customize visit photos and minimum notes. Changes apply separately to each company, with no company dropdown needed.')+
   '</p></div></div><div id="gr-gps-panel" aria-live="polite">'+
   allowed.map((id,index)=>'<section class="gr-gps-company-section" data-gps-company="'+esc(id)+'">'+
    '<header class="gr-gps-company-heading"><div><h3>'+esc(labels[id])+'</h3>'+
    '<p class="gr-gps-caption">'+(access?'Employee GPS attendance access':'Visit closure settings')+'</p></div>'+
    '<span class="gr-gps-company-tag">Separate company settings</span></header>'+
    '<div class="gr-gps-company-content">Loading…</div></section>').join('')+
   '</div></section>';
  const sections=[...root.querySelectorAll('[data-gps-company]')];
  async function rpc(name,args){const result=await db.rpc(name,args);if(result.error)throw Error(result.error.message);return result.data}
  async function renderSection(section,index){
   const companyId=section.dataset.gpsCompany,content=section.querySelector('.gr-gps-company-content');
   try{
    const data=await rpc('gr_field_admin_config',{p_company:companyId});
    if(access){
     const staff=(data.staff||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
     content.innerHTML='<div class="gr-gps-toolbar"><input type="search" class="gr-gps-search" placeholder="Search employee" aria-label="Search '+esc(labels[companyId])+' employees">'+
      '<span class="gr-gps-stats gr-gps-counter" '+(index===0?'id="gr-gps-counter"':'')+'>'+
      staff.filter(x=>x.enabled).length+' / '+staff.length+' GPS enabled</span></div>'+
      '<div class="gr-gps-grid">'+staff.map(x=>
       '<div class="gr-gps-person" data-person="'+esc(String(x.name||'').toLowerCase())+'">'+
       '<div><strong>'+esc(x.name)+'</strong><small class="gr-gps-state">'+
       (x.enabled?'Field staff · Time + GPS':'Office / untracked · Date & time only')+'</small></div>'+
       '<label class="gr-gps-switch"><input type="checkbox" data-staff-id="'+esc(x.id)+'" '+(x.enabled?'checked':'')+
       ' aria-label="Capture GPS for '+esc(x.name)+' at '+esc(labels[companyId])+'"><span>Capture GPS</span></label></div>'
      ).join('')+'</div>'+
      (!index?'<div class="gr-gps-help"><b>Tracking:</b> GPS ON records location with attendance and roughly every 30 minutes while GreenRich ONE stays open and visible. GPS OFF records attendance date and time only. GPS permission is required for enabled staff. No locked-phone/background tracking.</div>':'');
     content.querySelector('.gr-gps-search').oninput=event=>{
      const term=event.target.value.trim().toLowerCase();
      content.querySelectorAll('[data-person]').forEach(row=>{row.hidden=!row.dataset.person.includes(term)});
     };
     content.querySelectorAll('[data-staff-id]').forEach(toggle=>toggle.onchange=async()=>{
      const desired=toggle.checked;toggle.disabled=true;
      try{
       await rpc('gr_field_assign_staff',{p_company:companyId,p_user:toggle.dataset.staffId,p_enabled:desired});
       const person=staff.find(x=>x.id===toggle.dataset.staffId);
       if(person)person.enabled=desired;
       toggle.closest('.gr-gps-person').querySelector('.gr-gps-state').textContent=
        desired?'Field staff · Time + GPS':'Office / untracked · Date & time only';
       content.querySelector('.gr-gps-counter').textContent=staff.filter(x=>x.enabled).length+' / '+staff.length+' GPS enabled';
       notify?.((desired?'GPS enabled for ':'GPS disabled for ')+(person?.name||'employee')+' · '+labels[companyId]);
      }catch(error){toggle.checked=!desired;notify?.('GPS setting not saved: '+error.message)}
      finally{toggle.disabled=false}
     });
    }else{
     const rules=Object.fromEntries((data.rules||[]).map(item=>[item.type,item]));
     content.innerHTML='<section class="gr-fs-section"><p class="gr-gps-caption">Current GPS and notes are mandatory on visit completion. Choose whether a photo is required for each visit type.</p>'+
      '<div class="tablewrap"><table><thead><tr><th>Visit type</th><th>Photos</th><th>Minimum notes</th><th>Action</th></tr></thead><tbody>'+
      types.map(([id,label])=>{
       const rule=rules[id]||{photos:photoDefaults[id],min_notes:10};
       return '<tr data-rule="'+id+'"><td>'+esc(label)+'</td><td><select aria-label="'+esc(label)+' photo requirement">'+
        '<option value="true" '+(rule.photos?'selected':'')+'>Required</option>'+
        '<option value="false" '+(!rule.photos?'selected':'')+'>Optional</option></select></td>'+
        '<td><input type="number" min="10" max="500" value="'+Number(rule.min_notes||10)+'" aria-label="Minimum notes length for '+esc(label)+'"></td>'+
        '<td><button type="button" class="secondary" data-save-rule="'+id+'">Save</button></td></tr>';
      }).join('')+'</tbody></table></div></section>';
     content.querySelectorAll('[data-save-rule]').forEach(button=>button.onclick=async()=>{
      const row=button.closest('tr');button.disabled=true;
      try{
       await rpc('gr_field_update_visit_rule',{
        p_company:companyId,p_type:button.dataset.saveRule,
        p_photos:row.querySelector('select').value==='true',
        p_min_notes:Number(row.querySelector('input').value)
       });
       notify?.('Visit completion rules saved · '+labels[companyId]);
      }catch(error){notify?.('Rules not saved: '+error.message)}
      finally{button.disabled=false}
     });
    }
   }catch(error){content.innerHTML='<div class="notice">Unable to load '+esc(labels[companyId])+': '+esc(error.message)+'</div>'}
  }
  await Promise.all(sections.map(renderSection));
 }
 const mountAccess=(root,opts)=>mount(root,{...opts,mode:'access'});
 const mountRules=(root,opts)=>mount(root,{...opts,mode:'rules'});
 window.GreenRichFieldSettings={mount:mountAccess,mountAccess,mountRules};
})();
