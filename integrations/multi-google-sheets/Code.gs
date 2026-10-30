/** GreenRich ONE — Central Multi-Google-Sheet Lead Sync
 * Install ONE Apps Script in the existing "meta leads" workbook. Run as an editor with
 * access to every connected Google Sheet. Keep the existing 3 Script Properties:
 * GREENRICH_SUPABASE_URL, GREENRICH_PUBLISHABLE_KEY, GREENRICH_IMPORT_TOKEN.
 * Update this code in the existing project and run greenrichInstallTrigger once.
 * Do not Deploy as Web App. Only the 5-minute time-driven trigger is required.
 */
const GREENRICH_BATCH_SIZE=40;
const GREENRICH_SOURCE_TAB='Sheet1'; // legacy sheet name; sources are now loaded dynamically

function greenrichProps_(){
 const p=PropertiesService.getScriptProperties(),url=(p.getProperty('GREENRICH_SUPABASE_URL')||'').replace(/\/$/,''),
 key=(p.getProperty('GREENRICH_PUBLISHABLE_KEY')||'').trim(),
 token=(p.getProperty('GREENRICH_IMPORT_TOKEN')||'').trim();
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url))throw Error('Set GREENRICH_SUPABASE_URL in Script Properties.');
 if(!/^sb_publishable_/.test(key))throw Error('Set GREENRICH_PUBLISHABLE_KEY, not a service-role key.');
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Set GREENRICH_IMPORT_TOKEN from GreenRich ONE.');
 return {url,key,token};
}
function greenrichRpc_(name,payload){
 const cfg=greenrichProps_();
 const r=UrlFetchApp.fetch(cfg.url+'/rest/v1/rpc/'+name,{
  method:'post',contentType:'application/json',
  headers:{apikey:cfg.key,Accept:'application/json'},
  payload:JSON.stringify(payload),muteHttpExceptions:true,followRedirects:false
 });
 const status=r.getResponseCode(),body=r.getContentText();
 if(status<200||status>=300)throw Error(name+' failed (HTTP '+status+'): '+body.slice(0,350));
 return JSON.parse(body||'null');
}
function greenrichManifest_(){
 const cfg=greenrichProps_(),m=greenrichRpc_('gr_sheet_sync_manifest',{p_token:cfg.token});
 if(!Array.isArray(m))throw Error('Expected a connection list from the CRM.');
 return m;
}
function greenrichTestConnection(){
 const sources=greenrichManifest_();
 Logger.log('Connected to GreenRich ONE. Configured active sources: '+sources.length+'. No leads imported.');
 sources.forEach(s=>Logger.log(s.company+' / '+s.source+' / '+s.tab_name+' / '+s.sheet_id.slice(0,7)+'…'));
}
function greenrichInstallTrigger(){
 greenrichTestConnection();
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='greenrichSyncNow')
   .forEach(t=>ScriptApp.deleteTrigger(t));
 ScriptApp.newTrigger('greenrichSyncNow').timeBased().everyMinutes(5).create();
 Logger.log('One central 5-minute sync trigger installed. No Web App deployment required.');
}
function greenrichSyncSource_(s){
 const c=greenrichProps_();
 const ss=SpreadsheetApp.openById(s.sheet_id),sh=ss.getSheetByName(s.tab_name);
 if(!sh)throw Error('Sheet tab "'+s.tab_name+'" not found');
 const width=Math.min(Math.max(4,sh.getLastColumn()),80);
 const last=sh.getLastRow();
 if(last<s.header_row)throw Error('Configured header row is beyond the last sheet row');
 const header=sh.getRange(s.header_row,1,1,width).getDisplayValues()[0];
 const minimum=Number(s.first_data_row)-1;
 let cursor=Number(s.cursor_row);
 if(!Number.isInteger(cursor)||cursor<0)throw Error('Invalid server cursor');
 if(cursor===0 && s.import_mode==='new_only'){
  const checkpoint=Math.max(minimum,last);
  greenrichRpc_('gr_sheet_sync_batch',{
   p_token:c.token,p_connection:s.id,p_rows:[],p_headers:header,p_initial_cursor:checkpoint
  });
  Logger.log('Initialized '+s.source+' / '+s.tab_name+' at row '+checkpoint+'; existing rows preserved.');
  return {created:0,invalid:0,duplicate:0,skippedExisting:true};
 }
 cursor=Math.max(cursor,minimum);
 if(last<cursor)throw Error('Sheet lost rows since last sync. Review source before resetting its cursor.');
 let created=0,invalid=0,duplicates=0,replayed=0;
 while(cursor<last){
  const count=Math.min(GREENRICH_BATCH_SIZE,last-cursor);
  const rows=sh.getRange(cursor+1,1,count,width).getDisplayValues().map((values,i)=>({
    rowNumber:cursor+i+1,values
  }));
  const result=greenrichRpc_('gr_sheet_sync_batch',{
   p_token:c.token,p_connection:s.id,p_rows:rows,p_headers:header,p_initial_cursor:null
  });
  if(Number(result.created)+Number(result.replayed)+Number(result.invalid)!==rows.length){
   throw Error('CRM did not acknowledge all '+rows.length+' source rows; cursor retained for retry.');
  }
  created+=Number(result.created||0);invalid+=Number(result.invalid||0);
  duplicates+=Number(result.duplicate||0);replayed+=Number(result.replayed||0);
  cursor=Number(result.cursor);
 }
 Logger.log(s.source+' / '+s.tab_name+': created '+created+', duplicate warnings '+duplicates+
  ', invalid/heading rows '+invalid+', replayed '+replayed+', cursor '+cursor);
 return {created,invalid,duplicates};
}
function greenrichSyncNow(){
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(1000)){Logger.log('Previous run still in progress');return;}
 try{
  const list=greenrichManifest_();
  let passed=0,errors=0;
  for(const src of list){
   try{greenrichSyncSource_(src);passed++}
   catch(err){
    errors++;Logger.log('SYNC FAILED ['+src.source+' / '+src.tab_name+']: '+String(err.message).slice(0,280));
    try{greenrichRpc_('gr_sheet_sync_report_error',{
      p_token:greenrichProps_().token,p_connection:src.id,p_error:String(err.message).slice(0,380)
    })}catch(reportError){Logger.log('Could not report source error to CRM: '+reportError.message.slice(0,140))}
   }
  }
  Logger.log('Multi-sheet sync finished. Working sources: '+passed+', failed: '+errors);
 }finally{lock.releaseLock()}
}
