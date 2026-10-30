/**
 * GreenRich ONE — Meta Leads Google Sheets bridge
 * BOUND SCRIPT: open the exact "meta leads" Google Sheet -> Extensions -> Apps Script.
 * Configure Script Properties (never put a token in this source):
 *  GREENRICH_SUPABASE_URL         e.g. https://your-project.supabase.co
 *  GREENRICH_PUBLISHABLE_KEY      browser-safe sb_publishable_... key
 *  GREENRICH_IMPORT_TOKEN         one-time 64-character token from CRM admin setup
 * Then run greenrichInstallTrigger once and approve Google permissions.
 * Polls every five minutes because API-driven Google Sheets updates do not fire onEdit.
 */
const GREENRICH_SOURCE_ID='1oyrt_jUpmOCoHDJYecdvipyHGL0BKeeG00jVOqs3GdI';
const GREENRICH_SOURCE_TAB='Sheet1';
const GREENRICH_LAST_ROW_KEY='GREENRICH_META_LAST_SYNC_ROW';
const GREENRICH_MAX_BATCH=40;

function greenrichBoundSheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss || ss.getId()!==GREENRICH_SOURCE_ID){
    throw new Error('This script must be installed on the verified meta leads Google Sheet.');
  }
  const sh=ss.getSheetByName(GREENRICH_SOURCE_TAB);
  if(!sh)throw new Error('The Sheet1 tab is missing.');
  return sh;
}
function greenrichProps_(){
  const p=PropertiesService.getScriptProperties();
  const url=(p.getProperty('GREENRICH_SUPABASE_URL')||'').replace(/\/$/,'');
  const key=(p.getProperty('GREENRICH_PUBLISHABLE_KEY')||'').trim();
  const token=(p.getProperty('GREENRICH_IMPORT_TOKEN')||'').trim();
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url))
    throw new Error('Set GREENRICH_SUPABASE_URL in Apps Script Properties.');
  if(!key.startsWith('sb_publishable_'))throw new Error('Set GREENRICH_PUBLISHABLE_KEY (not the secret key).');
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Set GREENRICH_IMPORT_TOKEN from CRM admin setup.');
  return {p,url,key,token};
}
function greenrichNormalize_(v){
  return String(v===null||v===undefined?'':v).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}
function greenrichMapRow_(row,headers,n){
  const keys=headers.map(greenrichNormalize_);
  const hasMetaHeaders=keys.some(k=>['full_name','phone_number','created_time','campaign_name','lead_id','form_name'].includes(k));
  const get=names=>{
    for(const name of names){
      const idx=keys.indexOf(name);if(idx>=0 && row[idx]!==undefined && String(row[idx]).trim())return String(row[idx]).trim();
    }
    return '';
  };
  let name='',phone='',email='',product='',leadId='',campaign='',form='',createdTime='';
  if(hasMetaHeaders){
    name=get(['full_name','name','customer_name','first_name']);
    phone=get(['phone_number','phone','mobile_number','mobile','contact_number']);
    email=get(['email','email_address']);
    product=get(['product','product_interested','which_product_are_you_interested_in','product_name','interested_product']);
    leadId=get(['id','lead_id','meta_lead_id']);
    campaign=get(['campaign_name','campaign']);
    form=get(['form_name','form']);
    createdTime=get(['created_time','created_at','date','timestamp']);
    if(!product)product=form;
  }else{
    // The user's current sheet has no headings. Row 2 is a test
    // with A=name, B=phone, C=email, D=product.
    [name,phone,email,product]=row.slice(0,4).map(v=>String(v??'').trim());
  }
  const hasData=row.some(v=>String(v??'').trim()!=='');
  if(!hasData)return null;
  return {rowNumber:n,name,phone,email,product,leadId,campaign,form,createdTime};
}
function greenrichPost_(rows){
  const {url,key,token}=greenrichProps_();
  const resp=UrlFetchApp.fetch(url+'/rest/v1/rpc/gr_meta_sheet_ingest',{
    method:'post',
    contentType:'application/json',
    headers:{apikey:key,Accept:'application/json'},
    payload:JSON.stringify({
      p_token:token,p_sheet_id:GREENRICH_SOURCE_ID,p_tab_name:GREENRICH_SOURCE_TAB,p_rows:rows
    }),
    muteHttpExceptions:true,
    followRedirects:false
  });
  const status=resp.getResponseCode();
  if(status<200||status>=300){
    // Avoid printing request headers or the secret token in logs.
    const body=resp.getContentText().slice(0,650);
    throw new Error('GreenRich CRM sync failed (HTTP '+status+'): '+body);
  }
  const result=JSON.parse(resp.getContentText()||'{}');
  if(Number(result.received)!==rows.length ||
     Number(result.created)+Number(result.duplicates)!==rows.length)
    throw new Error('CRM did not acknowledge the complete lead batch.');
  return result;
}
function greenrichInstallTrigger(){
  const sh=greenrichBoundSheet_();
  greenrichProps_();
  const p=PropertiesService.getScriptProperties();
  // Never backfill existing rows without a separate, explicit review.
  if(p.getProperty(GREENRICH_LAST_ROW_KEY)===null)
    p.setProperty(GREENRICH_LAST_ROW_KEY,String(sh.getLastRow()));
  ScriptApp.getProjectTriggers().filter(x=>x.getHandlerFunction()==='greenrichSyncNow')
    .forEach(ScriptApp.deleteTrigger);
  ScriptApp.newTrigger('greenrichSyncNow').timeBased().everyMinutes(5).create();
  Logger.log('GreenRich sync installed. Existing rows preserved. First new row begins after row '+p.getProperty(GREENRICH_LAST_ROW_KEY));
}
function greenrichTestConnection(){
  greenrichBoundSheet_();
  const res=greenrichPost_([]);
  Logger.log('Secure CRM token verified. No leads imported. '+JSON.stringify(res));
}
function greenrichSyncNow(){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)){Logger.log('Another sync is running.');return;}
  try{
    const sh=greenrichBoundSheet_();
    const {p}=greenrichProps_();
    const cursorText=p.getProperty(GREENRICH_LAST_ROW_KEY);
    if(cursorText===null)throw new Error('Run greenrichInstallTrigger first to safely skip old test rows.');
    let cursor=Number(cursorText);
    if(!Number.isInteger(cursor)||cursor<0)throw new Error('Invalid saved cursor. Do not reset without reviewing duplicates.');
    const last=sh.getLastRow();
    if(last<cursor)throw new Error('Google Sheet rows were deleted or reordered; review sync cursor.');
    const headers=sh.getRange(1,1,1,Math.max(4,sh.getLastColumn())).getDisplayValues()[0];
    let imported=0,duplicates=0;
    while(cursor<last){
      const count=Math.min(GREENRICH_MAX_BATCH,last-cursor);
      const vals=sh.getRange(cursor+1,1,count,Math.max(4,sh.getLastColumn())).getDisplayValues();
      const rows=vals.map((v,i)=>greenrichMapRow_(v,headers,cursor+i+1)).filter(Boolean);
      if(rows.length){
        const result=greenrichPost_(rows);
        imported+=Number(result.created||0);
        duplicates+=Number(result.duplicates||0);
      }
      cursor+=count;
      p.setProperty(GREENRICH_LAST_ROW_KEY,String(cursor));
    }
    Logger.log('GreenRich synced: new '+imported+', already imported '+duplicates+', last row '+cursor);
  }finally{lock.releaseLock();}
}
