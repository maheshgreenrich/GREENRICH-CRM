'use strict';
/* GREENRICH ONE: company-wise Gmail OAuth, Webmail SMTP SSL, and Resend API.
 * Secrets sent only to the authenticated Supabase Edge Function, never stored
 * in localStorage/HTML outside the live settings form. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const redirect='https://uawgwkplkvahhmhvroul.supabase.co/functions/v1/greenrich-quotation-gmail';
 const uri='https://supabase.com/dashboard/project/uawgwkplkvahhmhvroul/settings/functions';
 const options=[['gmail','Gmail / Google Workspace'],['smtp','Webmail / Business Mail (SMTP SSL)'],['resend','Email API (Resend)']];
 const opt=(v,t,selected)=>'<option value="'+esc(v)+'"'+(v===selected?' selected':'')+'>'+esc(t)+'</option>';
 async function mount(root,{db,companies,companyNames,notify}){
  let company=companies[0],provider='gmail',busy=false;
  const call=async body=>{
   let data,error;
   try{({data,error}=await db.functions.invoke('greenrich-quotation-gmail',{body:{company_id:company,...body}}))}
   catch(e){throw Error('Could not reach Supabase mail backend. Check internet / Edge Function availability. '+e.message)}
   if(error){
    let detail='';
    try{const response=error.context;if(response&&typeof response.json==='function'){
     const message=await response.clone().json();detail=message.error||message.message||'';
    }}catch(_){}
    throw Error(detail||error.message||'Mail backend unavailable');
   }
   if(data?.error)throw Error(data.error);
   return data;
  };
  const intro='<h2>Email Connectivity & Settings</h2><p>Configure one official company sender. Gmail uses Google OAuth. Webmail uses SMTP SSL. Email API uses an API key. Company secrets are encrypted by the backend and are never displayed again.</p>';
  const help=(type,configured)=>type==='gmail'?'<div class="grgmail-guide"><h3>How to connect Gmail / Google Workspace</h3><ol>'+
   '<li>Open <a target="_blank" rel="noopener noreferrer" href="https://console.cloud.google.com/">Google Cloud Console</a>. Create/select a project.</li>'+
   '<li><a target="_blank" rel="noopener noreferrer" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">Enable Gmail API</a>.</li>'+
   '<li>Open <a target="_blank" rel="noopener noreferrer" href="https://console.cloud.google.com/auth/overview">Google Auth Platform</a>; configure Branding/Audience and the <code>gmail.send</code> scope; add company Gmail accounts as test users if required.</li>'+
   '<li>Create an <b>OAuth Client → Web application</b> under <a target="_blank" rel="noopener noreferrer" href="https://console.cloud.google.com/auth/clients">Clients</a>.</li>'+
   '<li>Under Authorized redirect URIs, add the URL below exactly:</li></ol>'+
   '<div class="grgmail-uri"><code>'+esc(redirect)+'</code><button id="grgmail-copy" type="button">Copy</button></div>'+
   '<p>Copy the OAuth <b>Client ID</b> and <b>Client Secret</b> into the fields above, save, then click <b>Connect Gmail</b>. Sign in with this company’s actual sending Gmail and approve Google permissions.</p></div>':
   type==='smtp'?'<div class="grgmail-guide"><h3>How to connect Webmail / cPanel / Zoho / business email</h3><ol>'+
   '<li>Log in to your email hosting panel (for example cPanel → Email Accounts → Connect Devices / Configure Mail Client).</li>'+
   '<li>Find the <b>Outgoing mail server (SMTP)</b> hostname, mailbox username and SSL/TLS port.</li>'+
   '<li>Use <b>port 465 (SSL)</b> when provided. This Supabase hosting blocks ports 25 and 587. Provider-supported alternate ports 2525/2587 can be tested.</li>'+
   '<li>Enter the full mailbox username and mailbox password or provider-issued app password; save securely.</li>'+
   '<li>Click <b>Test SMTP Connection</b>. A successful test verifies login/TLS, not message delivery. Then send an email to your own address from Customer 360.</li></ol>'+
   '<p>Webmail does not use a Google OAuth Client ID. Some providers require an app password or enablement of SMTP AUTH.</p></div>':
   '<div class="grgmail-guide"><h3>How to connect an email API provider</h3><ol><li>Create an account at <a target="_blank" rel="noopener noreferrer" href="https://resend.com/">Resend</a>.</li>'+
   '<li>Add and verify your company sending domain by setting DNS records (SPF/DKIM, as instructed by the provider).</li>'+
   '<li>Create an API key with sending permission, enter the domain and matching From address, and save.</li>'+
   '<li>Use <b>Test API Connection</b> to verify the key and domain. Then send a test message to your own email.</li></ol>'+
   '<p>API keys differ by provider. This integration currently supports the <b>Resend API</b>; other provider APIs require separate connectors.</p></div>';
  const section=(data)=>{
   const gmail=data.gmail_connection||{},smtp=data.smtp||{},api=data.resend||{};
   const ready=!!data.ready,connection=data.connection||{},configured=!!data.configured;
   let fields='';
   if(provider==='gmail'){
    fields='<form id="grgmail-oauth"><h3>Google OAuth Credentials</h3>'+
    '<label>Google OAuth Client ID<input name="client_id" autocomplete="off" maxlength="350" required placeholder="xxxxxxxx.apps.googleusercontent.com" value="'+esc(data.client_id||'')+'"></label>'+
    '<label>Google OAuth Client Secret<input type="password" name="client_secret" autocomplete="new-password" maxlength="800" required placeholder="Paste Google Client Secret"></label>'+
    '<p class="grgmail-note">The Client Secret is never shown after saving. Saving new OAuth credentials requires connecting Gmail again.</p>'+
    '<div class="grgmail-actions"><button type="submit">Save Google OAuth</button><button type="button" id="grgmail-connect"'+(!configured?' disabled':'')+'>Connect / Reconnect Gmail</button>'+
    '<button type="button" id="grgmail-disconnect"'+(gmail.status!=='connected'?' disabled':'')+'>Disconnect primary Gmail</button>'+
    '<button type="button" id="grgmail-add-account"'+(!configured?' disabled':'')+'>+ Connect another Gmail</button></div></form>'+
    '<section class="grgmail-accounts"><h3>Connected Gmail sender accounts</h3>'+
    (data.gmail_accounts?.length?data.gmail_accounts.map(a=>'<div class="grgmail-account"><span><strong>'+esc(a.sender_email)+'</strong> · '+(a.primary?'Primary Gmail':'Additional Gmail')+' · '+esc(a.status)+'</span>'+
       (!a.primary?'<button type="button" data-grgmail-remove-account="'+esc(a.id)+'">Disconnect</button>':'')+'</div>').join(''):'<p>No company Gmail accounts connected yet.</p>')+
    '<p>Each company can connect more than one official Gmail account. Employees choose the From address when composing email.</p></section>';
   }else if(provider==='smtp'){
    fields='<form id="grgmail-smtp"><h3>Webmail SMTP Server Settings</h3>'+
     '<label>SMTP hostname<input name="smtp_host" required maxlength="253" placeholder="mail.yourcompany.com" value="'+esc(smtp.host||'')+'"></label>'+
     '<label>SMTP SSL / TLS port<select name="smtp_port">'+[[465,'465 — SSL (recommended)'],[2525,'2525 — alternate STARTTLS'],[2587,'2587 — alternate STARTTLS']].map(([p,t])=>opt(String(p),t,String(smtp.port||465))).join('')+'</select></label>'+
     '<label>SMTP username (mailbox login)<input name="smtp_user" required maxlength="254" autocomplete="username" placeholder="sales@company.com" value="'+esc(smtp.user||'')+'"></label>'+
     '<label>SMTP password / app password<input name="smtp_password" type="password" autocomplete="new-password" placeholder="'+(smtp.password_saved?'Saved — leave blank to keep existing':'Enter mailbox password or app password')+'" '+(smtp.password_saved?'':'required')+' maxlength="1000"></label>'+
     '<label>From email address<input name="sender_email" required type="email" placeholder="sales@company.com" value="'+esc(smtp.sender_email||'')+'"></label>'+
     '<label>Sender display name<input name="sender_name" maxlength="100" placeholder="GreenRich Sales Team" value="'+esc(smtp.sender_name||'')+'"></label>'+
     '<div class="grgmail-actions"><button type="submit">Save SMTP Details</button><button type="button" id="grgmail-test" '+(smtp.password_saved?'':'disabled')+'>Test SMTP Connection</button></div></form>';
   }else{
    fields='<form id="grgmail-api"><h3>Email API Connection — Resend</h3>'+
     '<label>Verified sending domain<input name="resend_domain" required placeholder="yourcompany.com" value="'+esc(api.domain||'')+'"></label>'+
     '<label>From email address<input type="email" name="sender_email" required placeholder="sales@yourcompany.com" value="'+esc(api.sender_email||'')+'"></label>'+
     '<label>Sender display name<input name="sender_name" maxlength="100" placeholder="GreenRich Sales" value="'+esc(api.sender_name||'')+'"></label>'+
     '<label>Resend API Key<input type="password" autocomplete="new-password" name="resend_api_key" '+(api.api_key_saved?'':'required')+' placeholder="'+(api.api_key_saved?'Saved — blank keeps existing':'re_…')+'"></label>'+
     '<div class="grgmail-actions"><button type="submit">Save Email API Details</button><button type="button" id="grgmail-test" '+(api.api_key_saved?'':'disabled')+'>Test API Connection</button></div></form>';
   }
   return '<div class="panel grgmail-settings">'+intro+
    '<label>Company<select id="grgmail-company">'+companies.map(c=>opt(c,companyNames?.[c]||c,company)).join('')+'</select></label>'+
    '<label>Connection type<select id="grgmail-provider">'+options.map(x=>opt(x[0],x[1],provider)).join('')+'</select></label>'+
    '<div class="grgmail-connection"><strong>Active company sender:</strong> '+esc(data.transport==='gmail'?(gmail.sender_email||'Not connected'):(connection.sender_email||'Not connected'))+
     '<br><strong>Active transport:</strong> '+esc(data.transport||'gmail')+
     ' · <strong>Status:</strong> '+(ready?'<span class="grmail-success">Ready</span>':'<span class="grmail-alert">Not connected</span>')+
     (provider!==(data.transport||'gmail')?'<br><small>You are editing a different connection type. Saving makes it the active company sender.</small>':'')+'</div>'+
    (!configured?'<div class="grmail-alert"><b>One-time backend encryption key required.</b> In Supabase → Edge Functions → Secrets, set <code>GR_GMAIL_TOKEN_KEY_B64</code> to the Base64 output of <code>openssl rand -base64 32</code>. Keep it private; never paste it here.</div>':'')+
    fields+help(provider,configured)+
    '<div class="grgmail-guide"><h3>Safety & email history</h3><p>Use a mailbox owned by the selected company. Passwords, OAuth secrets and API keys are encrypted on the server. Employees use the configured sender in Customer 360, Lead 360 or Quotations. Sent messages are logged; Gmail/SMTP/API providers have separate quotas and sending limits.</p><p>After configuration, send a test email to your own mailbox and check recipient inbox and CRM history. A successful SMTP connection test alone does not guarantee delivery.</p><p><a href="'+esc(uri)+'" target="_blank" rel="noopener noreferrer">Supabase Edge Function Secrets (one-time Admin setup)</a></p></div></div>';
  };
  const showError=error=>{
   root.innerHTML='<div class="panel grgmail-settings">'+intro+'<div class="grmail-alert"><b>Connection error:</b> '+esc(error.message)+'</div>'+
   '<p>This may be a network/CORS problem, a missing Supabase function, or an expired login session. No credentials have been saved.</p><button type="button" id="grgmail-retry">Retry Connection</button>'+
   '<div class="grgmail-guide"><h3>Setup reference</h3><p>Gmail → Google Cloud OAuth. Webmail → SMTP SSL 465. Email API → Resend verified domain and key.</p></div></div>';
   root.querySelector('#grgmail-retry').onclick=()=>void draw();
  };
  async function draw(){
   root.innerHTML='<div class="panel">Loading company email connections…</div>';
   try{
    const data=await call({action:'status'});
    if(!options.some(x=>x[0]===provider))provider=data.transport||'gmail';
    root.innerHTML=section(data);
    root.querySelector('#grgmail-company').onchange=e=>{company=e.target.value;provider='gmail';void draw()};
    root.querySelector('#grgmail-provider').onchange=e=>{provider=e.target.value;root.innerHTML=section(data);wire(data)};
    wire(data);
   }catch(e){showError(e)}
  }
  const save=async payload=>{
   if(busy)return;
   busy=true;
   try{
    const reply=await call(payload);
    notify?.('Company mail settings saved securely. '+(payload.transport==='gmail'?'Connect the Gmail account to authorize it.':'Use Test Connection before sending.'));
    await draw();return reply;
   }catch(e){notify?.(e.message,'error')}finally{busy=false}
  };
  function wire(data){
   root.querySelector('#grgmail-company').onchange=e=>{company=e.target.value;provider='gmail';void draw()};
   root.querySelector('#grgmail-provider').onchange=e=>{provider=e.target.value;root.innerHTML=section(data);wire(data)};
   const copy=root.querySelector('#grgmail-copy');
   if(copy)copy.onclick=()=>navigator.clipboard?.writeText(redirect).then(()=>notify?.('Google OAuth callback URL copied')).catch(()=>{});
   const oauth=root.querySelector('#grgmail-oauth');
   if(oauth)oauth.onsubmit=e=>{e.preventDefault();const f=new FormData(oauth);void save({action:'configure',client_id:f.get('client_id'),client_secret:f.get('client_secret')})};
   const smtp=root.querySelector('#grgmail-smtp');
   if(smtp)smtp.onsubmit=e=>{e.preventDefault();const f=new FormData(smtp);void save({action:'configure_transport',transport:'smtp',smtp_host:f.get('smtp_host'),smtp_port:Number(f.get('smtp_port')),smtp_user:f.get('smtp_user'),smtp_password:f.get('smtp_password'),sender_email:f.get('sender_email'),sender_name:f.get('sender_name')})};
   const api=root.querySelector('#grgmail-api');
   if(api)api.onsubmit=e=>{e.preventDefault();const f=new FormData(api);void save({action:'configure_transport',transport:'resend',resend_domain:f.get('resend_domain'),resend_api_key:f.get('resend_api_key'),sender_email:f.get('sender_email'),sender_name:f.get('sender_name')})};
   const connect=root.querySelector('#grgmail-connect');
   if(connect)connect.onclick=async()=>{try{const {authorize_url}=await call({action:'connect'});window.location.assign(authorize_url)}catch(e){notify?.(e.message,'error')}};
   const add=root.querySelector('#grgmail-add-account');
   if(add)add.onclick=async()=>{try{
     const {authorize_url}=await call({action:'connect_account'});
     window.location.assign(authorize_url);
   }catch(e){notify?.(e.message,'error')}};
   root.querySelectorAll('[data-grgmail-remove-account]').forEach(b=>b.onclick=async()=>{
     if(!window.confirm('Disconnect '+b.closest('.grgmail-account')?.querySelector('strong')?.textContent+' from this company?'))return;
     try{await call({action:'disconnect_account',account_id:b.dataset.grgmailRemoveAccount});notify?.('Additional Gmail disconnected');await draw()}
     catch(e){notify?.(e.message,'error')}
   });
   const disconnect=root.querySelector('#grgmail-disconnect');
   if(disconnect)disconnect.onclick=async()=>{if(!window.confirm('Disconnect this company Gmail account?'))return;try{await call({action:'disconnect'});notify?.('Gmail disconnected');await draw()}catch(e){notify?.(e.message,'error')}};
   const test=root.querySelector('#grgmail-test');
   if(test)test.onclick=async()=>{test.disabled=true;test.textContent='Testing…';try{const response=await call({action:'test_transport'});notify?.(response.message);await draw()}catch(e){notify?.(e.message,'error');test.disabled=false;test.textContent='Test Connection'}};
  }
  await draw();
 }
 window.GreenRichGmailSettings={mount};
})();