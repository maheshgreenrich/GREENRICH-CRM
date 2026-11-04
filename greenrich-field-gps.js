'use strict';
/* GreenRich Admin-opt-in, 30-minute foreground GPS samples. Hidden or locked devices cannot be tracked reliably. */
(()=>{
 let client=null,timer=null,busy=false,lastSave=0;
 async function enabledCompanies(db){
  const r=await db.rpc('gr_field_my_enabled_companies');
  if(r.error)throw Error('Field GPS assignment could not be checked: '+r.error.message);
  return Array.isArray(r.data)?r.data:[];
 }
 function locate(){
  return new Promise((resolve,reject)=>{
   if(!window.isSecureContext||!navigator.geolocation)return reject(Error('GPS attendance requires HTTPS and device location.'));
   navigator.geolocation.getCurrentPosition(p=>{
    const c=p.coords;
    if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy)||c.accuracy>3000)
     return reject(Error('Enable precise GPS location and try again. Accuracy must be within 3 km.'));
    resolve({latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy});
   },err=>reject(Error(err.code===1?'Location permission denied. Allow GPS access to GreenRich ONE.':'Current GPS unavailable. Turn on phone location and retry.')),
   {enableHighAccuracy:true,maximumAge:0,timeout:20000});
  });
 }
 async function attendanceBody(db){
  const permitted=await enabledCompanies(db);
  if(!permitted.length)return {};
  const u=(await db.auth.getUser()).data.user;
  const choice=window.GreenRichCompanies?.selected?.(u?.id);
  const companyId=permitted.includes(choice)?choice:permitted[0];
  return {companyId,...await locate()};
 }
 async function tick(){
  if(!client||document.visibilityState!=='visible'||busy||Date.now()-lastSave<29*60*1000)return;
  busy=true;
  try{
   const permitted=await enabledCompanies(client);
   if(!permitted.length)return;
   const me=(await client.auth.getUser()).data.user;
   if(!me)return;
   const r=await client.from('gr_field_sessions').select('id,company_id').eq('user_id',me.id).is('checkout_at',null).limit(1);
   if(r.error||!r.data?.length)return;
   const session=r.data[0];if(!permitted.includes(session.company_id))return;
   const gps=await locate();
   const saved=await client.rpc('gr_field_record_point',{p_session:session.id,p_lat:gps.latitude,p_lng:gps.longitude,p_accuracy:gps.accuracy});
   if(saved.error)throw Error(saved.error.message);
   // A second tab or the initial header check-in may already have saved this slot.
   // Avoid repeatedly waking the GPS sensor for the same half-hour.
   lastSave=Date.now();
  }catch(err){console.info('Field GPS update skipped:',err.message)}
  finally{busy=false}
 }
 function start(db){
  client=db;
  if(timer)clearInterval(timer);
  timer=setInterval(()=>void tick(),60000);
  document.removeEventListener('visibilitychange',onVisible);
  document.addEventListener('visibilitychange',onVisible);
  void tick();
 }
 function onVisible(){if(document.visibilityState==='visible')void tick()}
 function stop(){if(timer)clearInterval(timer);timer=null;client=null;lastSave=0;document.removeEventListener('visibilitychange',onVisible)}
 window.GreenRichFieldGPS={attendanceBody,requiresAttendanceGPS:async db=>(await enabledCompanies(db)).length>0,start,stop};
})();
