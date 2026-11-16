// GreenRich ONE / SocialBerries read-only gateway.
// Deploy with JWT verification ON. No send/template mutation endpoints in this release.
// The user's screenshots document HTTP Basic username:password, not an API-key header.
// Confirm with SocialBerries whether their Developer API Key is accepted as Basic password.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const allowOrigin = "https://maheshgreenrich.github.io";
const cors = (request: Request) => ({
 "Access-Control-Allow-Origin": request.headers.get("origin") === allowOrigin ? allowOrigin : allowOrigin,
 "Access-Control-Allow-Methods": "POST, OPTIONS",
 "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
 "Vary": "Origin",
 "Cache-Control": "no-store",
});
const response = (request: Request, status: number, body: Record<string, unknown>) =>
 new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8",...cors(request)}});

const prefixes: Record<string, string> = {
 "grow-india:1":"SB_GROW_INDIA_SLOT1",
 "grow-india:2":"SB_GROW_INDIA_SLOT2",
 "enviro-solutions:1":"SB_ENVIRO_SOLUTIONS_SLOT1",
 "enviro-solutions:2":"SB_ENVIRO_SOLUTIONS_SLOT2"
};
const env=(name:string)=>Deno.env.get(name)?.trim()||"";
function credentials(company:string,slot:number){
 const prefix=prefixes[company+":"+slot];
 if(!prefix)return {configured:false,missing:["connection"],settings:null};
 const values={
  baseUrl:env(prefix+"_BASE_URL"),username:env(prefix+"_BASIC_USERNAME"),
  password:env(prefix+"_BASIC_PASSWORD"),version:env(prefix+"_API_VERSION")||"v1"
 };
 const missing=[
  ...(!values.baseUrl?["API base URL"]:[]),
  ...(!values.username?["Basic username"]:[]),
  ...(!values.password?["Basic password"]:[])
 ];
 if(missing.length)return {configured:false,missing,settings:null};
 let url:URL;
 try{
  url=new URL(values.baseUrl);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!/^v[0-9]+$/.test(values.version))
   throw Error("Invalid provider API host/version");
  if(url.hostname==="localhost"||url.hostname.endsWith(".local")||/^(127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname))
   throw Error("Provider host must be public HTTPS");
 }catch{ return {configured:false,missing:["Valid public HTTPS API base URL"],settings:null} }
 // Provider host is server administrator-controlled, never supplied by the browser.
 const baseUrl=url.origin+url.pathname.replace(/\/+$/,"");
 return {configured:true,missing:[],settings:{...values,baseUrl}};
}
function userKey(){
 const legacy=env("SUPABASE_ANON_KEY");
 if(legacy)return legacy;
 try{
  const raw=JSON.parse(env("SUPABASE_PUBLISHABLE_KEYS"));
  return typeof raw.default==="string"?raw.default:"";
 }catch{return ""}
}
function safePath(path:string){return path.replace(/^\/+/,"");}
async function providerRead(options:{baseUrl:string,username:string,password:string,version:string},path:string,query:Record<string,string>){
 const url=new URL(options.baseUrl+"/api/"+options.version+"/"+safePath(path));
 for(const [key,value] of Object.entries(query))url.searchParams.set(key,value);
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),12000);
 try{
  const header="Basic "+btoa(options.username+":"+options.password);
  const result=await fetch(url,{method:"GET",headers:{Authorization:header,Accept:"application/json"},signal:abort.signal,redirect:"error"});
  if(!result.ok)return {ok:false,status:result.status,data:null};
  const raw=await result.text();
  if(raw.length>150000)throw Error("Provider response too large");
  const body=JSON.parse(raw);
  if(!body||body.error!==false)throw Error("Provider returned an unsuccessful response");
  return {ok:true,status:result.status,data:body.data};
 }finally{clearTimeout(timer)}
}
Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(request)});
 if(request.method!=="POST")return response(request,405,{ok:false,error:"Method not allowed"});
 try{
  const auth=request.headers.get("Authorization")||"";
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token)return response(request,401,{ok:false,error:"Sign in to GreenRich ONE"});
  const url=env("SUPABASE_URL"),key=userKey();
  if(!url||!key)return response(request,503,{ok:false,error:"Supabase authentication is not configured"});
  const client=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:"Bearer "+token}}});
  const who=await client.auth.getUser(token);
  if(who.error||!who.data.user)return response(request,401,{ok:false,error:"Session expired"});
  const incoming=await request.text();
  if(incoming.length>4096)return response(request,413,{ok:false,error:"Request too large"});
  const body=JSON.parse(incoming);
  const connectionId=String(body.connection_id||"");
  if(!/^[0-9a-f-]{36}$/i.test(connectionId))
   return response(request,400,{ok:false,error:"Choose a saved WhatsApp provider"});
  const result=await client.from("gr_wa_connections")
    .select("id,company_id,slot,provider,display_name").eq("id",connectionId).maybeSingle();
  if(result.error||!result.data)return response(request,404,{ok:false,error:"Provider not available"});
  const connection=result.data;
  const admin=await client.rpc("gr_wa_admin",{p_company:connection.company_id});
  if(admin.error||admin.data!==true)return response(request,403,{ok:false,error:"Administrator permission required"});
  if(String(connection.provider).toLowerCase()!=="socialberries")
   return response(request,422,{ok:false,error:"This test supports SocialBerries only; second provider requires its own adapter"});
  const settings=credentials(connection.company_id,connection.slot);
  if(!settings.configured)
   return response(request,200,{ok:false,configured:false,missing:settings.missing,
     message:"Enter these credentials in Supabase Edge Function Secrets. Never paste secrets into CRM."});
  const cfg=settings.settings!;
  const action=String(body.action||"test");
  if(action==="test"){
   try{
    const out=await providerRead(cfg,"users/",{page:"1"});
    if(!out.ok)return response(request,200,{ok:false,configured:true,code:"HTTP_"+out.status,message:out.status===401?"Basic authentication rejected by SocialBerries":"Provider request returned HTTP "+out.status});
    const count=Number(out.data?.count);
    return response(request,200,{ok:true,configured:true,authenticated:true,
     message:"Authenticated read-only API connection succeeded",users_count:Number.isFinite(count)?count:null});
   }catch{return response(request,200,{ok:false,configured:true,message:"API host unreachable or provider response is invalid. Check the base URL and credentials."})}
  }
  // Service-role access is server-only, gated above by signed-in company Admin.
  function serverDb(){
   const key=env("SUPABASE_SERVICE_ROLE_KEY");
   if(!key)throw Error("Server batch history storage unavailable");
   return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  }
  function finiteCount(x:unknown){const n=Number(x);return Number.isFinite(n)&&n>=0?Math.floor(n):0}
  function providerRow(v:any){
   const id=String(v?.id||"");
   if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)||id.length!==36)return null;
   const stamp=(value:unknown)=>{
    if(!value)return null;
    const date=new Date(String(value));return Number.isFinite(date.getTime())?date.toISOString():null;
   };
   return {
    company_id:connection.company_id,connection_id:connection.id,provider_batch_id:id,
    name:String(v.name||"").slice(0,160),
    phone_number_id:String(v.phone_number_id||"").slice(0,90),
    total_clients_count:finiteCount(v.total_clients_count),
    total_batches_count:finiteCount(v.total_batches_count),
    completed_clients_count:finiteCount(v.completed_clients_count),
    mmlite:v.mmlite===true,
    status:String(v.status||"unknown").slice(0,50),
    provider_created_at:stamp(v.created_on),
    provider_updated_at:stamp(v.last_updated_on),
    synced_at:new Date().toISOString()
   };
  }
  async function persistBatches(records:any[]){
   if(!records.length)return;
   const db=serverDb();
   // Summary sync must preserve richer detail stats already saved for each batch.
   const {data:existing,error:lookupError}=await db.from("gr_wa_bulk_batches")
    .select("provider_batch_id,message_statistics")
    .eq("company_id",connection.company_id).eq("connection_id",connection.id)
    .in("provider_batch_id",records.map(x=>x.provider_batch_id));
   if(lookupError)throw Error("Could not reconcile saved campaign statistics");
   const detailById=new Map((existing||[]).map((x:any)=>[x.provider_batch_id,x.message_statistics]));
   const {error}=await db.from("gr_wa_bulk_batches").upsert(records.map(x=>({
    ...x,message_statistics:detailById.get(x.provider_batch_id)||null
   })),{onConflict:"company_id,connection_id,provider_batch_id"});
   if(error)throw Error("Could not save SocialBerries campaign summaries");
  }
  if(action==="batch_history"){
   try{
    const page=Math.max(1,Math.min(500,Math.trunc(Number(body.page)||1))),size=20;
    const {data,error,count}=await serverDb().from("gr_wa_bulk_batches")
     .select("provider_batch_id,name,phone_number_id,status,total_clients_count,total_batches_count,completed_clients_count,mmlite,provider_created_at,provider_updated_at,message_statistics,synced_at",
      {count:"exact"}).eq("company_id",connection.company_id).eq("connection_id",connection.id)
     .order("synced_at",{ascending:false}).range((page-1)*size,page*size-1);
    if(error)throw error;
    return response(request,200,{ok:true,page,count:count||0,batches:data||[],cached:true});
   }catch{return response(request,200,{ok:false,message:"Could not read saved SocialBerries batch history"})}
  }
  if(action==="batches"){
   const page=Math.max(1,Math.min(1000,Math.trunc(Number(body.page)||1)));
   try{
    // Do not follow provider 'next' links: documentation examples contain localhost URLs.
    // Always use the configured public HTTPS API host and explicit page number.
    const out=await providerRead(cfg,"whatsapp/messages/bulk_batches/",{page:String(page),limit:"10"});
    if(!out.ok)return response(request,200,{ok:false,configured:true,code:"HTTP_"+out.status,
     message:"SocialBerries batch list returned HTTP "+out.status});
    const data=out.data||{};
    if(!Array.isArray(data.results))return response(request,200,{ok:false,
     message:"Unrecognized SocialBerries bulk batch list; no records saved"});
    const records=data.results.slice(0,10).map(providerRow).filter(Boolean);
    await persistBatches(records);
    // Match existing CRM campaigns only by exact provider_batch_id and company;
    // NEVER infer that a provider batch belongs to a contact based on batch name.
    const batchIds=records.map(x=>x.provider_batch_id);
    const links=batchIds.length?await serverDb().from("gr_wa_campaigns")
      .select("id,provider_batch_id").eq("company_id",connection.company_id)
      .eq("connection_id",connection.id).in("provider_batch_id",batchIds):{data:[],error:null};
    if(links.error)throw Error("Could not look up CRM campaign references");
    const linkById=new Map((links.data||[]).map((r:any)=>[r.provider_batch_id,r.id]));
    return response(request,200,{ok:true,configured:true,count:finiteCount(data.count),page,
      has_more:!!data.next||page*10<finiteCount(data.count),
      batches:records.map(x=>({id:x.provider_batch_id,name:x.name,status:x.status,
       total_clients_count:x.total_clients_count,total_batches_count:x.total_batches_count,
       completed_clients_count:x.completed_clients_count,phone_number_id:x.phone_number_id,
       created_on:x.provider_created_at,last_updated_on:x.provider_updated_at,
       crm_campaign_id:linkById.get(x.provider_batch_id)||null})),
      saved:records.length,message:"Provider campaign summaries synced. No messages sent."});
   }catch{return response(request,200,{ok:false,configured:true,
     message:"Could not retrieve or save provider campaign list. Verify the documented list endpoint and server storage."})}
  }
  if(action==="batch_detail"){
   const id=String(body.batch_id||"").trim();
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return response(request,400,{ok:false,error:"Valid SocialBerries campaign batch ID required"});
   try{
    const out=await providerRead(cfg,"whatsapp/messages/bulk_batches/"+id+"/",{});
    if(!out.ok)return response(request,200,{ok:false,message:"Provider batch detail returned HTTP "+out.status});
    const d=out.data||{};
    if(String(d.id)!==id)return response(request,200,{ok:false,message:"Provider returned an unexpected batch ID"});
    const b=providerRow(d);
    if(!b)return response(request,200,{ok:false,message:"Unrecognized SocialBerries batch detail"});
    const raw=d.message_statistics||{};
    const toCount=(x:unknown)=>{const value=Number(x);return Number.isFinite(value)&&value>=0?Math.floor(value):null};
    const toRate=(x:unknown)=>{const n=Number(x);return Number.isFinite(n)&&n>=0&&n<=100?Number(n.toFixed(2)):null};
    const stats={
     total_messages:toCount(raw.total_messages),pending:toCount(raw.pending),
     sent:toCount(raw.sent),delivered:toCount(raw.delivered),
     read:toCount(raw.read),failed:toCount(raw.failed),
     success_rate:toRate(raw.success_rate),failure_rate:toRate(raw.failure_rate),
     effective_success_rate:toRate(raw.effective_success_rate),
     effective_failure_rate:toRate(raw.effective_failure_rate),
     recovery_in_retry:toCount(raw.recovery_in_retry),
     recovery_retry_succeeded:toCount(raw.recovery_retry_succeeded),
     recovery_reengage_succeeded:toCount(raw.recovery_reengage_succeeded),
     recovery_rate:toRate(raw.recovery_rate)
    };
    const {error}=await serverDb().from("gr_wa_bulk_batches").upsert({
     ...b,message_statistics:stats
    },{onConflict:"company_id,connection_id,provider_batch_id"});
    if(error)throw Error("Could not save batch statistics");
    return response(request,200,{ok:true,id,name:b.name,status:b.status,
     phone_number_id:b.phone_number_id,
     total_clients_count:b.total_clients_count,total_batches_count:b.total_batches_count,
     completed_clients_count:b.completed_clients_count,statistics:stats,
     responded:null,not_responded:null,
     updated_at:b.provider_updated_at,
     message:"Provider batch detail synced. No messages sent.",
     note:"Completed is campaign processing, NOT WhatsApp delivery. This API does not expose contact-level delivery or replies."});
   }catch{return response(request,200,{ok:false,message:"Could not retrieve or save provider batch statistics. Verify the batch detail URL with SocialBerries."})}
  }
  if(action==="sync_leads"){
   // Read provider's documented GET Leads endpoint, stage only the whitelisted
   // fields, and require explicit Admin approval to create GreenRich CRM leads.
   const page=Math.trunc(Number(body.page)||1);
   if(page<1||page>100)return response(request,400,{ok:false,error:"Page must be 1–100"});
   const serviceKey=env("SUPABASE_SERVICE_ROLE_KEY");
   if(!serviceKey)return response(request,503,{ok:false,error:"Server sync capability unavailable; service role key not configured"});
   try{
    const result=await providerRead(cfg,"leads/",{page:String(page)});
    if(!result.ok)return response(request,200,{ok:false,configured:true,
     message:"SocialBerries Get Leads returned HTTP "+result.status+
      ". Confirm whether its GET endpoint requires the documented client filters."});
    const data=result.data;
    const leads=Array.isArray(data?.results)?data.results:(Array.isArray(data)?data:[]);
    if(!Array.isArray(data?.results)&&!Array.isArray(data))
     return response(request,200,{ok:false,configured:true,
      message:"SocialBerries returned an unrecognized lead-list format; no records were imported."});
    const clean=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";
    const items=leads.slice(0,100).filter((x:unknown)=>x&&typeof x==="object").flatMap((x:Record<string,unknown>)=>{
     const c=(x.client&&typeof x.client==="object")?x.client as Record<string,unknown>:{};
     const id=clean(x.id,150),mobile=clean(c.mobile??x.mobile,25);
     if(!id)return [];
     let displayName=[clean(c.first_name??x.first_name,90),clean(c.last_name??x.last_name,90)].filter(Boolean).join(" ");
     if(!displayName)displayName=clean(c.name??x.name,180);
     const state=(x.status&&typeof x.status==="object"?"":clean(x.status,90));
     const source=clean(x.source??c.source,150);
     return [{
      company_id:connection.company_id,connection_id:connection.id,
      provider_lead_id:id,provider_client_id:clean(c.id,150),
      name:displayName,mobile,email:clean(c.email??x.email,200),
      source,provider_status:state,received_at:new Date().toISOString()
     }];
    });
    if(items.length){
     const adminDb=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
     const saved=await adminDb.from("gr_wa_provider_leads").upsert(items,
      {onConflict:"company_id,connection_id,provider_lead_id",ignoreDuplicates:false});
     if(saved.error)throw Error("Could not stage provider leads");
    }
    return response(request,200,{ok:true,configured:true,page,
     synced:items.length,skipped:Math.max(0,leads.slice(0,100).length-items.length),
     provider_count:Number.isFinite(Number(data?.count))?Number(data.count):null,
     has_more:Boolean(data?.next)});
   }catch{return response(request,200,{ok:false,configured:true,
    message:"Could not sync leads. Check SocialBerries API response and credentials."})}
  }
  if(action==="messages"){
   // Never permit a browser-supplied provider URL, arbitrary query or client ID.
   // All mobile numbers in this GreenRich CRM integration use the Indian 91 prefix.
   const raw=String(body.phone_number||"").trim();
   const digits=raw.replace(/[\s()+-]/g,"");
   const phone=/^[6-9]\d{9}$/.test(digits)?"91"+digits:digits;
   if(!/^91[6-9]\d{9}$/.test(phone))
    return response(request,400,{ok:false,error:"Enter a valid Indian WhatsApp mobile number"});
   const pageNumber=Number(body.page);
   const page=Number.isInteger(pageNumber)&&pageNumber>=1&&pageNumber<=100?String(pageNumber):"1";
   try{
    const out=await providerRead(cfg,"whatsapp/messages/",{phone_number:phone,page,limit:"15"});
    if(!out.ok)return response(request,200,{ok:false,configured:true,code:"HTTP_"+out.status,
      message:"SocialBerries message-history request returned HTTP "+out.status});
    const data=out.data;
    // The OpenAPI Get Messages 200 schema is empty. Accept list or paginated
    // results only, whitelist fields, and never expose an unknown response body.
    const list=Array.isArray(data)?data:(Array.isArray(data?.results)?data.results:[]);
    const records=list.slice(0,15).filter(x=>x&&typeof x==="object").map(x=>{
      const sender=String(x.sender??""),receiver=String(x.receiver??"");
      const direction=sender.replace(/\D/g,"")===phone?"Incoming":
        receiver.replace(/\D/g,"")===phone?"Outgoing":"Unknown";
      return {
       id:String(x.id??x.message_id??"").slice(0,120),
       direction,
       type:String(x.type??"unknown").slice(0,60),
       status:String(x.status??"unknown").slice(0,60),
       text:typeof x.message_text==="string"?x.message_text.slice(0,600):"",
       event_at:String(x.created_on??x.created_at??"").slice(0,50)
      };
    });
    const count=Number(data?.count);
    return response(request,200,{ok:true,configured:true,page:Number(page),
      messages:records,count:Number.isFinite(count)?count:null,
      shape_known:Array.isArray(data)||Array.isArray(data?.results)});
   }catch{return response(request,200,{ok:false,configured:true,
     message:"Could not retrieve message history. Check provider response format and API settings."})}
  }
  return response(request,400,{ok:false,error:"Only read-only tests, batch summaries/details, message history and provider-lead staging are enabled"});
 }catch{return response(request,400,{ok:false,error:"Invalid request or integration configuration"})}
});
