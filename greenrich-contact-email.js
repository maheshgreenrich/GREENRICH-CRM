'use strict';
/* In-CRM plain text customer/lead email composer. Uses the same company Gmail
 * backend; no mailto navigation and no automatic email is sent without click. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const valid=x=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(x||''));
 let dialog;
 async function open({db,company,contactType,contactId,name,email,notify,subject='',body=''}){
  if(!db||!company||!contactId||!['customer','lead'].includes(contactType))throw Error('A linked CRM customer or lead is required');
  if(!valid(email))throw Error('Valid contact email is not recorded');
  if(dialog?.isConnected)dialog.remove();
  dialog=document.createElement('dialog');dialog.className='gr-contact-email-modal';
  dialog.innerHTML='<form method="dialog" id="grce-form"><div class="grce-top"><h2>Compose Email in CRM</h2><button type="button" data-grce-close aria-label="Close">✕</button></div>'+
   '<p class="grce-hint">Customer / Lead: '+esc(name||email)+' · From official company Gmail</p>'+
   '<div class="grce-connect" id="grce-status">Checking Gmail connection…</div>'+
   '<label>To<input name="to" type="email" readonly value="'+esc(email)+'"></label>'+
   '<label>Subject<input name="subject" required maxlength="200" value="'+esc(subject)+'" placeholder="Email subject"></label>'+
   '<label>Message<textarea name="body" rows="9" required placeholder="Type your email here…">'+esc(body)+'</textarea></label>'+
   '<div class="grce-actions"><button type="button" data-grce-close>Cancel</button><button type="submit" id="grce-send" disabled>Send Email</button></div></form>';
  document.body.append(dialog);dialog.showModal();dialog.onclose=()=>dialog.remove();
  dialog.querySelectorAll('[data-grce-close]').forEach(b=>b.onclick=()=>dialog.close());
  const button=dialog.querySelector('#grce-send'),status=dialog.querySelector('#grce-status');
  try{
   const {data,error}=await db.functions.invoke('greenrich-quotation-gmail',{body:{action:'status',company_id:company}});
   if(error||data?.error)throw Error(data?.error||error?.message||'Gmail status not available');
   const ready=!!data.ready;
   status.textContent=ready?'Connected company sender: '+data.connection.sender_email:'Company email not connected. Ask Admin to configure Gmail, Webmail SMTP or Email API in Settings → Gmail Connectivity.';
   button.disabled=!ready;
  }catch(e){status.textContent=e.message;button.disabled=true}
  dialog.querySelector('#grce-form').onsubmit=async event=>{
   event.preventDefault();
   if(button.disabled)return;
   const fd=new FormData(event.currentTarget),to=String(fd.get('to')||''),subject=String(fd.get('subject')||'').trim(),message=String(fd.get('body')||'').trim();
   if(!subject||!message)return;
   if(!window.confirm('Send this email to '+to+' using the connected company Gmail account?'))return;
   button.disabled=true;button.textContent='Sending…';
   try{
    const {data,error}=await db.functions.invoke('greenrich-quotation-gmail',{
     body:{action:'send_contact',company_id:company,contact_type:contactType,contact_id:String(contactId),
       request_key:crypto.randomUUID(),to,subject,body:message}
    });
    if(error||data?.error)throw Error(data?.error||error?.message||'Gmail send failed');
    notify?.('Email accepted by company mail provider');dialog.close();
   }catch(e){
    notify?.(e.message,'error');status.textContent=e.message+(e.message.includes('review')?' Check Gmail Sent before retrying.':'');
    button.textContent='Send Email';button.disabled=false;
   }
  };
 }
 window.GreenRichContactEmail={open};
})();