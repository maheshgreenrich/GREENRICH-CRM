'use strict';
/* GreenRich Field Tracker — standalone foreground-only pilot.
   Real employee GPS is requested only by an explicit check-in/visit proof action.
   No service worker, hidden/background capture, or payroll attendance mutation. */
(()=> {
 const $=q=>document.querySelector(q),e=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const fmt=d=>d?new Date(d).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}):'—';
 const stamp=d=>d?new Date(d).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}):'—';
 const coord=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?'<a href="https://www.google.com/maps?q='+encodeURIComponent(a+','+b)+'" target="_blank" rel="noopener noreferrer" class="ft-link">View GPS location</a>':'—';
 const todayLocal=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
 const companies={'grow-india':'GreenRich Grow India Pvt Ltd','enviro-solutions':'GreenRich Enviro Solutions Pvt Ltd'};
 let db,user,profile,company='',tab='shift',isSupervisor=false,isAdmin=false,team=[],visits=[],sessions=[],photos=[],points=[],customers=[],leads=[],supervisors=[],openSession=null;
 let watch=null,lastGpsSent=0,map=null,refreshing=false,monitorTimer=null;
 const notify=(msg,err=false)=>{const n=$('#ft-notice');n.hidden=false;n.className='ft-notice'+(err?' error':'');n.textContent=msg;n.scrollIntoView({block:'nearest',behavior:'smooth'});};
 const run=async(fn)=>{try{return await fn()}catch(err){notify(err?.message||String(err),true);return null}};
 async function rpc(name,args){const r=await db.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data}
 async function q(table,cols='*',configure=x=>x){const result=await configure(db.from(table).select(cols));if(result.error)throw Error(result.error.message);return result.data||[]}
 function hasGPS(){if(!window.isSecureContext||!navigator.geolocation)throw Error('GPS requires HTTPS and a location-enabled browser. Open this page on your phone and allow location access.');}
 function locate(){hasGPS();return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(
  p=>{const c=p.coords;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy))return reject(Error('GPS coordinates unavailable'));resolve({p_lat:c.latitude,p_lng:c.longitude,p_accuracy:c.accuracy});},
  err=>reject(Error(err.code===1?'Location permission denied. Enable location access for this site.':err.code===3?'GPS request timed out. Move outdoors and try again.':'Location unavailable. Enable phone GPS and mobile data.')),
  {enableHighAccuracy:true,timeout:20000,maximumAge:0}));}
 function activeHere(){return openSession&&openSession.company_id===company}
 function stopTracking(){if(watch!==null&&navigator.geolocation){navigator.geolocation.clearWatch(watch);watch=null}}
 function startTracking(){
  stopTracking();if(!openSession||document.visibilityState==='hidden')return;
  try{hasGPS();watch=navigator.geolocation.watchPosition(async p=>{
   if(!openSession||document.visibilityState==='hidden'||Date.now()-lastGpsSent<55000)return;
   lastGpsSent=Date.now();const c=p.coords;
   try{await rpc('gr_field_record_point',{p_session:openSession.id,p_lat:c.latitude,p_lng:c.longitude,p_accuracy:c.accuracy})}
   catch(err){notify('GPS history paused: '+err.message,true);stopTracking();}
  },err=>{if(err.code===1){stopTracking();notify('GPS tracking permission was revoked. Tracking has stopped.',true)}},
  {enableHighAccuracy:true,maximumAge:15000,timeout:20000});}
  catch(err){notify(err.message,true)}
 }
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')startTracking();else stopTracking()});
 window.addEventListener('pagehide',stopTracking);
 function btn(label,action,id='',variant='ft-btn-ghost'){return '<button type="button" class="ft-btn '+variant+'" data-action="'+e(action)+'" data-id="'+e(id)+'">'+e(label)+'</button>'}
 function box(title,body){return '<section class="ft-panel"><h2>'+e(title)+'</h2>'+body+'</section>'}
 const pill=status=>'<span class="ft-pill '+(status==='completed'?'online':status==='on_site'?'online':status==='cancelled'?'warn':'')+'">'+e(status.replaceAll('_',' '))+'</span>';
 function filterCompany(){return visits.filter(x=>x.company_id===company)}
 const ownerName=id=>team.find(t=>t.id===id)?.full_name||(id===user.id?profile.full_name:'Employee '+String(id||'').slice(0,8));
 function sessionState(){return openSession?'<span class="ft-pill online">● Shift checked in</span>':'<span class="ft-pill offline">● Not checked in</span>'}
 function nextTitle(){return {shift:'My Shift',visits:'My Visits',new:'Schedule Field Visit',history:'Visit & Location History',monitor:'Live Team Tracking',team:'Supervisor Access'}[tab]||'Field Tracker'}
 function setupNav(){document.querySelectorAll('#ft-nav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('#ft-monitor-link').hidden=!isSupervisor;$('#ft-team-link').hidden=!isAdmin;$('#ft-title').textContent=nextTitle();}
 async function bootstrap(){
  if(!window.supabase||!window.GREENRICH_PUBLIC_CONFIG)throw Error('Secure Supabase login library or public configuration is unavailable');
  const cfg=window.GREENRICH_PUBLIC_CONFIG;
  db=window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
  const result=await db.auth.getUser();if(result.error||!result.data.user)throw Error('Sign in to GreenRich ONE first, then reopen this tracking page.');
  user=result.data.user;
  const p=await db.from('gr_profiles').select('id,full_name,active,company_ids,role_id').eq('id',user.id).single();
  if(p.error||!p.data?.active)throw Error('An active GreenRich employee profile is required.');
  profile=p.data;
  const ids=(profile.company_ids||[]).filter(x=>companies[x]);
  if(!ids.length)throw Error('Your employee account has no assigned GreenRich company.');
  company=ids.includes('grow-india')?'grow-india':ids[0];$('#ft-user').textContent=profile.full_name;
  $('#ft-company').innerHTML=ids.map(id=>'<option value="'+e(id)+'">'+e(companies[id])+'</option>').join('');
  $('#ft-company').value=company;
  $('#ft-company').onchange=async ev=>{company=ev.target.value;tab='shift';await run(reload)};
  $('#ft-refresh').onclick=()=>run(reload);
  $('#ft-nav').addEventListener('click',ev=>{const item=ev.target.closest('[data-tab]');if(!item)return;const target=item.dataset.tab;
   if((target==='monitor'&&!isSupervisor)||(target==='team'&&!isAdmin))return;
   tab=target;render();if(tab==='monitor')void run(()=>drawMap());});
  $('#ft-content').addEventListener('click',onClick);
  await reload();monitorTimer=setInterval(()=>{if(document.visibilityState==='visible'&&tab==='monitor'&&!refreshing)void run(reload)},30000);
 }
 async function reload(){
  if(refreshing)return;refreshing=true;
  try{
   isSupervisor=await rpc('gr_field_supervisor',{p_company:company});
   isAdmin=await rpc('gr_field_is_admin',{p_company:company});
   const [dir,allVisits,shift,allSessions,allPhotos,allPoints,allCustomers,allLeads,allSupervisors]=await Promise.all([
    rpc('gr_field_directory',{p_company:company}),
    q('gr_field_visits','*',x=>x.eq('company_id',company).order('due_at',{ascending:false}).limit(300)),
    q('gr_field_sessions','*',x=>x.eq('user_id',user.id).is('checkout_at',null).limit(1)),
    q('gr_field_sessions','*',x=>x.eq('company_id',company).order('checkin_at',{ascending:false}).limit(300)),
    q('gr_field_photos','id,company_id,visit_id,uploaded_by,object_path,notes,lat,lng,accuracy_m,captured_at',x=>x.eq('company_id',company).order('captured_at',{ascending:false}).limit(250)),
    isSupervisor?q('gr_field_points','id,session_id,user_id,lat,lng,accuracy_m,recorded_at',x=>x.eq('company_id',company).order('recorded_at',{ascending:false}).limit(600)):Promise.resolve([]),
    q('gr_crm_customers','id,name,mobile,address1,address2,city',x=>x.order('name').limit(200)),
    q('gr_lead_pipeline','company_id,lead_id,contact,title,mobile,lead_heat,assigned_to',x=>x.eq('company_id',company).order('updated_at',{ascending:false}).limit(250)),
    isAdmin?q('gr_field_supervisors','company_id,user_id',x=>x.eq('company_id',company)):Promise.resolve([])
   ]);
   team=dir||[];visits=allVisits;sessions=allSessions;photos=allPhotos;points=allPoints;customers=allCustomers;leads=allLeads;supervisors=allSupervisors;
   // Check across companies so a staff member cannot start a second shift.
   const wasOpen=openSession?.id;const shiftAcross=await q('gr_field_sessions','*',x=>x.eq('user_id',user.id).is('checkout_at',null).limit(1));
   openSession=shiftAcross[0]||null;
   if(wasOpen!==openSession?.id){stopTracking();if(openSession)startTracking();}
   if(!openSession)stopTracking();
   render();if(tab==='monitor')await drawMap();
  }finally{refreshing=false}
 }
 function render(){
  if(map){map.remove();map=null}
  setupNav();const el=$('#ft-content');
  el.innerHTML=tab==='shift'?drawShift():tab==='visits'?drawVisits():tab==='new'?drawNew():tab==='history'?drawHistory():tab==='monitor'&&isSupervisor?drawMonitor():tab==='team'&&isAdmin?drawTeam():drawShift();
 }
 function drawShift(){
  const today=visits.filter(v=>v.assigned_to===user.id&&new Date(v.due_at).toDateString()===new Date().toDateString()).length;
  const completed=visits.filter(v=>v.assigned_to===user.id&&v.status==='completed').length;
  const s=openSession;
  return '<div class="ft-cards">'+[
   ['Shift status',s?'Checked in':'Not checked in'],['Assigned today',today],['My completed visits',completed]
  ].map(x=>'<div class="ft-card"><small>'+e(x[0])+'</small><strong>'+e(x[1])+'</strong></div>').join('')+'</div>'+
   box('My Field Attendance',sessionState()+
    (s?'<p><b>Check-in:</b> '+fmt(s.checkin_at)+'<br><b>Check-in GPS:</b> '+coord(s.checkin_lat,s.checkin_lng)+
     '<br><b>Accuracy:</b> ±'+Math.round(s.checkin_accuracy_m)+' m<br><b>Company:</b> '+e(companies[s.company_id])+'</p>'+
     btn('Check Out With Current GPS','checkout','', 'ft-btn-danger'):
     '<p>Check in to record your server time and GPS coordinates. Location history will update approximately once a minute while this page is visible.</p>'+
     btn('Check In With Current GPS','checkin','','ft-btn')))+
   box('Location sharing & privacy',
    '<p class="ft-note">GPS is only collected after Check In, during an active shift, when this page is open and visible. Phone lock, browser suspension, no network or GPS permission denial may stop updates. You can stop location sharing by checking out. The admin can review locations collected during authorized shifts.</p>'+
    '<p><b>Important:</b> Pilot attendance stays separate from official GreenRich ONE attendance and payroll until approved.</p>')+
   box('My recent field shifts',shiftTable(sessions.filter(x=>x.user_id===user.id).slice(0,8)));
 }
 function shiftTable(list){return list.length?'<div class="ft-tablebox"><table class="ft-table"><thead><tr><th>Employee</th><th>Check-in</th><th>Check-in location</th><th>Check-out</th><th>Check-out location</th><th>History</th></tr></thead><tbody>'+
 list.map(s=>'<tr><td><b>'+e(ownerName(s.user_id))+'</b></td><td>'+fmt(s.checkin_at)+'</td><td>'+coord(s.checkin_lat,s.checkin_lng)+'</td><td>'+fmt(s.checkout_at)+'</td><td>'+coord(s.checkout_lat,s.checkout_lng)+'</td><td>'+btn('GPS route','route',s.id,'ft-btn-ghost ft-btn-sm')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="ft-empty">No field shift records yet.</div>'}
 function drawVisits(){
  const items=filterCompany().filter(v=>v.assigned_to===user.id).sort((a,b)=>(a.status==='completed')-(b.status==='completed')||new Date(a.due_at)-new Date(b.due_at));
  return box('My Assigned Visits','<p>Schedule a visit, check in to your shift, record arrival GPS, upload at least one photo with notes, then complete the visit.</p>'+
   (items.length?items.slice(0,80).map(v=>visitCard(v)).join(''):'<div class="ft-empty">No visits assigned yet. Use Schedule Visit to create your first visit.</div>'));
 }
 function visitCard(v){
  const pp=photos.filter(p=>p.visit_id===v.id);
  const heat=v.lead_heat?'<span class="ft-heat '+e(v.lead_heat.toLowerCase())+'">Lead '+e(v.lead_heat)+'</span>':'';
  const actions=v.status==='planned'?
   btn('Arrived · GPS check-in','arrive',v.id,'ft-btn'):'';
  const extra=v.status==='on_site'?btn('Upload photo proof','upload',v.id,'ft-btn-soft')+
   btn('Complete visit','complete',v.id,'ft-btn'):v.status==='completed'?btn('View proof','proof',v.id):'';
  return '<div class="ft-listitem"><div class="ft-visit"><div><div class="ft-row">'+pill(v.status)+'<span class="ft-pill">'+e(v.visit_type.toUpperCase())+'</span>'+heat+'</div>'+
   '<h3 style="margin-top:10px">'+e(v.title)+'</h3><p><b>Customer:</b> '+e(v.contact_name||'—')+
   ' &nbsp; <b>Scheduled:</b> '+fmt(v.due_at)+'<br><b>Address:</b> '+e(v.address||'—')+
   (v.arrival_at?'<br><b>Arrived:</b> '+fmt(v.arrival_at)+' · '+coord(v.arrival_lat,v.arrival_lng):'')+
   (v.completed_at?'<br><b>Completed:</b> '+fmt(v.completed_at)+' · '+coord(v.completed_lat,v.completed_lng):'')+
   '<br><b>Proof:</b> '+pp.length+' photo(s)'+(v.recurrence_every?'<br><b>Repeat:</b> Every '+v.recurrence_every+' '+e(v.recurrence_unit):'')+'</p>'+
   (v.completion_notes?'<p><b>Report:</b> '+e(v.completion_notes)+'</p>':'')+'</div><div class="ft-actions">'+actions+extra+'</div></div></div>';
 }
 function drawNew(){
  return box('Schedule a service, sales or site visit',
   '<p>Staff can schedule their own visits; supervisors can assign jobs to other staff. Service repeats are automatically scheduled after completion, not sent over WhatsApp.</p>'+
   '<form id="ft-new-form" class="ft-form">'+
   '<label>Visit type <select name="type" required><option value="service">Service / maintenance</option><option value="sales">Sales conversation</option><option value="site">Site visit</option></select></label>'+
   '<label>Assigned employee <select name="assignee">'+team.map(x=>'<option value="'+e(x.id)+'" '+(x.id===user.id?'selected':'')+'>'+e(x.full_name)+'</option>').join('')+'</select></label>'+
   '<label>Customer from CRM (optional)<select name="customer"><option value="">Select customer or enter details</option>'+
   customers.map(x=>'<option value="'+e(x.id)+'" data-name="'+e(x.name)+'" data-phone="'+e(x.mobile||'')+'" data-address="'+e([x.address1,x.address2,x.city].filter(Boolean).join(', '))+'">'+e(x.name)+'</option>').join('')+'</select></label>'+
   '<label>CRM lead (optional)<select name="lead"><option value="">None</option>'+
   leads.map(x=>'<option value="'+e(x.lead_id)+'" data-name="'+e(x.contact||x.title||'')+'" data-phone="'+e(x.mobile||'')+'">'+e(x.contact||x.title||x.lead_id)+'</option>').join('')+'</select></label>'+
   '<label class="wide">Visit title *<input name="title" required maxlength="160" placeholder="Install composting bin / Sales demo / Site inspection"></label>'+
   '<label>Customer / site contact <input name="contact" maxlength="160" placeholder="Contact person"></label>'+
   '<label>Phone <input name="phone" maxlength="30" placeholder="+91…"></label>'+
   '<label class="wide">Customer address / site details <textarea name="address" maxlength="650" rows="2" placeholder="Address and directions"></textarea></label>'+
   '<label>Scheduled date & time *<input type="datetime-local" name="due" required value="'+e(todayLocal())+'"></label>'+
   '<label>Repeat service every <input type="number" name="repeat" min="1" max="365" placeholder="Blank = one-time"></label>'+
   '<label>Repeat unit <select name="unit"><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option></select></label>'+
   '<label>Repeat until (optional)<input type="date" name="repeatEnd"></label>'+
   '<label class="wide">Service / sales purpose <textarea name="notes" maxlength="2000" placeholder="Reason, product, and customer requirements"></textarea></label>'+
   '<div class="wide"><button type="submit" class="ft-btn">Create Field Visit</button></div></form>');
 }
 function drawHistory(){
  const v=filterCompany().slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,120);
  return box('Recorded Service, Sales & Site Visits','<p>Every completed visit retains server timestamps, GPS arrival and completion coordinates, visit notes and private photo evidence.</p>'+
   (v.length?'<div class="ft-tablebox"><table class="ft-table"><thead><tr><th>Visit / employee</th><th>Type</th><th>Scheduled</th><th>Arrival GPS</th><th>Completion GPS</th><th>Report</th><th>Evidence</th></tr></thead><tbody>'+
    v.map(x=>'<tr><td><b>'+e(x.title)+'</b><br>'+e(ownerName(x.assigned_to))+'<br>'+e(x.contact_name||'')+'</td><td>'+pill(x.status)+'<br>'+e(x.visit_type)+'</td>'+
     '<td>'+fmt(x.due_at)+'</td><td>'+fmt(x.arrival_at)+'<br>'+coord(x.arrival_lat,x.arrival_lng)+'</td>'+
     '<td>'+fmt(x.completed_at)+'<br>'+coord(x.completed_lat,x.completed_lng)+'</td>'+
     '<td>'+e(x.completion_notes||x.notes||'—')+(x.lead_heat?'<br><b>Lead: '+e(x.lead_heat)+'</b>':'')+'</td>'+
     '<td>'+btn('Photos ('+photos.filter(p=>p.visit_id===x.id).length+')','proof',x.id,'ft-btn-sm ft-btn-ghost')+'</td></tr>').join('')+
     '</tbody></table></div>':'<div class="ft-empty">No visit history available.</div>')+
  (isSupervisor?box('Recent Field Shift Logs',shiftTable(sessions.slice(0,70))):box('My Field Shift Logs',shiftTable(sessions.filter(x=>x.user_id===user.id).slice(0,50))));
 }
 function drawMonitor(){
  const active=sessions.filter(x=>!x.checkout_at);
  const latest=active.map(s=>{const p=points.find(x=>x.session_id===s.id);return {session:s,p:p||{lat:s.checkin_lat,lng:s.checkin_lng,recorded_at:s.checkin_at,accuracy_m:s.checkin_accuracy_m}}});
  const live=latest.filter(x=>Date.now()-new Date(x.p.recorded_at).getTime()<120000).length;
  return '<div class="ft-cards"><div class="ft-card"><small>Active shifts</small><strong>'+active.length+'</strong></div>'+
   '<div class="ft-card"><small>Recent GPS updates (2 min)</small><strong>'+live+'</strong></div>'+
   '<div class="ft-card"><small>Company visits</small><strong>'+filterCompany().length+'</strong></div></div>'+
   box('Field Staff Location Map','<p>Only staff who explicitly checked in are shown. A stale marker is the last reported position, not guaranteed real-time GPS. The page refreshes approximately every 30 seconds while visible.</p>'+
    '<div id="ft-map" class="ft-map" role="img" aria-label="Latest GPS coordinates of checked-in employees"></div>')+
   box('Active Employee Positions',latest.length?'<div class="ft-tablebox"><table class="ft-table"><thead><tr><th>Employee</th><th>Shift started</th><th>Last GPS update</th><th>Accuracy</th><th>Position</th><th>History</th></tr></thead><tbody>'+
   latest.map(x=>'<tr><td><b>'+e(ownerName(x.session.user_id))+'</b></td><td>'+fmt(x.session.checkin_at)+'</td><td>'+
    fmt(x.p.recorded_at)+' <span class="ft-pill '+(Date.now()-new Date(x.p.recorded_at).getTime()<120000?'online':'offline')+'">'+
    (Date.now()-new Date(x.p.recorded_at).getTime()<120000?'Recent':'Stale')+'</span></td><td>±'+Math.round(x.p.accuracy_m)+' m</td><td>'+coord(x.p.lat,x.p.lng)+'</td><td>'+btn('Show route','route',x.session.id,'ft-btn-sm ft-btn-ghost')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="ft-empty">No employee has an active field shift.</div>');
 }
 async function drawMap(){
  if(tab!=='monitor'||!isSupervisor||!$('#ft-map'))return;
  if(!window.L){$('#ft-map').textContent='Map tiles unavailable. GPS locations are listed below with map links.';return}
  const active=sessions.filter(x=>!x.checkout_at);
  if(map){map.remove();map=null}
  map=window.L.map('ft-map').setView([11.0,78.0],6);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
   {attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
  const marks=[];
  for(const s of active){
   const p=points.find(x=>x.session_id===s.id)||{lat:s.checkin_lat,lng:s.checkin_lng,recorded_at:s.checkin_at};
   const m=window.L.marker([p.lat,p.lng]).addTo(map);
   const el=document.createElement('div');el.textContent=ownerName(s.user_id)+' · Last update '+fmt(p.recorded_at);
   m.bindPopup(el);marks.push([p.lat,p.lng]);
  }
  if(marks.length)map.fitBounds(window.L.latLngBounds(marks).pad(.3),{maxZoom:14});
  setTimeout(()=>map?.invalidateSize(),100);
 }
 function drawTeam(){
  return box('Allow a Sales Head or Service Head to monitor this company',
   '<p>Admin/Director roles already have company-scoped visibility. You can explicitly grant and revoke read-only tracking dashboard access for another active employee. Access includes location history, so grant it only to authorized managers.</p>'+
   '<form id="ft-supervisor-form" class="ft-form">'+
   '<label>Employee <select name="person" required>'+team.map(t=>'<option value="'+e(t.id)+'">'+e(t.full_name)+'</option>').join('')+'</select></label>'+
   '<label>Permission <select name="enable"><option value="yes">Grant tracking dashboard</option><option value="no">Revoke tracking dashboard</option></select></label>'+
   '<div class="wide"><button class="ft-btn" type="submit">Save Permission</button></div></form>'+
   '<p><b>Additional supervisors currently granted:</b> '+(supervisors.length?supervisors.map(s=>e(ownerName(s.user_id))).join(', '):'None')+'</p>');
 }
 function modal(title,body,submit){
  const d=document.createElement('dialog');d.className='ft-modal';d.innerHTML='<div class="ft-modal-inner"><div class="ft-row ft-between"><h2>'+e(title)+'</h2><button class="ft-btn ft-btn-ghost ft-btn-sm" data-close type="button">✕ Close</button></div>'+body+'</div>';
  document.body.appendChild(d);d.querySelector('[data-close]').onclick=()=>d.close();d.onclose=()=>d.remove();
  const form=d.querySelector('form');if(form&&submit)form.onsubmit=async ev=>{
   ev.preventDefault();const save=form.querySelector('[type=submit]');if(save)save.disabled=true;
   try{await submit(new FormData(form),form);d.close();await reload()}
   catch(err){notify(err.message,true)}finally{if(save)save.disabled=false}
  };d.showModal();return d;
 }
 async function onClick(ev){
  const b=ev.target.closest('[data-action]');if(b){const id=b.dataset.id;const action=b.dataset.action;
   b.disabled=true;try{await actionHandler(action,id)}catch(err){notify(err.message,true)}finally{b.disabled=false}return}
  if(ev.target.closest('#ft-new-form button[type=submit]'))return;
 }
 async function actionHandler(action,id){
  if(action==='checkin'){
   if(openSession)throw Error('Already checked in. Check out before starting a new shift.');
   const p=await locate();const s=await rpc('gr_field_clock_in',{p_company:company,...p});
   notify('Field check-in recorded using server time and GPS. Shift '+String(s).slice(0,8)+'.');await reload();startTracking();
  }else if(action==='checkout'){
   if(!openSession)throw Error('No active field shift');
   const p=await locate();await rpc('gr_field_clock_out',{p_session:openSession.id,...p});stopTracking();
   notify('Field check-out time and GPS saved. Tracking stopped.');await reload();
  }else if(action==='arrive'){
   const p=await locate();await rpc('gr_field_arrive',{p_visit:id,...p});notify('Customer/site arrival time and GPS recorded. Upload photo proof before completing.');await reload();
  }else if(action==='upload')await showUpload(id);
  else if(action==='complete')await showComplete(id);
  else if(action==='proof')await showProof(id);
  else if(action==='route')await showRoute(id);
 }
 async function showUpload(id){
  const v=visits.find(x=>x.id===id&&x.assigned_to===user.id&&x.status==='on_site');
  if(!v)throw Error('Only the assigned technician on site may upload visit proof.');
  modal('Photo proof · '+v.title,'<p>Take or select one JPEG, PNG or WebP image (max 5 MB). GPS, server timestamp, staff name and notes are saved with this proof.</p>'+
   '<form class="ft-form"><label>Photo from camera or gallery *<input type="file" name="photo" required accept="image/jpeg,image/png,image/webp" capture="environment"></label>'+
   '<label class="wide">Photo notes / what this proves *<textarea name="notes" minlength="5" required placeholder="Equipment condition, installed item, demonstration or customer visit evidence"></textarea></label>'+
   '<button class="ft-btn" type="submit">Upload Private GPS Photo</button></form>',
   async(fd)=>{
    const file=fd.get('photo'),notes=String(fd.get('notes')||'').trim();
    if(!(file instanceof File)||!file.size||file.size>5242880||!['image/jpeg','image/png','image/webp'].includes(file.type))
     throw Error('Select JPG, PNG or WebP under 5 MB');
    if(notes.length<5)throw Error('Photo notes are required');
    const p=await locate(),ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    const path=v.company_id+'/'+v.id+'/'+user.id+'/'+crypto.randomUUID()+'.'+ext;
    const put=await db.storage.from('gr-field-visit-proofs').upload(path,file,{contentType:file.type,upsert:false});
    if(put.error)throw Error('Photo upload failed: '+put.error.message);
    try{await rpc('gr_field_add_photo',{p_visit:v.id,p_path:path,p_note:notes,...p})}
    catch(err){throw Error('Photo uploaded but evidence registration failed: '+err.message+' (ask Admin to reconcile; do not keep retrying uploads)')}
    notify('GPS-stamped service/sales visit photo and notes saved privately.');
   });
 }
 async function showComplete(id){
  const v=visits.find(x=>x.id===id&&x.assigned_to===user.id&&x.status==='on_site');
  if(!v)throw Error('An on-site assigned visit is required.');
  if(!photos.some(x=>x.visit_id===v.id))throw Error('Upload at least one service/site photo before finishing the visit.');
  const sales=(v.visit_type==='sales'||v.visit_type==='site')&&!!v.lead_id;
  modal('Complete Visit · '+v.title,
   '<p>Completion captures current GPS and server time. Enter the work performed or sales conversation. For a linked sales/site lead, update its Hot/Warm/Cold priority.</p>'+
   '<form class="ft-form"><label class="wide">Service report / customer conversation *<textarea name="notes" minlength="10" maxlength="4000" required placeholder="Problem, action taken, customer response, follow-up needed"></textarea></label>'+
   (sales?'<label>Lead priority <select name="heat" required><option value="">Choose</option><option value="Hot">Hot</option><option value="Warm">Warm</option><option value="Cold">Cold</option></select></label>':'')+
   '<button class="ft-btn" type="submit">Save GPS Completion</button></form>',
   async fd=>{
    const notes=String(fd.get('notes')||'').trim(),heat=sales?String(fd.get('heat')||''):null;
    if(notes.length<10)throw Error('Add at least 10 characters about this visit');
    if(sales&&!['Hot','Warm','Cold'].includes(heat))throw Error('Choose lead priority');
    const p=await locate();const next=await rpc('gr_field_finish_visit',{p_visit:v.id,p_notes:notes,p_heat:heat,...p});
    notify('Visit completed with location, time, report and evidence.'+(next?' Next recurring service job scheduled automatically.':''));
   });
 }
 async function showProof(id){
  const v=visits.find(x=>x.id===id);if(!v)throw Error('Visit inaccessible');
  const pp=photos.filter(x=>x.visit_id===id),cards=[];
  for(const p of pp){
   const r=await db.storage.from('gr-field-visit-proofs').createSignedUrl(p.object_path,300);
   if(r.error){cards.push('<div class="ft-photo">Private image unavailable: '+e(r.error.message)+'</div>');continue}
   const url=r.data.signedUrl;cards.push('<div class="ft-photo"><a target="_blank" rel="noopener noreferrer" href="'+e(url)+'">'+
    '<img loading="lazy" src="'+e(url)+'" alt="Visit evidence photo"></a><span>'+fmt(p.captured_at)+'</span><span>'+e(p.notes)+'</span>'+
    '<span>'+coord(p.lat,p.lng)+'</span></div>');
  }
  modal('Visit evidence · '+v.title,'<p><b>Arrived:</b> '+fmt(v.arrival_at)+' · '+coord(v.arrival_lat,v.arrival_lng)+
   '<br><b>Completed:</b> '+fmt(v.completed_at)+' · '+coord(v.completed_lat,v.completed_lng)+
   '<br><b>Conversation / service report:</b> '+e(v.completion_notes||v.notes||'—')+
   '</p><div class="ft-photos">'+(cards.join('')||'No proof photos uploaded yet.')+'</div>');
 }
 async function showRoute(sessionId){
  const s=sessions.find(x=>x.id===sessionId);if(!s)throw Error('No authorized access to this field session');
  const list=await q('gr_field_points','lat,lng,accuracy_m,recorded_at',x=>x.eq('session_id',sessionId).order('recorded_at',{ascending:true}).limit(1200));
  const d=modal('GPS Route · '+ownerName(s.user_id),
   '<p>Check-in: '+fmt(s.checkin_at)+' · Check-out: '+fmt(s.checkout_at)+
   '. These are recorded GPS samples, not a guaranteed continuous route. Each marker has server time and accuracy.</p>'+
   '<div id="ft-route-map" class="ft-map"></div>'+
   '<div class="ft-tablebox"><table class="ft-table"><thead><tr><th>Captured</th><th>Accuracy</th><th>GPS</th></tr></thead><tbody>'+
   list.slice(-150).reverse().map(p=>'<tr><td>'+fmt(p.recorded_at)+'</td><td>±'+Math.round(p.accuracy_m)+'m</td><td>'+coord(p.lat,p.lng)+'</td></tr>').join('')+'</tbody></table></div>');
  if(window.L&&list.length){
   const m=window.L.map(d.querySelector('#ft-route-map')).setView([list[0].lat,list[0].lng],13);
   window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(m);
   const pts=list.map(p=>[p.lat,p.lng]);window.L.polyline(pts,{color:'#137454'}).addTo(m);
   window.L.circleMarker(pts[0],{radius:7,color:'#176d51'}).addTo(m).bindPopup('Check-in route start');
   window.L.circleMarker(pts[pts.length-1],{radius:7,color:'#a34635'}).addTo(m).bindPopup('Last reported point');
   m.fitBounds(window.L.latLngBounds(pts).pad(.25),{maxZoom:16});
   const prev=d.onclose;d.onclose=()=>{m.remove();prev?.()};
   setTimeout(()=>m.invalidateSize(),100);
  }else if(d.querySelector('#ft-route-map'))d.querySelector('#ft-route-map').textContent='GPS route map unavailable. See the location links below.';
 }
 document.addEventListener('submit',async ev=>{
  const form=ev.target;
  if(form.id==='ft-new-form'){
   ev.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;
   await run(async()=>{
    const fd=new FormData(form),type=String(fd.get('type')),repeat=String(fd.get('repeat')||'').trim(),
     due=String(fd.get('due')||''),date=new Date(due),name=String(fd.get('title')||'').trim();
    if(name.length<3||!due||!Number.isFinite(date.getTime()))throw Error('Title and valid scheduled date are required');
    if(repeat&&type!=='service')throw Error('Repeat scheduling is supported for service visits only');
    const newId=await rpc('gr_field_create_visit',{p_company:company,p_type:type,p_title:name,
     p_contact:String(fd.get('contact')||''),p_phone:String(fd.get('phone')||''),
     p_address:String(fd.get('address')||''),p_assignee:String(fd.get('assignee')||user.id),
     p_due:date.toISOString(),p_customer:fd.get('customer')||null,p_lead:fd.get('lead')||null,
     p_repeat_every:repeat?Number(repeat):null,p_repeat_unit:repeat?String(fd.get('unit')||'days'):null,
     p_repeat_end:fd.get('repeatEnd')||null,p_notes:String(fd.get('notes')||'')});
    notify('Field visit scheduled.'+(repeat?' The next repeat will be created after this visit is completed.':''));
    tab='visits';await reload();
   });b.disabled=false;
  }else if(form.id==='ft-supervisor-form'){
   ev.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;
   await run(async()=>{
    const fd=new FormData(form);await rpc('gr_field_assign_supervisor',
     {p_company:company,p_user:String(fd.get('person')),p_enable:fd.get('enable')==='yes'});
    notify('Supervisor GPS access updated.');await reload();
   });b.disabled=false;
  }
 });
 document.addEventListener('change',ev=>{
  const f=ev.target.closest('#ft-new-form');if(!f)return;
  if(ev.target.name==='customer'||ev.target.name==='lead'){
   const o=ev.target.selectedOptions?.[0];if(!o?.value)return;
   if(o.dataset.name)f.elements.contact.value=o.dataset.name;
   if(o.dataset.phone)f.elements.phone.value=o.dataset.phone;
   if(o.dataset.address)f.elements.address.value=o.dataset.address;
  }
  if(ev.target.name==='type'){
   const service=ev.target.value==='service';
   f.elements.repeat.disabled=!service;f.elements.unit.disabled=!service;f.elements.repeatEnd.disabled=!service;
   if(!service)f.elements.repeat.value='';
  }
 });
 bootstrap().catch(err=>{
  $('#ft-content').innerHTML='<section class="ft-panel"><h2>Sign in to GreenRich ONE</h2><p>'+e(err.message)+'</p><a href="./secure.html" class="ft-btn">Open secure login</a></section>';
  $('#ft-user').textContent='Login required';notify(err.message,true);
 });
})();