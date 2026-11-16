// GreenRich ONE company Gmail OAuth + quotation PDF mail service.
// Public OAuth callback is protected by one-time DB nonce, PKCE and stored initiator.
// Every other operation verifies the Supabase user access token and company permission.
// Never place OAuth credentials or service keys in public GitHub Pages files.
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import nodemailer from 'npm:nodemailer@7.0.10';

const ORIGIN = 'https://maheshgreenrich.github.io';
const HOME = ORIGIN + '/GREENRICH-CRM/secure.html';
const cors = {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
const json = (data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const secret = (key:string)=>Deno.env.get(key)||'';
const url = secret('SUPABASE_URL');
const serviceKey=secret('SUPABASE_SERVICE_ROLE_KEY');
const client=()=>createClient(url,serviceKey,{auth:{persistSession:false}});
const uuid=()=>crypto.randomUUID();
const bytes=(v:string)=>new TextEncoder().encode(v);
const b64=(v:Uint8Array)=>btoa(Array.from(v,c=>String.fromCharCode(c)).join(''));
const unb64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const b64url=(v:Uint8Array)=>b64(v).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const random=()=>b64url(crypto.getRandomValues(new Uint8Array(32)));
const digest=async(v:Uint8Array)=>new Uint8Array(await crypto.subtle.digest('SHA-256',v));
const googleRedirect=()=>url+'/functions/v1/greenrich-quotation-gmail';
const plain=(v:unknown,max=300)=>String(v??'').trim().slice(0,max);
const validEmail=(s:string)=>/^[^\s@<>,"\r\n]+@[^\s@<>,"\r\n]+\.[^\s@<>,"\r\n]+$/.test(s)&&s.length<=254;
const parseEmail=(v:unknown)=>Array.isArray(v)?v.map(x=>plain(x,254)):String(v||'').split(/[;,]/).map(x=>x.trim()).filter(Boolean);
const statusMsg=(x:any)=>x?.message||x?.error_description||x?.error||'External service error';
const fail=(message:string,status=400)=>json({error:message},status);
const requireSetup=()=>{if(!secret('GR_GMAIL_TOKEN_KEY_B64')||!url||!serviceKey)throw Error('Admin setup required: Gmail encryption key is not configured in Supabase')};
const aesKey=async()=>{
 const input=unb64(secret('GR_GMAIL_TOKEN_KEY_B64'));
 if(input.length!==32)throw Error('GR_GMAIL_TOKEN_KEY_B64 must be a 32-byte AES key');
 return crypto.subtle.importKey('raw',input,{name:'AES-GCM'},false,['encrypt','decrypt']);
};
const encrypt=async(value:string)=>{
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(),bytes(value)));
 return b64(iv)+'.'+b64(cipher);
};
const decrypt=async(value:string)=>{
 const [nonce,cipher]=value.split('.');
 const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(nonce)},await aesKey(),unb64(cipher));
 return new TextDecoder().decode(clear);
};
async function actor(req:Request){
 const bearer=req.headers.get('Authorization')||'';
 if(!bearer.startsWith('Bearer '))throw Error('Sign in to GreenRich CRM');
 const db=client();
 const {data,error}=await db.auth.getUser(bearer.slice(7));
 if(error||!data.user)throw Error('Invalid login session');
 const {data:profile,error:pe}=await db.from('gr_profiles').select('id,active,company_ids,role_id').eq('id',data.user.id).single();
 if(pe||!profile?.active)throw Error('Active employee profile required');
 return {db,profile,user:data.user};
}
async function allowed(db:any,profile:any,company:string,action:'send'|'admin'|'view'|'send_customer'|'send_lead'){
 if(!profile.company_ids?.includes(company))throw Error('Company access denied');
 if(action==='admin'){
  const {data}=await db.rpc('gr_field_is_admin',{p_company:company});
  // The RPC is called by a service key and must NOT be relied on for the acting user.
  const {data:role}=await db.from('gr_roles').select('name').eq('id',profile.role_id).single();
  if(role?.name!=='Admin')throw Error('Only Admin can configure company Gmail');
  return;
 }
 const {data:role}=await db.from('gr_roles').select('name').eq('id',profile.role_id).single();
 if(role?.name==='Admin')return;
 const modules=action==='view'?['sales','orders','customers','leads']:action==='send_customer'?['customers']:action==='send_lead'?['leads']:['sales','orders'];
 const actions=action==='send'||action.startsWith('send_')?['create','edit']:['view'];
 const {data:grants}=await db.from('gr_role_permissions').select('allowed').eq('role_id',profile.role_id).in('module',modules).in('action',actions).eq('allowed',true).limit(1);
 if(!grants?.length)throw Error('Your role cannot '+(action==='send'?'send quotations':'view quotation documents'));
}
const callbackRedirect=(result:string)=>{
 const target=new URL(HOME);target.searchParams.set('gmail_connect',result);
 return Response.redirect(target.toString(),302);
};
async function oauthCredentials(db:any,company:string){
 requireSetup();
 const {data,error}=await db.from('gr_gmail_oauth_configs').select('client_id,encrypted_client_secret').eq('company_id',company).maybeSingle();
 if(error)throw error;
 if(data?.client_id&&data?.encrypted_client_secret)return {id:data.client_id,secret:await decrypt(data.encrypted_client_secret)};
 if(secret('GR_GMAIL_CLIENT_ID')&&secret('GR_GMAIL_CLIENT_SECRET'))return {id:secret('GR_GMAIL_CLIENT_ID'),secret:secret('GR_GMAIL_CLIENT_SECRET')};
 throw Error('Google OAuth Client ID and Client Secret are not configured for this company');
}
async function oauthStatus(db:any,company:string){
 const {data}=await db.from('gr_gmail_oauth_configs').select('client_id').eq('company_id',company).maybeSingle();
 return {configured:Boolean(secret('GR_GMAIL_TOKEN_KEY_B64')&&(data?.client_id||(secret('GR_GMAIL_CLIENT_ID')&&secret('GR_GMAIL_CLIENT_SECRET')))),client_id:data?.client_id||''};
}
async function callback(req:Request){
 const u=new URL(req.url),nonce=u.searchParams.get('state')||'',code=u.searchParams.get('code')||'';
 if(!/^[a-zA-Z0-9_-]{30,100}$/.test(nonce))return callbackRedirect('invalid_state');
 const db=client();
 const {data:state,error:se}=await db.from('gr_gmail_oauth_states').delete().eq('nonce',nonce).select('*').maybeSingle();
 if(se||!state||Date.parse(state.expires_at)<Date.now())return callbackRedirect('state_expired');
 if(!code||u.searchParams.has('error'))return callbackRedirect('not_authorized');
 try{
  const creds=await oauthCredentials(db,state.company_id);
  const payload=new URLSearchParams({
   code,client_id:creds.id,client_secret:creds.secret,
   redirect_uri:googleRedirect(),grant_type:'authorization_code',code_verifier:state.code_verifier
  });
  const exchange=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:payload});
  const token=await exchange.json();
  if(!exchange.ok||!token.refresh_token||!token.access_token)throw Error('Google did not return a refresh token; reconnect with consent');
  const info=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+token.access_token}});
  const sender=await info.json();
  if(!info.ok||!sender.email_verified||!validEmail(sender.email))throw Error('Verified Gmail address unavailable');
  const encrypted=await encrypt(token.refresh_token);
  const one=await db.from('gr_gmail_private_tokens').upsert({company_id:state.company_id,encrypted_refresh_token:encrypted,updated_at:new Date().toISOString()});
  if(one.error)throw one.error;
  const two=await db.from('gr_gmail_connections').upsert({
   company_id:state.company_id,sender_email:sender.email,status:'connected',
   connected_at:new Date().toISOString(),connected_by:state.initiated_by,updated_at:new Date().toISOString()
  });
  if(two.error)throw two.error;
  return callbackRedirect('connected');
 }catch(error){console.error('Gmail OAuth callback failed',String(error));return callbackRedirect('failed')}
}
async function createAuthorizeUrl(db:any,profile:any,company:string){
 await allowed(db,profile,company,'admin');
 const creds=await oauthCredentials(db,company);
 const state=random(),verifier=random(),challenge=b64url(await digest(bytes(verifier)));
 const {error}=await db.from('gr_gmail_oauth_states').insert({
  nonce:state,company_id:company,initiated_by:profile.id,code_verifier:verifier,
  expires_at:new Date(Date.now()+10*60*1000).toISOString()
 });
 if(error)throw error;
 const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [k,v] of Object.entries({
  client_id:creds.id,redirect_uri:googleRedirect(),response_type:'code',
  scope:'openid email https://www.googleapis.com/auth/gmail.send',
  access_type:'offline',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256'
 }))target.searchParams.set(k,v);
 return target.toString();
}
async function getAccessToken(db:any,company:string){
 const creds=await oauthCredentials(db,company);
 const {data:token,error}=await db.from('gr_gmail_private_tokens').select('encrypted_refresh_token').eq('company_id',company).maybeSingle();
 if(error||!token)throw Error('Company Gmail is not connected');
 const refresh=await decrypt(token.encrypted_refresh_token);
 const response=await fetch('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({client_id:creds.id,client_secret:creds.secret,
   refresh_token:refresh,grant_type:'refresh_token'})
 });
 const result=await response.json();
 if(!response.ok||!result.access_token)throw Error('Gmail authorization expired. Ask Admin to reconnect');
 return result.access_token as string;
}
async function configureOAuth(db:any,profile:any,company:string,payload:any){
 await allowed(db,profile,company,'admin');requireSetup();
 const id=plain(payload.client_id,350),clientSecret=plain(payload.client_secret,800);
 if(!id.endsWith('.apps.googleusercontent.com')||!clientSecret||clientSecret.length<8)throw Error('Enter a valid Google OAuth Web Client ID and Client Secret');
 const encrypted=await encrypt(clientSecret);
 const {error}=await db.from('gr_gmail_oauth_configs').upsert({
  company_id:company,client_id:id,encrypted_client_secret:encrypted,updated_by:profile.id,updated_at:new Date().toISOString()
 });
 if(error)throw error;
 await db.from('gr_gmail_private_tokens').delete().eq('company_id',company);
 await db.from('gr_gmail_connections').update({status:'needs_reconnect',updated_at:new Date().toISOString()}).eq('company_id',company);
 return {configured:true,client_id:id,status:'needs_reconnect'};
}
function contactMime(from:string,to:string,subject:string,body:string){
 const lines=['From: '+header(from),'To: '+header(to),
 'Subject: =?UTF-8?B?'+b64(bytes(subject))+'?=',
 'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8',
 'Content-Transfer-Encoding: base64','',b64(bytes(body)),''];
 return b64url(bytes(lines.join('\r\n')));
}
async function sendContact(db:any,profile:any,payload:any){
 const company=plain(payload.company_id,50);
 const kind=plain(payload.contact_type,15),id=plain(payload.contact_id,100);
 if(!['customer','lead'].includes(kind)||!id)throw Error('Customer or lead reference required');
 await allowed(db,profile,company,kind==='customer'?'send_customer':'send_lead');
 const recipient=plain(payload.to,254),subject=plain(payload.subject,200),body=plain(payload.body,10000),key=plain(payload.request_key,60);
 if(!validEmail(recipient)||!subject||!body||!/^[0-9a-f-]{36}$/i.test(key))throw Error('Valid email, subject, body and request ID required');
 if(kind==='customer'){
  const {data}=await db.from('gr_crm_customers').select('id,email').eq('id',id).maybeSingle();
  if(!data||String(data.email||'').toLowerCase()!==recipient.toLowerCase())throw Error('Recipient must match the linked customer email');
 }else{
  const {data}=await db.from('gr_lead_pipeline').select('lead_id,email,company_id').eq('lead_id',id).eq('company_id',company).maybeSingle();
  if(!data||String(data.email||'').toLowerCase()!==recipient.toLowerCase())throw Error('Recipient must match the linked lead email');
 }
 const transport=await transportStatus(db,company);
 if(!transport.ready)throw Error('Company email sender is not connected. Configure it in Settings.');
 const logged=await db.from('gr_contact_email_history').insert({
  company_id:company,request_key:key,recipient,subject,body,contact_type:kind,contact_id:id,
  sender_email:transport.connection.sender_email,transport:transport.transport,sent_by:profile.id
 }).select('id').single();
 if(logged.error){if(logged.error.code==='23505')throw Error('This send has already been requested; check history');throw logged.error}
 const rowId=logged.data.id;
 try{
  const result=await deliverMail(db,company,[recipient],[],subject,body);
  const saved=await db.from('gr_contact_email_history').update({
   status:'sent',transport:result.transport,gmail_message_id:result.id||null,sent_at:new Date().toISOString()
  }).eq('id',rowId);
  if(saved.error)throw Error('Email provider accepted the message, but history update failed; do not resend');
  return {status:'sent',history_id:rowId,gmail_message_id:result.id};
 }catch(error){
  const {data:entry}=await db.from('gr_contact_email_history').select('status').eq('id',rowId).single();
  if(entry?.status==='sending')await db.from('gr_contact_email_history').update({
   status:'needs_review',failure_reason:'Uncertain provider outcome; check sender account before retrying'
  }).eq('id',rowId);
  throw error;
 }
}

