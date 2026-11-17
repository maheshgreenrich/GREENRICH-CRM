'use strict';
/* GreenRich ONE conversation workspace.
   CRM contacts are always shown; SocialBerries history is fetched only for a selected
   number. "Live" implies verified provider webhooks; this UI never invents them. */
(()=>{
 let ctx=null,host=null,selected='',filter='',kind='all',company='all',page=1,fetchSerial=0,ticker=null;
 const history=new Map(),drafts=new Map(),attachments=new Map(),templateValues=new Map(),templateMedia=new Map();
 let templateOpen=false,chosenTemplateId='';
 const latestByNumber=new Map(), readByNumber=new Map(), unreadByNumber=new Map();
 let watchCursor=0,watchBusy=false,lastListRefresh=0;
 const conversationKey=x=>String(x?.company_id||'')+':'+String(x?.number||'');
 const seenKey=k=>'grwx-read-v9:'+k;
 const lastRead=k=>{if(readByNumber.has(k))return readByNumber.get(k);let t=0;
  try{t=Number(localStorage.getItem(seenKey(k)))||0}catch{}readByNumber.set(k,t);return t};
 const markRead=x=>{const k=conversationKey(x),stamp=Date.now();
   readByNumber.set(k,stamp);unreadByNumber.delete(k);
   try{localStorage.setItem(seenKey(k),String(stamp))}catch{}
 };
 const rememberIncoming=(person,messages,opened=false)=>{
  const key=conversationKey(person);
  if(opened){markRead(person);}
  const rows=messages.filter(x=>x.direction==='Incoming'&&Number.isFinite(Date.parse(x.event_at)));
  const newest=rows.sort((a,b)=>Date.parse(b.event_at)-Date.parse(a.event_at))[0];
  if(newest){
   const old=latestByNumber.get(key);
   if(!old||Date.parse(newest.event_at)>=Date.parse(old.event_at))
     latestByNumber.set(key,{text:newest.text||newest.template_name||'Attachment received',event_at:newest.event_at,id:newest.provider_message_id||newest.id});
   const cutoff=lastRead(key);
   const unread=rows.filter(x=>Date.parse(x.event_at)>cutoff&&Date.parse(x.event_at)>Date.now()-7*86400000);
   if(!opened&&unread.length)unreadByNumber.set(key,{count:unread.length,text:newest.text||'New attachment',when:newest.event_at});
   else if(opened)unreadByNumber.delete(key);
  }
 };
 const cleanupAttachment=x=>{if(x?.previewUrl)URL.revokeObjectURL(x.previewUrl)};
 const attachmentView=x=>{
  if(!x)return '';
  let media='';
  if(x.previewUrl&&x.type.startsWith('image/'))media='<img src="'+esc(x.previewUrl)+'" alt="Selected image preview">';
  else if(x.previewUrl&&x.type.startsWith('video/'))media='<video controls preload="metadata" src="'+esc(x.previewUrl)+'"></video>';
  else if(x.previewUrl&&x.type.startsWith('audio/'))media='<audio controls preload="none" src="'+esc(x.previewUrl)+'"></audio>';
  const size=(x.size/1024).toFixed(0)+' KB';
  return '<div class="grwx-media-preview">'+media+'<span title="'+esc(x.name)+'"><b>'+esc(x.name)+'</b><small>'+esc(size)+' · Ready to attach</small></span>'+
   '<button type="button" data-grwx-action="remove-attachment" title="Remove attachment" aria-label="Remove selected attachment">✕</button></div>';
 };

 let sending=false;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clean=x=>String(x||'').replace(/\D/g,'').replace(/^91(?=[6-9]\d{9}$)/,'');
 const phone=x=>/^[6-9]\d{9}$/.test(clean(x))?clean(x):null;
 const date=x=>{if(!x)return '';const d=new Date(x);return Number.isFinite(d.getTime())?d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):''};
 const quote=x=>esc(x).replace(/\n/g,'<span class="grwx-linebreak"></span>');
 const companyName=x=>ctx?.companyName(x)||x||'Company not assigned';
 const data=()=>ctx?.getRows()||{};
 // Only display a provider/local template's media URL if the payload actually
 // contains an HTTPS link. Never invent image locations or guess Meta handles.
 const safeMediaLink=x=>{
  if(typeof x!=='string'||x.length>1800)return '';
  try{const u=new URL(x);return u.protocol==='https:'&&u.username===''&&u.password===''?u.href:''}
  catch{return ''}
 };
 const previewFor=(m,contact)=>{
  const rows=data();
  // CRM campaign records often store only "Marketing template: <name>" in body.
  // Recover the exact saved template name for DISPLAY only, never for sending.
  const localName=/^Marketing template:\s*([a-z0-9_]+)\s*$/i.exec(String(m.text||''));
  const name=String(m.template_name||m.template||localName?.[1]||'').trim().toLowerCase();
  if(!name||!(contact.provider_company_id||contact.company_id))return null;
  const t=(rows.templates||[]).find(x=>x.company_id===(contact.provider_company_id||contact.company_id)&&
    String(x.name||'').toLowerCase()===name&&
    (x.language==='en_US'||!x.language));
  if(!t)return null; // Preview does not grant permission to send; never alter approval.
  const pv=typeof t.provider_preview==='string'?(()=>{try{return JSON.parse(t.provider_preview)}catch{return {}}})():t.provider_preview||{};
  const components=Array.isArray(pv.components)?pv.components:[];
  const header=components.find(c=>String(c.type).toUpperCase()==='HEADER');
  const buttons=components.find(c=>String(c.type).toUpperCase()==='BUTTONS');
  const links=[header?.example?.header_handle?.[0],header?.example?.header_url,
     header?.image?.link,t.header_media_url,m.media_url,m.image_url];
  const image=links.map(safeMediaLink).find(Boolean)||'';
  return {image,hasImage:String(header?.format||'').toUpperCase()==='IMAGE',
    buttons:Array.isArray(buttons?.buttons)?buttons.buttons.slice(0,3).map(b=>String(b.text||'').slice(0,70)).filter(Boolean):[]};
 };
 const usableTemplates=person=>{
  if(!person?.connection)return [];
  return (data().templates||[]).filter(t=>t.connection_id===person.connection.id&&t.company_id===(person.provider_company_id||person.company_id))
   .filter(t=>['marketing','utility','authentication'].includes(String(t.category||'').toLowerCase()))
   .sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 };
 const readyTemplate=t=>!!t&&t.provider_approval==='approved'&&
  ['verified_provider','admin_confirmed'].includes(t.provider_source)&&
  /^\d{5,25}$/.test(String(t.provider_template_id||''))&&
  Array.isArray(t.provider_preview?.components)&&
  t.provider_preview.components.some(c=>String(c.type).toUpperCase()==='BODY')&&
  !!String(t.body||'').trim();
 const templateSpec=t=>{
  const parts=t?.provider_preview?.components||[];
  const head=parts.find(c=>String(c.type).toUpperCase()==='HEADER');
  const buttons=parts.find(c=>String(c.type).toUpperCase()==='BUTTONS');
  const body=String(parts.find(c=>String(c.type).toUpperCase()==='BODY')?.text||t?.body||'');
  const nums=[...body.matchAll(/\{\{(\d+)\}\}/g)].map(x=>Number(x[1]));
  return {body,image:String(head?.format||'').toUpperCase()==='IMAGE',
   count:Math.max(0,...nums),buttons:Array.isArray(buttons?.buttons)?buttons.buttons.map(x=>x.text).filter(Boolean):[]};
 };
 const messageCard=(m,contact)=>{
  const template=previewFor(m,contact);
  const actualButtons=Array.isArray(m.template_buttons)?m.template_buttons.slice(0,3):[];
  const actualImage=safeMediaLink(m.media_url);
  let header='';
  if(m.media_url&&safeMediaLink(m.media_url)&&m.media_type==='image')header='<img class="grwx-template-image" loading="lazy" alt="WhatsApp message attachment" src="'+esc(safeMediaLink(m.media_url))+'">';
  else if(actualImage&&m.template_name)header='<img class="grwx-template-image" loading="lazy" alt="WhatsApp template image" src="'+esc(actualImage)+'">';
  else if(template?.image)header='<img class="grwx-template-image" loading="lazy" alt="Approved template image" src="'+esc(template.image)+'">';
  else if(m.template_image_expected||template?.hasImage||m.has_attachment&&m.attachment_type==='image')header='<div class="grwx-media-missing">Image attached in WhatsApp · Provider did not supply a public image URL</div>';
  const buttonsList=actualButtons.length?actualButtons:(template?.buttons||[]);
  const buttons=buttonsList.length?'<div class="grwx-template-buttons">'+buttonsList.map(b=>'<span>'+esc(b)+'</span>').join('')+'</div>':'';
  return '<div class="grwx-bubble">'+header+'<div class="grwx-bubble-text">'+quote(m.text)+'</div>'+buttons+
   '<small>'+esc(date(m.when))+' · '+esc(m.status||m.origin)+'</small></div>';
 };
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
   const enabled=(r.connections||[]).filter(c=>ctx.companies.includes(c.company_id)&&
      String(c.provider||'').toLowerCase()==='socialberries'&&c.enabled===true&&c.setup_state==='verified');
   let linked=enabled.find(c=>c.company_id===x.company_id);
   // Legacy CRM customers may lack a consent/order company link.
   // Use a fallback only if exactly one authorized verified sender is enabled.
   // Never change ownership or guess when multiple senders are connected.
   if(!linked&&!x.company_id&&x.type==='Customer'&&enabled.length===1)linked=enabled[0];
   x.connection=linked||null;
   x.provider_company_id=linked?.company_id||x.company_id||'';
   x.provider_fallback=!!linked&&!x.company_id;
   x.messages=msgs.filter(m=>phone(m.phone)===x.number&&
      x.provider_company_id===m.company_id).sort((a,b)=>String(a.event_at||a.created_at).localeCompare(String(b.event_at||b.created_at)));
   x.recent=x.messages[x.messages.length-1];
   x.salesperson=(r.profiles||[]).find(p=>p.id===x.owner)?.full_name||'Not assigned';
  }
  return list.sort((a,b)=>{
   const time=x=>latestByNumber.get(conversationKey(x))?.event_at||x.recent?.event_at||x.recent?.created_at||x.created_at||'';
   return String(time(b)).localeCompare(String(time(a)));
  });
 };
 function render(){
  if(!host?.isConnected||!ctx)return;
  const r=data(),all=customers();
  const visible=all.filter(x=>(company==='all'||x.provider_company_id===company)&&
    (kind==='all'||kind==='leads'&&x.type==='Lead'||kind==='customers'&&x.type==='Customer')&&
    (!filter||[x.name,x.number,x.email,x.source,x.salesperson].some(v=>String(v||'').toLowerCase().includes(filter))));
  if(selected&&!all.some(x=>x.key===selected))selected='';
  if(!selected&&visible.length)selected=visible[0].key;
  const active=all.find(x=>x.key===selected);
  const state=history.get(selected)||{};
  const currentTemplates=usableTemplates(active);
  const pickedTemplate=currentTemplates.find(t=>t.id===chosenTemplateId);
  const pickedSpec=pickedTemplate?templateSpec(pickedTemplate):null;
  const provider=state.messages||[];
  const crm=active?.messages||[];
  // Provider UUID and WhatsApp wamid may differ. Prefer the actual wamid
  // so accepted campaign messages do not appear twice as separate chats.
  const seen=new Set(provider.flatMap(m=>[m.id,m.provider_message_id]).filter(Boolean));
  const matchingLocal=x=>crm.find(m=>m.provider_message_id&&
    [x.id,x.provider_message_id].includes(m.provider_message_id));
  const rendered=[...provider.map(x=>{
    const local=matchingLocal(x);
    const content=x.text||(x.template_name?'Template: '+x.template_name:
      x.has_attachment?'Attachment: '+(x.attachment_type||'media')+' (media URL unavailable from provider)':
      local?.body||'[Provider did not return readable message text]');
    return {text:content,direction:x.direction==='Outgoing'?'outbound':x.direction==='Incoming'?'inbound':'unknown',
      when:x.event_at,status:x.status,id:x.provider_message_id||x.id,origin:'provider',template_name:x.template_name,has_attachment:x.has_attachment,attachment_type:x.attachment_type,media_url:x.media_url||'',media_type:x.media_type||'',template_buttons:x.template_buttons||[],template_image_expected:!!x.template_image_expected};
   }),
    ...crm.filter(x=>!x.provider_message_id||!seen.has(x.provider_message_id))
      .map(x=>({text:x.body||'[CRM message text unavailable]',direction:x.direction,
       when:x.event_at||x.created_at,status:x.delivery_status,id:x.id,origin:'crm'}))];
  rendered.sort((a,b)=>(Date.parse(a.when)||0)-(Date.parse(b.when)||0));
  const title=active?.name||'Choose a customer';
  const previousScroll=host.querySelector('#grwx-messages');
  const wasNearBottom=previousScroll?previousScroll.scrollHeight-previousScroll.scrollTop-previousScroll.clientHeight<100:true;
  host.innerHTML='<section class="grwx-shell">'+
   '<div class="grwx-top"><div><h3>WhatsApp Inbox <span class="grwx-release" title="UI version">v9</span></h3><p>CRM contacts and available SocialBerries messages</p></div>'+
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
       '<span class="grwx-user-copy"><strong class="grwx-contact-name">'+esc(x.name)+'</strong><span class="grwx-contact-phone">+91 '+esc(x.number)+'</span>'+
       '<span class="grwx-last-message">'+esc(unreadByNumber.get(conversationKey(x))?.text||latestByNumber.get(conversationKey(x))?.text||x.recent?.body||x.recent?.delivery_status||'No CRM messages yet')+'</span></span>'+
       (unreadByNumber.has(conversationKey(x))?'<span class="grwx-unread-badge" aria-label="'+unreadByNumber.get(conversationKey(x)).count+' unread WhatsApp replies">'+Math.min(99,unreadByNumber.get(conversationKey(x)).count)+(unreadByNumber.get(conversationKey(x)).count>99?'+':'')+'</span>':'')+
       '</button>'
     ).join(''):'<p class="grwx-empty">No matching customers or leads</p>')+'</div></aside>'+
    '<main class="grwx-conversation '+(templateOpen?'grwx-with-template':'')+'">'+
    (active?'<div class="grwx-chat-head"><span class="grwx-avatar">'+esc(title.charAt(0).toUpperCase())+'</span>'+
      '<span class="grwx-heading-person"><strong>'+esc(title)+'</strong><small>+91 '+esc(active.number)+' · '+esc(active.provider_fallback?'WhatsApp sender: '+companyName(active.provider_company_id):companyName(active.company_id))+'</small></span>'+
      '<button type="button" data-grwx-action="refresh-chat" '+(!ctx.admin||!active.connection?'disabled':'')+'>'+ (state.loading?'Loading…':'Refresh chat')+'</button></div>'+
      '<div class="grwx-provider-note" aria-live="polite">'+
      (state.error?'<span class="grwx-error">'+esc(state.error)+'</span>':
       state.loading?'Reading SocialBerries messages…':
       state.checked?'SocialBerries checked '+esc(date(state.checked))+' · '+provider.length+' provider message(s) on page '+(state.page||1):
       active.connection?'Select Refresh chat to load provider messages':'This contact needs a confirmed sender-company link for provider history')+'</div>'+
      '<div class="grwx-messages" id="grwx-messages">'+(rendered.length?rendered.map(m=>
       '<div class="grwx-message '+(m.direction==='outbound'?'sent':m.direction==='inbound'?'received':'unknown')+'">'+messageCard(m,active)+'</div>').join(''):
        '<div class="grwx-empty">No saved messages for this customer. Refresh chat to request provider history.</div>')+'</div>'+
      (templateOpen?'<section class="grwx-template-picker" aria-label="Choose an approved WhatsApp template">'+
        '<div class="grwx-template-picker-heading"><b>Approved WhatsApp templates</b><button type="button" data-grwx-action="close-template" aria-label="Close template picker">✕</button></div>'+
        '<div class="grwx-template-options">'+(currentTemplates.length?currentTemplates.map(t=>
          '<button type="button" data-grwx-template="'+esc(t.id)+'" '+(!readyTemplate(t)?'disabled title="Existing approval details must be synced in CRM"':'')+
          ' class="'+(chosenTemplateId===t.id?'active':'')+'">'+esc(t.name)+' · '+esc(t.language)+' '+(readyTemplate(t)?'':' · Pending CRM sync')+'</button>'
        ).join(''):'<span>No templates found for this sender</span>')+'</div>'+
        (pickedTemplate&&readyTemplate(pickedTemplate)?'<div class="grwx-template-content">'+
          '<p class="grwx-template-body">'+quote(pickedSpec.body)+'</p>'+
          (pickedSpec.buttons.length?'<p class="grwx-template-cta">Buttons: '+esc(pickedSpec.buttons.join(' · '))+'</p>':'')+
          (Array.from({length:Math.min(20,pickedSpec.count)},(_,i)=>'<label>Variable '+(i+1)+
           '<input type="text" data-grwx-variable="'+i+'" maxlength="512" placeholder="Value for {{'+(i+1)+'}}" value="'+esc((templateValues.get(selected+":"+pickedTemplate.id)||[])[i]||'')+'"></label>').join(''))+
          (pickedSpec.image?'<label>Approved template header image (JPEG or PNG required)<input type="file" id="grwx-template-image" accept="image/jpeg,image/png"></label>'+
            '<span class="grwx-template-upload-name">'+esc(templateMedia.get(selected+":"+pickedTemplate.id)?.name||'No image selected')+'</span>':'')+
          '<button type="button" data-grwx-action="send-template" '+(sending?'disabled':'')+'>Send selected template</button>'+
        '</div>':'<small>Select an approved template. Pending CRM sync templates cannot be sent until their existing approved details are recorded.</small>')+
      '</section>':'')+
      '<div class="grwx-chat-footer">'+
      '<div class="grwx-composer-layout"><div class="grwx-attachment-tools">'+
      '<button type="button" class="grwx-tool-icon" data-grwx-action="attach-image" aria-label="Select image" title="Select image">▧</button>'+
      '<button type="button" class="grwx-tool-icon" data-grwx-action="attach-video" aria-label="Select video" title="Select video">▣</button>'+
      '<button type="button" class="grwx-tool-icon" data-grwx-action="attach-document" aria-label="Select document" title="Select PDF or document">▤</button>'+
      '<button type="button" class="grwx-tool-icon" data-grwx-action="attach-audio" aria-label="Select audio" title="Select audio">♫</button>'+
      '<input id="grwx-attachment" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" hidden aria-label="Choose attachment">'+
      '</div>'+
      '<div class="grwx-compose-row"><textarea id="grwx-compose" rows="2" maxlength="4096" placeholder="Type a WhatsApp reply…" aria-label="WhatsApp message draft">'+esc(drafts.get(active.key)||'')+'</textarea>'+
      '<button type="button" data-grwx-action="template-draft" aria-expanded="'+(templateOpen?'true':'false')+'">Template</button>'+
      '<button type="button" data-grwx-action="send-draft" '+(!ctx?.admin||!active.connection||sending?'disabled':'')+' title="Send text reply within 24 hours of the customer’s last incoming message" aria-label="Send WhatsApp text">'+(sending?'…':'➤')+'</button></div></div>'+
      '<div class="grwx-attachment-selection">'+attachmentView(attachments.get(active.key))+'</div>'+
      '<p class="grwx-send-unavailable">'+(attachments.get(active.key)?'Selected attachment will be sent with the arrow. Caption optional; filename is used when blank. Remove ✕ to send text only.':'Text message: type and press ➤. Outside 24 hours, use an approved template.')+'</p>'+
      '<div class="grwx-pagination"><button type="button" data-grwx-action="newer" '+(!state.page||state.page<=1||state.loading?'disabled':'')+'>Newer</button>'+
      '<small>History page '+(state.page||1)+'</small><button type="button" data-grwx-action="older" '+(!state.hasMore||state.loading?'disabled':'')+'>Older</button></div></div>':
      '<div class="grwx-empty">Choose a contact to view chat history</div>')+'</main>'+
    '<aside class="grwx-customer-profile">'+(active?
     '<div class="grwx-profile-head"><b>Customer details</b><div class="grwx-profile-avatar">'+esc(title.charAt(0).toUpperCase())+'</div>'+
     '<h4>'+esc(title)+'</h4><span>'+esc(active.type)+'</span></div>'+
     [['Phone','+91 '+active.number],['Email',active.email||'Not available'],['Company',active.company_id?companyName(active.company_id):active.provider_fallback?'Unassigned in CRM · WhatsApp via '+companyName(active.provider_company_id):'Not assigned'],
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
  const chatScroller=host.querySelector('#grwx-messages');
  if(chatScroller&&wasNearBottom)chatScroller.scrollTop=chatScroller.scrollHeight;
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
   // Open conversation is considered read; sidebar preview updates from incoming provider records.
   rememberIncoming(chosen,messages,pageNumber===1);
  }catch(err){
   if(seq!==fetchSerial)return;
   history.set(identity,{...prev,loading:false,error:String(err.message||err)});
  }
  if(ctx&&host?.isConnected)render();
 }
 // Best-effort history polling while Inbox is visible. A proper provider webhook
 // remains necessary for instant global notifications; never claim real-time delivery.
 async function watchNewReplies(){
  if(watchBusy||!ctx?.admin||!host?.isConnected||document.visibilityState==='hidden')return;
  const list=customers().filter(x=>x.connection&&x.key!==selected);
  if(!list.length)return;
  watchBusy=true;
  try{
   const number=Math.min(3,list.length);
   for(let i=0;i<number;i++){
    const person=list[(watchCursor++)%list.length];
    try{
     const r=await ctx.app.db.functions.invoke('greenrich-socialberries',{body:{
       connection_id:person.connection.id,action:'messages',phone_number:'91'+person.number,page:1}});
     if(r.error||!r.data?.ok||!r.data.shape_known)continue;
     const messages=Array.isArray(r.data.messages)?r.data.messages:[];
     rememberIncoming(person,messages,false);
    }catch{}
   }
   if(host?.isConnected)render();
  }finally{watchBusy=false}
 }
 const cleanup=()=>{if(ticker){clearInterval(ticker);ticker=null}fetchSerial++;watchBusy=false};
 const mount=(root,settings)=>{
  cleanup();ctx=settings;host=root;if(!host)return;
  if(!selected){const first=customers()[0];if(first)selected=first.key}
  host.onclick=async e=>{
   const p=e.target.closest('[data-grwx-contact]');if(p){selected=p.dataset.grwxContact;
    const opened=customers().find(x=>x.key===selected);if(opened)markRead(opened);
    templateOpen=false;chosenTemplateId='';page=1;fetchSerial++;render();const picked=customers().find(x=>x.key===selected);if(picked?.connection&&ctx.admin&&!history.get(selected)?.checked)void load(1);return}
   const templateChoice=e.target.closest('[data-grwx-template]');
   if(templateChoice){chosenTemplateId=templateChoice.dataset.grwxTemplate;render();return}
   const action=e.target.closest('[data-grwx-action]')?.dataset.grwxAction;
   if(action==='refresh-chat')return void load(1);
   if(['attach-image','attach-video','attach-document','attach-audio'].includes(action)){
    const picker=host.querySelector('#grwx-attachment');
    if(!picker)return;
    const accepts={'attach-image':'image/*','attach-video':'video/*','attach-audio':'audio/*',
      'attach-document':'.pdf,.doc,.docx,.xls,.xlsx,.txt'};
    picker.accept=accepts[action];picker.click();return;
   }
   if(action==='template-draft'){templateOpen=!templateOpen;chosenTemplateId='';render();return}
   if(action==='close-template'){templateOpen=false;chosenTemplateId='';render();return}
   if(action==='remove-attachment'){cleanupAttachment(attachments.get(selected));attachments.delete(selected);render();return}
   if(action==='send-template'){
    if(sending)return;
    const person=customers().find(x=>x.key===selected);
    const t=usableTemplates(person).find(x=>x.id===chosenTemplateId);
    if(!ctx?.admin||!person?.connection||!readyTemplate(t))
      return settings.notify('Choose a synced approved template for this sender first.','warning');
    const spec=templateSpec(t),key=selected+":"+t.id;
    const values=templateValues.get(key)||[];
    if(values.length<spec.count||Array.from({length:spec.count},(_,i)=>values[i]).some(v=>!String(v||'').trim()))
      return settings.notify('Complete all required template variables.','warning');
    const file=templateMedia.get(key);
    if(spec.image&&!file)return settings.notify('Select the approved template header image (JPEG or PNG) before sending.','warning');
    if(file&&file.size>8*1024*1024)return settings.notify('Template image must be 8 MB or less.','warning');
    if(!window.confirm('Send approved WhatsApp template "'+t.name+'" to '+person.name+' (+91 '+person.number+')? This may incur WhatsApp messaging charges.'))return;
    const form=new FormData(),targetKey=selected;
    form.set('connection_id',person.connection.id);
    form.set('customer_key',person.key);
    form.set('phone_number','91'+person.number);
    form.set('request_id',crypto.randomUUID());
    form.set('type','template');
    form.set('template_id',t.id);
    form.set('template_values',JSON.stringify(values.slice(0,spec.count)));
    if(file)form.set('attachment',file,file.name);
    sending=true;render();
    try{
      const sess=await settings.app.db.auth.getSession();
      const jwt=sess.data?.session?.access_token;
      if(!jwt)throw Error('Please sign in again before sending.');
      const response=await fetch('https://uawgwkplkvahhmhvroul.supabase.co/functions/v1/greenrich-whatsapp-reply',{
       method:'POST',headers:{Authorization:'Bearer '+jwt,apikey:settings.publishableKey||window.GREENRICH_PUBLIC_CONFIG?.publishableKey||''},body:form
      });
      const result=await response.json().catch(()=>({ok:false,error:'Invalid SocialBerries template reply'}));
      if(!response.ok||!result.ok)throw Error(result.error||'WhatsApp template was not submitted');
      if(result.status==='accepted_by_provider'){
       templateMedia.delete(key);templateValues.delete(key);
       chosenTemplateId='';templateOpen=false;
       settings.notify('SocialBerries accepted the selected template. Delivery is still pending.','success');
       if(selected===targetKey)void load(1);
      }else settings.notify('Provider acceptance is not confirmed. Check provider history before resending.','warning');
      await settings.refresh?.();
    }catch(error){settings.notify(String(error.message||error)+'. Check provider history before retrying if sending may have started.','error')}
    finally{sending=false;if(host?.isConnected)render()}
    return;
   }
   if(action==='send-draft'||action==='send-attachment'){
    if(sending)return;
    const person=customers().find(x=>x.key===selected);
    if(!ctx?.admin||!person?.connection)return settings.notify('An authorized provider connection is required.','warning');
    const draft=(drafts.get(selected)||'').trim();
    const media=attachments.get(selected)||null;
    if(!draft&&!media)return settings.notify('Type a text reply or select an image, video, audio or document.','warning');
    if(action==='send-attachment'&&!media?.file)return settings.notify('Choose a file to attach first.','warning');
    if(media?.file?.size>8*1024*1024)return settings.notify('Attachment maximum is 8 MB. No message sent.','warning');
    // Selection is explicit: arrow sends the selected media, else plain text.
    const confirmText='Send '+(media?media.name+' as a WhatsApp attachment':'your text message')+' to '+person.name+' (+91 '+person.number+') via SocialBerries? The backend verifies the 24-hour reply window.';
    if(!window.confirm(confirmText))return;
    const requestId=crypto.randomUUID();
    const form=new FormData();
    form.set('connection_id',person.connection.id);
    form.set('customer_key',person.key);
    form.set('phone_number','91'+person.number);
    form.set('request_id',requestId);
    form.set('message_text',draft||(media?'Attachment: '+media.name:''));
    if(media?.file){
      const types={'image/jpeg':'image','image/png':'image','video/mp4':'video',
        'audio/mpeg':'audio','audio/mp4':'audio','audio/ogg':'audio',
        'application/pdf':'document','text/plain':'document',
        'application/msword':'document',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'document',
        'application/vnd.ms-excel':'document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'document'};
      const kind=types[media.file.type];
      if(!kind)return settings.notify('Unsupported file type. Use JPEG/PNG, MP4, MP3/OGG, PDF, TXT, DOC/DOCX, XLS/XLSX.','warning');
      form.set('type',kind);
      form.set('attachment',media.file,media.file.name);
    }else form.set('type','text');
    const targetKey=selected;
    sending=true;
    const button=host.querySelector('[data-grwx-action="send-draft"]');
    if(button){button.disabled=true;button.textContent='…'}
    try{
      // Browser sends a real multipart request directly to this authenticated Edge
      // Function, never to Workaxis; Basic credentials never leave the backend.
      const sess=await settings.app.db.auth.getSession();
      const jwt=sess.data?.session?.access_token;
      if(!jwt)throw Error('Please sign in again before sending a message');
      const response=await fetch('https://uawgwkplkvahhmhvroul.supabase.co/functions/v1/greenrich-whatsapp-reply',{
        method:'POST',headers:{Authorization:'Bearer '+jwt,apikey:settings.publishableKey||window.GREENRICH_PUBLIC_CONFIG?.publishableKey||''},
        body:form
      });
      const data=await response.json().catch(()=>({ok:false,error:'Invalid reply response'}));
      if(!response.ok||!data.ok)throw Error(data.error||'Unable to submit WhatsApp reply');
      if(data.status==='accepted_by_provider'){
        drafts.delete(targetKey);if(media){cleanupAttachment(attachments.get(targetKey));attachments.delete(targetKey)}
        if(selected===targetKey){render();void load(1)}
        settings.notify('SocialBerries accepted your reply. Delivery is not yet confirmed.','success');
      }else{
        settings.notify('Provider acceptance is unconfirmed. Check history before retrying.','warning');
      }
      await settings.refresh?.();
    }catch(error){settings.notify(String(error.message||error)+'. If the request may have reached SocialBerries, check history before retrying.','error')}
    finally{sending=false;if(host?.isConnected)render()}
    return;
   }
   if(action==='older'){const h=history.get(selected);if(h?.hasMore)void load((h.page||1)+1);return}
   if(action==='newer'){const h=history.get(selected);if(h?.page>1)void load(h.page-1);return}
   if(action==='refresh-directory'){try{await settings.refresh();render()}catch(err){settings.notify(String(err.message||err),'error')}return}
  };
  host.oninput=e=>{
   if(e.target.id==='grwx-compose'){drafts.set(selected,e.target.value.slice(0,4096));return}
   if(e.target.dataset.grwxVariable!==undefined){
    const key=selected+":"+chosenTemplateId;const values=templateValues.get(key)||[];
    values[Number(e.target.dataset.grwxVariable)]=e.target.value.slice(0,512);templateValues.set(key,values);return;
   }
   if(e.target.id!=='grwx-search')return;
   filter=e.target.value.toLowerCase();
   const cursor=e.target.selectionStart;render();
   const input=host.querySelector('#grwx-search');input?.focus();
   try{input?.setSelectionRange(cursor,cursor)}catch{}
  };
  host.onchange=e=>{
   if(e.target.id==='grwx-template-image'){
    const t=usableTemplates(customers().find(x=>x.key===selected)).find(x=>x.id===chosenTemplateId);
    if(!t)return;
    const file=e.target.files?.[0];
    const key=selected+":"+t.id;
    if(file&&!['image/jpeg','image/png'].includes(file.type))return settings.notify('Template header must be a JPEG or PNG image.','warning');
    if(file&&file.size>8*1024*1024)return settings.notify('Template image must be under 8 MB.','warning');
    if(file)templateMedia.set(key,file);else templateMedia.delete(key);
    const label=host.querySelector('.grwx-template-upload-name');if(label)label.textContent=file?.name||'No image selected';
    return;
   }
   if(e.target.id==='grwx-attachment'){
    const file=e.target.files?.[0];
    if(file&&file.size>8*1024*1024){settings.notify('Please choose a file under 8 MB. No file has been uploaded.','warning');e.target.value='';return}
    if(file){cleanupAttachment(attachments.get(selected));
     const previewUrl=/^(image|video|audio)\//.test(file.type)?URL.createObjectURL(file):'';
     attachments.set(selected,{name:file.name,size:file.size,type:file.type,file,previewUrl});
    }
    else attachments.delete(selected);
    render();return;
   }
   if(e.target.id==='grwx-company'){company=e.target.value;selected=''}
   else if(e.target.id==='grwx-kind'){kind=e.target.value;selected=''}
   else return;
   render();
  };
  render();
  const initial=customers().find(x=>x.key===selected);
  if(initial?.connection&&ctx.admin&&!history.get(selected)?.checked)void load(1);
  if(ctx.admin)void watchNewReplies();
  // Poll only the currently open contact, and only if its provider history was already requested.
  // This is a best-effort refresh, NOT proof of webhook-backed live synchronization.
  ticker=setInterval(()=>{
   if(!host?.isConnected){cleanup();return}
   if(document.visibilityState==='hidden'||!ctx?.admin)return;
   const h=history.get(selected);if(h?.checked&&!h?.loading&&h.page===1)void load(1,true);
   void watchNewReplies();
  },30000);
 };
 window.GreenRichInbox={mount,unmount:cleanup};
})();
