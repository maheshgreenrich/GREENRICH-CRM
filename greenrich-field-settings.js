'use strict';
/* Admin-only employee GPS assignment and visit-closing policy configuration. */
(()=>{
 // Preserve quotes and apostrophes in employee names safely within HTML.
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const types=[['sales','Sales visit'],['service','Service visit'],['site','Site visit'],['installation','Installation']];
 const defaults={sales:true,service:false,site:true,installation:false};
 async function mount(root,{db,companies,notify}){
  if(!db)throw Error('CRM database is unavailable');
  const valid=companies.filter(c=>c==='grow-india'||c==='enviro-solutions');
  if(!valid.length)throw Error('No company access');
  root.innerHTML='<div class="panel"><div class="row"><div><h2>Field Staff & Visit Rules</h2><p>Control which employees share GPS during duty hours. Office employees use normal attendance without GPS.</p></div>'+
   '<label>Company <select id="gr-fs-company">'+valid.map(v=>'<option value="'+escape(v)+'">'+(v==='grow-india'?'Grow India':'Enviro Solutions')+'</option>').join('')+'</select></label></div>'+
   '<p class="notice">Location permission is always requested from the employee. Browser tracking only operates while a page is open and visible; locked/background phones cannot be tracked reliably.</p>'+
   '<div id="gr-fs-content">Loading staff settings…</div></div>';
  const area=root.querySelector('#gr-fs-content'),company=root.querySelector('#gr-fs-company');
  async function rpc(name,args){const r=await db.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data}
  async function load(){
   area.textContent='Loading staff and visit rules…';
   try{
    const data=await rpc('gr_field_admin_config',{p_company:company.value});
    const rows=data.staff||[],rules=Object.fromEntries((data.rules||[]).map(x=>[x.type,x]));
    area.innerHTML='<section class="gr-fs-section"><h3>Employee GPS Attendance</h3>'+
     '<p>Only enabled employees must supply GPS when using morning Check In / Check Out. GPS is visible to authorized supervisors only.</p>'+
     '<div class="tablewrap"><table><thead><tr><th>Employee</th><th>Duty type</th><th>Save</th></tr></thead><tbody>'+
     rows.map(s=>'<tr data-staff="'+escape(s.id)+'"><td>'+escape(s.name)+'</td><td><select aria-label="Tracking for '+escape(s.name)+'"><option value="false" '+(!s.enabled?'selected':'')+'>Office · No GPS</option><option value="true" '+(s.enabled?'selected':'')+'>Field · GPS required</option></select></td>'+
     '<td><button class="secondary" type="button" data-save-staff="'+escape(s.id)+'">Save</button></td></tr>').join('')+
     '</tbody></table></div></section>'+
     '<section class="gr-fs-section"><h3>Visit Closure Requirements</h3>'+
     '<p>GPS and work notes are mandatory for every completed visit. Choose whether photo evidence is required for each type. A follow-up employee and date can be assigned during completion.</p>'+
     '<div class="tablewrap"><table><thead><tr><th>Visit type</th><th>Photos</th><th>Minimum notes</th><th>Save</th></tr></thead><tbody>'+
     types.map(([id,label])=>{const r=rules[id]||{photos:defaults[id],min_notes:10};
      return '<tr data-rule="'+id+'"><td>'+escape(label)+'</td><td><select aria-label="Photo rule for '+escape(label)+'"><option value="true" '+(r.photos?'selected':'')+'>Required</option><option value="false" '+(!r.photos?'selected':'')+'>Optional</option></select></td>'+
      '<td><input type="number" min="10" max="500" value="'+Number(r.min_notes||10)+'" aria-label="Minimum note characters"></td>'+
      '<td><button class="secondary" type="button" data-save-rule="'+id+'">Save</button></td></tr>'}).join('')+
     '</tbody></table></div></section>';
    area.querySelectorAll('[data-save-staff]').forEach(b=>b.onclick=async()=>{
     const line=b.closest('tr');b.disabled=true;
     try{await rpc('gr_field_assign_staff',{p_company:company.value,p_user:b.dataset.saveStaff,p_enabled:line.querySelector('select').value==='true'});
      notify?.('Employee location assignment saved');await load()}
     catch(err){notify?.('Unable to save field assignment: '+err.message)}finally{b.disabled=false}
    });
    area.querySelectorAll('[data-save-rule]').forEach(b=>b.onclick=async()=>{
     const line=b.closest('tr');b.disabled=true;
     try{await rpc('gr_field_update_visit_rule',{p_company:company.value,p_type:b.dataset.saveRule,
      p_photos:line.querySelector('select').value==='true',p_min_notes:Number(line.querySelector('input').value)});
      notify?.('Visit requirements saved');await load()}
     catch(err){notify?.('Unable to save visit requirements: '+err.message)}finally{b.disabled=false}
    });
   }catch(err){area.innerHTML='<div class="notice">Field settings could not be loaded: '+escape(err.message)+'</div>'}
  }
  company.onchange=load;await load();
 }
 window.GreenRichFieldSettings={mount};
})();
