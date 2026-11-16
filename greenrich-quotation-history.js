'use strict';
/* Customer 360 and product quotation mail history. Read-only; signed PDFs from backend. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const when=v=>v?new Date(v).toLocaleString('en-IN'):'—';
 const statuses={sent:'Sent',failed:'Failed',sending:'Sending',needs_review:'Needs review'};
 const staff={};
 const row=x=>'<article class="grmail-history"><div><strong>'+esc(x.subject)+'</strong><span class="grmail-pill" data-status="'+esc(x.status)+'">'+esc(statuses[x.status]||x.status)+'</span></div>'+
 '<small>Recipient: '+esc((x.recipients||[]).join(', '))+' · '+esc(when(x.sent_at||x.attempted_at))+'</small>'+
 '<small>From: '+esc(x.sender_email)+' · Sent by employee: '+esc(staff[x.sent_by]||x.sent_by)+'</small>'+
 '<small>Quotation ID: '+esc(x.quotation_id)+' · Products: '+esc((x.product_ids||[]).join(', '))+'</small>'+
 (x.pdf_path?'<button type="button" data-grqh-pdf="'+esc(x.id)+'" data-grqh-company="'+esc(x.company_id)+'">View sent PDF</button>':'')+'</article>';
 async function showPdf(db,id,company,notify){
  const {data,error}=await db.functions.invoke('greenrich-quotation-gmail',{body:{action:'pdf_url',company_id:company,history_id:id}});
  if(error||!data?.url)throw Error(data?.error||error?.message||'Unable to open archived PDF');
  window.open(data.url,'_blank','noopener');
 }
 function attach(root,db,notify){
  root.addEventListener('click',event=>{
   const button=event.target.closest('[data-grqh-pdf]');if(!button)return;
   void showPdf(db,button.dataset.grqhPdf,button.dataset.grqhCompany,notify).catch(e=>notify?.(e.message,'error'));
  });
 }

 const contactRow=x=>{
  const attachments=Array.isArray(x.attachment_manifest)?x.attachment_manifest:[];
  const recipientList=(x.to_recipients?.length?x.to_recipients:[x.recipient]).filter(Boolean).join(', ');
  const status=x.status==='sent'?'Accepted by provider (delivery unconfirmed)':(statuses[x.status]||x.status);
  return '<article class="grmail-history grce-history-card">'+
   '<div><strong>'+esc(x.subject)+'</strong><span class="grmail-pill" data-status="'+esc(x.status)+'">'+esc(status)+'</span></div>'+
   '<small>To: '+esc(recipientList)+' · '+esc(when(x.sent_at||x.attempted_at))+'</small>'+
   '<small>From: '+esc(x.sender_email)+' · By: '+esc(staff[x.sent_by]||x.sent_by)+' · '+esc((x.transport||'gmail').toUpperCase())+'</small>'+
   '<small>'+esc(attachments.length)+' attachment'+(attachments.length===1?'':'s')+'</small>'+
   '<button type="button" class="grce-history-expand" data-grqh-contact="'+esc(x.id)+'">View email & attachments</button>'+
   '<div class="grce-history-detail" data-grqh-detail="'+esc(x.id)+'" hidden></div></article>';
 };
 const getSigned=async(db,company,id,index)=>{
  const {data,error}=await db.functions.invoke('greenrich-quotation-gmail',{
   body:{action:'contact_attachment_url',company_id:company,history_id:id,attachment_index:index}
  });
  if(error||data?.error||!data?.url)throw Error(data?.error||error?.message||'Could not access archived attachment');
  return data.url;
 };
 const attachContactViewer=(section,db,records,notify)=>{
  section.addEventListener('click',event=>{
   const trigger=event.target.closest('[data-grqh-contact]');
   if(!trigger)return;
   const record=records.find(x=>x.id===trigger.dataset.grqhContact),target=section.querySelector('[data-grqh-detail="'+trigger.dataset.grqhContact+'"]');
   if(!record||!target)return;
   if(target.dataset.loaded){target.hidden=!target.hidden;return}
   target.hidden=false;target.textContent='Loading sent email details…';
   void (async()=>{
    const manifest=Array.isArray(record.attachment_manifest)?record.attachment_manifest:[];
    // Explicitly blank iframe sandbox: no JavaScript, no same-origin rights, no forms.
    const iframe=document.createElement('iframe');
    iframe.className='grce-history-preview';
    iframe.setAttribute('sandbox','');
    iframe.setAttribute('referrerpolicy','no-referrer');
    iframe.title='Sent email message';
    let html=String(record.html_body||'').trim();
    if(!html){
     html='<div style="white-space:pre-wrap;font:14px/1.6 Arial,sans-serif">'+esc(record.body||'')+'</div>';
    }
    const doc=new DOMParser().parseFromString(html,'text/html');
    for(const img of doc.querySelectorAll('img')){
     const src=img.getAttribute('src')||'';
     const index=manifest.findIndex(f=>f.cid&&src==='cid:'+f.cid);
     if(index<0){img.remove();continue}
     try{img.setAttribute('src',await getSigned(db,record.company_id,record.id,index))}
     catch(_){img.remove()}
    }
    for(const el of doc.querySelectorAll('script,style,iframe,object,embed,form,link,meta'))el.remove();
    for(const el of doc.querySelectorAll('*')){
     for(const a of [...el.attributes]){
      if(/^on/i.test(a.name))el.removeAttribute(a.name);
      if(['href','src'].includes(a.name)&&/^\s*(?:javascript|data|file):/i.test(a.value))el.removeAttribute(a.name);
     }
    }
    const content='<!doctype html><meta charset="utf-8"><style>body{font:14px/1.6 Arial,sans-serif;color:#203149;margin:15px;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>'+doc.body.innerHTML;
    target.replaceChildren();
    const details=document.createElement('div');
    details.className='grce-history-fields';
    const cc=record.cc?.join(', ')||'—',bcc=record.bcc?.join(', ')||'—';
    details.textContent='To: '+(record.to_recipients?.join(', ')||record.recipient)+' · CC: '+cc+' · BCC: '+bcc;
    target.append(details,iframe);
    iframe.srcdoc=content;
    const files=document.createElement('div');files.className='grce-history-files';
    target.append(files);
    if(!manifest.length)files.textContent='No file attachments.';
    for(let i=0;i<manifest.length;i++){
     const item=manifest[i];
     const row=document.createElement('div');row.className='grce-history-file';
     const label=document.createElement('span');
     label.textContent='📎 '+(item.name||'Attachment')+' · '+Math.round((item.bytes||0)/1024)+' KB';
     const view=document.createElement('button');view.type='button';view.textContent='Preview';
     const download=document.createElement('button');download.type='button';download.textContent='Download';
     view.onclick=()=>void getSigned(db,record.company_id,record.id,i).then(url=>window.open(url,'_blank','noopener')).catch(e=>notify?.(e.message,'error'));
     download.onclick=()=>void getSigned(db,record.company_id,record.id,i).then(url=>{
      const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.download=item.name||'attachment';a.click();
     }).catch(e=>notify?.(e.message,'error'));
     row.append(label,view,download);files.append(row);
    }
    target.dataset.loaded='true';
   })().catch(error=>{target.textContent='Could not load email: '+error.message;notify?.(error.message,'error')});
  });
 };

 async function customer(host,{db,customerId,companyIds,notify}){
  if(!host||!db||!customerId)return;
  const section=document.createElement('section');
  section.className='gr360-panel';section.id='gr-qmail-customer-history';
  section.innerHTML='<h3>Emails, quotations & attachments</h3><p>Loading customer communication history…</p>';
  host.append(section);
  attach(section,db,notify);
  async function reload(){
   try{
    const [quotes,mails,contactMails,associatedLeads]=await Promise.all([
     db.from('gr_quotations').select('id,quotation_no,company_id,quotation_date,status,payload').eq('customer_id',customerId).in('company_id',companyIds).order('quotation_date',{ascending:false}).limit(100),
     db.from('gr_quotation_email_history').select('*').eq('customer_id',customerId).in('company_id',companyIds).order('attempted_at',{ascending:false}).limit(100),
     db.from('gr_contact_email_history').select('*').eq('contact_type','customer').eq('contact_id',customerId).in('company_id',companyIds).order('attempted_at',{ascending:false}).limit(100),
     db.from('gr_lead_pipeline').select('lead_id').eq('customer_id',customerId).in('company_id',companyIds).limit(100)
    ]);
    if(quotes.error||mails.error||contactMails.error||associatedLeads.error)throw Error(quotes.error?.message||mails.error?.message||contactMails.error?.message||associatedLeads.error?.message);
    const leadIds=(associatedLeads.data||[]).map(x=>x.lead_id).filter(Boolean);
    let linked=[];
    if(leadIds.length){
     const result=await db.from('gr_contact_email_history').select('*').eq('contact_type','lead').in('contact_id',leadIds).in('company_id',companyIds).order('attempted_at',{ascending:false}).limit(100);
     if(!result.error)linked=result.data||[];
    }
    const allContact=[...(contactMails.data||[]),...linked].sort((a,b)=>new Date(b.attempted_at)-new Date(a.attempted_at)).slice(0,200);
    const userIds=[...new Set([...(mails.data||[]),...allContact].map(x=>x.sent_by).filter(Boolean))];
    if(userIds.length){
     const people=await db.from('gr_profiles').select('id,full_name').in('id',userIds);
     if(!people.error)for(const person of people.data||[])staff[person.id]=person.full_name;
    }
    if(!section.isConnected)return;
    section.innerHTML='<div class="gr360-panel-heading"><div><span class="gr360-kicker">CUSTOMER COMMUNICATION</span>'+
     '<h3>Email history & saved attachments</h3><p>All emails sent from CRM to this customer or linked leads</p></div></div>'+
     '<div class="grmail-history-group"><h4>Sent customer / lead emails ('+allContact.length+')</h4>'+
     (allContact.length?allContact.map(contactRow).join(''):'<p>No CRM emails sent to this customer yet.</p>')+'</div>'+
     '<div class="grmail-history-group"><h4>Quotation emails ('+(mails.data||[]).length+')</h4>'+
     ((mails.data||[]).length?(mails.data||[]).map(row).join(''):'<p>No quotation PDFs emailed to this customer yet.</p>')+'</div>'+
     '<div class="grmail-history-group"><h4>Saved quotations</h4>'+
     ((quotes.data||[]).length?(quotes.data||[]).map(q=>'<div class="grmail-history"><strong>'+esc(q.quotation_no)+'</strong> · '+esc(q.status)+' · '+esc(q.quotation_date)+
     '<small>'+esc((q.payload?.lines||[]).map(l=>l.description).filter(Boolean).join(', '))+'</small></div>').join(''):'<p>No saved quotations.</p>')+'</div>';
    attachContactViewer(section,db,allContact,notify);
   }catch(error){if(section.isConnected)section.innerHTML='<h3>Email history</h3><p>History unavailable: '+esc(error.message)+'</p>'}
  }
  const handler=()=>{if(section.isConnected)void reload();else window.removeEventListener('gr:contact-email-sent',handler)};
  window.addEventListener('gr:contact-email-sent',handler);
  await reload();
 }
 async function product({db,companyId,productId,productName,notify}){
  if(!db||!companyId||!productId)return;
  const modal=document.createElement('dialog');modal.className='grq-product-mail-dialog';
  modal.innerHTML='<div class="grq-product-mail-head"><h2>Quotation history — '+esc(productName)+'</h2><button type="button" data-grqh-close>Close</button></div><div data-grqh-content>Loading sent quotations…</div>';
  document.body.append(modal);
  attach(modal,db,notify);
  modal.querySelector('[data-grqh-close]').onclick=()=>modal.close();
  modal.onclose=()=>modal.remove();
  modal.showModal();
  try{
   const {data,error}=await db.from('gr_quotation_email_history').select('*').eq('company_id',companyId).contains('product_ids',[productId]).order('attempted_at',{ascending:false}).limit(100);
   if(error)throw Error(error.message);
   const ids=[...new Set((data||[]).map(x=>x.sent_by).filter(Boolean))];
   if(ids.length){const names=await db.from('gr_profiles').select('id,full_name').in('id',ids);if(!names.error)for(const u of names.data||[])staff[u.id]=u.full_name}
   modal.querySelector('[data-grqh-content]').innerHTML=data?.length?data.map(row).join(''):'<p>No quotation emails sent for this product yet.</p>';
  }catch(error){modal.querySelector('[data-grqh-content]').innerHTML='<p>'+esc(error.message)+'</p>'}
 }
 window.GreenRichQuotationHistory={customer,product};
})();