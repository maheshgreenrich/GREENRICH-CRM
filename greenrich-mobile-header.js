'use strict';
(()=>{
 const toggle=document.getElementById('grAccountToggle'),panel=document.getElementById('grAccountPanel');
 if(!toggle||!panel)return;
 const account=toggle.parentElement;
 const close=()=>{account.classList.remove('open');toggle.setAttribute('aria-expanded','false')};
 toggle.onclick=()=>{const open=toggle.getAttribute('aria-expanded')!=='true';account.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open))};
 document.addEventListener('click',event=>{if(!account.contains(event.target))close()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&toggle.getAttribute('aria-expanded')==='true'){close();toggle.focus()}});
 document.getElementById('grAccountLogout').onclick=()=>{close();document.getElementById('logout').click()};
 window.addEventListener('resize',close);
})();
