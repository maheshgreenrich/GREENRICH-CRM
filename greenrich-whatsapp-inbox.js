'use strict';
/* GreenRich ONE conversation workspace.
   CRM contacts are always shown; SocialBerries history is fetched only for a selected
   number. "Live" implies verified provider webhooks; this UI never invents them. */
(()=>{
 let ctx=null,host=null,selected='',filter='',kind='all',company='all',page=1,fetchSerial=0,ticker=null;
 const history=new Map(),drafts=new Map(),attachments=new Map();
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clean=x=>String(x||'').replace(/\D/g,'').replace(/^91(?=[6-9]\d{9}$)/,'');
 const phone=x=>/^[6-9]\d{9}$/.test(clean(x))?clean(x):null;
 const date=x=>{if(!x)return '';const d=new Date(x);return Number.isFinite(d.getTime())?d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):''};
 const quote=x=>esc(x).replace(/\n/g,'<span class="grwx-linebreak"></span>');
 const companyName=x=>ctx?.companyName(x)||x||'Company not assigned';
 const data=()=>ctx?.getRows()||{};
 const customers=()=>{
  const r=data(),found=new Map();
  const raw=ctx.getTargets();
  const add=x=>{
   const number=phone(x.mobile);if(!number)return;
   const key=x.id||'W:'+x.company_id+':'+number;
   found.set(key,{...x,key,number,source:x.source||'',type:x.type||'Contact',tags:x.tags||[],orders:x.orders||[],products:x.products||[]});
  };
  raw.forEach(add);
  const list=[...found.values()];
  const msgs=r.messages||[];
  for(const m of msgs){
   const number=phone(m.phone);if(!number)continue;
   const link=list.find(x=>x.number===number&&(!x.company_id||x.company_id===m.company_id));
   if(!link){
    const key='W:'+m.company_id+':'+number;
    if(!found.has(key)){const row={key,number,name:'WhatsApp '+number,mobile:number,
      type:'Unlinked WhatsApp',company_id:m.company_id,source:'',tags:[],orders:[],products:[],owner:''};
      found.set(key,row);list.push(row)}
   }
  }
  for(const x of list){
   x.messages=msgs.filter(m=>phone(m.phone)===x.number&&
      (!x.company_id||x.company_id===m.company_id)).sort((a,b)=>String(a.event_at||a.created_at).localeCompare(String(b.event_at||b.created_at)));
   x.recent=x.messages[x.messages.length-1];
   x.connection=(r.connections||[]).find(c=>c.company_id===x.company_id&&String(c.provider).toLowerCase()==='socialberries');
   x.salesperson=(r.profiles||[]).find(p=>p.id===x.owner)?.full_name||'Not assigned';
  }
  return list.sort((a,b)=>String(b.recent?.event_at||b.recent?.created_at||b.created_at||'').localeCompare(
   String(a.recent?.event_at||a.recent?.created_at||a.created_at||'')));
 };
 function render(){
  if(!host?.isConnected||!ctx)return;
  const r=data(),all=customers();
  const visible=all.filter(x=>(company==='all'||x.company_id===company)&&
    (kind==='all'||kind==='leads'&&x.type==='Lead'||kind==='customers'&&x.type==='Customer')&&
    (!filter||[x.name,x.number,x.email,x.source,x.salesperson].some(v=>String(v||'').toLowerCase().includes(filter))));
  if(selected&&!all.some(x=>x.key===selected))selected='';
  if(!selected&&visible.length)selected=visible[0].key;
  const active=all.find(x=>x.key===selected);
  const state=history.get(selected)||{};
  const provider=state.messages||[];
  const crm=active?.messages||[];
  const seen=new Set(provider.map(m=>m.id).filter(Boolean));
  const rendered=[...provider.map(x=>({text:x.text||(x.template_name?'Template: '+x.template_name:(x.has_attachment?'Attachment: '+(x.attachment_type||'media')+' (file preview unavailable through current API)':'[Provider did not return readable message text]')),direction:x.direction==='Outgoing'?'outbound':x.direction==='Incoming'?'inbound':'unknown',when:x.event_at,status:x.status,id:x.id,origin:'provider'})),
    ...crm.filter(x=>!x.provider_message_id||!seen.has(x.provider_message_id)).map(x=>({text:x.body||'[CRM message text unavailable]',direction:x.direction,when:x.event_at||x.created_at,status:x.delivery_status,id:x.id,origin:'crm'}))];
  rendered.sort((a,b)=>(Date.parse(a.when)||0)-(Date.parse(b.when)||0));
  const title=active?.name||'Choose a customer';
  host.innerHTML='<section class="grwx-shell">'+
   '<div class="grwx-top"><div><h3>WhatsApp Inbox</h3><p>CRM customer directory and available SocialBerries chat history</p></div>'+
    '<button type="button" data-grwx-action="refresh-directory">Refresh CRM</button></div>'+
   '<div class="grwx-grid">'+
    '<aside class="grwx-sidebar"><div class="grwx-side-controls"><strong>Chats & customers</strong><small>'+visible.length+' shown · '+all.length+' total contacts</small>'+
     '<input id="grwx-search" type="search" placeholder="Search name or mobile" aria-label="Search inbox contacts" value="'+esc(filter)+'">'+
     '<div class="grwx-filter-row"><select id="grwx-company" aria-label="Inbox company"><option value="all">All companies</option>'+
      ctx.companies.map(c=>'<option value="'+esc(c)+'" '+(company===c?'selected':'')+'>'+esc(companyName(c))+'</option>').join('')+'</select>'+
      '<select id="grwx-kind" aria-label="Lead or customer"><option value="all">All</option><option value="leads" '+(kind==='leads'?'selected':'')+'>Leads</option><option value="customers" '+(kind==='customers'?'selected':'')+'>Customers</option></select></div></div>'+
    '<div class="grwx-users">'+(visible.length?visible.slice(0,1200).map(x=>
     '<button type="button" class="grwx-user '+(x.key===selected?'active':'')+'" data-grwx-contact="'+esc(x.key)+'">'+
       '<span class="grwx-avatar">'+esc((x.name||'?').charAt(0).toUpperCase())+'</span>'+
       '<span class="grwx-user-copy"><b>'+esc(x.name)+'</b><small>+91 '+esc(x.number)+' · '+esc(x.type)+'</small>'+
       '<small class="grwx-last-message">'+esc(x.recent?.body||x.recent?.delivery_status||'No CRM messages yet')+'</small></span>'+
       '<time>'+esc(date(x.recent?.event_at||x.recent?.created_at).split(',')[0])+'</time></button>'
     ).join(''):'<p class="grwx-empty">No matching customers or leads</p>')+'</div></aside>'+
    '<main class="grwx-conversation">'+
    (active?'<div class="grwx-chat-head"><span class="grwx-avatar">'+esc(title.charAt(0).toUpperCase())+'</span>'+
      '<span class="grwx-heading-person"><strong>'+esc(title)+'</strong><small>+91 '+esc(active.number)+' · '+esc(companyName(active.company_id))+'</small></span>'+
      '<button type="button" data-grwx-action="refresh-chat" '+(!ctx.admin||!active.connection?'disabled':'')+'>'+ (state.loading?'Loading…':'Refresh chat')+'</button></div>'+
      '<div class="grwx-provider-note" aria-live="polite">'+
      (state.error?'<span class="grwx-error">'+esc(state.error)+'</span>':
       state.loading?'Reading SocialBerries messages…':
       state.checked?'SocialBerries checked '+esc(date(state.checked))+' · '+provider.length+' provider message(s) on page '+(state.page||1):
       active.connection?'Select Refresh chat to load provider messages':'This contact needs a confirmed sender-company link for provider history')+'</div>'+
      '<div class="grwx-messages" id="grwx-messages">'+(rendered.length?rendered.map(m=>
       '<div class="grwx-message '+(m.direction==='outbound'?'sent':m.direction==='inbound'?'received':'unknown')+'"><div class="grwx-bubble">'+
        '<div>'+quote(m.text)+'</div><small>'+esc(date(m.when))+' · '+esc(m.status||m.origin)+'</small></div></div>').join(''):
        '<div class="grwx-empty">No saved messages for this customer. Refresh chat to request provider history.</div>')+'</div>'+
      '<div class="grwx-chat-footer">'+
      '<div class="grwx-attachment-tools"><label>Attach image / video / file<input id="grwx-attachment" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"></label>'+
      '<span id="grwx-attachment-name">'+esc(attachments.get(active.key)?.name||'No file selected')+'</span></div>'+
      '<div class="grwx-compose-row"><textarea id="grwx-compose" rows="2" maxlength="4096" placeholder="Type a WhatsApp reply…" aria-label="WhatsApp message draft">'+esc(drafts.get(active.key)||'')+'</textarea>'+
      '<button type="button" class="grwx-composer-copy" data-grwx-action="copy-draft">Copy reply</button>'+
      '<button type="button" data-grwx-action="send-draft" disabled title="Provider reply endpoint and customer-service window verification required">Send</button></div>'+
      '<div class="grwx-send-unavailable">Direct Send disabled: SocialBerries has not provided a verified individual text/media reply API and inbound 24-hour conversation status. Drafts are local to this open page; use Copy reply and send from SocialBerries meanwhile. Attached files are not uploaded.</div>'+
      '<div class="grwx-pagination"><button type="button" data-grwx-action="newer" '+(!state.page||state.page<=1||state.loading?'disabled':'')+'>Newer</button>'+
      '<small>History page '+(state.page||1)+'</small><button type="button" data-grwx-action="older" '+(!state.hasMore||state.loading?'disabled':'')+'>Older</button></div></div>':
      '<div class="grwx-empty">Choose a contact to view chat history</div>')+'</main>'+
    '<aside class="grwx-customer-profile">'+(active?
     '<div class="grwx-profile-head"><b>Customer details</b><div class="grwx-profile-avatar">'+esc(title.charAt(0).toUpperCase())+'</div>'+
     '<h4>'+esc(title)+'</h4><span>'+esc(active.type)+'</span></div>'+
     [['Phone','+91 '+active.number],['Email',active.email||'Not available'],['Company',companyName(active.company_id)],
      ['Source',active.source||'Not recorded'],['Salesperson',active.salesperson],
      ['Tags',(active.tags||[]).map(t=>(r.tags||[]).find(z=>z.id===t)?.name||'').filter(Boolean).join(', ')||'None'],
      ['Products',(active.products||[]).join(', ')||'Not recorded'],
      ['Orders',(active.orders||[]).map(o=>o.order_id+' · '+o.status).join('; ')||'None'],
      ['Lead stage',active.stage||'—'],['Next follow-up',active.next_followup||'Not scheduled'],
      ['CRM notes',active.notes||'No notes recorded'],['CRM messages',crm.length+' recorded']].map(x=>'<div class="grwx-detail"><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></div>').join('')+
      '<p class="grwx-profile-hint">Edit ownership, notes, tags and follow-ups in Leads & CRM / Customers.</p>':
     '<p class="grwx-empty">Select a customer to show details</p>')+'</aside></div>'+
   '<div class="grwx-accuracy">All available CRM leads/customers appear in the directory, even without messages. Provider history is fetched by selected number only. Real-time updates for all SocialBerries conversations require authenticated incoming-message/status webhooks and a complete history API.</div>'+
   '</section>';
 }
 async function load(pageNumber=1,silent=false){
  const chosen=customers().find(x=>x.key===selected);
  if(!chosen?.connection||!ctx?.admin||!host?.isConnected)return;
  const identity=chosen.key,seq=++fetchSerial;
  const prev=history.get(identity)||{};
  if(prev.loading)return;
  history.set(identity,{...prev,loading:true,error:''});
  if(!silent)render();
  try{
   const r=await ctx.app.db.functions.invoke('greenrich-socialberries',{
    body:{connection_id:chosen.connection.id,action:'messages',phone_number:'91'+chosen.number,page:pageNumber}
   });
   if(r.error)throw Error(r.error.message||'Cannot access provider API');
   const x=r.data||{};
   if(!x.ok)throw Error(x.message||x.error||'SocialBerries request unsuccessful');
   if(!x.shape_known)throw Error('Provider response did not match a documented message list. Ask SocialBerries for the history response schema.');
   if(seq!==fetchSerial)return;
   const messages=Array.isArray(x.messages)?x.messages:[];
   const count=Number.isFinite(x.count)?x.count:null;
   history.set(identity,{messages,page:pageNumber,count,hasMore:messages.length>=15&&(count===null||pageNumber*15<count),
    checked:new Date().toISOString(),error:'',loading:false});
  }catch(err){
   if(seq!==fetchSerial)return;
   history.set(identity,{...prev,loading:false,error:String(err.message||err)});
  }
  if(ctx&&host?.isConnected)render();
 }
 const cleanup=()=>{if(ticker){clearInterval(ticker);ticker=null}fetchSerial++};
 const mount=(root,settings)=>{
  cleanup();ctx=settings;host=root;if(!host)return;
  if(!selected){const first=customers()[0];if(first)selected=first.key}
  host.onclick=async e=>{
   const p=e.target.closest('[data-grwx-contact]');if(p){selected=p.dataset.grwxContact;page=1;fetchSerial++;render();const picked=customers().find(x=>x.key===selected);if(picked?.connection&&ctx.admin&&!history.get(selected)?.checked)void load(1);return}
   const action=e.target.closest('[data-grwx-action]')?.dataset.grwxAction;
   if(action==='refresh-chat')return void load(1);
   if(action==='send-draft'){settings.notify('Direct WhatsApp reply is not connected. The provider reply endpoint and 24-hour conversation window must be verified before sending. No message was sent.','warning');return}
   if(action==='copy-draft'){
    const text=drafts.get(selected)||'';
    if(!text.trim()){settings.notify('Type a message first.','warning');return}
    try{await navigator.clipboard.writeText(text);settings.notify('Reply copied. Send it using your connected SocialBerries inbox. No CRM send was attempted.','success')}
    catch{settings.notify('Copy not available in this browser. Select the draft text and copy it manually.','warning')}
    return;
   }
   if(action==='older'){const h=history.get(selected);if(h?.hasMore)void load((h.page||1)+1);return}
   if(action==='newer'){const h=history.get(selected);if(h?.page>1)void load(h.page-1);return}
   if(action==='refresh-directory'){try{await settings.refresh();render()}catch(err){settings.notify(String(err.message||err),'error')}return}
  };
  host.oninput=e=>{
   if(e.target.id==='grwx-compose'){drafts.set(selected,e.target.value.slice(0,4096));return}
   if(e.target.id!=='grwx-search')return;
   filter=e.target.value.toLowerCase();
   const cursor=e.target.selectionStart;render();
   const input=host.querySelector('#grwx-search');input?.focus();
   try{input?.setSelectionRange(cursor,cursor)}catch{}
  };
  host.onchange=e=>{
   if(e.target.id==='grwx-attachment'){
    const file=e.target.files?.[0];
    if(file&&file.size>25*1024*1024){settings.notify('Please choose a file under 25 MB. No file has been uploaded.','warning');e.target.value='';return}
    if(file)attachments.set(selected,{name:file.name,size:file.size,type:file.type});
    else attachments.delete(selected);
    const label=host.querySelector('#grwx-attachment-name');if(label)label.textContent=file?.name||'No file selected';
    return;
   }
   if(e.target.id==='grwx-company'){company=e.target.value;selected=''}
   else if(e.target.id==='grwx-kind'){kind=e.target.value;selected=''}
   else return;
   render();
  };
  render();
  const initial=customers().find(x=>x.key===selected);
  if(initial?.connection&&ctx.admin&&!history.get(selected)?.checked)void load(1);
  // Poll only the currently open contact, and only if its provider history was already requested.
  // This is a best-effort refresh, NOT proof of webhook-backed live synchronization.
  ticker=setInterval(()=>{
   if(!host?.isConnected){cleanup();return}
   if(document.visibilityState==='hidden'||!ctx?.admin)return;
   const h=history.get(selected);if(h?.checked&&!h?.loading&&h.page===1)void load(1,true);
  },60000);
 };
 window.GreenRichInbox={mount,unmount:cleanup};
})();
