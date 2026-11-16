// Guarded GreenRich ONE SocialBerries sending. No automatic sending.
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
const origin="https://maheshgreenrich.github.io";
const hdr={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Content-Type":"application/json","Cache-Control":"no-store"};
const res=(code:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status:code,headers:hdr});
const env=(x:string)=>Deno.env.get(x)?.trim()||"";
const validId=(s:string)=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s)&&s.length===36;
const norm=(x:unknown)=>{const v=String(x||"").replace(/[\s()+-]/g,"");return /^[6-9]\d{9}$/.test(v)?"91"+v:/^91[6-9]\d{9}$/.test(v)?v:""};
const val=(x:unknown,n=180)=>String(x??"").trim().slice(0,n);
const prefixes:Record<string,string>={"grow-india:1":"SB_GROW_INDIA_SLOT1","grow-india:2":"SB_GROW_INDIA_SLOT2","enviro-solutions:1":"SB_ENVIRO_SOLUTIONS_SLOT1","enviro-solutions:2":"SB_ENVIRO_SOLUTIONS_SLOT2"};
function creds(company:string,slot:number){
 const p=prefixes[company+":"+slot];if(!p)return null;
 const base=env(p+"_BASE_URL"),user=env(p+"_BASIC_USERNAME"),pass=env(p+"_BASIC_PASSWORD"),version=env(p+"_API_VERSION")||"v1";
 if(!base||!user||!pass||!/^v[0-9]+$/.test(version))return null;
 try{const u=new URL(base);
  if(u.protocol!=="https:"||u.username||u.password||u.hash||u.search||u.hostname==="localhost"||u.hostname.endsWith(".local")
   ||/^(127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname))return null;
  return {base:u.origin+u.pathname.replace(/\/+$/,""),user,pass,version};
 }catch{return null}
}
const apiKey=(secret=false)=>{
 const legacy=env(secret?"SUPABASE_SERVICE_ROLE_KEY":"SUPABASE_ANON_KEY");if(legacy)return legacy;
 try{const keys=JSON.parse(env(secret?"SUPABASE_SECRET_KEYS":"SUPABASE_PUBLISHABLE_KEYS"));return String(keys.default||"")}catch{return ""}
};
type Person={key:string;name:string;email:string;phone:string};
async function audience(db:any,campaign:any,company:string){
 const ids=campaign.audience?.crm_ids;
 if(!Array.isArray(ids)||ids.length<1||ids.length>500||ids.some((x:unknown)=>typeof x!=="string"))
  throw Error("Save 1 to 500 CRM recipients in a draft first");
 const cids=ids.filter((x:string)=>x.startsWith("C:")&&validId(x.slice(2))).map((x:string)=>x.slice(2));
 const lids=ids.filter((x:string)=>x.startsWith("L:"+company+":")).map((x:string)=>x.slice(company.length+3));
 const [c,l]=await Promise.all([
  cids.length?db.from("gr_crm_customers").select("id,name,mobile,mobile2,email").in("id",cids):Promise.resolve({data:[],error:null}),
  lids.length?db.from("gr_lead_pipeline").select("lead_id,contact,title,mobile,email").eq("company_id",company).in("lead_id",lids):Promise.resolve({data:[],error:null})
 ]);
 if(c.error||l.error)throw Error("CRM recipient verification failed");
 const found=new Map<string,Person>();
 for(const x of c.data||[]){const phone=norm(x.mobile)||norm(x.mobile2);if(phone)found.set("C:"+x.id,{key:"C:"+x.id,name:val(x.name),email:val(x.email),phone})}
 for(const x of l.data||[]){const phone=norm(x.mobile);if(phone)found.set("L:"+company+":"+x.lead_id,{key:"L:"+company+":"+x.lead_id,name:val(x.contact||x.title),email:val(x.email),phone})}
 const people:Person[]=[],seen=new Set<string>();
 for(const id of ids){const x=found.get(id);if(x&&!seen.has(x.phone)){people.push(x);seen.add(x.phone)}}
 const [consent,existing]=await Promise.all([
  db.from("gr_wa_contacts").select("id,mobile,consent_status,consent_source,consent_at,opt_out_at").eq("company_id",company).limit(5000),
  db.from("gr_wa_messages").select("phone").eq("company_id",company).eq("campaign_id",campaign.id).eq("direction","outbound").limit(1000)
 ]);
 if(consent.error||existing.error)throw Error("Cannot verify consent or previous messages");
 const states=new Map<string,{yes:boolean;no:boolean;id:string}>();
 for(const x of consent.data||[]){
  const p=norm(x.mobile);if(!p)continue;
  const prev=states.get(p)||{yes:false,no:false,id:""};
  if(x.consent_status==="opted_out"||x.opt_out_at)prev.no=true;
  if(x.consent_status==="opted_in"&&x.consent_source&&x.consent_at&&!x.opt_out_at){prev.yes=true;prev.id=x.id}
  states.set(p,prev);
 }
 const eligible=people.filter(x=>states.get(x.phone)?.yes&&!states.get(x.phone)?.no);
 const attempted=new Set((existing.data||[]).map((x:any)=>x.phone));
 return {selected:ids.length,eligible,remaining:eligible.filter(x=>!attempted.has(x.phone)),
  no_phone:ids.length-people.length,no_consent:people.length-eligible.length,attempted:attempted.size,states};
}
function templateSpecs(template:any){
 const preview=template?.provider_preview;
 if(!preview||preview.status!=="APPROVED"||String(preview.category).toUpperCase()!=="MARKETING"||
  String(preview.id)!==String(template.provider_template_id)||
  preview.name!==template.name||preview.language!==template.language||
  !Array.isArray(preview.components))throw Error("Approved MARKETING template metadata is incomplete or mismatched");
 const parts=preview.components,body=parts.find((x:any)=>String(x.type).toUpperCase()==="BODY");
 const header=parts.find((x:any)=>String(x.type).toUpperCase()==="HEADER");
 if(typeof body?.text!=="string"||!body.text.trim())throw Error("Approved BODY component missing");
 const variables=(text:string)=>[...String(text||"").matchAll(/\{\{([^{}]+)\}\}/g)].map(x=>x[1].trim().toLowerCase());
 const headFormat=String(header?.format||"").toUpperCase();
 const unsupported=parts.some((x:any)=>["CAROUSEL","LIMITED_TIME_OFFER"].includes(String(x.type).toUpperCase()));
 if(unsupported)throw Error("This template has complex components not yet supported by CRM. Confirm provider template requirements.");
 if(headFormat&&!["IMAGE","TEXT","VIDEO","DOCUMENT"].includes(headFormat))
  throw Error("Unsupported template header format");
 const buttons=parts.find((x:any)=>String(x.type).toUpperCase()==="BUTTONS")?.buttons||[];
 if(!Array.isArray(buttons))throw Error("Invalid approved template buttons");
 const requirements:any[]=[];
 if(headFormat==="TEXT")for(const tag of variables(header?.text||""))requirements.push({key:"header:"+tag,kind:"header_text",label:"Header "+tag});
 for(const tag of variables(body.text)){
  if(["clientname","clientemail","clientmobile","1","2","3"].includes(tag))continue;
  requirements.push({key:"body:"+tag,kind:"body",label:"Body "+tag});
 }
 buttons.forEach((button:any,index:number)=>{
  const kind=String(button.type||"").toUpperCase();
  if(kind==="COPY_CODE")requirements.push({key:"coupon:"+index,kind:"coupon",label:"Copy code · "+(button.text||"Button "+(index+1))});
  else if(kind==="URL"&&variables(button.url||"").length)requirements.push({key:"url:"+index,kind:"url",label:"Dynamic website URL suffix · "+(button.text||"Button "+(index+1))});
  else if(!["QUICK_REPLY","URL","PHONE_NUMBER"].includes(kind))throw Error("Unsupported dynamic button type "+kind);
 });
 return {headFormat,header,body,buttons,requirements,variables};
}
function components(template:any,person:Person,image:string,fields:Record<string,string>={}){
 const spec=templateSpecs(template),out:any[]=[];
 if(image&&spec.headFormat!=="IMAGE")throw Error("This template has no IMAGE header");
 if(!image&&spec.headFormat==="IMAGE")throw Error("Template requires an IMAGE header");
 if(["VIDEO","DOCUMENT"].includes(spec.headFormat))
  throw Error("This template requires "+spec.headFormat+" media; CRM currently supports IMAGE header only");
 const value=(key:string)=>{
  const v=String(fields?.[key]||"").trim();
  if(!v||v.length>200||/[<>]/.test(v))throw Error("Required template field "+key+" is missing or invalid");
  return v;
 };
 if(image)out.push({type:"header",parameters:[{type:"image",image:{link:image}}]});
 if(spec.headFormat==="TEXT"){
  const tags=spec.variables(spec.header?.text||"");
  if(tags.length)out.push({type:"header",parameters:tags.map((tag:string)=>({type:"text",text:value("header:"+tag)}))});
 }
 const fixed:Record<string,string>={clientname:person.name,clientemail:person.email,clientmobile:person.phone,
  "1":person.name,"2":person.email,"3":person.phone};
 const tags=spec.variables(spec.body.text);
 if(tags.length)out.push({type:"body",parameters:tags.map((tag:string)=>{
  const configured=String(fields?.["body:"+tag]||"").trim();
  const mapped:Record<string,string>={"@crm:name":person.name,"@crm:mobile":person.phone,"@crm:email":person.email};
  const text=configured?(Object.hasOwn(mapped,configured)?mapped[configured]:value("body:"+tag)):
   Object.hasOwn(fixed,tag)?String(fixed[tag]||"").trim():value("body:"+tag);
  if(!text)throw Error("Missing CRM contact field for template placeholder "+tag);
  return {type:"text",text};
 })});
 spec.buttons.forEach((b:any,index:number)=>{
  const kind=String(b.type||"").toUpperCase();
  if(kind==="COPY_CODE"){
   const code=value("coupon:"+index);
   if(!/^[a-zA-Z0-9_-]{1,20}$/.test(code))throw Error("Coupon code must be 1–20 letters, numbers, hyphens or underscores");
   out.push({type:"button",sub_type:"copy_code",index:String(index),
    parameters:[{type:"coupon_code",coupon_code:code}]});
  }else if(kind==="URL"&&spec.variables(b.url||"").length){
   out.push({type:"button",sub_type:"url",index:String(index),
    parameters:[{type:"text",text:value("url:"+index)}]});
  }
 });
 return out;
}
type SendOutcome={id:string|null;code:string;reason:string;uncertain:boolean};
function safeProviderReason(v:unknown){
 // Only extract a short, non-secret description. Never store raw HTTP responses.
 return String(v??"").replace(/https?:\/\/\S+/gi,"[URL]")
  .replace(/\b(?:basic|bearer)\s+[a-z0-9+/=._-]+/gi,"[credential]")
  .replace(/\b[0-9]{10,16}\b/g,"[number]")
  .replace(/\b[a-z0-9+/=_-]{35,}\b/gi,"[redacted]")
  .replace(/[<>{}\r\n]/g," ").replace(/\s+/g," ").trim().slice(0,180);
}
async function send(cfg:any,recipient:Person,template:any,parts:any[]):Promise<SendOutcome>{
 const u=new URL(cfg.base+"/api/"+cfg.version+"/whatsapp/messages/");u.searchParams.set("phone_number",recipient.phone);
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{
  const response=await fetch(u,{method:"POST",redirect:"error",signal:ctl.signal,
   headers:{Authorization:"Basic "+btoa(cfg.user+":"+cfg.pass),"Content-Type":"application/json","Accept":"application/json"},
   body:JSON.stringify({type:"template",template:template.name,language:template.language,template_id:template.provider_template_id,
    category:"MARKETING",
    // Preserve the full approved template snapshot, including HEADER / BODY / BUTTONS.
    // Earlier we sent only identity metadata and omitted the approved components.
    preview_template:template.provider_preview,components:parts})});
  const raw=await response.text();
  if(raw.length>120000)return {id:null,code:"RESPONSE_TOO_LARGE",reason:"SocialBerries returned an unexpectedly large response.",uncertain:true};
  let doc:any=null;try{doc=JSON.parse(raw)}catch{
   return {id:null,code:"INVALID_PROVIDER_RESPONSE",reason:"SocialBerries returned a non-JSON response (HTTP "+response.status+").",uncertain:response.ok};
  }
  // Preserve the provider's useful nested rejection details without logging raw JSON,
  // credentials, image URLs or recipient phone numbers.
  const providerIssue=doc?.error && typeof doc.error==="object"?doc.error:
   Array.isArray(doc?.errors)?doc.errors[0]:
   doc?.data?.error && typeof doc.data.error==="object"?doc.data.error:
   Array.isArray(doc?.data?.errors)?doc.data.errors[0]:
   doc?.data?.result?.error && typeof doc.data.result.error==="object"?doc.data.result.error:null;
  const issue=providerIssue && typeof providerIssue==="object"?providerIssue:{};
  const code=safeProviderReason(doc?.error_code||doc?.code||issue?.code||
   doc?.data?.error_code||doc?.data?.code||doc?.data?.status_code||"");
  const details=issue?.message||issue?.description||issue?.detail||issue?.error_user_msg||
   doc?.data?.error_description||doc?.data?.error_message||doc?.data?.message||
   doc?.detail||doc?.message||(typeof doc?.error==="string"?doc.error:"");
  const errorText=safeProviderReason(details);
  if(!response.ok)return {id:null,code:"HTTP_"+response.status+(code?"_"+code:""),
   reason:errorText||"SocialBerries rejected the template request (HTTP "+response.status+").",
   uncertain:response.status>=500};
  const item=doc?.data||{},status=String(item?.status||doc?.status||"").toLowerCase();
  // SocialBerries response examples may include an id/message_id with "pending"
  // and omit the optional boolean error=false. Do not mislabel these as rejection.
  const explicitError=doc?.error===true||
   (typeof doc?.error==="string"&&doc.error.trim().toLowerCase()!=="false"&&doc.error.trim()!=="")||
   (doc?.error!==null&&typeof doc?.error==="object")||
   doc?.success===false||["failed","rejected","error"].includes(status);
  if(explicitError)
   return {id:null,code:code||"PROVIDER_REJECTED",reason:errorText||"SocialBerries reported an unsuccessful template send.",uncertain:false};
  const providerId=item?.message_id||item?.id||item?.data?.messages?.[0]?.id||
   doc?.message_id||doc?.id;
  if(!providerId)return {id:null,code:"NO_PROVIDER_MESSAGE_ID",reason:"SocialBerries returned HTTP success without a verifiable message ID; delivery is unknown.",uncertain:true};
  return {id:val(providerId,250),code:"",reason:"",uncertain:false};
 }catch(e){
  const timedOut=ctl.signal.aborted;
  return {id:null,code:timedOut?"PROVIDER_TIMEOUT":"PROVIDER_NETWORK_ERROR",
   reason:timedOut?"SocialBerries did not respond within 12 seconds. Delivery is unconfirmed.":"The SocialBerries API connection failed during sending. Delivery is unconfirmed.",
   uncertain:true};
 }finally{clearTimeout(timer)}
}
Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:hdr});
 if(request.method!=="POST")return res(405,{ok:false,error:"Method not allowed"});
 try{
  const jwt=(request.headers.get("Authorization")||"").replace(/^Bearer /,"");
  if(!jwt||!env("SUPABASE_URL")||!apiKey())return res(401,{ok:false,error:"Login required"});
  const userDb=createClient(env("SUPABASE_URL"),apiKey(),{auth:{autoRefreshToken:false,persistSession:false},
   global:{headers:{Authorization:"Bearer "+jwt}}});
  const session=await userDb.auth.getUser(jwt);
  if(session.error||!session.data.user)return res(401,{ok:false,error:"Invalid session"});
  const raw=await request.text();if(raw.length>70000)return res(413,{ok:false,error:"Request too large"});
  const input=JSON.parse(raw),action=val(input.action,40),connectionId=val(input.connection_id,40);
  if(!validId(connectionId))return res(400,{ok:false,error:"Select saved WhatsApp provider"});
  const r=await userDb.from("gr_wa_connections").select("id,company_id,slot,provider,setup_state,enabled,sender_phone").eq("id",connectionId).maybeSingle();
  if(r.error||!r.data||r.data.provider!=="socialberries")return res(404,{ok:false,error:"SocialBerries provider not found"});
  const company=r.data.company_id;
  const adminAuth=await userDb.rpc("gr_wa_admin",{p_company:company});
  if(adminAuth.error||adminAuth.data!==true)return res(403,{ok:false,error:"Company administrator permission required"});
  if(!apiKey(true))return res(503,{ok:false,error:"Supabase server credential unavailable"});
  const db=createClient(env("SUPABASE_URL"),apiKey(true),{auth:{autoRefreshToken:false,persistSession:false}});
  // Read-only preflight: do not create campaigns while setup is incomplete.
  // Report *all* blockers together so the user does not discover them one by one.
  // Read-only diagnostics: never attempts a send and never reveals provider credentials.
  // Explicit admin action: authenticate with a READ-ONLY provider request,
  // then mark the saved company connection verified. Never sends messages.
  if(action==="verify_provider_connection"){
   const cfg=creds(company,r.data.slot);
   if(!cfg)return res(422,{ok:false,error:"SocialBerries HTTPS URL / Basic credentials are missing in Supabase Secrets"});
   if(!/^\+91[6-9][0-9]{9}$/.test(String(r.data.sender_phone||"")))
    return res(422,{ok:false,error:"Save the registered +91 business sender number before verifying"});
   let response:Response;
   try{
    response=await fetch(cfg.base+"/api/"+cfg.version+"/users/?page=1",{
     method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),
     headers:{Authorization:"Basic "+btoa(cfg.user+":"+cfg.pass),Accept:"application/json"}
    });
   }catch{return res(502,{ok:false,error:"Could not authenticate against SocialBerries. No settings changed."})}
   if(!response.ok)return res(422,{ok:false,error:"SocialBerries rejected connection verification (HTTP "+response.status+"). No settings changed."});
   let data:any;
   try{data=await response.json()}catch{return res(502,{ok:false,error:"SocialBerries returned invalid authentication response"})}
   if(data?.error===true||data?.success===false)
    return res(422,{ok:false,error:"SocialBerries reported failed authentication. No settings changed."});
   const saved=await db.from("gr_wa_connections")
    .update({enabled:true,setup_state:"verified"}).eq("id",connectionId).eq("company_id",company);
   if(saved.error)return res(500,{ok:false,error:"Provider authentication passed but CRM setup status could not be saved"});
   return res(200,{ok:true,provider_verified:true,message:"SocialBerries API authenticated; company provider marked enabled. This is NOT Meta template or message-delivery verification. No message was sent."});
  }
  if(action==="diagnose_connection"){
   const cfg=creds(company,r.data.slot),p=prefixes[company+":"+r.data.slot];
   const credsReady=!!cfg,enabled=env("SB_ENABLE_MARKETING_SEND")==="true";
   const [allTemplates,consents,failures]=await Promise.all([
    db.from("gr_wa_templates").select("id,category,provider_approval,provider_source,provider_preview")
     .eq("company_id",company).eq("connection_id",connectionId).limit(100),
    db.from("gr_wa_contacts").select("id,consent_status,consent_source,consent_at,opt_out_at")
     .eq("company_id",company).limit(1000),
    db.from("gr_wa_messages").select("provider_error_code,provider_error_message,created_at,delivery_status")
     .eq("company_id",company).eq("connection_id",connectionId).eq("delivery_status","failed")
     .order("created_at",{ascending:false}).limit(5)
   ]);
   if(allTemplates.error||consents.error||failures.error)
    return res(500,{ok:false,error:"Could not load WhatsApp diagnostics"});
   const approved=(allTemplates.data||[]).filter((t:any)=>t.category==="marketing"&&
    t.provider_approval==="approved"&&t.provider_source==="verified_provider"&&
    Array.isArray(t.provider_preview?.components)).length;
   const adminConfirmed=(allTemplates.data||[]).filter((t:any)=>t.category==="marketing"&&
    t.provider_approval==="approved"&&t.provider_source==="admin_confirmed").length;
   const consentCount=(consents.data||[]).filter((x:any)=>x.consent_status==="opted_in"&&
    x.consent_source&&x.consent_at&&!x.opt_out_at).length;
   const blockers=[
    ...(!credsReady?["Missing or invalid SocialBerries API host / Basic credentials in Supabase Secrets"]:[]),
    ...(r.data.setup_state==="not_configured"||r.data.enabled!==true?["Provider is not marked connected / enabled in CRM Settings"]:[]),
    ...(!String(r.data.sender_phone||"").trim()?["No registered sender phone recorded for this provider"]:[]),
    ...(!approved?["No approved MARKETING template verified directly against Meta for this sender"]:[]),
    ...(!consentCount?["No recorded and documented WhatsApp marketing opt-in contacts"]:[]),
    ...(!enabled?["SB_ENABLE_MARKETING_SEND is not true; intentionally disabled until verified provider test"]:[])
   ];
   return res(200,{ok:true,company_id:company,provider:"socialberries",slot:r.data.slot,
    credentials_present:credsReady,provider_enabled:r.data.enabled===true,
    connection_state:r.data.setup_state||"not_configured",sender_recorded:!!String(r.data.sender_phone||"").trim(),
    verified_templates:approved,admin_confirmed_templates:adminConfirmed,
    opted_in_contacts:consentCount,sending_enabled:enabled,ready:!blockers.length,blockers,
    recent_failures:(failures.data||[]).map((x:any)=>({
      code:val(x.provider_error_code,90)||"UNSPECIFIED",
      reason:safeProviderReason(x.provider_error_message)||"Reason not captured for older attempt",
      date:x.created_at
    })),
    next_step:"Run Test Connection (read-only) to authenticate against SocialBerries; then verify provider template and a consented internal test number. No message was sent."});
  }
  if(action==="preflight_marketing"){
   const templateId=val(input.template_id,40),idList=input.crm_ids;
   if(!validId(templateId)||!Array.isArray(idList)||idList.length<1||idList.length>500||
    idList.some((id:unknown)=>typeof id!=="string"||id.length>160))
    return res(400,{ok:false,error:"Choose an approved template and 1–500 CRM contacts"});
   const found=await db.from("gr_wa_templates").select("*").eq("id",templateId)
    .eq("company_id",company).eq("connection_id",connectionId).maybeSingle();
   if(found.error)return res(422,{ok:false,error:"Could not verify the selected template"});
   const t=found.data;
   const cfg=creds(company,r.data.slot),blockers:string[]=[];
   if(!cfg)blockers.push("SocialBerries API credentials are missing in Supabase Secrets");
   if(r.data.enabled!==true||r.data.setup_state!=="verified")blockers.push("Verify and enable the company SocialBerries connection in Settings (read-only API check)");
   if(!t||t.category!=="marketing"||t.provider_approval!=="approved"||
    !["admin_confirmed","verified_provider"].includes(t.provider_source)||
    !Array.isArray(t.provider_preview?.components)||!t.body)
    blockers.push("Full approved MARKETING template is not confirmed in Settings");
   if(env("SB_ENABLE_MARKETING_SEND")!=="true")
    blockers.push("Live sending is disabled in Supabase Secrets");
   const fakeCampaign={id:"00000000-0000-4000-8000-000000000000",audience:{crm_ids:idList}};
   let checked:any;try{checked=await audience(db,fakeCampaign,company)}
   catch(e){return res(422,{ok:false,error:e instanceof Error?e.message:"Could not validate audience"})}
   if(!checked.eligible.length)
    blockers.push("No selected recipients have documented WhatsApp marketing opt-in for this sender company");
   // Invalid, duplicate and other-company contacts are skipped; eligible contacts may still send.
   const withImage=input.has_image===true;
   if(input.template_fields&&(
      typeof input.template_fields!=="object"||Array.isArray(input.template_fields)||
      Object.keys(input.template_fields).length>25||
      Object.entries(input.template_fields).some(([key,value])=>
       !/^(header|body|coupon|url):[a-z0-9_]{1,50}$/i.test(key)||
       typeof value!=="string"||value.length>200)
     ))blockers.push("Template parameters contain invalid field names or values");
   if(t?.provider_preview?.components){
    const header=t.provider_preview.components.find((x:any)=>String(x.type).toUpperCase()==="HEADER");
    const isImage=String(header?.format).toUpperCase()==="IMAGE";
    if(isImage&&!withImage)blockers.push("This approved template requires an image");
    if(!isImage&&withImage)blockers.push("The approved template has no IMAGE header; remove the image");
    if(checked.eligible.length)try{
     components(t,checked.eligible[0],withImage?"https://example.com/approved.jpg":"",input.template_fields||{});
    }catch(e){blockers.push(e instanceof Error?e.message:"Invalid approved template parameters")}
   }
   if(t)try{templateSpecs(t)}catch(e){blockers.push(e instanceof Error?e.message:"Invalid template format")}
   return res(200,{ok:true,ready:!blockers.length,selected:checked.selected,
    eligible:checked.eligible.length,not_eligible:checked.no_consent,
    skipped:checked.no_phone,blockers});
  }
  if(action==="record_consent"){
   const key=val(input.contact_key,190),source=val(input.consent_source,180),evidence=val(input.evidence_note,500);
   if(input.attested!==true)return res(400,{ok:false,error:"You must confirm that the customer actually gave permission for WhatsApp marketing."});
   if(source.length<12)return res(400,{ok:false,error:"Choose a valid source where the customer explicitly opted in to WhatsApp marketing."});
   if(evidence.length<10)return res(400,{ok:false,error:"Describe when and how the customer agreed (at least 10 characters). A value such as 1 is not evidence."});
   let row:any=null;
   if(key.startsWith("C:")&&validId(key.slice(2))){
    const q=await db.from("gr_crm_customers").select("id,name,mobile,mobile2").eq("id",key.slice(2)).maybeSingle();row=q.data;
   }else if(key.startsWith("L:"+company+":")){
    const q=await db.from("gr_lead_pipeline").select("lead_id,contact,mobile").eq("company_id",company).eq("lead_id",key.slice(company.length+3)).maybeSingle();row=q.data;
   }
   const number=norm(row?.mobile)||norm(row?.mobile2);
   if(!number)return res(400,{ok:false,error:"CRM contact or valid mobile not found"});
   const prev=await db.from("gr_wa_contacts").select("consent_status,opt_out_at").eq("company_id",company).eq("mobile",number).maybeSingle();
   if(prev.error)return res(400,{ok:false,error:"Could not read existing consent"});
   if((prev.data?.opt_out_at||prev.data?.consent_status==="opted_out")&&input.new_opt_in!==true)
    return res(409,{ok:false,error:"This number opted out. New explicit permission is needed before re-subscribing."});
   const record:any={company_id:company,mobile:number,name:val(row.name||row.contact)||"CRM contact",
    consent_status:"opted_in",consent_source:source,consent_at:new Date().toISOString(),opt_out_at:null,
    notes:"Opt-in evidence: "+evidence,created_by:session.data.user.id};
   if(key.startsWith("C:"))record.customer_id=key.slice(2);else record.lead_id=key.slice(company.length+3);
   const saved=await db.from("gr_wa_contacts").upsert(record,{onConflict:"company_id,mobile"});
   if(saved.error)return res(400,{ok:false,error:"Could not save consent evidence"});
   return res(200,{ok:true,message:"Consent evidence recorded for selected sender company"});
  }
  // Verify an existing template against Meta Graph API with an admin-only server
  // credential. This reads the actual WABA template, not a screenshot claim.
  // Approved-template catalog sync is read-only on Meta and scoped to this
  // company's WABA. No JSON input or repeated manual template attestation.
  if(action==="sync_approved_templates"){
   const prefix=prefixes[company+":"+r.data.slot];
   const waba=env(prefix+"_META_WABA_ID"),token=env(prefix+"_META_ACCESS_TOKEN");
   const version=env(prefix+"_META_GRAPH_VERSION")||"v23.0";
   if(!/^[0-9]{5,25}$/.test(waba)||!token||!/^v[0-9]{1,2}\.[0-9]{1,2}$/.test(version))
    return res(200,{ok:true,configured:false,imported:0,updated:0,
     message:"One-time Meta WABA ID and management token setup is required in Supabase Secrets. SocialBerries has not supplied a verified template listing API. No JSON copy/paste is required after this setup."});
   const apiBase="https://graph.facebook.com/"+version+"/"+waba+"/message_templates";
   let next:string|null=apiBase+"?fields=id,name,language,status,category,components&limit=100";
   const items:any[]=[],seen=new Set<string>();
   for(let page=0;page<4&&next;page++){
    let response:Response;
    try{response=await fetch(next,{method:"GET",redirect:"error",signal:AbortSignal.timeout(15000),
     headers:{Authorization:"Bearer "+token,Accept:"application/json"}})}
    catch{return res(502,{ok:false,error:"Cannot reach Meta template API. Existing CRM templates were not changed."})}
    if(!response.ok)return res(422,{ok:false,error:response.status===401||response.status===403?
      "Meta token does not have approved template access to this WABA":
      "Meta template list returned HTTP "+response.status});
    const raw=await response.text();
    if(raw.length>750000)return res(502,{ok:false,error:"Meta template response exceeded safe size"});
    let data:any;try{data=JSON.parse(raw)}catch{return res(502,{ok:false,error:"Invalid Meta template list response"})}
    if(!Array.isArray(data?.data))return res(422,{ok:false,error:"Meta did not return a template list"});
    for(const t of data.data){
     if(t?.status!=="APPROVED"||!["MARKETING","UTILITY"].includes(String(t.category||"").toUpperCase())||
      !/^[0-9]{5,25}$/.test(String(t.id||""))||
      !/^[a-z][a-z0-9_]{0,150}$/.test(String(t.name||""))||
      !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(String(t.language||""))||
      !Array.isArray(t.components)||!t.components.some((x:any)=>x.type==="BODY"&&typeof x.text==="string"))
      continue;
     const key=t.id+":"+t.language;if(seen.has(key))continue;seen.add(key);
     items.push(t);
    }
    const nextUrl=data?.paging?.next;
    if(nextUrl){
     try{const parsed=new URL(nextUrl);
      // Never forward the privileged Meta token to arbitrary next-page URLs.
      if(parsed.protocol!=="https:"||parsed.hostname!=="graph.facebook.com")
       throw Error("unexpected pagination host");
      next=parsed.toString();
     }catch{return res(502,{ok:false,error:"Meta returned an untrusted pagination URL; no template records changed"})}
    }else next=null;
   }
   if(next)return res(422,{ok:false,error:"Template catalog exceeds the supported 400-item sync limit; no records changed"});
   const old=await db.from("gr_wa_templates").select("id,name,language,provider_template_id")
    .eq("company_id",company).eq("connection_id",connectionId).limit(1000);
   if(old.error)return res(500,{ok:false,error:"Could not reconcile existing CRM templates"});
   let imported=0,updated=0;
   for(const t of items){
    const exact=(old.data||[]).find((x:any)=>x.provider_template_id===String(t.id));
    const duplicate=(old.data||[]).find((x:any)=>x.name===t.name&&x.language===t.language&&x.id!==exact?.id);
    if(duplicate)continue; // never remap a named template silently
    const preview={id:String(t.id),name:t.name,language:t.language,
     status:"APPROVED",category:String(t.category).toUpperCase(),components:t.components};
    const body=t.components.find((x:any)=>x.type==="BODY")?.text||"";
    const payload={name:t.name,language:t.language,category:String(t.category).toLowerCase(),
     body,provider_template_id:String(t.id),provider_preview:preview,provider_approval:"approved",
     provider_source:"verified_provider"};
    if(exact){
     const save=await db.from("gr_wa_templates").update(payload).eq("id",exact.id)
      .eq("company_id",company).eq("connection_id",connectionId);
     if(save.error)return res(500,{ok:false,error:"Template sync partially completed; check CRM template catalog"});
     updated++;
    }else{
     const save=await db.from("gr_wa_templates").insert({...payload,
      company_id:company,connection_id:connectionId,created_by:session.data.user.id});
     if(save.error)return res(500,{ok:false,error:"Template sync partially completed; check CRM template catalog"});
     imported++;
    }
   }
   return res(200,{ok:true,configured:true,imported,updated,
    total_approved:items.length,source:"Meta WABA",
    message:"Synced directly approved templates and their full components for this company. No messages sent, no manual JSON confirmation needed."});
  }
  if(action==="sync_meta_template"){
   const id=val(input.template_id,40);
   if(!validId(id))return res(400,{ok:false,error:"Choose a saved marketing template"});
   const row=await db.from("gr_wa_templates").select("*").eq("id",id)
    .eq("company_id",company).eq("connection_id",connectionId).maybeSingle();
   const template=row.data;
   if(row.error||!template||template.category!=="marketing")
    return res(404,{ok:false,error:"Marketing template unavailable"});
   const prefix=prefixes[company+":"+r.data.slot];
   const waba=env(prefix+"_META_WABA_ID"),token=env(prefix+"_META_ACCESS_TOKEN");
   const version=env(prefix+"_META_GRAPH_VERSION")||"v23.0";
   if(!/^[0-9]{5,25}$/.test(waba)||!token||!/^v[0-9]{1,2}\.[0-9]{1,2}$/.test(version))
    return res(422,{ok:false,error:"Automatic Meta verification is not connected. Set the WABA ID and Meta management token in Supabase Secrets, or use Confirm existing approved template with full JSON."});
   const u=new URL("https://graph.facebook.com/"+version+"/"+waba+"/message_templates");
   u.searchParams.set("fields","id,name,language,status,category,components");
   u.searchParams.set("name",template.name);
   u.searchParams.set("limit","100");
   let response:Response;
   try{
    response=await fetch(u,{method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),
     headers:{"Authorization":"Bearer "+token,"Accept":"application/json"}});
   }catch{return res(502,{ok:false,error:"Meta template verification could not connect securely"})}
   if(!response.ok)return res(422,{ok:false,error:
    response.status===401||response.status===403?"Meta denied template access. Check the WABA ID and token permissions.":"Meta template lookup failed (HTTP "+response.status+")."});
   const raw=await response.text();
   if(raw.length>300000)return res(502,{ok:false,error:"Meta returned too many template details"});
   let data:any;
   try{data=JSON.parse(raw)}catch{return res(502,{ok:false,error:"Unexpected Meta template response"})}
   const items=Array.isArray(data?.data)?data.data:[];
   const t=items.find((x:any)=>String(x?.id)===String(template.provider_template_id)&&
    x?.name===template.name&&x?.language===template.language);
   if(!t)return res(422,{ok:false,error:"Meta did not return this exact template ID, name and language from the selected WABA."});
   if(t.status!=="APPROVED"||String(t.category).toUpperCase()!=="MARKETING")
    return res(422,{ok:false,error:"Meta reports template status "+val(t.status,40)+
     " and category "+val(t.category,40)+". An approved MARKETING template is required."});
   const body=Array.isArray(t.components)?t.components.find((x:any)=>String(x.type).toUpperCase()==="BODY"):null;
   if(typeof body?.text!=="string"||!body.text.trim()||body.text.length>4000)
    return res(422,{ok:false,error:"Meta returned no valid approved template BODY."});
   const preview={id:String(t.id),name:t.name,language:t.language,category:"MARKETING",
    status:"APPROVED",components:t.components};
   const logged=await db.from("gr_wa_template_confirmations").insert({
    company_id:company,template_id:id,confirmed_by:session.data.user.id,
    confirmation_note:"Verified approved MARKETING template from Meta Graph API WABA "+waba,
    provider_template_id:String(t.id)});
   if(logged.error)return res(400,{ok:false,error:"Could not audit Meta verification"});
   const saved=await db.from("gr_wa_templates").update({provider_approval:"approved",
    provider_source:"verified_provider",body:body.text,provider_preview:preview})
    .eq("id",id).eq("company_id",company).eq("connection_id",connectionId);
   if(saved.error)return res(400,{ok:false,error:"Could not save verified Meta template"});
   return res(200,{ok:true,verified:true,template_name:t.name,message:"Meta-approved template verified with full message content."});
  }
  if(action==="confirm_template"){
   const id=val(input.template_id,40),note=val(input.confirmation_note,500);
   if(!validId(id)||input.attested!==true||note.length<10)return res(400,{ok:false,error:"Approval review and evidence required"});
   const q=await db.from("gr_wa_templates").select("*").eq("id",id).eq("company_id",company).eq("connection_id",connectionId).maybeSingle();
   const t=q.data;if(q.error||!t||t.category!=="marketing")return res(404,{ok:false,error:"Marketing template not found"});
   let full:any;try{full=JSON.parse(String(input.approved_json||""))}catch{return res(400,{ok:false,error:"Paste valid approved template JSON"})}
   const body=Array.isArray(full?.components)?full.components.find((x:any)=>String(x.type).toUpperCase()==="BODY"):null;
   if(full?.status!=="APPROVED"||String(full.category).toUpperCase()!=="MARKETING"||String(full.id)!==String(t.provider_template_id)
    ||full.name!==t.name||full.language!==t.language||typeof body?.text!=="string"||!body.text.trim())
    return res(422,{ok:false,error:"Full approved MARKETING template must match ID/name/language and contain BODY"});
   const logged=await db.from("gr_wa_template_confirmations").insert({company_id:company,template_id:id,
    confirmed_by:session.data.user.id,confirmation_note:note,provider_template_id:String(full.id)});
   if(logged.error)return res(400,{ok:false,error:"Could not audit admin confirmation"});
   const saved=await db.from("gr_wa_templates").update({provider_approval:"approved",provider_source:"admin_confirmed",
    body:body.text,provider_preview:full}).eq("id",id).eq("company_id",company);
   if(saved.error)return res(400,{ok:false,error:"Could not save approved template"});
   return res(200,{ok:true,message:"Full template saved with administrator approval attestation, not API verification"});
  }
  const campaignId=val(input.campaign_id,40);
  if(!validId(campaignId))return res(400,{ok:false,error:"Save the campaign draft first"});
  const q=await db.from("gr_wa_campaigns").select("*").eq("id",campaignId).eq("company_id",company).eq("connection_id",connectionId).maybeSingle();
  if(q.error||!q.data)return res(404,{ok:false,error:"Campaign unavailable"});
  const campaign=q.data,tid=campaign.template_id;
  const tr=await db.from("gr_wa_templates").select("*").eq("id",tid).eq("company_id",company).eq("connection_id",connectionId).maybeSingle();
  const t=tr.data,config=creds(company,r.data.slot),blockers:string[]=[];
  if(!config)blockers.push("Configure SocialBerries HTTPS URL and Basic credentials in Supabase Secrets");
  if(!t||t.category!=="marketing"||t.provider_approval!=="approved"
   ||!["verified_provider","admin_confirmed"].includes(t.provider_source))blockers.push("Confirm a full approved MARKETING template");
  if(["paused","archived"].includes(campaign.status))blockers.push("Campaign is paused or archived");
  if(env("SB_ENABLE_MARKETING_SEND")!=="true")blockers.push("Activate SB_ENABLE_MARKETING_SEND=true after provider testing");
  if(r.data.enabled!==true||r.data.setup_state!=="verified")blockers.push("Verify and enable this SocialBerries provider in Settings before submitting campaign messages");
  let group:any;try{group=await audience(db,campaign,company)}
  catch(e){return res(422,{ok:false,error:e instanceof Error?e.message:"Recipient validation failed"})}
  if(!group.eligible.length)blockers.push("No recipients have recorded company-specific WhatsApp marketing opt-in");
  let image="";
  if(campaign.attachment_path){
   if(!["image/png","image/jpeg"].includes(campaign.attachment_mime))
    blockers.push("IMAGE header must use JPEG or PNG. Upload an approved JPEG/PNG image, not WebP.");
   if(!campaign.attachment_path.startsWith(company+"/"+campaign.id+"/"))blockers.push("Invalid image association");
   else{
    const result=await db.storage.from("gr-wa-campaign-images").createSignedUrl(campaign.attachment_path,86400);
    if(result.error||!result.data?.signedUrl)blockers.push("Campaign image cannot be read");
    else image=result.data.signedUrl;
   }
  }
  if(t&&group.remaining.length)try{components(t,group.remaining[0],image,campaign.audience?.template_fields||{})}
  catch(e){blockers.push(e instanceof Error?e.message:"Invalid template parameters")}
  const summary={ready:blockers.length===0,selected:group.selected,eligible:group.eligible.length,
   remaining:group.remaining.length,attempted:group.attempted,no_phone:group.no_phone,
   no_consent:group.no_consent,blockers};
  if(action==="check_campaign")return res(200,{ok:true,...summary});
  if(action!=="send_campaign")return res(400,{ok:false,error:"Unsupported action"});
  if(input.confirm!==true)return res(400,{ok:false,error:"Explicit send confirmation is required"});
  if(blockers.length)return res(422,{ok:false,...summary,error:"Campaign not ready"});
  const chosen=group.remaining.slice(0,3),results:any[]=[];
  for(const person of chosen){
   const claim=await db.from("gr_wa_messages").insert({company_id:company,connection_id:connectionId,
    campaign_id:campaign.id,contact_id:group.states.get(person.phone)?.id||null,direction:"outbound",phone:person.phone,
    body:"Marketing template: "+t.name,delivery_status:"queued"}).select("id").single();
   if(claim.error){results.push({last4:person.phone.slice(-4),result:"duplicate_or_unavailable"});continue}
   let outcome:SendOutcome;
   try{outcome=await send(config,person,t,components(t,person,image,campaign.audience?.template_fields||{}))}
   catch{outcome={id:null,code:"TEMPLATE_PARAMETERS_INVALID",reason:"Template parameters did not match the approved BODY or IMAGE header.",uncertain:false}}
   const updated=await db.from("gr_wa_messages").update({
    provider_message_id:outcome.id,delivery_status:outcome.id?"queued":"failed",
    provider_error_code:outcome.code||null,provider_error_message:outcome.reason||null
   }).eq("id",claim.data.id);
   if(updated.error)return res(500,{ok:false,error:"Provider request was attempted but the CRM could not save its outcome. Do not retry automatically."});
   results.push({last4:person.phone.slice(-4),
    result:outcome.id?"accepted_by_provider":outcome.uncertain?"unconfirmed":"rejected",
    code:outcome.code||null,reason:outcome.reason||null});
  }
  const left=Math.max(0,group.remaining.length-chosen.length);
  if(results.length)await db.from("gr_wa_campaigns").update({status:left?"sending":"submitted"}).eq("id",campaign.id);
  return res(200,{ok:true,attempted:results.length,accepted:results.filter(x=>x.result==="accepted_by_provider").length,
   remaining:left,results,message:"Provider acceptance is not delivery. Unconfirmed attempts must be checked with SocialBerries before any resend."});
 }catch{return res(400,{ok:false,error:"Secure WhatsApp request could not be processed"})}
});
