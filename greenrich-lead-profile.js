'use strict';
window.GreenRichLeadProfile=(function(){
 const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const date=v=>v?new Date(v).toLocaleString('en-IN'):'—';
 const css='.grlp{font:13px/1.6 Inter,system-ui;color:#173454}.grlp h2{font-size:22px;margin:0}.grlp h3{font-size:16px}.grlp .muted{color:#64758a}.grlp .head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px}.grlp .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.grlp .panel{background:#fff;border:1px solid #dbe5f1;padding:18px;border-radius:12px;margin:11px 0}.grlp .kv{display:grid;grid-template-columns:130px minmax(0,1fr);gap:7px;border-bottom:1px solid #edf2f7;padding:6px 0}.grlp .kv span:first-child{color:#62758a}.grlp .chip{display:inline-block;background:#e9f0fa;color:#214974;border-radius:30px;padding:3px 9px}.grlp .actions{display:flex;gap:7px;flex-wrap:wrap}.grlp .actions a,.grlp button{display:inline-block;border:1px solid #c7d8ef;background:#fff;border-radius:8px;padding:8px 11px;color:#2453a2;text-decoration:none;font-size:12px;cursor:pointer}.grlp .event{border-left:3px solid #cdddf2;padding:6px 12px;margin:10px 0}.grlp .answer{display:grid;grid-template-columns:180px 1fr;gap:9px;border-bottom:1px solid #e9eef5;padding:8px 0;overflow-wrap:anywhere}.grlp .scroll{overflow:auto;max-height:420px}@media(max-width:700px){.grlp .grid,.grlp .kv,.grlp .answer{grid-template-columns:1fr}}.grlp-full{display:grid;gap:16px;color:#193451}.grlp-full .head.grlp-hero{background:linear-gradient(115deg,#132c63,#2857ae 70%,#3575d0);padding:24px 26px;border-radius:19px;color:white;box-shadow:0 12px 29px #21437c2b;min-height:100px;margin:0}.grlp-full .grlp-hero h2{font-size:25px!important;color:#fff!important;margin:3px 0!important;line-height:1.25}.grlp-eyebrow{font-size:10px;letter-spacing:.14em;color:#c8ddff;font-weight:800}.grlp-full .grlp-hero .muted{color:#dceaff!important}.grlp-full .grlp-hero .chip{background:#ffffff2b;color:#fff;border:1px solid #ffffff66}.grlp-full .grlp-hero a,.grlp-full .grlp-hero button{background:#ffffff24!important;border:1px solid #ffffff7a!important;color:#fff!important;font-weight:700}.grlp-full .grlp-hero .actions a:first-child{background:white!important;color:#214a8e!important}.grlp-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.grlp-stats>div{background:#fff;border:1px solid #e0e8f6;border-radius:13px;padding:15px 17px;box-shadow:0 4px 17px #113a7508}.grlp-stats small{font-size:11px;color:#68809f;display:block}.grlp-stats strong{font-size:19px;display:block;margin-top:7px;line-height:1.3;color:#163c86;overflow-wrap:anywhere}.grlp-full .panel{border-radius:15px;padding:20px;box-shadow:0 5px 19px #13356406}.grlp-full .panel h3{font-size:14px!important;line-height:1.38!important;font-weight:700;color:#203b66!important}.grlp-full .kv{font-size:12px!important;line-height:1.55!important}.grlp-full .event{border:1px solid #e3ebf7;border-left:3px solid #3675d0;border-radius:9px;background:#f9fbff;padding:10px 12px;font-size:12px}.grlp-full .event b{font-size:12.5px!important;color:#25548e}.grlp-full .event p{font-size:12px!important;margin:4px 0!important}@media(max-width:850px){.grlp-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}';
 const kv=(label,v)=>'<div class="kv"><span>'+esc(label)+'</span><span>'+esc(v??'—')+'</span></div>';
 let current=null;
 async function open({db,company,leadId,quick=false,host=null,onClose=null}){
  if(!db||!company||!leadId)throw Error('Lead ID and company are required');
  if(current?.open)current.close();
  const inline=!!host,d=document.createElement(inline?'section':'dialog');
  d.className='grlp'+(inline?' grlp-full':'');
  d.style.cssText=inline?'min-height:70vh;padding:10px 4px':'width:min(680px,94vw);max-width:none;max-height:90vh;overflow:auto;border:1px solid #d1dce9;border-radius:15px;padding:24px';
  const close=()=>{if(inline){d.remove();onClose?.()}else d.close()};
  d.innerHTML='<style>'+css+'</style><h2>Lead / Customer Details</h2><p>Loading…</p>';
  (host||document.body).append(d);current=d;
  if(!inline){d.onclose=()=>{if(current===d)current=null;d.remove()};d.showModal()}
  try{
   const [l,h,r,orders,answers,customer,tags,products]=await Promise.all([
    db.from('gr_lead_pipeline').select('*').eq('company_id',company).eq('lead_id',leadId).maybeSingle(),
    db.from('gr_lead_stage_history').select('*').eq('company_id',company).eq('lead_id',leadId).order('created_at',{ascending:false}).limit(500),
    db.from('gr_crm_records').select('payload').eq('company_id',company).eq('kind','leads').eq('record_id',leadId).maybeSingle(),
    db.from('gr_crm_records').select('record_id,payload').eq('company_id',company).eq('kind','sales').limit(500),
    db.rpc('gr_pipeline_source_answers',{p_company:company,p_lead:leadId}),
    db.from('gr_crm_customers').select('id,name').limit(500),
    db.from('gr_crm_tags').select('id,name').limit(500),
    db.from('gr_crm_records').select('record_id,payload').eq('company_id',company).eq('kind','products').limit(500)
   ]);
   if(l.error||!l.data)throw Error(l.error?.message||'Lead not available in this company');
   if(h.error)throw Error(h.error.message);
   const lead=l.data,p=r.data?.payload||{},hist=h.data||[];
   const actors=[...new Set(hist.filter(x=>x.actor_id&&x.event_type!=='CREATED').map(x=>x.actor_id))];
   const ids=[...new Set([lead.assigned_to,lead.created_by,...actors].filter(Boolean))];
   const [staff,profiles]=await Promise.all([
    db.rpc('gr_pipeline_staff',{p_company:company}),
    db.from('gr_profiles').select('id,full_name').in('id',ids.length?ids:['00000000-0000-0000-0000-000000000000'])
   ]);
   const tagMap=new Map((tags.data||[]).map(t=>[t.id,t.name]));
   const productMap=new Map((products.data||[]).map(t=>[t.record_id,t.payload?.name||t.record_id]));
   const interestIds=p.product_interest_ids||[lead.product_id].filter(Boolean);
   const productDisplay=interestIds.length?interestIds.map(id=>productMap.get(id)||id).join(', '):(p.product_interest||p.products||lead.title);
   const people=new Map([...(staff.data||[]),...(profiles.data||[])].map(x=>[x.id,x.full_name]));
   const person=id=>people.get(id)|| (id?'Employee '+String(id).slice(0,8):'Common queue');
   const sale=(orders.data||[]).find(o=>o.record_id===lead.won_order_id);
   const cust=(customer.data||[]).find(c=>c.id===lead.customer_id);
   const raw=answers.error?[]:answers.data||[];
   const rawFields=raw.flatMap(row=>(row.raw_answers?.values||[]).map((a,i)=>({
    label:row.raw_answers?.headers?.[i]||'Column '+(i<26?String.fromCharCode(65+i):i+1),value:a
   })));
   const normalizedFields=raw.flatMap(row=>Object.entries(row.normalized_answers||{}).map(([label,value])=>({label,value})));
   const mapped=p.enquiry_details&&typeof p.enquiry_details==='object'?Object.entries(p.enquiry_details).map(([label,value])=>({label,value})):[];
   const fields=rawFields.length?[...normalizedFields,...rawFields]:mapped;
   const phone=String(lead.mobile||'').replace(/[^+0-9]/g,'');
   const digits=phone.replace(/\D/g,'');
   const links=[
    phone.length>=10?'<a href="tel:'+esc(phone)+'">Call</a>':'',
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email||'')?'<a href="mailto:'+esc(lead.email)+'">Email</a>':'',
    digits.length>=10&&digits.length<=15?'<a target="_blank" rel="noopener noreferrer" href="https://wa.me/'+digits+'">WhatsApp</a>':''
   ].join('');
   const dup=lead.import_duplicate_type&&lead.import_duplicate_type!=='none'?
     '<span class="chip">Possible duplicate '+esc(lead.import_duplicate_type)+' — '+esc(lead.import_duplicate_review)+'</span>':'';
   const heroStats=inline?'<div class="grlp-stats">'+[
     ['Stage',lead.stage],...(lead.stage==='Won'?[]:[['Priority',lead.lead_heat||'Warm']]),
     ['Salesperson',person(lead.assigned_to)],['Sales Order',sale?.payload?.internal_order_id||lead.won_order_id||'Not linked']
   ].map(([label,value])=>'<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>').join('')+'</div>':'';
   const result='<div class="head '+(inline?'grlp-hero':'')+'"><div class="grlp-identity">'+
      (inline?'<span class="grlp-eyebrow">GREENRICH · LEAD 360</span>':'')+'<h2>'+esc(p.name||lead.contact||lead.title)+'</h2><span class="chip">'+esc(lead.stage)+'</span> '+dup+
      '<p class="muted">'+esc(company==='grow-india'?'GreenRich Grow India Pvt Ltd':'GreenRich Enviro Solutions Pvt Ltd')+'</p></div>'+
      '<div class="actions">'+links+(!lead.customer_id&&!quick?'<button type="button" data-link-customer>Link existing customer</button>':'')+
       (quick?'<button type="button" data-full>Full page view</button>':'')+
       '<button type="button" data-close>'+(inline?'← Back to Customers':'Close')+'</button></div></div>'+heroStats+
      '<div class="grid"><section class="panel"><h3>Customer & Lead Information</h3>'+
       kv('Name',p.name||lead.contact||lead.title)+kv('Mobile',lead.mobile)+kv('Email',lead.email)+
       kv('City',p.city)+kv('Address',p.address1||p.address)+kv('Product enquiry',productDisplay)+
       kv('Source',lead.source)+kv('Brand',p.brand)+kv('Tags',(lead.tag_ids||[]).map(id=>tagMap.get(id)||id).join(', '))+
       kv('Created',date(lead.created_at))+kv('Linked customer',cust?.name||'Not linked')+
       '</section><section class="panel"><h3>Sales & Assignment</h3>'+
       kv('Current stage',lead.stage)+(lead.stage==='Won'?'':kv('Lead priority',lead.lead_heat||'Warm'))+kv('Current salesperson',person(lead.assigned_to))+
       kv('Employees updating lead history',actors.length)+
       kv('Employees',actors.length?actors.map(person).join(', '):'No conversation updates recorded')+
       kv('Next follow-up',lead.next_followup_at?date(lead.next_followup_at):lead.next_followup)+kv('Expected value','₹'+Number(lead.expected_value||0).toLocaleString('en-IN'))+
       kv('Sales Order',sale?.payload?.internal_order_id||lead.won_order_id||'Not linked')+
       '<p class="muted">Activity records do not prove that telephone calls took place.</p></section></div>'+
      '<section class="panel"><h3>Original Ads / Google Sheet Form Answers</h3>'+
       (fields.length?'<div class="scroll">'+fields.map(f=>'<div class="answer"><b>'+esc(f.label)+'</b><span>'+esc(typeof f.value==='object'?JSON.stringify(f.value):f.value)+'</span></div>').join('')+'</div>':
         '<p class="muted">No accessible structured form answers for this enquiry.</p>')+
       (p.enquiry_details&&typeof p.enquiry_details==='string'?'<p>'+esc(p.enquiry_details)+'</p>':'')+
       (lead.notes?'<h3>Enquiry notes</h3><p>'+esc(lead.notes)+'</p>':'')+'</section>'+
      (quick?'':'<section class="panel"><h3>Lead Stage, Conversations & Assignment History</h3>'+
       (hist.length?hist.map(x=>'<div class="event"><b>'+esc((x.event_type||'Activity').replaceAll('_',' '))+'</b> · '+esc(person(x.actor_id))+
        ' · '+esc(date(x.created_at))+'<p>'+esc(x.old_stage||'')+(x.new_stage?' → '+esc(x.new_stage):'')+
        (x.new_assignee?' · Assigned to '+esc(person(x.new_assignee)):'')+'</p><p>'+esc(x.note||'')+'</p></div>').join(''):
       '<p>No activity recorded yet.</p>')+'</section>');
   d.innerHTML='<style>'+css+'</style>'+result;
   d.querySelector('[data-close]').onclick=close;
   const linker=d.querySelector('[data-link-customer]');
   if(linker)linker.onclick=async()=>{
     const people=(customer.data||[]).filter(x=>x.name);
     if(!people.length){alert('Create a customer in Customers before linking this lead.');return}
     const chooser=document.createElement('dialog');
     chooser.style.cssText='width:min(470px,92vw);border:1px solid #d4e2f1;border-radius:12px;padding:20px';
     chooser.innerHTML='<h3>Link a customer before issuing an SO</h3><form>'+
       '<label>Existing customer<select name="customer" style="width:100%;padding:10px">'+
       people.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label>'+
       '<label>Reason<textarea name="note" required style="width:100%;min-height:72px">Linked lead for Sales Order preparation</textarea></label>'+
       '<button type="submit">Link customer</button> <button type="button" data-cancel>Cancel</button></form>';
     document.body.append(chooser);chooser.onclose=()=>chooser.remove();chooser.querySelector('[data-cancel]').onclick=()=>chooser.close();
     chooser.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const fd=new FormData(e.target);
      const {error}=await db.rpc('gr_pipeline_link_customer',{p_company:company,p_lead:leadId,p_customer:fd.get('customer'),p_note:fd.get('note')});
      if(error){alert(error.message);return}
      chooser.close();linker.textContent='Customer linked — refresh to view';linker.disabled=true;
     };chooser.showModal();
   };
   const full=d.querySelector('[data-full]');
   if(full)full.onclick=()=>{close();window.GreenRichCRM?.switchPage?.('customers');
     window.GreenRichShell?.setPageWithoutRemount?.('customers');
     window.GreenRichContacts?.openLeadProfile?.(company,leadId);
   };
  }catch(e){
   d.innerHTML='<style>'+css+'</style><section class="panel"><h2>Lead Details unavailable</h2><p>'+esc(e.message)+'</p><button type="button" data-close>Close</button></section>';
   d.querySelector('[data-close]').onclick=close;
  }
 }
 return {open};
})();