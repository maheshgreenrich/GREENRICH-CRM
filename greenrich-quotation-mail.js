'use strict';
/* GreenRich quotation Gmail composer, company settings and send history.
 * Sending is strictly via Supabase Edge Function; no Gmail secrets in the browser. */
(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=x=>x?new Date(x).toLocaleString('en-IN'):'—';
 const money=x=>'₹'+Number(x||0).toLocaleString('en-IN',{maximumFractionDigits:2});
 let host,ctx,history=[],templates=[],info=null,mailTemplate='',busy=false,staff={};
 const notice=(msg,type)=>ctx.notify?.(msg,type);
 const sel=x=>host.querySelector(x);
 const query=async(builder)=>{const {data,error}=await builder;if(error)throw Error(error.message);return data||[]};
 const rpc=async(body)=>{
  const {data,error}=await ctx.db.functions.invoke('greenrich-quotation-gmail',{body:{...body,company_id:ctx.company}});
  if(error)throw Error(data?.error||error.message||'Email backend unavailable');
  if(data?.error)throw Error(data.error);
  return data;
 };
 const defaultSub=()=> 'Quotation '+(ctx.quotation?.quotation_no||'')+' – '+(ctx.quotation?.payload?.lines?.[0]?.description||ctx.quotation?.lines?.[0]?.description||'GreenRich');
 const defaultBody=()=> 'Dear '+(ctx.customer?.name||'Customer')+',\n\nPlease find attached our technical and commercial quotation for your kind review.\n\nKindly contact us for any clarification.\n\nRegards,\n'+(ctx.companyName||'GreenRich Team');
 const opt=(id,value,selected)=>'<option value="'+esc(id)+'"'+(selected?' selected':'')+'>'+esc(value)+'</option>';
 async function refresh(){
  const [connections,items,logs]=await Promise.all([
   rpc({action:'status'}),
   query(ctx.db.from('gr_quotation_email_templates').select('*').eq('company_id',ctx.company).order('name')),
   query(ctx.db.from('gr_quotation_email_history').select('*').eq('company_id',ctx.company).order('attempted_at',{ascending:false}).limit(250))
  ]);
  info=connections;templates=items;history=logs;
  const ids=[...new Set(logs.map(x=>x.sent_by).filter(Boolean))];
  if(ids.length){
   const users=await ctx.db.from('gr_profiles').select('id,full_name').in('id',ids);
   if(!users.error)staff=Object.fromEntries((users.data||[]).map(x=>[x.id,x.full_name]));
  }
 }
 function render(){
  if(!host)return;
  const connected=!!info?.ready,quote=ctx.quotation;
  const quoteId=quote?.id,customer=ctx.customer;
  const own=history.filter(r=>r.quotation_id===quoteId);
  host.innerHTML='<div class="grmail"><div class="grmail-header"><div><h2>Quotation Email & History</h2><p>Company: '+esc(ctx.companyName||ctx.company)+' · Private PDF archive and company-wide sending history</p></div><button data-mail="refresh">Refresh history</button></div>'+
   '<div class="grmail-status"><div><strong>Official sender</strong><div>'+esc(info?.connection?.sender_email||'No Gmail account connected')+'</div><small>'+esc(info?.connection?.status||'disconnected')+'</small></div><div>'+
   (!info?.configured&&info?.transport==='gmail'?'<span class="grmail-alert">Google OAuth backend secrets have not been configured by Admin.</span>':connected?'<span class="grmail-success">Gmail connected</span>':'<span class="grmail-alert">Gmail is not connected. Sending disabled.</span>')+'</div></div>'+
   '<p class="grmail-setup-link">Gmail accounts, OAuth credentials and company email templates are managed in <b>Settings → Gmail Connectivity</b>.</p>'+ 
   '<div class="grmail-layout"><section class="grmail-compose"><h3>Send quotation PDF</h3>'+
   (!quoteId?'<p class="grmail-alert">Save your quotation in the Quotations tab first, then open Email & History.</p>':'<div class="grmail-quote">Quotation '+esc(quote.quotation_no)+' · '+esc(customer?.name||'Customer')+'</div>')+
   '<form id="grmail-form"><label>From<input value="'+esc(info?.connection?.sender_email||'Not connected')+'" disabled></label>'+
   '<label>Recipient email<input type="email" name="to" required value="'+esc(customer?.email||'')+'" placeholder="customer@example.com"></label>'+
   '<label>CC (optional, comma separated)<input name="cc" placeholder="accounts@example.com"></label>'+
   '<label>Email template<select id="grmail-template">'+opt('','Default quotation email',!mailTemplate)+templates.map(t=>opt(t.id,t.name,mailTemplate===t.id)).join('')+'</select></label>'+
   '<label>Subject<input name="subject" required maxlength="200" value="'+esc(defaultSub())+'"></label>'+
   '<label>Message<textarea name="body" required rows="8">'+esc(defaultBody())+'</textarea></label>'+
   '<div class="grmail-attachment"> <strong>Quotation PDF</strong><small>Generated from the saved quotation and attached automatically. The exact sent PDF is stored privately.</small></div>'+
   '<div class="grmail-actions"><button type="button" data-mail="preview">Preview quotation</button><button type="submit" class="grmail-send" '+(!quoteId||!connected||busy||!ctx.canSend?'disabled':'')+'>'+(busy?'Sending…':'Send quotation by company email')+'</button></div></form></section>'+
   '<section class="grmail-logs"><h3>Quotation send history</h3><div class="grmail-scroll">'+(own.length?own.map(rowHtml).join(''):'<p>No email send history for this quotation yet.</p>')+'</div></section></div>'+
   '<section class="grmail-all"><h3>Company quotation email history</h3><p>Recent company activity; includes all authorised employees and products.</p><div class="grmail-scroll">'+(history.length?history.map(rowHtml).join(''):'<p>No quotation emails have been sent yet.</p>')+'</div></section>'+

   '</div>';
 }
 function rowHtml(r){
  const statuses={sent:'Sent',sending:'Sending',failed:'Failed',needs_review:'Needs review'};
  const productIds=Array.isArray(r.product_ids)?r.product_ids:[];
  return '<article class="grmail-history"><div><strong>'+esc(r.subject)+'</strong><span class="grmail-pill" data-status="'+esc(r.status)+'">'+esc(statuses[r.status]||r.status)+'</span></div>'+
   '<small>'+esc(r.recipients?.join(', ')||'')+' · '+esc(r.sender_email)+' · '+esc(date(r.sent_at||r.attempted_at))+'</small>'+
   '<small>Sent by user '+esc(r.sent_by)+' · Products: '+esc(productIds.join(', ')||'No SKU linked')+'</small>'+
   '<div class="grmail-actions">'+(r.pdf_path?'<button data-mail="pdf-link" data-id="'+esc(r.id)+'">View archived PDF</button>':'')+
   (r.provider_message_id||r.gmail_message_id?'<span>'+esc((r.transport||'gmail').toUpperCase())+' message ID: '+esc(r.provider_message_id||r.gmail_message_id)+'</span>':'')+'</div></article>';
 }
 async function send(event){
  event.preventDefault();if(busy)return;
  if(!ctx.quotation?.id)throw Error('Save the quotation before sending');
  if(!info?.ready)throw Error('Company email sender is not connected');
  if(!ctx.canSend)throw Error('You do not have quotation sending permission');
  const form=event.target,f=new FormData(form),to=String(f.get('to')||'').trim(),cc=String(f.get('cc')||'').trim(),
    subject=String(f.get('subject')||'').trim(),body=String(f.get('body')||'').trim();
  if(!window.confirm('Send quotation '+ctx.quotation.quotation_no+' from '+info.connection.sender_email+' to '+to+'?'))return;
  busy=true;render();
  try{
   const source=ctx.documentHtml();
   const pdf=await window.GreenRichPDFWorkbench.exportForEmail(source);
   const response=await rpc({action:'send',quotation_id:ctx.quotation.id,request_key:crypto.randomUUID(),
     to:[to],cc:cc.split(/[;,]/).map(x=>x.trim()).filter(Boolean),subject,body,pdf_base64:pdf});
   notice('Email provider accepted quotation. Sent PDF and history saved.');
   await refresh();render();
   return response;
  }finally{busy=false;render()}
 }
 async function templateSave(e){
  e.preventDefault();if(!ctx.admin)throw Error('Admin only');
  const data=new FormData(e.target),name=String(data.get('name')||'').trim();
  const body={company_id:ctx.company,name,subject:String(data.get('subject')||'').slice(0,200),
    body:String(data.get('body')||'').slice(0,10000),updated_at:new Date().toISOString()};
  if(!name||!body.subject||!body.body)throw Error('Complete the email template fields');
  const query=data.get('id')?ctx.db.from('gr_quotation_email_templates').update(body).eq('id',data.get('id')).eq('company_id',ctx.company):
    ctx.db.from('gr_quotation_email_templates').insert({...body,created_by:ctx.userId});
  const {error}=await query;if(error)throw Error(error.message);
  await refresh();notice('Company email template saved');render();
 }
 async function click(e){
  const btn=e.target.closest('[data-mail]');if(!btn)return;
  const action=btn.dataset.mail;
  if(action==='refresh'){await refresh();render()}
  if(action==='connect'){if(!ctx.admin)throw Error('Admin only');const {authorize_url}=await rpc({action:'connect'});window.location.assign(authorize_url)}
  if(action==='disconnect'){if(window.confirm('Disconnect this company Gmail sender?')){await rpc({action:'disconnect'});await refresh();render()}}
  if(action==='preview'){const blob=new Blob([ctx.documentHtml()],{type:'text/html'}),url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),20000)}
  if(action==='pdf-link'){const {url}=await rpc({action:'pdf_url',history_id:btn.dataset.id});window.open(url,'_blank','noopener')}
  if(action==='edit-template'){
   const record=templates.find(t=>t.id===btn.dataset.id),form=sel('#grmail-template-form');if(!record||!form)return;
   for(const k of ['id','name','subject','body'])form.elements.namedItem(k).value=record[k]||'';
   form.scrollIntoView({behavior:'smooth'});
  }
 }
 function mount(target,options){
  host=target;ctx=options;const body=host;
  host.addEventListener('click',e=>void click(e).catch(x=>notice(x.message,'error')));
  host.addEventListener('submit',e=>{
   if(e.target.id==='grmail-form')void send(e).catch(x=>notice(x.message,'error'));
   if(e.target.id==='grmail-template-form')void templateSave(e).catch(x=>notice(x.message,'error'));
  });
  host.addEventListener('change',e=>{
   if(e.target.id!=='grmail-template')return;
   mailTemplate=e.target.value;const t=templates.find(t=>t.id===mailTemplate),form=sel('#grmail-form');
   if(t&&form){form.elements.namedItem('subject').value=t.subject;form.elements.namedItem('body').value=t.body}
  });
  host.innerHTML='<p>Loading company Gmail connection and quotation history…</p>';
  void refresh().then(render).catch(e=>{host.innerHTML='<div class="grmail-alert">Email setup could not load: '+esc(e.message)+'</div>';notice(e.message,'error')});
 }
 window.GreenRichQuotationMail={mount};
})();