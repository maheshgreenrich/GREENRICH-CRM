'use strict';
/* GreenRich ONE shared sidebar logo. Admin upload, RLS-protected metadata, public brand image. */
(()=>{
 const BUCKET='greenrich-branding',KEY='sidebar-logo';
 const maxSize=2*1024*1024;
 const allowed={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
 let db=null,path='',ready=false,channel=null,previewObjectUrl=null;
 const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function publicUrl(p){
  if(!p||!db)return '';
  const result=db.storage.from(BUCKET).getPublicUrl(p);
  return result.data?.publicUrl?result.data.publicUrl+'?v='+encodeURIComponent(p.split('/').pop()):'';
 }
 function apply(p){
  path=p||'';
  const image=document.getElementById('grBrandLogo'),mark=document.getElementById('grBrandMark'),letter=document.getElementById('grBrandLetter');
  if(!image||!mark)return;
  if(path){
   image.onerror=()=>{
    image.hidden=true;if(letter)letter.hidden=false;mark.classList.remove('gr-has-logo');
   };
   image.onload=()=>{image.hidden=false;if(letter)letter.hidden=true;mark.classList.add('gr-has-logo')};
   image.hidden=false;image.src=publicUrl(path);
  }else{
   image.hidden=true;image.removeAttribute('src');
   if(letter)letter.hidden=false;mark.classList.remove('gr-has-logo');
  }
 }
 async function reload(){
  if(!db)return;
  const {data,error}=await db.from('gr_workspace_branding').select('object_path').eq('key',KEY).maybeSingle();
  if(error){console.warn('GreenRich branding unavailable:',error.message);return}
  apply(data?.object_path||'');
 }
 function configure(client){
  if(!client)return;
  if(db!==client&&channel&&db){void db.removeChannel(channel);channel=null}
  db=client;ready=true;
  void reload();
  if(!channel){
   channel=db.channel('greenrich-workspace-branding').on('postgres_changes',
    {event:'*',schema:'public',table:'gr_workspace_branding',filter:'key=eq.sidebar-logo'},()=>void reload()).subscribe();
  }
 }
 async function mount(host,{client,notify}){
  if(!client)throw Error('Branding requires a connected GreenRich account.');
  if(!ready||db!==client)configure(client);
  host.innerHTML='<div class="panel gr-logo-settings"><div class="gr-logo-settings-head"><div>'+
   '<h2>Workspace Logo</h2><p>Upload the GreenRich ONE logo that will appear in the top-left sidebar on desktop, tablet and mobile. The same logo is shared across both companies and employee devices.</p></div></div>'+
   '<div class="gr-logo-settings-body"><div class="gr-logo-current"><span>Current logo</span><div class="gr-logo-preview" id="grLogoPreview"><strong>G</strong></div><small id="grLogoCurrentNote">No custom logo uploaded yet. The default GreenRich icon is being used.</small></div>'+
   '<form id="grLogoForm"><label for="grLogoFile">Choose logo image</label><input id="grLogoFile" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp">'+
   '<p class="gr-logo-hint">PNG, JPG or WebP · maximum 2 MB. A square logo with a transparent background works best for the compact sidebar.</p>'+
   '<div class="gr-logo-actions"><button class="blue" id="grLogoSave" type="submit" disabled>Upload & Apply Logo</button>'+
   '<button class="secondary" id="grLogoReset" type="button">Use Default Logo</button></div>'+
   '<div role="status" id="grLogoStatus" class="gr-logo-status"></div></form></div>'+
   '<p class="gr-logo-privacy">The logo is a public brand image; never upload confidential documents. Only administrators can change it.</p></div>';
  const preview=host.querySelector('#grLogoPreview'),input=host.querySelector('#grLogoFile'),note=host.querySelector('#grLogoCurrentNote'),
   status=host.querySelector('#grLogoStatus'),button=host.querySelector('#grLogoSave'),reset=host.querySelector('#grLogoReset');
  const result=await client.from('gr_workspace_branding').select('object_path').eq('key',KEY).maybeSingle();
  if(result.error){status.textContent='Cannot load current logo: '+result.error.message;return}
  let originalPath=result.data?.object_path||'';
  function showPreview(url,custom){
   preview.innerHTML=custom?'<img src="'+e(url)+'" alt="GreenRich sidebar logo preview">':'<strong>G</strong>';
  }
  showPreview(publicUrl(originalPath),!!originalPath);
  note.textContent=originalPath?'Currently used across GreenRich ONE. Choose a new image below to replace it.':'No custom logo uploaded yet. The default GreenRich icon is being used.';
  reset.disabled=!originalPath;
  function discardPreview(){if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=null}}
  input.onchange=()=>{
   discardPreview();button.disabled=true;status.textContent='';
   const file=input.files?.[0];if(!file){showPreview(publicUrl(originalPath),!!originalPath);return}
   if(!allowed[file.type]){status.textContent='Choose PNG, JPG or WebP only.';return}
   if(file.size<=0||file.size>maxSize){status.textContent='Logo must be smaller than 2 MB.';return}
   previewObjectUrl=URL.createObjectURL(file);showPreview(previewObjectUrl,true);button.disabled=false;
   status.textContent='Preview ready. Click Upload & Apply Logo to save it for all devices.';
  };
  host.querySelector('#grLogoForm').onsubmit=async event=>{
   event.preventDefault();
   const file=input.files?.[0];if(!file||!allowed[file.type]||file.size<=0||file.size>maxSize)return;
   button.disabled=true;reset.disabled=true;status.textContent='Uploading logo…';
   const location='workspace/logo-'+Date.now()+'-'+Math.random().toString(36).slice(2,10)+'.'+allowed[file.type];
   try{
    const upload=await client.storage.from(BUCKET).upload(location,file,{contentType:file.type,upsert:false,cacheControl:'31536000'});
    if(upload.error)throw Error('Upload failed: '+upload.error.message);
    const saved=await client.from('gr_workspace_branding').upsert({key:KEY,object_path:location,updated_at:new Date().toISOString()},{onConflict:'key'});
    if(saved.error){await client.storage.from(BUCKET).remove([location]);throw Error('Logo was uploaded but could not be applied: '+saved.error.message)}
    originalPath=location;discardPreview();showPreview(publicUrl(location),true);apply(location);
    input.value='';button.disabled=true;reset.disabled=false;
    note.textContent='This image is now used across GreenRich ONE.';
    status.textContent='Logo saved successfully for all employee devices.';
    notify?.('GreenRich ONE logo updated.');
   }catch(error){status.textContent=error.message;button.disabled=false;reset.disabled=!originalPath}
  };
  reset.onclick=async()=>{
   if(!originalPath)return;
   reset.disabled=true;button.disabled=true;status.textContent='Restoring default logo…';
   const previous=originalPath;
   const saved=await client.from('gr_workspace_branding').update({object_path:null,updated_at:new Date().toISOString()}).eq('key',KEY);
   if(saved.error){status.textContent='Unable to restore default logo: '+saved.error.message;reset.disabled=false;return}
   originalPath='';discardPreview();input.value='';showPreview('',false);apply('');
   note.textContent='Default GreenRich icon restored.';
   status.textContent='Default logo restored across devices.';notify?.('Default GreenRich logo restored.');
   // Retire the previously uploaded public image after removing its reference.
   const removed=await client.storage.from(BUCKET).remove([previous]);
   if(removed.error)console.warn('Old brand image cleanup:',removed.error.message);
  };
 }
 window.GreenRichBranding={configure,mount,reload,apply};
})();
