/* Mobile and desktop installation helper. No forced prompts or app permissions. */
'use strict';
(()=>{
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
 navigator.serviceWorker.register('./greenrich-app-sw.js',{scope:'./'}).catch(err=>console.info('App installation service unavailable:',err.message));
 let installEvent=null;
 const isInstalled=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
 const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent);
 const makeButton=()=>{
  if(document.getElementById('gr-install-app')||isInstalled())return;
  const button=document.createElement('button');
  button.id='gr-install-app';button.type='button';button.textContent='Install GreenRich ONE App';
  button.setAttribute('aria-label','Install GreenRich ONE on this device');
  button.style.cssText='position:fixed;right:16px;bottom:16px;z-index:99999;background:#123f71;color:white;border:1px solid #ffffff55;border-radius:12px;padding:11px 15px;font:600 13px system-ui;box-shadow:0 4px 20px #0003;cursor:pointer';
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
