'use strict';
/* Admin-managed local customer tags; scoped to the selected company. */
(()=>{
 const names={'grow-india':'GreenRich Grow India Pvt Ltd','enviro-solutions':'GreenRich Enviro Solutions Pvt Ltd'};
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const key=id=>id==='grow-india'?'greenrich-crm-v2':'greenrich-crm-v2::'+id;
 const load=id=>{
  if(!Object.hasOwn(names,id))throw Error('Unknown company');
  let db;try{db=JSON.parse(localStorage.getItem(key(id))||'null')}catch{throw Error('Invalid CRM records. Restore your backup first.')}
  if(!db)db={version:3,tags:[],orderSequence:0,customers:[],sales:[],products:[],channels:[],leads:[],tasks:[]};
  if(!Array.isArray(db.customers)||!Array.isArray(db.sales))throw Error('Invalid CRM data. Restore your backup.');
  if(!Array.isArray(db.tags))db.tags=[];return db;
 };
 const save=(id,db)=>localStorage.setItem(key(id),JSON.stringify(db));
 function mount(root,{companyId,notify}){
  const inform=s=>{if(typeof notify==='function')notify(s)};
  root.innerHTML='<div class="panel"><h2>Customer Tags</h2><p>Create, rename or remove tags to categorize customers. Tags are stored separately for each company on this browser (not synced across devices).</p><div class="gr-tag-admin-toolbar"><label>Company<select id="gr-tags-company"></select></label></div><form id="gr-tags-form" class="gr-tag-admin-toolbar"><label>New customer tag<input name="tag" minlength="2" maxlength="50" required placeholder="VIP, Distributor, Repeat Customer"></label><button class="blue" type="submit">+ Add Tag</button></form><div id="gr-tags-rows" class="gr-tag-rows"></div></div>';
  const select=root.querySelector('#gr-tags-company');
  Object.entries(names).forEach(([id,label])=>{const option=document.createElement('option');option.value=id;option.textContent=window.GreenRichCompanies?.list?.().find(c=>c.id===id)?.name||label;select.append(option)});
  select.value=Object.hasOwn(names,companyId)?companyId:'grow-india';
  function render(){
   const db=load(select.value),host=root.querySelector('#gr-tags-rows');
   host.innerHTML=db.tags.map(tag=>'<div class="gr-tag-row"><strong>'+escape(tag.name)+'</strong><small>'+db.customers.filter(c=>Array.isArray(c.tag_ids)&&c.tag_ids.includes(tag.id)).length+' customers</small><button class="secondary" type="button" data-tag-edit="'+escape(tag.id)+'">Edit</button><button class="secondary" type="button" data-tag-delete="'+escape(tag.id)+'">Delete</button></div>').join('')||'<p>No tags yet. Create your first customer tag.</p>';
   host.querySelectorAll('[data-tag-edit]').forEach(button=>button.onclick=()=>{
    const db=load(select.value),tag=db.tags.find(t=>t.id===button.dataset.tagEdit);if(!tag)return;
    const text=prompt('Rename tag',tag.name);if(text===null)return;
    const name=text.trim();
    if(name.length<2||name.length>50)return inform('Tag must contain 2–50 characters');
    if(db.tags.some(t=>t.id!==tag.id&&t.name.toLowerCase()===name.toLowerCase()))return inform('This tag already exists');
    tag.name=name;try{save(select.value,db);render();inform('Tag updated')}catch(e){inform('Could not save tag: '+e.message)}
   });
   host.querySelectorAll('[data-tag-delete]').forEach(button=>button.onclick=()=>{
    const db=load(select.value),tag=db.tags.find(t=>t.id===button.dataset.tagDelete);
    if(!tag||!confirm('Delete "'+tag.name+'" and remove it from assigned customers?'))return;
    db.tags=db.tags.filter(t=>t.id!==tag.id);
    db.customers.forEach(c=>{if(Array.isArray(c.tag_ids))c.tag_ids=c.tag_ids.filter(id=>id!==tag.id)});
    try{save(select.value,db);render();inform('Tag deleted')}catch(e){inform('Could not delete tag: '+e.message)}
   });
  }
  root.querySelector('#gr-tags-form').onsubmit=event=>{
   event.preventDefault();
   const name=String(new FormData(event.currentTarget).get('tag')||'').trim(),db=load(select.value);
   if(name.length<2||name.length>50)return inform('Tag must contain 2–50 characters');
   if(db.tags.some(t=>t.name.toLowerCase()===name.toLowerCase()))return inform('This tag already exists');
   db.tags.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name});
   try{save(select.value,db);event.currentTarget.reset();render();inform('Tag created')}catch(e){inform('Could not create tag: '+e.message)}
  };
  select.onchange=render;render();
 }
 window.GreenRichCustomerTags={mount};
})();