'use strict';
window.GreenRichLeadProfile=(function(){
 const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const date=v=>v?new Date(v).toLocaleString('en-IN'):'—';
 const css='.grlp{font:13px/1.6 Inter,system-ui;color:#173454}.grlp h2{font-size:22px;margin:0}.grlp h3{font-size:16px}.grlp .muted{color:#64758a}.grlp .head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px}.grlp .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.grlp .panel{background:#fff;border:1px solid #dbe5f1;padding:18px;border-radius:12px;margin:11px 0}.grlp .kv{display:grid;grid-template-columns:130px minmax(0,1fr);gap:7px;border-bottom:1px solid #edf2f7;padding:6px 0}.grlp .kv span:first-child{color:#62758a}.grlp .chip{display:inline-block;background:#e9f0fa;color:#214974;border-radius:30px;padding:3px 9px}.grlp .actions{display:flex;gap:7px;flex-wrap:wrap}.grlp .actions a,.grlp button{display:inline-block;border:1px solid #c7d8ef;background:#fff;border-radius:8px;padding:8px 11px;color:#2453a2;text-decoration:none;font-size:12px;cursor:pointer}.grlp .event{border-left:3px solid #cdddf2;padding:6px 12px;margin:10px 0}.grlp .answer{display:grid;grid-template-columns:180px 1fr;gap:9px;border-bottom:1px solid #e9eef5;padding:8px 0;overflow-wrap:anywhere}.grlp .scroll{overflow:auto;max-height:420px}@media(max-width:700px){.grlp .grid,.grlp .kv,.grlp .answer{grid-template-columns:1fr}}';
 const kv=(label,v)=>'<div class="kv"><span>'+esc(label)+'</span><span>'+esc(v??'—')+'</span></div>';
 let current=null;
 async function open({db,company,leadId,quick=false}){
  if(!db||!company||!leadId)throw Error('Lead ID and company are required');
  if(current?.open)current.close();
  const d=document.createElement('dialog');d.className='grlp';
  d.style.cssText='width:min(1100px,96vw);max-width:none;max-height:95vh;overflow:auto;border:1px solid #d1dce9;border-radius:15px;padding:24px';
  d.innerHTML='<style>'+css+'</style><h2>Lead / Customer Details</h2><p>Loading…</p>';
  document.body.append(d);current=d;d.onclose=()=>{if(current===d)current=null;d.remove()};d.showModal();
  try{
   const [l,h,r,orders,answers,customer,tags,products]=await Promise.all([
    db.from('gr_lead_pipeline').select('*').eq('company_id',company).eq('lead_id',leadId).maybeSingle(),
    db.from('gr_lead_stage_history').select('*').eq('company_id',company).eq('lead_id',leadId).order('created_at',{ascending:false}).limit(500),
    db.from('gr_crm_records').select('payload').eq('company_id',company).eq('kind','leads').eq('record_id',leadId).maybeSingle(),
    db.from('gr_crm_records').select('record_id,payload').eq('company_id',company).eq('kind','sales').limit(500),
    db.from('gr_sheet_import_rows').select('raw_answers,normalized_answers,row_number').eq('company_id',company).eq('lead_id',leadId).limit(5),
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
   const person=id=>people.get(id)|| (id?'Employee '+String(id).slice(0,8):'Unassigned');
   const sale=(orders.data||[]).find(o=>o.record_id===lead.won_order_id);
   const cust=(customer.data||[]).find(c=>c.id===lead.customer_id);
   const raw=answers.error?[]:answers.data||[];
   const rawFields=raw.flatMap(row=>(row.raw_answers?.values||[]).map((a,i)=>({
    label:row.raw_answers?.headers?.[i]||'Column '+(i<26?String.fromCharCode(65+i):i+1),value:a
   })));
   const mapped=p.enquiry_details&&typeof p.enquiry_details==='object'?Object.entries(p.enquiry_details).map(([label,value])=>({label,value})):[];
   const fields=rawFields.length?rawFields:mapped;
   const phone=String(lead.mobile||'').replace(/[^+0-9]/g,'');
   const digits=phone.replace(/\D/g,'');
   const links=[
    phone.length>=10?'<a href="tel:'+esc(phone)+'">Call</a>':'',
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email||'')?'<a href="mailto:'+esc(lead.email)+'">Email</a>':'',
    digits.length>=10&&digits.length<=15?'<a target="_blank" rel="noopener noreferrer" href="https://wa.me/'+digits+'">WhatsApp</a>':''
   ].join('');
   const dup=lead.import_duplicate_type&&lead.import_duplicate_type!=='none'?
     '<span class="chip">Possible duplicate '+esc(lead.import_duplicate_type)+' — '+esc(lead.import_duplicate_review)+'</span>':'';
   const result='<div class="head"><div><h2>'+esc(p.name||lead.contact||lead.title)+'</h2><span class="chip">'+esc(lead.stage)+'</span> '+dup+
      '<p class="muted">'+esc(company==='grow-india'?'GreenRich Grow India Pvt Ltd':'GreenRich Enviro Solutions Pvt Ltd')+'</p></div>'+
      '<div class="actions">'+links+'<button type="button" data-close>Close</button></div></div>'+
      '<div class="grid"><section class="panel"><h3>Customer & Lead Information</h3>'+
       kv('Name',p.name||lead.contact||lead.title)+kv('Mobile',lead.mobile)+kv('Email',lead.email)+
       kv('City',p.city)+kv('Address',p.address1||p.address)+kv('Product enquiry',productDisplay)+
       kv('Source',lead.source)+kv('Brand',p.brand)+kv('Tags',(lead.tag_ids||[]).map(id=>tagMap.get(id)||id).join(', '))+
       kv('Created',date(lead.created_at))+kv('Linked customer',cust?.name||'Not linked')+
       '</section><section class="panel"><h3>Sales & Assignment</h3>'+
       kv('Current stage',lead.stage)+kv('Current salesperson',person(lead.assigned_to))+
       kv('Employees updating lead history',actors.length)+
       kv('Employees',actors.length?actors.map(person).join(', '):'No conversation updates recorded')+
       kv('Next follow-up',lead.next_followup)+kv('Expected value','₹'+Number(lead.expected_value||0).toLocaleString('en-IN'))+
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
   d.querySelector('[data-close]').onclick=()=>d.close();
  }catch(e){
   d.innerHTML='<style>'+css+'</style><section class="panel"><h2>Lead Details unavailable</h2><p>'+esc(e.message)+'</p><button type="button" data-close>Close</button></section>';
   d.querySelector('[data-close]').onclick=()=>d.close();
  }
 }
 return {open};
})();