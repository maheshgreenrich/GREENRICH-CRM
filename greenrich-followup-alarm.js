'use strict';
/* Assigned salesperson's non-blocking follow-up reminder. Fires at the next known due time
   while the app is running, and rechecks when a background tab becomes visible. */
window.GreenRichFollowupAlarm=(()=>{
 let interval=null,deadline=null,modal=null,session=null,working=false,lastError='';
 const alreadyNotified=new Set();
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fields='lead_id,company_id,contact,title,mobile,stage,next_followup_at,assigned_to,notes';
 const base=()=>session.db.from('gr_lead_pipeline').select(fields)
  .in('company_id',session.companyIds).eq('assigned_to',session.userId)
  .neq('stage','Won').neq('stage','Lost').not('next_followup_at','is',null);
 function plan(iso){
  if(deadline)clearTimeout(deadline);deadline=null;
  if(!session||!iso)return;
  const ms=new Date(iso).getTime()-Date.now()+75;
  if(Number.isFinite(ms))deadline=setTimeout(()=>void check(),Math.max(0,Math.min(ms,60000)));
 }
 async function check(){
  if(working||!session||modal?.isConnected)return;
  working=true;
  try{
   const due=await base().lte('next_followup_at',new Date().toISOString())
    .order('next_followup_at',{ascending:true}).limit(1);
   if(due.error)throw Error(due.error.message);
   if(due.data?.length){
    // Lead card carries the prominent red pulse. Never block the workspace
    // with a modal; use a single non-blocking notice per scheduled due time.
    const l=due.data[0],key=l.company_id+':'+l.lead_id+':'+l.next_followup_at;
    if(!alreadyNotified.has(key)){
     alreadyNotified.add(key);
     if(alreadyNotified.size>500)alreadyNotified.clear();
     window.GreenRichNotify?.('⏰ Follow-up due: '+(l.contact||l.title||'Lead')+'. Open Leads & CRM and call now.','warning');
    }
    plan(null);lastError='';return;
   }
   const upcoming=await base().gt('next_followup_at',new Date().toISOString())
    .order('next_followup_at',{ascending:true}).limit(1);
   if(upcoming.error)throw Error(upcoming.error.message);
   plan(upcoming.data?.[0]?.next_followup_at);
   lastError='';
  }catch(error){
   if(lastError!==error.message)window.GreenRichNotify?.('Follow-up check failed: '+error.message,'error');
   lastError=error.message;
  }finally{working=false}
 }
 function open(l){
  if(modal?.isConnected||!session)return;
  const d=document.createElement('dialog');modal=d;d.className='gr-due-modal';
  const contact=l.contact||l.title||'Lead',phone=String(l.mobile||'').replace(/[^+0-9]/g,'');
  d.innerHTML='<div class="gr-due-head"><small>GREENRICH ONE · ASSIGNED FOLLOW-UP DUE</small><h2>⏰ Time to contact your lead</h2><p>'+
   esc(new Date(l.next_followup_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}))+' IST</p></div>'+
   '<div class="gr-due-content"><h3>'+esc(contact)+'</h3><p>'+esc(l.mobile||'No phone')+' · '+esc(l.stage)+'</p>'+
   (l.notes?'<p class="gr-due-last">Previous note: '+esc(l.notes)+'</p>':'')+
   '<p>Record a conversation or reschedule this follow-up. The warning stays open until it is saved.</p>'+
   '<div class="gr-due-shortcuts"><button type="button" data-focus-note>Add note</button>'+
   '<button type="button" data-focus-next>Reschedule</button><button type="button" data-open-lead>Open lead details</button></div>'+
   '<form><label>Conversation notes<textarea name="note" maxlength="4000" placeholder="What was discussed?"></textarea></label>'+
   '<label>Next follow-up date & time<input name="next" type="datetime-local"></label>'+
   '<p role="alert" class="gr-due-error" aria-live="assertive"></p><div class="gr-due-actions">'+
   (phone.replace(/\\D/g,'').length>=10?'<a href="tel:'+esc(phone)+'">☎ Call now</a>':'')+
   '<button type="submit">Save and clear reminder</button></div></form></div>';
  document.body.append(d);d.addEventListener('cancel',e=>e.preventDefault());
  d.onclose=()=>{d.remove();modal=null;void check()};
  d.querySelector('[data-focus-note]').onclick=()=>d.querySelector('[name=note]').focus();
  d.querySelector('[data-focus-next]').onclick=()=>d.querySelector('[name=next]').focus();
  d.querySelector('[data-open-lead]').onclick=()=>void window.GreenRichLeadProfile?.open?.({
    db:session.db,company:l.company_id,leadId:l.lead_id,quick:true
  });
  d.querySelector('form').onsubmit=async event=>{
   event.preventDefault();
   const form=event.currentTarget,fd=new FormData(form);
   const note=String(fd.get('note')||'').trim(),next=String(fd.get('next')||'');
   const err=form.querySelector('[role=alert]'),button=form.querySelector('button[type=submit]');
   if(!note&&!next){err.textContent='Enter a conversation note or a new follow-up date/time.';return}
   const nextStamp=next?new Date(next).getTime():null;
   if(next&&( !Number.isFinite(nextStamp)||nextStamp<=Date.now())){
    err.textContent='Next follow-up must be a valid future date and time.';return;
   }
   button.disabled=true;
   try{
    const result=await session.db.rpc('gr_pipeline_followup_respond',{
     p_company:l.company_id,p_lead:l.lead_id,p_note:note||null,
     p_next_at:next?new Date(nextStamp).toISOString():null
    });
    if(result.error)throw Error(result.error.message);
    window.GreenRichNotify?.('Follow-up saved. Reminder cleared.','success');
    d.close();
   }catch(error){err.textContent=error.message;window.GreenRichNotify?.(error.message,'error');button.disabled=false}
  };
  d.showModal();
 }
 function stop(){
  if(interval)clearInterval(interval);interval=null;
  if(deadline)clearTimeout(deadline);deadline=null;session=null;lastError='';
  if(modal?.open)modal.close();
 }
 function start({db,userId,companyIds,role}){
  stop();
  if(!db||!userId||!companyIds?.length||!/(sales|telecall)/i.test(String(role||'')))return;
  session={db,userId,companyIds};void check();
  interval=setInterval(()=>void check(),60000);
 }
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void check()});
 window.addEventListener('focus',()=>void check());
 return {start,stop,check};
})();
