'use strict';
/* GreenRich ONE shared CRM: per-record cloud synchronization, first-device legacy import,
   company-restricted Supabase Realtime and safe local recovery copies.
   Never writes to Attendance. */
(()=>{
 const KINDS=['sales','products','channels','leads','tasks'];
 const BASE='greenrich-crm-v2';
 const key=id=>id==='grow-india'?BASE:BASE+'::'+id;
 const importedKey=id=>'greenrich-crm-cloud-imported-v1:'+id;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const isObject=x=>x&&typeof x==='object'&&!Array.isArray(x);
 const toRows=(companyId,kind,records)=>records.filter(r=>r&&typeof r.id==='string'&&r.id.length>0).map(r=>({company_id:companyId,kind,record_id:r.id,payload:r}));
 const fingerprints=x=>JSON.stringify(x);
 let db=null,companies=[],apply=null,notice=null,active=false,channels=[],timer=null,focusFn=null,visibilityFn=null;
 let state=new Map(),queue=new Map(),pending=new Set(),errors=new Map(),reloadTimer=null,remoteBusy=false;
 let session=0;
 const notify=message=>{if(notice)notice(message)};
 const local=id=>{const raw=localStorage.getItem(key(id));if(!raw)return null;try{return JSON.parse(raw)}catch{throw Error('Existing local data for '+id+' is not valid JSON. Export the browser backup before proceeding.')}};
 const rowKey=(companyId,kind,id)=>companyId+'|'+kind+'|'+id;
 const serverStore=()=>({version:4,orderSequence:0,invoiceSequences:{},sales:[],products:[],channels:[],leads:[],tasks:[],customers:[],tags:[]});
 const ensureArray=store=>KINDS.every(kind=>Array.isArray(store?.[kind]));
 const companyRows=id=>[...state.values()].filter(r=>r.company_id===id);
 const isValidRow=row=>KINDS.includes(row.kind)&&isObject(row.payload)&&row.payload.id===row.record_id;
 const setRows=rows=>{state=new Map(rows.filter(isValidRow).map(row=>[rowKey(row.company_id,row.kind,row.record_id),row]))};
 const pendingCount=()=>[...pending].length;
 function snapshot(id){
  const old=local(id),base=old&&ensureArray(old)?old:serverStore();
  const result={...base};
  KINDS.forEach(kind=>{result[kind]=companyRows(id).filter(r=>r.kind===kind).map(r=>clone(r.payload))});
  return result;
 }
 const setLocal=(id,value)=>{localStorage.setItem(key(id),JSON.stringify(value));if(apply)apply(id,value)};
 async function loadAll(){
  const results=[];
  for(let start=0;;start+=1000){
   const {data,error}=await db.from('gr_crm_records').select('company_id,kind,record_id,payload,updated_at').in('company_id',companies).order('company_id').order('kind').order('record_id').range(start,start+999);
   if(error)throw Error('Cloud CRM could not load: '+error.message);
   results.push(...(data||[]));if(!data||data.length<1000)break;
  }
  return results;
 }
 async function importLocal(){
  const legacy=[];
  for(const id of companies){
   const store=local(id);
   if(localStorage.getItem(importedKey(id))==='yes'||!store)continue; // Newly opened browser: never seed arbitrary empty local channels.
   if(!ensureArray(store))throw Error('Local CRM backup for '+id+' is invalid. Export it before migration.');
   // Legacy leads lack verified employee IDs. Preserve them for assigned import in
   // the pipeline instead of silently uploading unassigned records or overwriting them.
   if(store.leads.length){
    const backupKey='greenrich-crm-pipeline-legacy-backup:'+id;
    if(!localStorage.getItem(backupKey))localStorage.setItem(backupKey,JSON.stringify(store.leads));
    notify('Saved '+store.leads.length+' legacy leads from '+id+' for assignment in Leads & CRM → Assign saved leads.');
   }
   for(const kind of KINDS.filter(k=>k!=='leads'))legacy.push(...toRows(id,kind,store[kind]));
  }
  if(!legacy.length)return 0;
  // INSERT ... ON CONFLICT DO NOTHING; pre-existing cloud records always win.
  // Import only data that existed on this device. Never perform blanket replacement.
  for(let i=0;i<legacy.length;i+=80){
   const chunk=legacy.slice(i,i+80);
   const {error}=await db.from('gr_crm_records').upsert(chunk,{onConflict:'company_id,kind,record_id',ignoreDuplicates:true});
   if(error)throw Error('Legacy CRM import stopped safely: '+error.message+'. Original browser records have not been deleted.');
  }
  return legacy.length;
 }
 function diff(before,after){
  const result=[];
  for(const kind of KINDS){
   const previous=new Map((before?.[kind]||[]).map(r=>[r.id,r]));
   const next=new Map((after?.[kind]||[]).map(r=>[r.id,r]));
   for(const [id,row] of next){
    if(!id)continue;
    const original=previous.get(id);
    if(!original)result.push({kind,id,type:'insert',payload:row});
    else if(fingerprints(original)!==fingerprints(row))result.push({kind,id,type:'update',payload:row});
   }
   for(const [id] of previous)if(!next.has(id))result.push({kind,id,type:'delete'});
  }
  return result;
 }
 const identical=(a,b)=>a&&b&&fingerprints(a)===fingerprints(b);
 async function perform(id,changes){
  for(const change of changes){
   const rid=rowKey(id,change.kind,change.id);
   const old=state.get(rid);
   if(change.type==='insert'){
    if(old){
     if(!identical(old.payload,change.payload))throw Error('Record '+change.id+' exists on another device. Refresh before editing.');
     continue;
    }
    const {data,error}=await db.from('gr_crm_records').insert({company_id:id,kind:change.kind,record_id:change.id,payload:change.payload})
      .select('company_id,kind,record_id,payload,updated_at').single();
    if(error)throw Error('Save '+change.kind+' failed: '+error.message);
    state.set(rid,data);
   }else{
    if(!old)throw Error('Record '+change.id+' was changed on another device. Refresh before retrying.');
    if(change.type==='update'){
     const {data,error}=await db.from('gr_crm_records')
      .update({payload:change.payload,updated_at:new Date().toISOString()})
      .eq('company_id',id).eq('kind',change.kind).eq('record_id',change.id).eq('updated_at',old.updated_at)
      .select('company_id,kind,record_id,payload,updated_at');
     if(error)throw Error('Update '+change.kind+' failed: '+error.message);
     if(!data?.length)throw Error('This '+change.kind+' record was changed by another employee. Refresh to see their changes before editing.');
     state.set(rid,data[0]);
    }else{
     const {data,error}=await db.from('gr_crm_records').delete().eq('company_id',id)
      .eq('kind',change.kind).eq('record_id',change.id).eq('updated_at',old.updated_at).select('record_id');
     if(error)throw Error('Delete '+change.kind+' failed: '+error.message);
     if(!data?.length)throw Error('This record changed on another device. Refresh before deleting.');
     state.delete(rid);
    }
   }
  }
 }
 function commit(id,before,after){
  if(!active||!companies.includes(id))return Promise.reject(Error('Cloud sync unavailable. No changes were sent.'));
  const changes=diff(before,after);
  if(!changes.length)return Promise.resolve();
  pending.add(id);
  const prev=queue.get(id)||Promise.resolve();
  const task=prev.catch(()=>{}).then(()=>perform(id,changes))
   .then(()=>{errors.delete(id)})
   .catch(error=>{errors.set(id,error.message);notify('Cloud sync failed for '+id+': '+error.message+'. This browser retains a local copy. Do not clear its storage.');throw error})
   .finally(()=>{
    if(queue.get(id)===task){pending.delete(id);queue.delete(id);if(!errors.has(id))scheduleRefresh(500)}
   });
  queue.set(id,task);
  return task;
 }
 async function refresh(){
  if(!active||remoteBusy||pendingCount())return;
  remoteBusy=true;
  try{
   const rows=await loadAll();
   if(pendingCount())return;
   setRows(rows);
   for(const id of companies){
    if(errors.has(id))continue;
    setLocal(id,snapshot(id));
   }
  }catch(error){notify('Cannot refresh shared CRM: '+error.message)}
  finally{remoteBusy=false}
 }
 function scheduleRefresh(delay=200){
  if(!active)return;
  if(reloadTimer)clearTimeout(reloadTimer);
  reloadTimer=setTimeout(()=>{reloadTimer=null;void refresh()},delay);
 }
 function stop(){
  active=false;session++;
  if(timer)clearInterval(timer);timer=null;
  if(reloadTimer)clearTimeout(reloadTimer);reloadTimer=null;
  if(focusFn)window.removeEventListener('focus',focusFn);focusFn=null;
  if(visibilityFn)document.removeEventListener('visibilitychange',visibilityFn);visibilityFn=null;
  if(db)for(const channel of channels)db.removeChannel(channel);
  channels=[];
 }
 async function start({client,companyIds,onData,onNotice}){
  stop();
  db=client;companies=[...new Set(companyIds)].filter(id=>id==='grow-india'||id==='enviro-solutions');
  if(!db||!companies.length)throw Error('CRM cloud synchronization requires an authenticated user and assigned company.');
  apply=onData;notice=onNotice;
  state=new Map();queue=new Map();pending=new Set();errors=new Map();
  // First, reconcile copies created in the original desktop browser.
  // The local files remain untouched if any import fails.
  const uploaded=await importLocal();
  const rows=await loadAll();
  setRows(rows);
  active=true;
  for(const id of companies){setLocal(id,snapshot(id));localStorage.setItem(importedKey(id),'yes')}
  for(const id of companies){
   const channel=db.channel('greenrich-crm-live-'+id+'-'+session)
    .on('postgres_changes',{event:'*',schema:'public',table:'gr_crm_records',filter:'company_id=eq.'+id},()=>scheduleRefresh(120))
    .subscribe();
   channels.push(channel);
  }
  focusFn=()=>scheduleRefresh(200);
  visibilityFn=()=>{if(document.visibilityState==='visible')scheduleRefresh(200)};
  window.addEventListener('focus',focusFn);document.addEventListener('visibilitychange',visibilityFn);
  timer=setInterval(()=>scheduleRefresh(0),45000);
  if(uploaded)notify('Imported '+uploaded+' existing browser records to the shared CRM. Open a second device to see them.');
  return {migrated:uploaded,sharedRecords:rows.length};
 }
 async function externalSave(id,before,after,client){
  if(!active||!companies.includes(id)){
   // Settings is opened without opening CRM: connect first, importing local data safely.
   await start({client,companyIds:[id],onData:null,onNotice:msg=>window.alert(msg)});
  }
  return commit(id,before,after);
 }
 async function whenSynced(company){const p=queue.get(company);if(p)await p;const error=errors.get(company);if(error)throw Error(error)}
  window.GreenRichCRMCloud={start,stop,commit,whenSynced,externalSave,refresh,local,diff};
})();
