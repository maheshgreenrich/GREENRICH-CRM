'use strict';
/* Admin Settings: global customer tags for both companies and all employee logins. */
(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function mount(root,{db,notify}){
  if(!root||!db||!window.GreenRichSharedCustomers)throw Error('Shared customer tag service is not available');
  const inform=s=>{if(typeof notify==='function')notify(s)};
  root.innerHTML='<div class="panel"><h2>Customer Tags</h2><p>Tags are shared by both GreenRich companies and are available when you create or edit customers in Sales & CRM.</p><form id="gr-tags-form" class="gr-tag-admin-toolbar"><label>New customer tag<input name="tag" minlength="2" maxlength="50" required placeholder="VIP, Dealer, Repeat Customer"></label><button class="blue" type="submit">+ Add Tag</button></form><div id="gr-tags-rows" class="gr-tag-rows">Loading shared tags...</div></div>';
  const shared=window.GreenRichSharedCustomers;
  await shared.ready({client:db,admin:true});
  const redraw=()=>{
   const {customers,tags}=shared.snapshot(),host=root.querySelector('#gr-tags-rows');
   if(!host)return;
   host.innerHTML=tags.map(tag=>'<div class="gr-tag-row"><strong>'+esc(tag.name)+'</strong><small>'+customers.filter(c=>Array.isArray(c.tag_ids)&&c.tag_ids.includes(tag.id)).length+' customers</small><button class="secondary" type="button" data-tag-edit="'+esc(tag.id)+'">Edit</button><button class="secondary" type="button" data-tag-delete="'+esc(tag.id)+'">Delete</button></div>').join('')||'<p>No customer tags yet. Create your first tag above.</p>';
   host.querySelectorAll('[data-tag-edit]').forEach(button=>button.onclick=async()=>{
    const tag=shared.snapshot().tags.find(t=>t.id===button.dataset.tagEdit);if(!tag)return;
    const newName=prompt('Rename customer tag',tag.name);if(newName===null)return;
    const name=newName.trim();
    if(name.length<2||name.length>50)return inform('Tag name must contain 2–50 characters');
    if(shared.snapshot().tags.some(t=>t.id!==tag.id&&t.name.toLowerCase()===name.toLowerCase()))return inform('This tag name already exists');
    button.disabled=true;
    try{await shared.renameTag(tag.id,name);redraw();inform('Customer tag updated')}
    catch(e){inform('Unable to rename tag: '+e.message)}finally{button.disabled=false}
   });
   host.querySelectorAll('[data-tag-delete]').forEach(button=>button.onclick=async()=>{
    const tag=shared.snapshot().tags.find(t=>t.id===button.dataset.tagDelete);
    if(!tag||!confirm('Delete "'+tag.name+'" and remove it from all customer records?'))return;
    button.disabled=true;
    try{await shared.deleteTag(tag.id);redraw();inform('Customer tag deleted')}
    catch(e){inform('Unable to delete tag: '+e.message)}finally{button.disabled=false}
   });
  };
  root.querySelector('#gr-tags-form').onsubmit=async event=>{
   event.preventDefault();
   const name=String(new FormData(event.currentTarget).get('tag')||'').trim();
   if(name.length<2||name.length>50)return inform('Tag name must contain 2–50 characters');
   if(shared.snapshot().tags.some(t=>t.name.toLowerCase()===name.toLowerCase()))return inform('This tag already exists');
   const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;
   try{await shared.createTag(name);event.currentTarget.reset();redraw();inform('Tag added for both companies')}
   catch(e){inform('Unable to add customer tag: '+e.message)}finally{button.disabled=false}
  };
  redraw();
 }
 window.GreenRichCustomerTags={mount};
})();