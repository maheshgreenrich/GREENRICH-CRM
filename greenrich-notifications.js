'use strict';
window.GreenRichNotify=(()=>{
 let timeout;
 const classify=value=>{
  const x=String(value||'').toLowerCase();
  return /error|failed|denied|invalid|unavailable|unable|not found|permission|cannot|could not|rejected/.test(x)?'error':
   /warning|overdue|required|missing|choose |must |pending|attention|duplicate/.test(x)?'warning':
   /saved|success|updated|created|imported|exported|assigned|sent|completed|approved|won|converted|linked|deleted|removed|edited|uploaded|synchroni[sz]ed|synced|check-in recorded|check-out recorded/.test(x)?'success':'info';
 };
 return (message,kind)=>{
  const t=document.querySelector('#toast');if(!t)return;
  t.textContent=String(message??'');t.dataset.kind=['success','error','warning','info'].includes(kind)?kind:classify(message);
  t.setAttribute('role',t.dataset.kind==='error'||t.dataset.kind==='warning'?'alert':'status');
  t.setAttribute('aria-live',t.dataset.kind==='error'||t.dataset.kind==='warning'?'assertive':'polite');
  t.classList.add('show');clearTimeout(timeout);
  timeout=setTimeout(()=>t.classList.remove('show'),t.dataset.kind==='error'?8500:4500);
 };
})();