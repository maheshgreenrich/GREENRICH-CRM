// Authenticated server-to-server inbound events for GreenRich ONE.
// This is a canonical relay contract, NOT a direct SocialBerries webhook parser.
// No event is accepted without HMAC SHA-256 proof and a configured secret.
// The sending API and customer marketing consents are never modified here.
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
const env=(key:string)=>Deno.env.get(key)?.trim()||"";
const answer=(code:number,value:Record<string,unknown>)=>new Response(JSON.stringify(value),{
 status:code,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const key=()=>{
 const legacy=env("SUPABASE_SERVICE_ROLE_KEY");if(legacy)return legacy;
 try{return String(JSON.parse(env("SUPABASE_SECRET_KEYS")).default||"")}catch{return ""}
};
function safeEqual(a:string,b:string){
 if(a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
Deno.serve(async request=>{
 if(request.method!=="POST")return answer(405,{ok:false,error:"POST required"});
 const secret=env("GREENRICH_INBOUND_WEBHOOK_SECRET");
 const serviceKey=key(),supabaseUrl=env("SUPABASE_URL");
 if(!secret||secret.length<32||!serviceKey||!supabaseUrl)
  return answer(503,{ok:false,error:"Trusted inbound integration has not been configured"});
 const timestamp=request.headers.get("x-gr-timestamp")||"";
 const signature=(request.headers.get("x-gr-signature")||"").replace(/^sha256=/i,"").toLowerCase();
 const seconds=Number(timestamp);
 if(!/^\d{10}$/.test(timestamp)||!Number.isSafeInteger(seconds)||
    Math.abs(Date.now()/1000-seconds)>300||!/^[0-9a-f]{64}$/.test(signature))
  return answer(401,{ok:false,error:"Invalid or expired signed request"});
 const raw=await request.text();
 if(raw.length>16000)return answer(413,{ok:false,error:"Event size exceeds limit"});
 const hmacKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",hmacKey,new TextEncoder().encode(timestamp+"."+raw)));
 const expected=[...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
 if(!safeEqual(expected,signature))return answer(401,{ok:false,error:"Invalid signed request"});
 let data:Record<string,unknown>;
 try{data=JSON.parse(raw)}catch{return answer(400,{ok:false,error:"Invalid JSON"})}
 const asText=(x:unknown,max:number)=>typeof x==="string"?x.trim().slice(0,max):"";
 const eventId=asText(data.event_id,121),type=asText(data.event_type,40),
  company=asText(data.company_id,40),mobile=asText(data.mobile,30),
  name=asText(data.name,180),message=asText(data.message,4000),
  provider=asText(data.connection_id,40);
 if(!/^[a-zA-Z0-9:_-]{5,120}$/.test(eventId)||
    !["grow-india","enviro-solutions"].includes(company)||
    !["whatsapp_enquiry","website_enquiry","website_whatsapp_otp"].includes(type)||
    !/^(?:\+?91)?[6-9]\d{9}$/.test(mobile.replace(/[\s()-]/g,""))||
    (type==="whatsapp_enquiry"&&!/^[0-9a-f-]{36}$/i.test(provider)))
  return answer(422,{ok:false,error:"Invalid company, event type, event ID, sender or mobile"});
 const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const res=await db.rpc("gr_wa_accept_trusted_event",{
  p_company:company,p_key:eventId,p_type:type,p_phone:mobile,p_name:name,
  p_connection:provider||null,p_message:message
 });
 if(res.error)return answer(422,{ok:false,error:"Incoming event could not be accepted. Check company provider, routing rule and event fields."});
 return answer(200,{ok:true,...res.data});
});
