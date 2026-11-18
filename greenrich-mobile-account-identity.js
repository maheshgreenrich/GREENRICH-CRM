'use strict';
(()=>{
 const init=()=>{
  const sourceName=document.getElementById('userName'),sourceRole=document.getElementById('userRole');
  const targetName=document.getElementById('grMobileUserName'),targetRole=document.getElementById('grMobileUserRole');
  if(!sourceName||!sourceRole||!targetName||!targetRole)return;
  const sync=()=>{
   targetName.textContent=sourceName.textContent?.trim()||'Signed-in user';
   targetRole.textContent=sourceRole.textContent?.trim()||'Role not assigned';
  };
  const observer=new MutationObserver(sync);
  observer.observe(sourceName,{childList:true,subtree:true,characterData:true});
  observer.observe(sourceRole,{childList:true,subtree:true,characterData:true});
  sync();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
