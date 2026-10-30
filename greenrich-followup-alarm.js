'use strict';
window.GreenRichFollowupAlarm=(()=>{
 let timer=null,modal=null,session=null,working=false;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function check(){
  if(working||!session||modal?.isConnected)return;
  working=true;
  try{
   const r=await session.db.from('gr_lead_pipeline')
    .select('lead_id,company_id,contact,title,mobile,stage,next_followup_at,assigned_to,notes')
    .in('company_id',session.companyIds).lte('next_followup_at',new Date().toISOString())
    .neq('stage','Won').or('assigned_to.eq.'+session.userId+',assigned_to.is.null')
    .order('next_followup_at',{ascending:true}).limit(1);
   if(r.error)throw Error(r.error.message);
   if(r.data?.length)open(r.data[0]);
  }catch(e){console.warn('Follow-up reminder:',e.message)}
  finally{working=false}
 }
 function open(l){
  if(modal?.isConnected)return;
  const d=document.createElement('dialog');modal=d;d.className='gr-due-modal';
  d.innerHTML='<div class="gr-due-head"><small>GREENRICH ONE · FOLLOW-UP REQUIRED</small><h2>⏰ Time to contact your lead</h2><p>'+
   esc(new Date(l.next_followup_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}))+'</p></div>'+
   '<div class="gr-due-content"><h3>'+esc(l.contact||l.title)+'</h3><p>'+esc(l.mobile||'No phone')+' · '+esc(l.stage)+'</p>'+
   (l.notes?'<p class="gr-due-last">Previous note: '+esc(l.notes)+'</p>':'')+
   '<p>Enter a conversation note or reschedule. This reminder cannot be dismissed without saving.</p>'+
   '<form><label>Conversation notes<textarea name="note" placeholder="What was discussed?"></textarea></label>'+
   '<label>Next follow-up date & time<input name="next" type="datetime-local"></label>'+
   '<p role="alert" class="gr-due-error"></p><div class="gr-due-actions">'+
   (String(l.mobile||'').replace(/\D/g,'').length>=10?'<a href="tel:'+esc(String(l.mobile).replace(/[^+0-9]/g,''))+'">☎ Call</a>':'')+
   '<button type="submit">Save and clear reminder</button></div></form></div>';
  document.body.append(d);d.addEventListener('cancel',e=>e.preventDefault());
  d.onclose=()=>{d.remove();modal=null;void check()};
  d.querySelector('form').onsubmit=async e=>{
   e.preventDefault();
   const f=e.currentTarget,fd=new FormData(f),note=String(fd.get('note')||'').trim(),next=String(fd.get('next')||'');
   const err=f.querySelector('[role=alert]'),button=f.querySelector('button[type=submit]');
   if(!note&&!next){err.textContent='Enter a note or a new follow-up date/time.';return}
   const due=next?new Date(next).toISOString():null;
   if(due&&new Date(due).getTime()<=Date.now()){err.textContent='Next follow-up must be in the future.';return}
   button.disabled=true;
   try{
    const r=await session.db.rpc('gr_pipeline_followup_respond',
     {p_company:l.company_id,p_lead:l.lead_id,p_note:note||null,p_next_at:due});
    if(r.error)throw Error(r.error.message);
    window.GreenRichNotify?.('Follow-up saved','success');
    d.close();
   }catch(ex){err.textContent=ex.message;button.disabled=false}
  };
  d.showModal();
 }
 function stop(){if(timer)clearInterval(timer);timer=null;session=null;if(modal?.open)modal.close()}
 function start({db,userId,companyIds,role}){
  stop();if(!db||!userId||!companyIds?.length||!['Sales','Telecaller'].includes(role))return;
  session={db,userId,companyIds};void check();timer=setInterval(check,15000);
 }
 return {start,stop,check};
})();