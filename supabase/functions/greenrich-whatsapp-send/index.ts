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
function components(template:any,person:Person,image:string){
 const p=template.provider_preview;
 if(!p||p.status!=="APPROVED"||String(p.category).toUpperCase()!=="MARKETING"||String(p.id)!==String(template.provider_template_id)
  ||p.name!==template.name||p.language!==template.language||!Array.isArray(p.components))
  throw Error("Approved MARKETING template metadata is incomplete");
 const body=p.components.find((c:any)=>String(c.type).toUpperCase()==="BODY");
 const header=p.components.find((c:any)=>String(c.type).toUpperCase()==="HEADER");
 if(typeof body?.text!=="string"||!body.text.trim())throw Error("Approved BODY component missing");
 if(image&&String(header?.format).toUpperCase()!=="IMAGE")throw Error("This template does not support an IMAGE header");
 if(!image&&String(header?.format).toUpperCase()==="IMAGE")throw Error("This template requires a campaign image");
 const result:any[]=[];
 if(image)result.push({type:"header",parameters:[{type:"image",image:{link:image}}]});
 const vars=[...body.text.matchAll(/\{\{([^{}]+)\}\}/g)].map(x=>x[1].trim().toLowerCase());
 const values:Record<string,string>={clientname:person.name,clientemail:person.email,clientmobile:person.phone,"1":person.name,"2":person.email,"3":person.phone};
 if(vars.some(x=>!Object.hasOwn(values,x)||!values[x]))throw Error("Template variables must match available customer name, email or mobile");
 if(vars.length)result.push({type:"body",parameters:vars.map(x=>({type:"text",text:values[x]}))});
 return result;
}
async function send(cfg:any,recipient:Person,template:any,parts:any[]){
 const u=new URL(cfg.base+"/api/"+cfg.version+"/whatsapp/messages/");u.searchParams.set("phone_number",recipient.phone);
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{
  const response=await fetch(u,{method:"POST",redirect:"error",signal:ctl.signal,
   headers:{Authorization:"Basic "+btoa(cfg.user+":"+cfg.pass),"Content-Type":"application/json","Accept":"application/json"},
   body:JSON.stringify({type:"template",template:template.name,language:template.language,template_id:template.provider_template_id,
    category:"MARKETING",preview_template:{id:template.provider_template_id,name:template.name,language:template.language,status:"APPROVED",category:"MARKETING",components:template.provider_preview.components},components:parts})});
  if(!response.ok)return null;
  const raw=await response.text();if(raw.length>120000)return null;
  const doc=JSON.parse(raw),item=doc?.data||{};
  if(doc?.error!==false||(!item.id&&!item.message_id)||["failed","rejected","error"].includes(String(item.status||"").toLowerCase()))return null;
  return val(item.message_id||item.id,250);
 }catch{return null}finally{clearTimeout(timer)}
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
  const r=await userDb.from("gr_wa_connections").select("id,company_id,slot,provider").eq("id",connectionId).maybeSingle();
  if(r.error||!r.data||r.data.provider!=="socialberries")return res(404,{ok:false,error:"SocialBerries provider not found"});
  const company=r.data.company_id;
  const adminAuth=await userDb.rpc("gr_wa_admin",{p_company:company});
  if(adminAuth.error||adminAuth.data!==true)return res(403,{ok:false,error:"Company administrator permission required"});
  if(!apiKey(true))return res(503,{ok:false,error:"Supabase server credential unavailable"});
  const db=createClient(env("SUPABASE_URL"),apiKey(true),{auth:{autoRefreshToken:false,persistSession:false}});
  // Read-only preflight: do not create campaigns while setup is incomplete.
  // Report *all* blockers together so the user does not discover them one by one.
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
   if(t?.provider_preview?.components){
    const header=t.provider_preview.components.find((x:any)=>String(x.type).toUpperCase()==="HEADER");
    const isImage=String(header?.format).toUpperCase()==="IMAGE";
    if(isImage&&!withImage)blockers.push("This approved template requires an image");
    if(!isImage&&withImage)blockers.push("The approved template has no IMAGE header; remove the image");
    if(checked.eligible.length)try{
     components(t,checked.eligible[0],withImage?"https://example.com/approved.jpg":"");
    }catch(e){blockers.push(e instanceof Error?e.message:"Invalid approved template parameters")}
   }
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
  let group:any;try{group=await audience(db,campaign,company)}
  catch(e){return res(422,{ok:false,error:e instanceof Error?e.message:"Recipient validation failed"})}
  if(!group.eligible.length)blockers.push("No recipients have recorded company-specific WhatsApp marketing opt-in");
  let image="";
  if(campaign.attachment_path){
   if(!campaign.attachment_path.startsWith(company+"/"+campaign.id+"/"))blockers.push("Invalid image association");
   else{
    const result=await db.storage.from("gr-wa-campaign-images").createSignedUrl(campaign.attachment_path,86400);
    if(result.error||!result.data?.signedUrl)blockers.push("Campaign image cannot be read");
    else image=result.data.signedUrl;
   }
  }
  if(t&&group.remaining.length)try{components(t,group.remaining[0],image)}
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
   let providerId:string|null=null;
   try{providerId=await send(config,person,t,components(t,person,image))}catch{}
   await db.from("gr_wa_messages").update({provider_message_id:providerId,delivery_status:providerId?"queued":"failed"}).eq("id",claim.data.id);
   results.push({last4:person.phone.slice(-4),result:providerId?"accepted_by_provider":"not_confirmed"});
  }
  const left=Math.max(0,group.remaining.length-chosen.length);
  if(results.length)await db.from("gr_wa_campaigns").update({status:left?"sending":"submitted"}).eq("id",campaign.id);
  return res(200,{ok:true,attempted:results.length,accepted:results.filter(x=>x.result==="accepted_by_provider").length,
   remaining:left,results,message:"Acceptance is not delivery. Failed or uncertain attempts are not automatically retried."});
 }catch{return res(400,{ok:false,error:"Secure WhatsApp request could not be processed"})}
});
