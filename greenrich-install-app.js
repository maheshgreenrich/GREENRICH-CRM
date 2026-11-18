/* Mobile and desktop installation helper. No forced prompts or app permissions. */
'use strict';
(()=>{
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
 navigator.serviceWorker.register('./greenrich-app-sw.js?v=20261119-v3',{scope:'./'}).catch(err=>console.info('App installation service unavailable:',err.message));
 let installEvent=null;
 const isInstalled=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
 const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent);
 const makeButton=()=>{
  if(document.getElementById('gr-install-app')||isInstalled())return;
  const button=document.createElement('button');
  button.id='gr-install-app';button.type='button';
  const brand=document.createElement('img');brand.src='https://uawgwkplkvahhmhvroul.supabase.co/storage/v1/object/public/greenrich-branding/workspace/logo-1793332914856-f5ujd3qi.jpg';
  brand.alt='';brand.width=26;brand.height=26;brand.style.cssText='width:26px;height:26px;object-fit:contain;border-radius:5px;background:white';
  brand.onerror=()=>brand.remove();button.appendChild(brand);
  button.appendChild(document.createTextNode(' Install GreenRich ONE App'));
  button.setAttribute('aria-label','Install GreenRich ONE on this device');
  button.style.cssText='position:fixed;right:16px;bottom:16px;z-index:99999;background:#123f71;color:white;border:1px solid #ffffff55;border-radius:12px;padding:9px 15px;display:flex;align-items:center;gap:8px;font:600 13px system-ui;box-shadow:0 4px 20px #0003;cursor:pointer';
  button.addEventListener('click',async()=>{
   if(installEvent){
    const event=installEvent;installEvent=null;button.disabled=true;
    try{await event.prompt();await event.userChoice;}catch(err){console.info('Install prompt unavailable:',err.message)}
    button.disabled=false;button.remove();return;
   }
   const instructions=isIOS()?'In Safari, tap Share and choose Add to Home Screen.':'In Chrome or Edge, open the browser menu and select Install app or Add to Home screen.';
   window.alert(instructions);
  });
  document.body.appendChild(button);
 };
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;makeButton()});
 window.addEventListener('appinstalled',()=>{installEvent=null;document.getElementById('gr-install-app')?.remove()});
 // Always expose an install entry point; Chrome controls its own toolbar icon.
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',makeButton,{once:true});
 else makeButton();
})();