/** Non-Gmail mail transport; credentials remain only in server-owned rows. */
async function transportConfig(db:any,company:string){
 const {data,error}=await db.from('gr_mail_transport_configs').select('*').eq('company_id',company).maybeSingle();
 if(error)throw error;
 return data;
}
async function transportStatus(db:any,company:string){
 const config=await transportConfig(db,company);
 const {data:gmail}=await db.from('gr_gmail_connections').select('status,sender_email,connected_at').eq('company_id',company).maybeSingle();
 const chosen=config?.transport||'gmail';
 const gmailReady=gmail?.status==='connected';
 const externalReady=!!config&&config.status==='verified';
 const active=chosen==='gmail'?gmailReady:externalReady;
 return {
  transport:chosen,
  ready:active,
  connection:chosen==='gmail'
   ?gmail||{status:'disconnected',sender_email:''}
   :{status:active?'connected':'disconnected',sender_email:config?.sender_email||'',connected_at:config?.verified_at||null},
  gmail_connection:gmail||{status:'disconnected',sender_email:''},
  smtp:{
   host:config?.smtp_host||'',port:config?.smtp_port||465,user:config?.smtp_user||'',
   sender_email:config?.sender_email||'',sender_name:config?.sender_name||'',
   status:chosen==='smtp'?config?.status||'not_configured':'not_configured',
   password_saved:!!config?.encrypted_smtp_password
  },
  resend:{
   sender_email:config?.sender_email||'',sender_name:config?.sender_name||'',
   domain:config?.resend_domain||'',api_key_saved:!!config?.encrypted_resend_api_key,
   status:chosen==='resend'?config?.status||'not_configured':'not_configured'
  }
 };
}
function validateSmtpHost(host:string){
 const name=host.trim().toLowerCase();
 // Disallow internal URLs/IP literals and private-address SSRF through SMTP.
 if(!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name)||
   name.endsWith('.local')||name.endsWith('.internal')||name.endsWith('.localhost'))
  throw Error('Use the public SMTP hostname supplied by your email provider, such as mail.example.com');
 return name;
}
async function configureTransport(db:any,profile:any,company:string,payload:any){
 await allowed(db,profile,company,'admin');
 const transport=plain(payload.transport,15);
 if(!['gmail','smtp','resend'].includes(transport))throw Error('Choose Gmail, Webmail SMTP, or Email API');
 const previous=await transportConfig(db,company);
 const config:any={company_id:company,transport,updated_by:profile.id,updated_at:new Date().toISOString(),status:'not_configured',verified_at:null};
 if(transport==='smtp'){
  requireSetup();
  const host=validateSmtpHost(plain(payload.smtp_host,253));
  const port=Number(payload.smtp_port);
  if(![465,2525,2587].includes(port))throw Error('Use SMTP TLS port 465, or a provider-supported alternate port 2525/2587. Ports 25/587 are blocked.');
  const user=plain(payload.smtp_user,254),sender=plain(payload.sender_email,254),name=plain(payload.sender_name,100);
  if(!user||!validEmail(sender))throw Error('SMTP username and valid From email address required');
  const password=String(payload.smtp_password||'');
  let encrypted=previous?.encrypted_smtp_password;
  if(password){
   if(password.length>1000)throw Error('SMTP password is too long');
   encrypted=await encrypt(password);
  }
  if(!encrypted)throw Error('Enter the SMTP mailbox password or app password');
  Object.assign(config,{smtp_host:host,smtp_port:port,smtp_user:user,sender_email:sender,sender_name:name,
   encrypted_smtp_password:encrypted,status:'configured'});
 }else if(transport==='resend'){
  requireSetup();
  const from=plain(payload.sender_email,254),name=plain(payload.sender_name,100),domain=plain(payload.resend_domain,150).toLowerCase();
  if(!validEmail(from)||!domain||!from.toLowerCase().endsWith('@'+domain))
   throw Error('Choose a sender address on your verified API sending domain');
  const key=String(payload.resend_api_key||'');
  let encrypted=previous?.encrypted_resend_api_key;
  if(key){if(!/^re_[A-Za-z0-9_-]{10,}$/.test(key))throw Error('Invalid email API key');encrypted=await encrypt(key)}
  if(!encrypted)throw Error('Enter your email provider API key');
  Object.assign(config,{resend_domain:domain,sender_email:from,sender_name:name,
   encrypted_resend_api_key:encrypted,status:'configured'});
 }else{
  const {data:gmail}=await db.from('gr_gmail_connections').select('status').eq('company_id',company).maybeSingle();
  config.status=gmail?.status==='connected'?'verified':'not_configured';
 }
 const {error}=await db.from('gr_mail_transport_configs').upsert(config,{onConflict:'company_id'});
 if(error)throw error;
 return {saved:true,transport,status:config.status};
}
function smtpClient(config:any,password:string){
 return nodemailer.createTransport({
  host:config.smtp_host,port:config.smtp_port,secure:config.smtp_port===465,
  requireTLS:config.smtp_port!==465,
  auth:{user:config.smtp_user,pass:password},
  tls:{rejectUnauthorized:true,servername:config.smtp_host},
  connectionTimeout:13000,greetingTimeout:12000,socketTimeout:15000,
  pool:false,disableFileAccess:true,disableUrlAccess:true
 });
}
async function testTransport(db:any,profile:any,company:string){
 await allowed(db,profile,company,'admin');
 const config=await transportConfig(db,company);
 if(!config||config.transport==='gmail')throw Error('For Gmail, use Google Connect / Reconnect instead of SMTP test');
 if(config.transport==='smtp'){
  validateSmtpHost(config.smtp_host);
  const smtp=smtpClient(config,await decrypt(config.encrypted_smtp_password));
  try{await smtp.verify()}catch(error){throw Error('SMTP connection failed. Check SSL port, hostname and mailbox/app password. '+String(error).slice(0,140))}
  finally{smtp.close()}
  const {error}=await db.from('gr_mail_transport_configs').update({status:'verified',verified_at:new Date().toISOString()}).eq('company_id',company);
  if(error)throw error;
  return {tested:true,transport:'smtp',message:'SMTP login and TLS connection verified. No email was sent.'};
 }
 const response=await fetch('https://api.resend.com/domains',{
  headers:{Authorization:'Bearer '+await decrypt(config.encrypted_resend_api_key)}
 });
 if(!response.ok)throw Error('Email API key verification failed (HTTP '+response.status+'). Check your API key and verified domain.');
 const domains=await response.json();
 const found=Array.isArray(domains.data)&&domains.data.some((item:any)=>String(item.name).toLowerCase()===config.resend_domain&&item.status==='verified');
 if(!found)throw Error('Email API domain is not verified. Verify your DNS records with the provider first.');
 await db.from('gr_mail_transport_configs').update({status:'verified',verified_at:new Date().toISOString()}).eq('company_id',company);
 return {tested:true,transport:'resend',message:'API key and verified domain confirmed. No email was sent.'};
}
async function deliverMail(db:any,company:string,to:string[],cc:string[],subject:string,body:string,pdf?:Uint8Array,pdfName?:string){
 const config=await transportConfig(db,company);
 const transport=config?.transport||'gmail';
 if(transport==='smtp'){
  if(!config?.encrypted_smtp_password||config.status!=='verified')throw Error('Test and verify company SMTP in Settings before sending');
  validateSmtpHost(config.smtp_host);
  const smtp=smtpClient(config,await decrypt(config.encrypted_smtp_password));
  try{
   const info=await smtp.sendMail({
    from:{name:config.sender_name||'',address:config.sender_email},
    to,cc,subject,text:body,
    ...(pdf?{attachments:[{filename:pdfName||'Quotation.pdf',content:pdf,contentType:'application/pdf'}]}:{})
   });
   return {id:info.messageId||null,threadId:null,transport:'smtp'};
  }finally{smtp.close()}
 }
 if(transport==='resend'){
  if(!config?.encrypted_resend_api_key||config.status!=='verified')throw Error('Test company email API and domain in Settings before sending');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{
   Authorization:'Bearer '+await decrypt(config.encrypted_resend_api_key),
   'Content-Type':'application/json'
  },body:JSON.stringify({
   from:(config.sender_name?config.sender_name.replace(/[<>\r\n]/g,'')+' <'+config.sender_email+'>':config.sender_email),
   to,cc,subject,text:body,
   ...(pdf?{attachments:[{filename:pdfName||'Quotation.pdf',content:b64(pdf)}]}:{})
  })});
  const out=await response.json().catch(()=>({}));
  if(!response.ok)throw Error('Email API rejected send (HTTP '+response.status+'): '+plain(out.message,140));
  return {id:out.id||null,threadId:null,transport:'resend'};
 }
 const {data:gmail}=await db.from('gr_gmail_connections').select('sender_email,status').eq('company_id',company).maybeSingle();
 if(gmail?.status!=='connected')throw Error('Gmail is not connected. Configure it in Settings.');
 const token=await getAccessToken(db,company);
 const raw=pdf?mime(gmail.sender_email,to,cc,subject,body,pdf,pdfName||'Quotation.pdf'):
 contactMime(gmail.sender_email,to[0],subject,body);
 const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({raw})
 });
 const out=await response.json().catch(()=>({}));
 if(!response.ok)throw Error('Gmail rejected send (HTTP '+response.status+'). Reconnect or review permissions.');
 return {id:out.id||null,threadId:out.threadId||null,transport:'gmail'};
}

