'use strict';
/* Customer 360 and product quotation mail history. Read-only; signed PDFs from backend. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const when=v=>v?new Date(v).toLocaleString('en-IN'):'—';
 const statuses={sent:'Sent',failed:'Failed',sending:'Sending',needs_review:'Needs review'};
 const row=x=>'<article class="grmail-history"><div><strong>'+esc(x.subject)+'</strong><span class="grmail-pill" data-status="'+esc(x.status)+'">'+esc(statuses[x.status]||x.status)+'</span></div>'+
 '<small>Recipient: '+esc((x.recipients||[]).join(', '))+' · '+esc(when(x.sent_at||x.attempted_at))+'</small>'+
 '<small>From: '+esc(x.sender_email)+' · Sent by employee: '+esc(x.sent_by)+'</small>'+
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
 async function customer(host,{db,customerId,companyIds,notify}){
  if(!host||!db||!customerId)return;
  const section=document.createElement('section');
  section.className='gr360-panel';section.id='gr-qmail-customer-history';
  section.innerHTML='<h3>Sent quotation PDFs & Gmail history</h3><p>Loading actual quotation history…</p>';
  host.append(section);
  attach(section,db,notify);
  try{
   const [quotes,mails]=await Promise.all([
    db.from('gr_quotations').select('id,quotation_no,company_id,quotation_date,status,payload').eq('customer_id',customerId).in('company_id',companyIds).order('quotation_date',{ascending:false}).limit(100),
    db.from('gr_quotation_email_history').select('*').eq('customer_id',customerId).in('company_id',companyIds).order('attempted_at',{ascending:false}).limit(100)
   ]);
   if(quotes.error||mails.error)throw Error(quotes.error?.message||mails.error?.message);
   if(!section.isConnected)return;
   section.innerHTML='<div class="gr360-panel-heading"><div><span class="gr360-kicker">QUOTATION ARCHIVE</span><h3>Sent quotation PDFs & Gmail history</h3>'+
    '<p>Actual CRM quotation records, sender, date and attachment</p></div></div>'+
    '<div class="grmail-history-group"><h4>Saved customer quotations</h4>'+
    (quotes.data?.length?quotes.data.map(q=>'<div class="grmail-history"><strong>'+esc(q.quotation_no)+'</strong> · '+esc(q.status)+' · '+esc(q.quotation_date)+
      '<small>'+esc((q.payload?.lines||[]).map(l=>l.description).filter(Boolean).join(', '))+'</small></div>').join(''):'<p>No saved quotations for this customer.</p>')+
    '</div><div class="grmail-history-group"><h4>Email send history</h4>'+
    (mails.data?.length?mails.data.map(row).join(''):'<p>No quotation emails sent to this customer yet.</p>')+'</div>';
  }catch(error){if(section.isConnected)section.innerHTML='<h3>Quotation history</h3><p>History unavailable: '+esc(error.message)+'</p>'}
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
   modal.querySelector('[data-grqh-content]').innerHTML=data?.length?data.map(row).join(''):'<p>No quotation emails sent for this product yet.</p>';
  }catch(error){modal.querySelector('[data-grqh-content]').innerHTML='<p>'+esc(error.message)+'</p>'}
 }
 window.GreenRichQuotationHistory={customer,product};
})();