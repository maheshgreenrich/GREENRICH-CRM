'use strict';
/* Shared customer directory and tags. Authenticated Supabase master, not company/browser partitioned. */
(()=>{
 const companyKeys=['greenrich-crm-v2','greenrich-crm-v2::enviro-solutions'];
 const normalize=x=>String(x??'').trim();
 const phone=x=>normalize(x).replace(/\D/g,'').slice(-10);
 const uuid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(36).slice(2);
 let db=null,customers=[],tags=[],isAdmin=false,migrationDone=false,loading=null;
 const snapshot=()=>({customers:customers.map(x=>({...x})),tags:tags.map(x=>({...x}))});
 const requireDb=()=>{if(!db)throw Error('Sign in to GreenRich ONE to access shared customers and tags')};
 const check=resp=>{if(resp.error)throw Error(resp.error.message);return resp.data};
 async function refresh(){
  requireDb();
  const [cr,tr]=await Promise.all([
   db.from('gr_crm_customers').select('*').order('name'),
   db.from('gr_crm_tags').select('*').order('name')
  ]);
  customers=check(cr)||[];tags=check(tr)||[];
  return snapshot();
 }
 function legacy(){
  const out=[];
  for(const key of companyKeys){
   let parsed;try{parsed=JSON.parse(localStorage.getItem(key)||'null')}catch{continue}
   if(parsed&&typeof parsed==='object')out.push({key,data:parsed});
  }
  return out;
 }
 function matching(row){
  const email=normalize(row.email).toLowerCase(),numbers=[phone(row.mobile),phone(row.mobile2)].filter(x=>x.length===10);
  return customers.find(c=>
   (email&&normalize(c.email).toLowerCase()===email)
   || [phone(c.mobile),phone(c.mobile2)].some(p=>p.length===10&&numbers.includes(p)));
 }
 async function importLegacy(){
  let copied=0,unmatchedTags=0;
  const local=legacy();
  if(isAdmin){
   const oldNames=[...new Set(local.flatMap(entry=>(entry.data.tags||[]).map(t=>normalize(t.name)).filter(Boolean)))];
   for(const name of oldNames){
    if(tags.some(t=>t.name.toLowerCase()===name.toLowerCase()))continue;
    const result=await db.from('gr_crm_tags').insert({name}).select('*').single();
    if(!result.error)tags.push(result.data);
    else if(result.error.code==='23505')await refresh();
    else throw Error('Unable to migrate customer tag "'+name+'": '+result.error.message);
   }
  }
  for(const entry of local){
   const source=entry.data;
   if(!Array.isArray(source.customers))continue;
   const idMap=new Map();
   for(const old of source.customers){
    if(!old||!normalize(old.name))continue;
    const oldTags=(Array.isArray(old.tag_ids)?old.tag_ids:[])
     .map(id=>source.tags?.find(t=>t.id===id)?.name)
     .map(n=>tags.find(t=>t.name.toLowerCase()===normalize(n).toLowerCase())?.id)
     .filter(Boolean);
    if(Array.isArray(old.tag_ids)&&old.tag_ids.length&&!oldTags.length)unmatchedTags++;
    let match=matching(old);
    if(!match){
     const candidate={
      name:normalize(old.name),email:normalize(old.email)||null,
      mobile:normalize(old.mobile)||null,mobile2:normalize(old.mobile2)||null,
      address1:normalize(old.address1)||null,address2:normalize(old.address2),city:normalize(old.city),
      state:normalize(old.state),pincode:normalize(old.pincode),country:normalize(old.country)||'India',
      company:normalize(old.company),type:normalize(old.type)||'Individual',gstin:normalize(old.gstin),
      source:normalize(old.source),owner:normalize(old.owner),notes:normalize(old.notes),tag_ids:oldTags
     };
     if(candidate.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email))candidate.email=null;
     // Keep older contact records even when their optional phone fields are incomplete.
     if(candidate.mobile&&phone(candidate.mobile).length!==10)candidate.mobile=null;
     if(candidate.mobile2&&phone(candidate.mobile2).length!==10)candidate.mobile2=null;
     if(candidate.mobile&&candidate.mobile2&&phone(candidate.mobile)===phone(candidate.mobile2))candidate.mobile2=null;
     const saved=await db.from('gr_crm_customers').insert(candidate).select('*').single();
     if(saved.error){
      if(saved.error.code==='23505'){await refresh();match=matching(old)}
      else if(saved.error.code==='42501'){throw Error('Cannot move local customers into shared CRM: '+saved.error.message)}
      else throw Error('Customer migration failed for '+candidate.name+': '+saved.error.message);
     }else{match=saved.data;customers.push(match);copied++}
    }
    if(match&&oldTags.length&&isAdmin){
     const union=[...new Set([...(match.tag_ids||[]),...oldTags])];
     if(union.length!==(match.tag_ids||[]).length){
      const updated=await db.from('gr_crm_customers').update({tag_ids:union}).eq('id',match.id).select('*').single();
      if(!updated.error){customers=customers.map(c=>c.id===match.id?updated.data:c);match=updated.data}
     }
    }
    if(match&&old.id)idMap.set(String(old.id),match.id);
   }
   // Existing local sale lines retain their data but point at the global customer id.
   if(idMap.size&&Array.isArray(source.sales)){
    let changed=false;
    for(const sale of source.sales){
     const target=idMap.get(String(sale.customer_id||''));
     if(target&&sale.customer_id!==target){sale.customer_id=target;changed=true}
    }
    if(changed)try{localStorage.setItem(entry.key,JSON.stringify(source))}catch{ /* Browser full: sale's customer_name remains available. */ }
   }
  }
  return {copied,unmatchedTags};
 }
 async function ready({client,admin=false}={}){
  if(client&&client!==db){db=client;customers=[];tags=[];migrationDone=false}
  isAdmin=Boolean(admin);
  if(loading)return loading;
  loading=(async()=>{
   await refresh();
   if(!migrationDone){
    await importLegacy();
    migrationDone=true;
    await refresh();
   }
   return snapshot();
  })();
  try{return await loading}finally{loading=null}
 }
 async function saveCustomer(input){
  requireDb();
  const row={...input};
  const id=row.id;delete row.id;delete row.created_at;delete row.updated_at;delete row.created_by;
  const query=id?db.from('gr_crm_customers').update(row).eq('id',id):db.from('gr_crm_customers').insert(row);
  const result=await query.select('*').single();const saved=check(result);
  customers=id?customers.map(c=>c.id===id?saved:c):[...customers,saved];
  return saved;
 }
 async function deleteCustomer(id){
  requireDb();
  check(await db.from('gr_crm_customers').delete().eq('id',id).select('id').single());
  customers=customers.filter(c=>c.id!==id);
 }
 async function createTag(name){
  requireDb();const row=check(await db.from('gr_crm_tags').insert({name:normalize(name)}).select('*').single());tags.push(row);return row;
 }
 async function renameTag(id,name){
  requireDb();const row=check(await db.from('gr_crm_tags').update({name:normalize(name),updated_at:new Date().toISOString()}).eq('id',id).select('*').single());tags=tags.map(t=>t.id===id?row:t);return row;
 }
 async function deleteTag(id){
  requireDb();
  // Remove assignments first to avoid dangling tags; only Admin can edit shared tags.
  for(const c of customers.filter(c=>Array.isArray(c.tag_ids)&&c.tag_ids.includes(id))){
   const next=c.tag_ids.filter(x=>x!==id);
   const updated=check(await db.from('gr_crm_customers').update({tag_ids:next}).eq('id',c.id).select('*').single());
   customers=customers.map(row=>row.id===c.id?updated:row);
  }
  check(await db.from('gr_crm_tags').delete().eq('id',id));
  tags=tags.filter(t=>t.id!==id);
 }
 window.GreenRichSharedCustomers={ready,refresh,snapshot,saveCustomer,deleteCustomer,createTag,renameTag,deleteTag};
})();
