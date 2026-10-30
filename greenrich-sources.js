'use strict';
/* Admin CRM lead/customer source management. Sources shared across both companies. */
(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function mount(root,{db,notify}){
  root.innerHTML='<section class="gr-source-settings"><header><h2>Customer & Lead Sources</h2><p>Manage the sources used by customers, enquiries, filters and Excel imports. Shared across both GreenRich companies.</p></header>'+
   '<form class="gr-source-new" id="gr-source-new"><label>Source name<input name="name" placeholder="Website, Meta, Google, Direct…" minlength="2" maxlength="80" required></label>'+
   '<button type="submit" class="blue">+ Add Source</button></form>'+
   '<div class="gr-source-rows" id="gr-source-rows" aria-live="polite">Loading sources…</div><p class="gr-source-status" id="gr-source-status" role="status"></p></section>';
  const result=root.querySelector('#gr-source-rows'),notice=root.querySelector('#gr-source-status');
  let sources=[];
  const say=x=>{notice.textContent=x;notify?.(x)};
  async function refresh(){
   const r=await db.from('gr_crm_sources').select('*').order('name');
   if(r.error)throw Error(r.error.message);
   sources=r.data||[];
   result.innerHTML=sources.map(s=>'<div class="gr-source-row"><span>'+esc(s.name)+(s.active?'':' · Inactive')+'</span>'+
    '<div><button type="button" class="secondary" data-source-edit="'+esc(s.id)+'">Rename</button>'+
    '<button type="button" class="secondary" data-source-status="'+esc(s.id)+'">'+(s.active?'Deactivate':'Activate')+'</button></div></div>').join('')||'<p>No sources yet. Add one above.</p>';
  }
  root.querySelector('#gr-source-new').onsubmit=async e=>{
   e.preventDefault();const form=e.currentTarget,name=form.elements.namedItem('name').value.trim();
   if(!name)return;
   const existing=sources.some(s=>s.name.toLowerCase()===name.toLowerCase());
   if(existing)return say('Source already exists.');
   const r=await db.from('gr_crm_sources').insert({name}).select('id');
   if(r.error)return say('Cannot add source: '+r.error.message);
   form.reset();await refresh();say('Added source '+name+'.');
  };
  result.onclick=async e=>{
   const edit=e.target.closest('[data-source-edit]'),status=e.target.closest('[data-source-status]');
   const id=edit?.dataset.sourceEdit||status?.dataset.sourceStatus,s=sources.find(x=>x.id===id);
   if(!s)return;
   if(edit){
    const name=prompt('Rename source (existing contact source values remain unchanged until edited)',s.name);
    if(name===null||!name.trim()||name.trim()===s.name)return;
    const updated=await db.from('gr_crm_sources').update({name:name.trim(),updated_at:new Date().toISOString()}).eq('id',id).select('id');
    if(updated.error)return say(updated.error.message);
    say('Source name updated. Older records retain their original source text until updated.');
   }else{
    const updated=await db.from('gr_crm_sources').update({active:!s.active,updated_at:new Date().toISOString()}).eq('id',id).select('id');
    if(updated.error)return say(updated.error.message);
    say('Source '+(!s.active?'activated':'deactivated')+'. Existing records are preserved.');
   }
   await refresh();
  };
  try{await refresh()}catch(e){say('Unable to load sources: '+e.message)}
 }
 window.GreenRichSources={mount};
})();
