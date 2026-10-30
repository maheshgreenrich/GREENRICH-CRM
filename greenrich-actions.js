'use strict';
/* One accessible, viewport-positioned action menu for CRM table rows.
   Existing edit/delete/approve/dispatch handlers continue to own their actions. */
(()=>{
 let menu=null,active=null;
 const close=()=>{if(menu){menu.remove();menu=null}if(active){active.setAttribute('aria-expanded','false');active=null}};
 function wrap(buttons){return '<div class="gr-more-cell"><button class="gr-more-trigger" type="button" aria-label="Open row actions" aria-haspopup="menu" aria-expanded="false" title="More actions">⋮</button><div class="gr-more-source" hidden>'+buttons+'</div></div>'}
 document.addEventListener('click',event=>{
  const trigger=event.target.closest('.gr-more-trigger');
  if(trigger){
   const parent=trigger.closest('.gr-more-cell');if(!parent)return;
   const wasActive=active===trigger;close();if(wasActive)return;
   active=trigger;trigger.setAttribute('aria-expanded','true');
   menu=document.createElement('div');menu.className='gr-more-popover';menu.setAttribute('role','menu');
   const sources=[...parent.querySelectorAll('.gr-more-source button')];
   if(!sources.length){close();return}
   sources.forEach((button,index)=>{
    const item=document.createElement('button');item.type='button';item.className='gr-more-option'+(button.classList.contains('delete')?' danger':'');
    item.setAttribute('role','menuitem');item.textContent=button.textContent.trim()||button.getAttribute('aria-label')||'Action';
    item.disabled=button.disabled;
    item.onclick=()=>{
     const actual=sources[index];close();
     if(actual?.isConnected)actual.click();
    };
    menu.append(item);
   });
   document.body.append(menu);
   const rect=trigger.getBoundingClientRect(),mw=198,mh=Math.min(menu.offsetHeight,360);
   menu.style.left=Math.max(8,Math.min(window.innerWidth-mw-8,rect.right-mw))+'px';
   menu.style.top=(rect.bottom+mh+7>window.innerHeight?Math.max(8,rect.top-mh-5):rect.bottom+5)+'px';
   menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
   event.preventDefault();return;
  }
  if(menu&&!event.target.closest('.gr-more-popover'))close();
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu){close();event.preventDefault()}});
 window.addEventListener('scroll',close,true);window.addEventListener('resize',close);
 window.GreenRichActionMenu={wrap,close};
})();
