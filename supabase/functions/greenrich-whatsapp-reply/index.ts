// GREENRICH ONE: guarded one-to-one WhatsApp reply through Workaxis/SocialBerries.
// Caller-controlled phone numbers, provider URLs and credentials are never trusted.
// A 24-hour incoming customer message is required for free-form replies.
// Provider acceptance is NOT WhatsApp delivery. Do not retry uncertain sends.
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
const ORIGIN="https://maheshgreenrich.github.io";
const headers={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const out=(code:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status:code,headers});
const env=(key:string)=>Deno.env.get(key)?.trim()||"";
const uuid=(x:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const normalize=(value:unknown)=>{const s=String(value||"").replace(/[\s()+-]/g,"");return /^[6-9]\d{9}$/.test(s)?"91"+s:/^91[6-9]\d{9}$/.test(s)?s:""};
const keys=(privileged=false)=>{const x=env(privileged?"SUPABASE_SERVICE_ROLE_KEY":"SUPABASE_ANON_KEY");if(x)return x;try{return String(JSON.parse(env(privileged?"SUPABASE_SECRET_KEYS":"SUPABASE_PUBLISHABLE_KEYS")).default||"")}catch{return ""}};
const prefixes:Record<string,string>={"grow-india:1":"SB_GROW_INDIA_SLOT1","grow-india:2":"SB_GROW_INDIA_SLOT2","enviro-solutions:1":"SB_ENVIRO_SOLUTIONS_SLOT1","enviro-solutions:2":"SB_ENVIRO_SOLUTIONS_SLOT2"};
function providerSettings(company:string,slot:number){
 const prefix=prefixes[company+":"+slot];if(!prefix)return null;
 const host=company==="grow-india"&&slot===1?"https://api.antcrm.co":env(prefix+"_BASE_URL");
 const version=company==="grow-india"&&slot===1?"v1":env(prefix+"_API_VERSION")||"v1";
 const user=env(prefix+"_BASIC_USERNAME"),pass=env(prefix+"_BASIC_PASSWORD");
 if(!user||!pass||!/^v[0-9]+$/.test(version))return null;
 try{const u=new URL(host);if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
  /^(127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)||u.hostname==="localhost")return null;
  return {root:u.origin+u.pathname.replace(/\/+$/,"")+"/api/"+version+"/whatsapp/messages/",auth:"Basic "+btoa(user+":"+pass)};
 }catch{return null}
}
function extractRecords(raw:any){
 if(raw?.error===true||raw?.success===false)return null;
 const data=raw?.data;
 const objects=[data,data?.data];
 for(const v of objects){
  if(Array.isArray(v))return v;
  for(const list of [v?.results,v?.messages,v?.data])if(Array.isArray(list))return list;
 }
 return null;
}
async function inWindow(cfg:{root:string,auth:string},phone:string){
 const u=new URL(cfg.root);u.searchParams.set("phone_number",phone);u.searchParams.set("page","1");u.searchParams.set("limit","50");
 const response=await fetch(u,{method:"GET",headers:{Authorization:cfg.auth,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error("Cannot verify the WhatsApp customer-service window (provider HTTP "+response.status+")");
 const text=await response.text();if(text.length>500000)throw Error("History response too large");
 const list=extractRecords(JSON.parse(text));
 if(!list)throw Error("Cannot verify incoming-message history; do not send outside the 24-hour window");
 const now=Date.now(),cutoff=now-24*60*60*1000;
 return list.some((x:any)=>{
  const sender=normalize(x?.sender),stamp=Date.parse(String(x?.created_on||x?.created_at||x?.timestamp||""));
  return sender===phone&&Number.isFinite(stamp)&&stamp>=cutoff&&stamp<=now+60000&&stamp<=now;
 });
}
const formats:Record<string,string[]>={
 image:["image/jpeg","image/png"],video:["video/mp4"],audio:["audio/mpeg","audio/mp4","audio/ogg"],
 document:["application/pdf","text/plain","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
};
Deno.serve(async(request:Request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="POST")return out(405,{ok:false,error:"Method not allowed"});
 let recordId="";
 try{
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token||!env("SUPABASE_URL")||!keys()||!keys(true))return out(401,{ok:false,error:"Signed-in CRM session required"});
  const userDb=createClient(env("SUPABASE_URL"),keys(),{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+token}}});
  const me=await userDb.auth.getUser(token);
  if(me.error||!me.data.user)return out(401,{ok:false,error:"Session expired"});
  // Do not process browser-supplied provider host/auth.
  const contentType=request.headers.get("content-type")||"";
  if(!contentType.startsWith("multipart/form-data"))return out(415,{ok:false,error:"Multipart form required"});
  const length=Number(request.headers.get("content-length")||"0");
  if(length>9*1024*1024)return out(413,{ok:false,error:"Attachment is too large (8 MB maximum)"});
  const form=await request.formData();
  const connectionId=String(form.get("connection_id")||"");
  const customerKey=String(form.get("customer_key")||"");
  const phone=normalize(form.get("phone_number"));
  const requestId=String(form.get("request_id")||"");
  const text=String(form.get("message_text")||"").trim();
  const kind=String(form.get("type")||"text");
  const file=form.get("attachment");
  if(!uuid(connectionId)||!uuid(requestId)||!phone)return out(400,{ok:false,error:"Valid provider, message ID and customer mobile are required"});
  if(!["text","image","video","audio","document"].includes(kind))return out(400,{ok:false,error:"Unsupported message type"});
  if(!text||text.length>4096)return out(400,{ok:false,error:"Enter a message or media caption (required by SocialBerries), maximum 4096 characters"});
  if(kind==="text"&&file instanceof File)return out(400,{ok:false,error:"Text messages cannot include an attachment"});
  if(kind!=="text"&&!(file instanceof File))return out(400,{ok:false,error:"Choose the attachment first"});
  if(file instanceof File&&(file.size===0||file.size>8*1024*1024||!formats[kind]?.includes(file.type)))
   return out(400,{ok:false,error:"Invalid attachment type or size (maximum 8 MB)"});
  if(file instanceof File&&!/^[\w(). -]{1,120}$/.test(file.name))
   return out(400,{ok:false,error:"Please rename the file using letters, numbers and simple punctuation"});
  const connection=await userDb.from("gr_wa_connections").select("id,company_id,slot,provider,enabled,setup_state,sender_phone").eq("id",connectionId).maybeSingle();
  if(connection.error||!connection.data||connection.data.provider!=="socialberries")
   return out(404,{ok:false,error:"Saved SocialBerries sender not found"});
  const c=connection.data;
  const admin=await userDb.rpc("gr_wa_admin",{p_company:c.company_id});
  if(admin.error||admin.data!==true)return out(403,{ok:false,error:"Only authorized company administrators can send messages"});
  if(!c.enabled||c.setup_state!=="verified")return out(422,{ok:false,error:"Verify and enable the selected SocialBerries sender"});
  const server=createClient(env("SUPABASE_URL"),keys(true),{auth:{persistSession:false,autoRefreshToken:false}});
  // Recheck the exact CRM recipient server-side. Never trust user-chosen phone.
  let valid=false;
  if(customerKey.startsWith("L:"+c.company_id+":")){
   const leadId=customerKey.slice(("L:"+c.company_id+":").length);
   const lead=await server.from("gr_lead_pipeline").select("mobile").eq("company_id",c.company_id).eq("lead_id",leadId).maybeSingle();
   if(lead.error)return out(500,{ok:false,error:"Could not verify CRM lead"});
   valid=normalize(lead.data?.mobile)===phone;
  }else if(/^C:[0-9a-f-]{36}$/i.test(customerKey)){
   const customer=await server.from("gr_crm_customers").select("mobile,mobile2").eq("id",customerKey.slice(2)).maybeSingle();
   if(customer.error)return out(500,{ok:false,error:"Could not verify CRM customer"});
   valid=[customer.data?.mobile,customer.data?.mobile2].some(v=>normalize(v)===phone);
  }
  if(!valid)return out(403,{ok:false,error:"Recipient must match an existing company-associated CRM contact"});
  const cfg=providerSettings(c.company_id,c.slot);
  if(!cfg)return out(422,{ok:false,error:"SocialBerries Basic Auth is not configured on the server"});
  // Never use local CRM timestamps as sufficient proof of an open 24-hour window.
  let allowed=false;
  try{allowed=await inWindow(cfg,phone)}
  catch(e){return out(422,{ok:false,error:String(e instanceof Error?e.message:"Could not verify the customer-service window")})}
  if(!allowed)return out(422,{ok:false,error:"No verified incoming customer message in the past 24 hours. Use an approved WhatsApp template instead."});
  // Claim request UUID before attempting delivery to guard double-click/retries.
  recordId=requestId;
  const claim=await server.from("gr_wa_messages").insert({
   id:requestId,company_id:c.company_id,connection_id:c.id,
   direction:"outbound",phone,body:kind==="text"?text:("["+kind+" attachment] "+text).slice(0,4096),
   delivery_status:"queued"
  }).select("id").single();
  if(claim.error)return out(409,{ok:false,error:"This message was already submitted or could not be claimed. Check chat history before retrying."});
  let providerResponse:Response;
  try{
   const url=new URL(cfg.root);url.searchParams.set("phone_number",phone);
   let body:BodyInit;const headers:Record<string,string>={Authorization:cfg.auth,Accept:"application/json"};
   if(kind==="text"){headers["Content-Type"]="application/json";body=JSON.stringify({type:"text",message_text:text})}
   else{
    const formBody=new FormData();formBody.set("type",kind);formBody.set("message_text",text);
    formBody.set("attachment",file as File,(file as File).name);body=formBody;
   }
   providerResponse=await fetch(url,{method:"POST",headers,body,redirect:"error",signal:AbortSignal.timeout(20000)});
  }catch{
   await server.from("gr_wa_messages").update({delivery_status:"queued",provider_error_code:"UNCERTAIN_PROVIDER_TIMEOUT",
    provider_error_message:"Request outcome unknown. Check provider history before retrying."}).eq("id",recordId);
   return out(502,{ok:false,uncertain:true,error:"SocialBerries response was not received. Message may have been submitted; check history before retrying."});
  }
  const raw=await providerResponse.text();
  let parsed:any=null;try{if(raw.length<=120000)parsed=JSON.parse(raw)}catch{}
  const d=parsed?.data||{};
  const mid=String(d.message_id||d.data?.messages?.[0]?.id||parsed?.message_id||"").slice(0,180);
  const rejected=!providerResponse.ok||parsed?.error===true||parsed?.success===false||["failed","rejected"].includes(String(d.status||"").toLowerCase());
  const status=rejected?"failed":mid?"queued":"queued";
  await server.from("gr_wa_messages").update({delivery_status:status,provider_message_id:mid||null,
    provider_error_code:rejected?("HTTP_"+providerResponse.status):mid?null:"ACCEPTANCE_UNCONFIRMED",
    provider_error_message:rejected?"Provider rejected message request":mid?null:"Provider did not return a WhatsApp message ID"
   }).eq("id",recordId).eq("company_id",c.company_id);
  if(rejected)return out(422,{ok:false,request_id:recordId,error:"SocialBerries rejected the message request (HTTP "+providerResponse.status+")"});
  return out(200,{ok:true,request_id:recordId,provider_message_id:mid||null,
   status:mid?"accepted_by_provider":"acceptance_unconfirmed",
   message:mid?"Provider accepted the request; delivery is not yet confirmed":"Provider response did not provide a WhatsApp message ID; confirm in SocialBerries before retrying."});
 }catch{
  return out(500,{ok:false,request_id:recordId||null,error:"Unable to complete secure WhatsApp reply. If sending started, check provider chat history before retrying."});
 }
});
