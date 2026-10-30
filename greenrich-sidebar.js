'use strict';
/* GreenRich ONE responsive sidebar; a saved preference for desktop and mobile. */
(()=>{
 const widthQuery='(max-width: 760px)';
 const storagePrefix='gr-one-sidebar-collapsed-v1-';
 let userId='',initialized=false,collapsed=false,viewportMobile=false;
 const isMobile=()=>window.matchMedia(widthQuery).matches;
 const key=mobile=>storagePrefix+(mobile?'mobile-':'desktop-')+userId;
 const stored=mobile=>{try{const v=localStorage.getItem(key(mobile));return v==='true'?true:v==='false'?false:null}catch{return null}};
 function apply(value,persist=true){
  const app=document.getElementById('app'),sidebar=document.getElementById('sidebar'),toggle=document.getElementById('grSidebarToggle'),
   hamburger=document.getElementById('hamburger'),backdrop=document.getElementById('grSidebarBackdrop');
  if(!app||!sidebar||!toggle)return;
  collapsed=!!value;viewportMobile=isMobile();
  app.classList.toggle('gr-sidebar-collapsed',collapsed);
  app.classList.toggle('gr-sidebar-expanded',!collapsed);
  sidebar.classList.toggle('open',!collapsed);
  const title=collapsed?'Expand menu':'Collapse menu';
  toggle.setAttribute('aria-label',title);
  toggle.setAttribute('title',title);
  toggle.setAttribute('aria-expanded',String(!collapsed));
  if(hamburger){hamburger.setAttribute('aria-label',title);hamburger.setAttribute('aria-expanded',String(!collapsed))}
  if(backdrop){backdrop.hidden=collapsed||!viewportMobile;backdrop.setAttribute('aria-hidden','true')}
  if(persist)try{localStorage.setItem(key(viewportMobile),String(collapsed))}catch{}
 }
 function setInitial(){viewportMobile=isMobile();apply(stored(viewportMobile)??viewportMobile,false)}
 function toggle(){apply(!collapsed)}
 function collapseMobile(){if(initialized&&isMobile()&&!collapsed)apply(true)}
 function init({userId:nextUserId}){
  userId=nextUserId||'anonymous';
  const button=document.getElementById('grSidebarToggle'),headerButton=document.getElementById('hamburger'),
   backdrop=document.getElementById('grSidebarBackdrop');
  if(!button)return;
  button.onclick=toggle;
  if(headerButton)headerButton.onclick=toggle;
  if(backdrop)backdrop.onclick=()=>apply(true);
  if(!initialized){
   window.addEventListener('resize',()=>{
    if(viewportMobile===isMobile())return;
    setInitial();
   });
   document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&isMobile()&&!collapsed){apply(true);document.getElementById('hamburger')?.focus()}
   });
  }
  initialized=true;setInitial();
 }
 window.GreenRichSidebar={init,toggle,collapseMobile,isCollapsed:()=>collapsed};
})();