const header=(value:string)=>value.replace(/[\r\n]/g,' ').replace(/[^\x20-\x7e]/g,' ').slice(0,450);
function mime(from:string,to:string[],cc:string[],subject:string,body:string,pdf:Uint8Array,name:string){
 const boundary='GRQ_'+random(),encodedSub='=?UTF-8?B?'+b64(bytes(subject))+'?=';
 const cleanName=name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
 const pdf64=b64(pdf).replace(/.{1,76}/g,'$&\r\n');
 const lines=[
  'From: '+header(from),'To: '+to.map(header).join(', '),
  ...(cc.length?['Cc: '+cc.map(header).join(', ')]:[]),
  'Subject: '+encodedSub,'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="'+boundary+'"',
  '','--'+boundary,'Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: base64',
  '',b64(bytes(body)),'--'+boundary,'Content-Type: application/pdf; name="'+cleanName+'"',
  'Content-Disposition: attachment; filename="'+cleanName+'"','Content-Transfer-Encoding: base64',
  '',pdf64,'--'+boundary+'--',''
 ];
 return b64url(bytes(lines.join('\r\n')));
}
async function send(db:any,profile:any,data:any){
 const company=plain(data.company_id,50),qid=plain(data.quotation_id,60),requestKey=plain(data.request_key,60);
 if(!/^[0-9a-f-]{36}$/i.test(qid)||!/^[0-9a-f-]{36}$/i.test(requestKey))throw Error('Valid quotation ID and send request ID required');
 await allowed(db,profile,company,'send');
 const to=parseEmail(data.to),cc=parseEmail(data.cc);
 if(!to.length||to.length>5||cc.length>5||[...to,...cc].some(x=>!validEmail(x)))throw Error('Provide valid recipient addresses (maximum 5 To and 5 CC)');
 const subject=plain(data.subject,200),message=plain(data.body,10000);
 if(!subject||!message)throw Error('Email subject and message are required');
 const {data:quote,error:qe}=await db.from('gr_quotations').select('id,company_id,customer_id,quotation_no,payload').eq('id',qid).eq('company_id',company).maybeSingle();
 if(qe||!quote)throw Error('Quotation not found in this company');
 const transport=await transportStatus(db,company);
 if(!transport.ready)throw Error('Company email sender is not connected. Configure it in Settings.');
 // validate PDF bytes before creating audit row. Browser sends base64 of finalized quotation PDF.
 const raw=plain(data.pdf_base64,14_000_000);
 if(!raw||raw.length>11_000_000||!/^[A-Za-z0-9+/=]+$/.test(raw))throw Error('Valid quotation PDF required (maximum 8 MB)');
 const pdf=unb64(raw);
 if(pdf.length<20||pdf.length>8_000_000||new TextDecoder().decode(pdf.slice(0,5))!=='%PDF-')throw Error('Attachment must be a PDF under 8 MB');
 const checksum=Array.from(await digest(pdf)).map(v=>v.toString(16).padStart(2,'0')).join('');
 const productIds=(quote.payload?.lines||[]).map((l:any)=>String(l.product_id||'')).filter(Boolean).slice(0,50);
 const first=await db.from('gr_quotation_email_history').insert({
  company_id:company,quotation_id:qid,customer_id:quote.customer_id,request_key:requestKey,
  sender_email:transport.connection.sender_email,transport:transport.transport,recipients:to,cc,subject,body:message,product_ids:productIds,
  pdf_sha256:checksum,pdf_bytes:pdf.length,status:'sending',sent_by:profile.id
 }).select('id').single();
 if(first.error){
  if(first.error.code==='23505')throw Error('This send request was already submitted. Check email history before resending');
  throw first.error;
 }
 const rowId=first.data.id,path=company+'/'+qid+'/'+rowId+'.pdf';
 const storage=await db.storage.from('gr-quotation-pdfs').upload(path,pdf,{contentType:'application/pdf',upsert:false});
 if(storage.error){
  await db.from('gr_quotation_email_history').update({status:'failed',failure_reason:'PDF archive failed'}).eq('id',rowId);
  throw Error('Could not archive the PDF. Email was not sent');
 }
 await db.from('gr_quotation_email_history').update({pdf_path:path}).eq('id',rowId);
 try{
  const response=await deliverMail(db,company,to,cc,subject,message,pdf,quote.quotation_no+'.pdf');
  // Gmail accepted the message. If DB update fails the audit stays "sending" for admin reconciliation.
  const upd=await db.from('gr_quotation_email_history').update({
   status:'sent',transport:response.transport,gmail_message_id:response.id||null,gmail_thread_id:response.threadId||null,
   sent_at:new Date().toISOString(),failure_reason:null
  }).eq('id',rowId);
  if(upd.error)throw Error('Email provider accepted the email, but audit finalization failed. Do not resend; ask Admin to reconcile');
  return {history_id:rowId,status:'sent',gmail_message_id:response.id};
 }catch(error){
  // A network error may mean Google accepted the email: never blindly retry it.
  const {data:row}=await db.from('gr_quotation_email_history').select('status').eq('id',rowId).single();
  if(row?.status==='sending')await db.from('gr_quotation_email_history').update({
   status:'needs_review',failure_reason:'Uncertain Gmail outcome; do not retry without checking Sent Mail'
  }).eq('id',rowId);
  throw error;
 }
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(new URL(req.url).searchParams.has('state')&&req.method==='GET')return callback(req);
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const {db,profile}=await actor(req);
  const payload=await req.json(),action=plain(payload.action,50),company=plain(payload.company_id,50);
  if(!company)return fail('Select company');
  if(action==='configure')return json(await configureOAuth(db,profile,company,payload));
  if(action==='configure_transport')return json(await configureTransport(db,profile,company,payload));
  if(action==='test_transport')return json(await testTransport(db,profile,company));
  if(action==='send_contact')return json(await sendContact(db,profile,payload));
  if(action==='connect')return json({authorize_url:await createAuthorizeUrl(db,profile,company)});
  if(action==='disconnect'){
   await allowed(db,profile,company,'admin');
   await db.from('gr_gmail_private_tokens').delete().eq('company_id',company);
   const result=await db.from('gr_gmail_connections').update({status:'disconnected',updated_at:new Date().toISOString()}).eq('company_id',company);
   if(result.error)throw result.error;
   return json({status:'disconnected'});
  }
  if(action==='status'){
   await allowed(db,profile,company,'view');
   const {data}=await db.from('gr_gmail_connections').select('status,sender_email,connected_at').eq('company_id',company).maybeSingle();
   return json({...await oauthStatus(db,company),...await transportStatus(db,company)});
  }
  if(action==='pdf_url'){
   await allowed(db,profile,company,'view');
   const {data:history}=await db.from('gr_quotation_email_history').select('pdf_path').eq('id',plain(payload.history_id,60)).eq('company_id',company).maybeSingle();
   if(!history?.pdf_path)throw Error('PDF not available');
   const {data,error}=await db.storage.from('gr-quotation-pdfs').createSignedUrl(history.pdf_path,90);
   if(error)throw error;
   return json({url:data.signedUrl});
  }
  if(action==='send')return json(await send(db,profile,payload));
  return fail('Unsupported operation',400);
 }catch(error){
  console.error('Quotation Gmail action',String(error));
  return fail(error instanceof Error?error.message:'Request failed',400);
 }
});
