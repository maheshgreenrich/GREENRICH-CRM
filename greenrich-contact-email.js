'use strict';
/* Customer / Lead 360 rich email composer: Gmail-like formatting, CC/BCC,
   attachments, previously sent quotation PDF, company + account selection.
   HTML and files are validated on the Supabase Edge Function before sending. */
(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const emailOK=s=>/^[^\s@<>,";]+@[^\s@<>,";]+\.[^\s@<>,";]+$/.test(s);
 const split=x=>String(x||'').split(/[,;\n]+/).map(v=>v.trim()).filter(Boolean);
 const allowedMime=new Set(['application/pdf','image/png','image/jpeg','image/webp','text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
 const size=n=>n<1024?(n+' B'):(n/1048576).toFixed(2)+' MB';
 let dialog;
 async function open({db,company,companies,companyNames,contactType,contactId,name,email,notify,subject='',body=''}){
  if(!db||!company||!contactId||!['customer','lead'].includes(contactType))throw Error('A linked CRM customer or lead is required');
  if(!emailOK(email))throw Error('A valid customer/lead email must be recorded first');
  if(dialog?.isConnected)dialog.close();
  const available=[...new Set([company,...(contactType==='customer'?(companies||[]):[])])];
  let currentCompany=company,selectedSender='',sending=false,attached=[],archived=[],lastRequestKey=null,connection=null;
  dialog=document.createElement('dialog');dialog.className='gr-contact-email-modal grce-rich';
  dialog.innerHTML='<div class="grce-heading"><div><h2>New Email</h2><p>Customer / Lead: '+esc(name||email)+'</p></div><button class="grce-icon" data-close type="button" aria-label="Close">✕</button></div>'+
   '<form id="grce-form">'+
   '<div class="grce-line"><label>Company</label><select id="grce-company">'+available.map(c=>'<option value="'+esc(c)+'"'+(c===company?' selected':'')+'>'+esc(companyNames?.[c]||c)+'</option>').join('')+'</select></div>'+
   '<div class="grce-line"><label>From</label><select id="grce-from" aria-label="Choose connected sender"><option>Checking company mail connections…</option></select></div>'+
   '<div class="grce-line"><label>To</label><input name="to" required value="'+esc(email)+'" placeholder="Separate addresses with commas"></div>'+
   '<div class="grce-line"><label>CC</label><input name="cc" placeholder="Optional CC email addresses"></div>'+
   '<div class="grce-line"><label>BCC</label><input name="bcc" placeholder="Optional hidden recipients"></div>'+
   '<div class="grce-line"><label>Subject</label><input name="subject" required maxlength="200" value="'+esc(subject||'GreenRich customer communication')+'" placeholder="Email subject"></div>'+
   '<div class="grce-toolbar" role="toolbar" aria-label="Format email">'+
   '<button data-format="bold" type="button" title="Bold"><b>B</b></button>'+
   '<button data-format="italic" type="button" title="Italic"><i>I</i></button>'+
   '<button data-format="underline" type="button" title="Underline"><u>U</u></button>'+
   '<button data-format="strikeThrough" type="button" title="Strikethrough"><s>S</s></button>'+
   '<span class="grce-sep"></span>'+
   '<button data-format="insertUnorderedList" type="button" title="Bulleted list">• List</button>'+
   '<button data-format="insertOrderedList" type="button" title="Numbered list">1. List</button>'+
   '<button data-format="justifyLeft" type="button" title="Align left">⇤</button>'+
   '<button data-format="justifyCenter" type="button" title="Center align">≡</button>'+
   '<button data-format="justifyRight" type="button" title="Align right">⇥</button><button data-format="indent" type="button" title="Increase indent">→|</button><button data-format="outdent" type="button" title="Decrease indent">|←</button><button data-format="formatBlock" data-value="blockquote" type="button" title="Block quote">❞</button>'+
   '<select id="grce-font-family" aria-label="Font family"><option value="">Font</option><option value="Arial">Sans Serif</option><option value="Georgia">Serif</option><option value="Courier New">Monospace</option><option value="Verdana">Verdana</option><option value="Tahoma">Tahoma</option></select>'+ 
   '<select id="grce-font" aria-label="Font size">'+
   '<option value="">Text size</option><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">Heading</option></select>'+
   '<label class="grce-color" title="Text colour">A<input id="grce-color" type="color" value="#253750" aria-label="Text colour"></label><label class="grce-color" title="Text highlight">▣<input id="grce-highlight" type="color" value="#fff2a8" aria-label="Highlight colour"></label>'+
   '<button id="grce-link" type="button" title="Insert hyperlink">🔗</button>'+
   '<button id="grce-emoji-toggle" type="button" title="Emoji picker">☺</button><button type="button" id="grce-image" title="Insert image">▣ Image</button><input type="file" id="grce-inline-file" accept="image/png,image/jpeg,image/webp" hidden>'+
   '<button data-format="removeFormat" type="button" title="Clear formatting">T×</button>'+
   '<button data-format="undo" type="button" title="Undo">↶</button>'+
   '<button data-format="redo" type="button" title="Redo">↷</button></div>'+
   '<div id="grce-emojis" class="grce-emojis" hidden><div class="grce-emoji-grid">'+["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😍","🥰","😘","😗","😙","😚","😋","😛","😜","🤪","🤨","🧐","🤓","😎","🥳","🤩","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🫡","🤭","🫢","🤫","🤥","😶","🫥","😐","😑","😬","🙄","😯","😮","😲","🥱","😴","🤤","😪","😵","🤐","🤢","🤮","🤧","😷","🤒","🤕","🤑","🤠","😈","👿","👻","💀","☠️","👽","🤖","💩","🎃","😺","😸","😹","😻","😼","😽","🙀","😿","😾","👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💪","👀","👁️","👄","🧠","🫀","🫁","❤️","🩷","🧡","💛","💚","💙","🩵","💜","🤎","🖤","🩶","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💯","💢","💥","💫","💦","💨","💤","💬","💭","💌","💋","🌱","🌿","☘️","🍀","🌳","🌲","🌴","🌵","🌾","🌺","🌸","🌼","🌻","🌹","🥀","🪻","🌷","🍁","🍂","🍃","🍄","🪴","🌎","🌍","🌏","🌈","☀️","🌤️","⛅","☁️","🌧️","⛈️","❄️","☃️","🔥","💧","🌊","⚡","✨","⭐","🌟","🌙","🌕","🎉","🎊","🎈","🎁","🎀","🎂","🍰","☕","🍵","🥤","🍎","🍌","🥭","🍋","🥦","🥕","🌽","🥔","🥥","🥜","🍯","🍪","🍕","🍔","🍟","🍫","🍬","📄","📑","📃","📋","📎","🖇️","📁","📂","🗂️","📝","✏️","🖊️","📚","📖","📕","📰","📧","📨","📩","📤","📥","📬","📦","📫","📪","📭","💻","🖥️","📱","☎️","📞","📷","📸","🖼️","🗓️","📅","📊","📈","📉","📍","📌","🔗","🔒","🔓","🔑","⚙️","🛠️","💡","💰","💳","🧾","✅","☑️","✔️","❌","❎","⚠️","❗","❓","‼️","⁉️","⭕","🚫","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔺","🔻","⬆️","⬇️","➡️","⬅️","🔁","🔄","🔀","➕","➖","✖️","➗","♻️","🌐","🏠","🏢","🏭","🏥","🏫","🚚","🚗","🚀","🛒","📣","🎯","🏆","🥇","💎","🕒","⌛","⏰","🔔"].map(x=>'<button type="button" data-emoji="'+esc(x)+'">'+esc(x)+'</button>').join('')+'</div></div>'+
   '<div id="grce-editor" class="grce-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Email message" data-placeholder="Write your email…">'+(body?esc(body).replace(/\n/g,'<br>'):'')+'</div>'+
   '<div class="grce-attach-head"><strong>Attachments</strong><span>PDF · Word · Excel · Images · TXT (max 6 MB total)</span></div>'+
   '<div class="grce-attach-buttons"><label class="grce-file-button">📎 Attach files<input id="grce-file" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.xlsx"></label>'+
   '<label>Attach saved quotation <select id="grce-archive"><option value="">Choose a previously sent PDF</option></select></label></div>'+
   '<div id="grce-files" class="grce-files" aria-live="polite"></div>'+
   '<div id="grce-status" class="grce-connect" role="status">Checking company email connections…</div>'+
   '<div class="grce-actions"><span id="grce-count" aria-live="polite">0 characters</span>'+
   '<button type="button" data-close>Cancel</button><button type="submit" class="grce-primary" id="grce-send" disabled>Send Email</button></div>'+
   '</form>';
  document.body.append(dialog);dialog.showModal();dialog.onclose=()=>{attached.forEach(f=>{if(f.grPreview)URL.revokeObjectURL(f.grPreview)});dialog.remove()};
  const $=selector=>dialog.querySelector(selector);
  const form=$('#grce-form'),status=$('#grce-status'),button=$('#grce-send'),editor=$('#grce-editor');
  const feedback=(msg,type)=>{status.textContent=msg;notify?.(msg,type)};
  const updateCount=()=>{$('#grce-count').textContent=String(editor.innerText??editor.textContent??'').length.toLocaleString('en-IN')+' characters'};
  updateCount();
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dialog.close());
  const selectSender=()=>{
   const raw=$('#grce-from').value;
   selectedSender=raw.startsWith('gmail:')?raw.slice(6):'';
  };
  async function refreshConnection(){
   status.textContent='Checking company mail connection…';button.disabled=true;
   try{
    const {data,error}=await db.functions.invoke('greenrich-quotation-gmail',{body:{action:'status',company_id:currentCompany}});
    if(error||data?.error)throw Error(data?.error||error?.message||'Email backend unavailable');
    connection=data;
    const options=[];
    if(data.ready&&data.transport!=='gmail')options.push({id:'provider',label:data.connection.sender_email+' · '+data.transport.toUpperCase()});
    const unique=new Set();
    for(const account of data.gmail_accounts||[]){
     if(account.status==='connected'&&!unique.has(account.sender_email)){
      unique.add(account.sender_email);options.push({id:'gmail:'+account.id,label:account.sender_email+' · Gmail'});
     }
    }
    if(data.ready&&data.transport==='gmail'&&options.length===0&&data.connection?.sender_email)
     options.push({id:'gmail:primary',label:data.connection.sender_email+' · Gmail'});
    $('#grce-from').innerHTML=options.length?options.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.label)+'</option>').join(''):
     '<option value="">No connected sender — Settings → Gmail Connectivity</option>';
    selectSender();button.disabled=!options.length;
    status.textContent=options.length?options.length+' company sender'+(options.length===1?'':'s')+' available. Choose the From address before sending.':
     'No connected sender. Ask Admin to connect Gmail, Webmail SMTP or Email API in Settings.';
   }catch(error){status.textContent=error.message;button.disabled=true}
  }
  async function loadArchive(){
   const dropdown=$('#grce-archive');dropdown.innerHTML='<option value="">Choose a previously sent PDF</option>';
   try{
    let customerId=contactId;
    if(contactType==='lead'){
     const {data}=await db.from('gr_lead_pipeline').select('customer_id').eq('lead_id',contactId).eq('company_id',currentCompany).maybeSingle();
     customerId=data?.customer_id||null;
    }
    if(!customerId)return;
    const {data,error}=await db.from('gr_quotation_email_history').select('id,quotation_id,subject,attempted_at')
     .eq('company_id',currentCompany).eq('customer_id',customerId).not('pdf_path','is',null).order('attempted_at',{ascending:false}).limit(30);
    if(error)throw error;
    for(const item of data||[]){
     const option=document.createElement('option');option.value=item.id;
     option.textContent=(item.subject||'Quotation')+' · '+new Date(item.attempted_at).toLocaleDateString('en-IN');
     dropdown.append(option);
    }
   }catch(_){/* The file upload remains available if no archived documents are visible. */}
  }
  $('#grce-company').onchange=()=>{currentCompany=$('#grce-company').value;void refreshConnection();void loadArchive()};
  $('#grce-from').onchange=selectSender;
  editor.oninput=updateCount;
  // Save and restore selections across toolbar, colour picker, link dialog and emoji picker.
  let savedRange=null;
  const rememberSelection=()=>{
   const sel=window.getSelection?.();
   if(sel?.rangeCount&&editor.contains(sel.anchorNode))savedRange=sel.getRangeAt(0).cloneRange();
  };
  const restoreSelection=()=>{
   editor.focus();
   const sel=window.getSelection?.();
   if(sel&&savedRange){sel.removeAllRanges();sel.addRange(savedRange)}
  };
  const command=(name,value=null)=>{
   restoreSelection();
   document.execCommand(name,false,value);
   rememberSelection();updateCount();
  };
  editor.addEventListener('mouseup',rememberSelection);
  editor.addEventListener('keyup',rememberSelection);
  editor.addEventListener('focusout',rememberSelection);
  dialog.querySelectorAll('[data-format]').forEach(b=>{
   b.onmousedown=e=>e.preventDefault();
   b.onclick=()=>command(b.dataset.format,b.dataset.value||null);
  });
  $('#grce-font-family').addEventListener('pointerdown',rememberSelection);
  $('#grce-font-family').onchange=e=>{if(e.target.value)command('fontName',e.target.value);e.target.value=''};
  $('#grce-font').addEventListener('pointerdown',rememberSelection);
  $('#grce-font').onchange=e=>{command('fontSize',e.target.value);e.target.value=''};
  $('#grce-color').addEventListener('pointerdown',rememberSelection);
  $('#grce-color').oninput=e=>command('foreColor',e.target.value);
  $('#grce-color').onchange=e=>command('foreColor',e.target.value);
  $('#grce-highlight').addEventListener('pointerdown',rememberSelection);
  $('#grce-highlight').onchange=e=>command('hiliteColor',e.target.value);
  const insertLink=()=>{
   rememberSelection();
   const target=window.prompt('Enter link: https://example.com or mailto:name@example.com');
   if(!target)return;
   if(!/^(https?:\/\/|mailto:)[^\s<>]+$/i.test(target)){
    feedback('Enter an HTTPS or mailto link','error');return;
   }
   restoreSelection();
   const sel=window.getSelection?.();
   if(sel&&!sel.isCollapsed)document.execCommand('createLink',false,target);
   else document.execCommand('insertHTML',false,'<a href="'+esc(target)+'">'+esc(target)+'</a>');
   rememberSelection();updateCount();
  };
  $('#grce-link').onmousedown=rememberSelection;
  $('#grce-link').onclick=insertLink;
  $('#grce-emoji-toggle').onmousedown=rememberSelection;
  $('#grce-emoji-toggle').onclick=()=>{
   rememberSelection();$('#grce-emojis').hidden=!$('#grce-emojis').hidden;
  };
  dialog.querySelectorAll('[data-emoji]').forEach(b=>{
   b.onmousedown=e=>e.preventDefault();
   b.onclick=()=>command('insertText',b.dataset.emoji);
  });
  $('#grce-image').onmousedown=rememberSelection;
  $('#grce-image').onclick=()=>{$('#grce-inline-file').click()};
  $('#grce-inline-file').onchange=e=>{
   const file=e.target.files?.[0];e.target.value='';
   if(!file)return;
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2000000){
    feedback('Inline image must be PNG, JPEG or WebP under 2 MB','error');return;
   }
   if(attached.length>=4||attached.reduce((n,x)=>n+x.size,0)+file.size>6000000){
    feedback('Maximum 4 attachments / 6 MB total','error');return;
   }
   const cid='grinline-'+crypto.randomUUID()+'@greenrich';
   file.grCid=cid;
   file.grPreview=URL.createObjectURL(file);
   attached.push(file);
   command('insertHTML','<img src="'+esc(file.grPreview)+'" data-gr-cid="'+esc(cid)+'" alt="'+esc(file.name)+'" style="max-width:100%;height:auto">');
   fileDisplay();
  };
  const fileDisplay=()=>{
   $('#grce-files').innerHTML=attached.map((f,i)=>'<div class="grce-file"><span>📄 '+esc(f.name)+' · '+size(f.size)+'</span><button type="button" data-remove="'+i+'" aria-label="Remove file">✕</button></div>').join('');
   dialog.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
    const [gone]=attached.splice(Number(b.dataset.remove),1);
    if(gone?.grPreview){editor.querySelectorAll('img[data-gr-cid]').forEach(img=>{if(img.dataset.grCid===gone.grCid)img.remove()});URL.revokeObjectURL(gone.grPreview)}
    fileDisplay();
   });
  };
  $('#grce-file').onchange=e=>{
   const incoming=[...e.target.files];e.target.value='';
   for(const file of incoming){
    if(!allowedMime.has(file.type)){feedback('Unsupported file: '+file.name,'error');continue}
    if(file.size>4194304){feedback('Maximum 4 MB per file: '+file.name,'error');continue}
    if(attached.length>=4||attached.reduce((n,x)=>n+x.size,0)+file.size>6000000){
     feedback('Maximum 4 files and 6 MB total attachments','error');continue;
    }
    attached.push(file);
   }
   fileDisplay();
  };
  const encode=async file=>{
   const buffer=new Uint8Array(await file.arrayBuffer()),chunks=[];
   for(let i=0;i<buffer.length;i+=8192)chunks.push(String.fromCharCode(...buffer.subarray(i,i+8192)));
   return {name:file.name,type:file.type,base64:btoa(chunks.join('')),cid:file.grCid||null};
  };
  form.onsubmit=async event=>{
   event.preventDefault();if(sending||button.disabled)return;
   const fd=new FormData(form),to=split(fd.get('to')),cc=split(fd.get('cc')),bcc=split(fd.get('bcc'));
   const subject=String(fd.get('subject')||'').trim();
   const plain=String(editor.innerText??editor.textContent??'').trim();
   const htmlRoot=editor.cloneNode(true);
   htmlRoot.querySelectorAll('img[data-gr-cid]').forEach(img=>{
    if(!attached.some(file=>file.grCid===img.dataset.grCid))img.remove();
    else{img.setAttribute('src','cid:'+img.dataset.grCid);img.removeAttribute('data-gr-cid')}
   });
   const html=htmlRoot.innerHTML;
   if(!to.some(x=>x.toLowerCase()===email.toLowerCase())){
    feedback('The contact’s registered email must remain in To.','error');return;
   }
   if(!to.length||!to.every(emailOK)||!cc.every(emailOK)||!bcc.every(emailOK)||to.length>5||cc.length>5||bcc.length>5){
    feedback('Enter valid email addresses. Maximum 5 per To, CC or BCC.','error');return;
   }
   if(!subject||!plain){feedback('Enter a subject and message.','error');return}
   if(!window.confirm('Send email from '+$('#grce-from').selectedOptions[0]?.textContent+' to '+to.join(', ')+'?'))return;
   sending=true;button.disabled=true;button.textContent='Sending…';
   const key=lastRequestKey||crypto.randomUUID();lastRequestKey=key;
   try{
    const attachments=await Promise.all(attached.map(encode));
    const {data,error}=await db.functions.invoke('greenrich-quotation-gmail',{body:{
     action:'send_contact',company_id:currentCompany,contact_type:contactType,contact_id:String(contactId),
     request_key:key,to,cc,bcc,subject,body:plain,html_body:html,attachments,
     archive_pdf_id:$('#grce-archive').value||null,sender_account_id:selectedSender||null
    }});
    if(error||data?.error)throw Error(data?.error||error?.message||'Email sending failed');
    feedback('Message accepted by the company email provider. Delivery is not yet confirmed.','success');window.dispatchEvent(new CustomEvent('gr:contact-email-sent',{detail:{company:currentCompany,contactId,contactType}}));dialog.close();
   }catch(error){
    feedback(error.message,'error');
    button.textContent='Send Email';
    // Prevent duplicate sends when outcome is uncertain. User must reopen to retry.
    button.disabled=true;
    status.textContent=error.message+' — Check Sent Mail / CRM history before attempting another send.';
   }finally{sending=false}
  };
  void refreshConnection();void loadArchive();
 }
 window.GreenRichContactEmail={open};
})();