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
  if(action==="batches"){
   const page=Math.max(1,Math.min(1000,Math.trunc(Number(body.page)||1)));
   try{
    const out=await providerRead(cfg,"whatsapp/messages/bulk_batches/",{page:String(page),limit:"10",status:""});
    if(!out.ok)return response(request,200,{ok:false,configured:true,code:"HTTP_"+out.status});
    const data=out.data||{};
    const batches=Array.isArray(data.results)?data.results.slice(0,10).map((b:Record<string,unknown>)=>({
     id:b.id,name:b.name,status:b.status,total_clients_count:b.total_clients_count,
     completed_clients_count:b.completed_clients_count,created_on:b.created_on
    })):[];
    return response(request,200,{ok:true,configured:true,count:Number(data.count)||0,page,batches});
   }catch{return response(request,200,{ok:false,configured:true,message:"Could not retrieve provider campaigns"})}
  }
  return response(request,400,{ok:false,error:"Only read-only Test Connection and Batch List operations are enabled"});
 }catch{return response(request,400,{ok:false,error:"Invalid request or integration configuration"})}
});
