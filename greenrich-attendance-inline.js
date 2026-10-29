'use strict';
window.GreenRichAttendance=(function(){
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const localDay=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>p.find(x=>x.type===t).value;return get('year')+'-'+get('month')+'-'+get('day')};
 const iso=value=>value?new Date(value.length===16?value+':00+05:30':value).toISOString():null;
 const shortDate=s=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:true}):'—';
 const officeLocal=s=>{if(!s)return '';const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(s));const v=t=>p.find(x=>x.type===t).value;return v('year')+'-'+v('month')+'-'+v('day')+'T'+v('hour')+':'+v('minute')};
 const input=(form,name)=>form.elements.namedItem(name).value;
 const today=localDay();
 let db,apiRoot,apiKey,actorRole='',actorName='',staff=[],departments=[],shifts=[],holidays=[],adminItems=[],myPage=1,adminPage=1,ownId='',workingDays=[1,2,3,4,5,6];
 const manager=()=>actorRole==='Admin'||actorRole==='Office Admin';
 const notify=(message,error=false)=>{const e=$('#alert');e.hidden=false;e.textContent=message;e.classList.toggle('error',error);e.scrollIntoView({behavior:'smooth',block:'nearest'})};
 async function request(path,method='GET',body=null,download=false){
  const session=(await db.auth.getSession()).data.session;
  if(!session)throw Error('Sign in again to continue.');
  const r=await fetch(apiRoot+path,{method,headers:{Authorization:'Bearer '+session.access_token,apikey:apiKey,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  if(download){if(!r.ok){const b=await r.json().catch(()=>null);throw Error(b?.error?.message||'Download failed ('+r.status+')')}return r}
  const b=await r.json().catch(()=>null);
  if(!r.ok)throw Error(b?.error?.message||'Attendance server rejected this request ('+r.status+')');
  return b.data;
 }
 async function safe(task){try{await task()}catch(e){notify(e.message,true)}}
 const params=data=>{const u=new URLSearchParams();Object.entries(data).forEach(([k,v])=>{if(v!==''&&v!==undefined&&v!==null)u.set(k,v)});return u.toString()};
 const tRow=(values)=>'<tr>'+values.map(x=>'<td>'+x+'</td>').join('')+'</tr>';
 const table=(list,render,empty)=>list.length?list.map(render).join(''):'<p class="av-empty">'+empty+'</p>';
 function tab(which){
  $$('.av-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===which));
  $$('.av-section').forEach(s=>s.hidden=s.id!=='tab-'+which);
  if(which==='mine')safe(loadMine);
  if(which==='requests')safe(loadRequests);
  if(which==='admin')safe(loadAdmin);
  if(which==='config')safe(loadConfiguration);
 }
 async function init(){
  const url=localStorage.getItem('gr-supabase-url'),key=localStorage.getItem('gr-supabase-key');
  if(!url||!key||!window.supabase)throw Error('Connect Supabase through GreenRich ONE secure login first.');
  db=window.supabase.createClient(url,key);apiKey=key;apiRoot=url.replace(/\/$/,'')+'/functions/v1/attendance-api';
  const user=(await db.auth.getUser()).data.user;
  if(!user)throw Error('Sign in using the secure GreenRich ONE login.');
  const p=await db.from('gr_profiles').select('full_name,active,role_id,shift_id').eq('id',user.id).single();
  if(p.error||!p.data?.active)throw Error('Employee account is not active.');
  const role=await db.from('gr_roles').select('name').eq('id',p.data.role_id).single();
  if(role.error)throw Error(role.error.message);
  actorRole=role.data.name;actorName=p.data.full_name;ownId=user.id;
  if(p.data.shift_id){const assignedShift=await db.from('grm_shifts').select('working_days').eq('id',p.data.shift_id).maybeSingle();if(!assignedShift.error&&Array.isArray(assignedShift.data?.working_days))workingDays=assignedShift.data.working_days;}
  $('#todayLabel').textContent='Today · '+today;
  $('#adminTab').hidden=!manager();$('#manageTab').hidden=!manager();$('#launchPanel').hidden=actorRole!=='Admin';$('#launchDate').min=today;$('#launchDate').value=today;
  $('#myMonth').value=today.slice(0,7);$('#reportMonth').value=today.slice(0,7);
  $('#adminFrom').value=today.slice(0,7)+'-01';$('#adminTo').value=today;
  $('#correctionDate').max=new Date(new Date(today+'T00:00:00Z').getTime()-86400000).toISOString().slice(0,10);
  
  $$('.av-tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
  $('#checkIn').onclick=()=>safe(async()=>{await request('/attendance/check-in','POST',{});notify('Check-in saved using server time.');await loadMine()});
  $('#checkOut').onclick=()=>safe(async()=>{await request('/attendance/check-out','POST',{});notify('Check-out saved using server time.');await loadMine()});
  $('#myMonth').onchange=()=>{myPage=1;safe(loadMine)};
  $('#myPrev').onclick=()=>{myPage=Math.max(1,myPage-1);safe(loadMine)};
  $('#myNext').onclick=()=>{myPage++;safe(loadMine)};
  $('#correctionForm').onsubmit=e=>{e.preventDefault();safe(async()=>{
   const f=e.currentTarget;
   await request('/attendance/corrections','POST',{date:input(f,'date'),requestedCheckIn:iso(input(f,'in')),requestedCheckOut:iso(input(f,'out')),reason:input(f,'reason')});
   f.reset();notify('Attendance correction submitted for Office Admin review.');await loadRequests();
  })};
  $('#leaveForm').onsubmit=e=>{e.preventDefault();safe(async()=>{
   const f=e.currentTarget;await request('/leaves','POST',{type:input(f,'type'),fromDate:input(f,'from'),toDate:input(f,'to'),reason:input(f,'reason')});
   f.reset();notify('Leave request submitted.');await loadRequests();
  })};
  $('#adminFilters').onsubmit=e=>{e.preventDefault();adminPage=1;safe(loadAdmin)};
  $('#adminPrev').onclick=()=>{adminPage=Math.max(1,adminPage-1);safe(loadAdmin)};
  $('#adminNext').onclick=()=>{adminPage++;safe(loadAdmin)};
  $('#adminMark').onsubmit=e=>{e.preventDefault();safe(async()=>{
   const f=e.currentTarget;
   const editing=f.dataset.recordId;
   await request(editing?'/admin/attendance/'+editing:'/admin/attendance',editing?'PUT':'POST',{
    userId:input(f,'userId'),date:input(f,'date'),status:input(f,'status'),checkIn:iso(input(f,'checkIn')),
    checkOut:iso(input(f,'checkOut')),reason:input(f,'reason')});
   f.dataset.recordId='';f.reset();notify('Attendance saved and audited.');await loadAdmin();
  })};
  $('#bulkForm').onsubmit=e=>{e.preventDefault();safe(async()=>{
   const f=e.currentTarget,ids=$$('#bulkUsers input:checked').map(el=>el.value);
   if(!ids.length)throw Error('Select at least one employee.');
   if(!confirm('Mark '+ids.length+' employee(s)?'))return;
   const result=await request('/admin/attendance/bulk','POST',{userIds:ids,date:input(f,'date'),status:input(f,'status'),reason:input(f,'reason')});
   notify('Updated '+result.updated+' employee attendance records.');await loadAdmin();
  })};
  $$('[data-export]').forEach(b=>b.onclick=()=>safe(async()=>{
   const ext=b.dataset.export,m=$('#reportMonth').value;
   const response=await request('/admin/reports/monthly?'+params({month:m,format:ext}),'GET',null,true);
   const blob=await response.blob(),link=document.createElement('a'),url=URL.createObjectURL(blob);
   link.href=url;link.download='greenrich-attendance-'+m+'.'+ext;link.click();setTimeout(()=>URL.revokeObjectURL(url),500);
  }));
  $('#launchForm').onsubmit=e=>{e.preventDefault();safe(async()=>{
  if(actorRole!=='Admin')throw Error('Built-in Admin permission required');
  if(!confirm('Enable automatic ABSENT marking from the selected date?'))return;
  const f=e.currentTarget;
  const result=await request('/admin/settings/launch','POST',{startDate:input(f,'startDate'),reason:input(f,'reason')});
  notify('Daily automatic absence marking will start from '+result.enabledFrom+'.');
  await loadConfiguration();
 })};
 $('#disableLaunch').onclick=()=>safe(async()=>{
  if(actorRole!=='Admin')throw Error('Built-in Admin permission required');
  if(!confirm('Disable automatic ABSENT marking for all employees?'))return;
  const reason=prompt('Reason for disabling automatic absent marking (required):');if(reason===null)return;
  await request('/admin/settings/launch','POST',{startDate:null,reason});
  notify('Automatic absence marking disabled.');await loadConfiguration();
 });
 $('#holidayForm').onsubmit=e=>{e.preventDefault();safe(()=>saveConfig('holidays',e.currentTarget))};
  $('#shiftForm').onsubmit=e=>{e.preventDefault();safe(()=>saveConfig('shifts',e.currentTarget))};
  $('#departmentForm').onsubmit=e=>{e.preventDefault();safe(()=>saveConfig('departments',e.currentTarget))};
  try{await loadMine();if(manager())safe(loadPendingCount);}catch(e){notify('Attendance could not load: '+e.message+'. Check your login and Attendance API access.',true)}
 }
 async function loadMine(){
  const month=$('#myMonth').value,from=month+'-01',to=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  const [history,summary,holidayList]=await Promise.all([
   request('/attendance/me?'+params({from,to,page:1,pageSize:100})),
   request('/attendance/me/summary?'+params({month})),
   db.from('grm_holidays').select('date,name').gte('date',from).lte('date',to)
  ]);
  const records=history.items||[],byDate=new Map(records.map(x=>[x.date,x]));
  const specialDays=new Map((holidayList.data||[]).map(x=>[x.date,x.name]));
  const todayRecord=byDate.get(localDay());
  const checkIn=todayRecord?.check_in,checkOut=todayRecord?.check_out;
  $('#checkInTime').textContent=checkIn?shortDate(checkIn):'Not marked';
  $('#checkOutTime').textContent=checkOut?shortDate(checkOut):'Not marked';
  $('#checkIn').disabled=!!todayRecord;
  $('#checkOut').disabled=!checkIn||!!checkOut;
  $('#clockStatus').textContent=checkOut?'Completed for today · '+Number(todayRecord.total_hours||0).toFixed(2)+' hours':checkIn?'Checked in. Remember to check out before leaving.':todayRecord?'Attendance already recorded for today.':'You have not checked in today.';
  const totals=[['Present',summary.present],['Late',summary.late],['Half Day',summary.half_day],['Absent',summary.absent],['Leave',summary.leave],['Hours',summary.hours]];
  $('#mySummary').innerHTML=totals.map(([name,count])=>'<div class="card"><small>'+esc(name)+'</small><strong>'+esc(count||0)+'</strong></div>').join('');
  const year=Number(month.slice(0,4)),mo=Number(month.slice(5,7)),days=new Date(Date.UTC(year,mo,0)).getUTCDate();
  let cells=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>'<div class="av-calendar-weekday">'+d+'</div>');
  const firstWeekday=(new Date(Date.UTC(year,mo-1,1)).getUTCDay()+6)%7;
  for(let i=0;i<firstWeekday;i++)cells.push('<div class="av-calendar-empty" aria-hidden="true"></div>');
  for(let day=1;day<=days;day++){
   const date=month+'-'+String(day).padStart(2,'0'),entry=byDate.get(date);
   const isoDay=new Date(date+'T00:00:00Z').getUTCDay();
   const weekday=isoDay===0?7:isoDay;
   const actual=entry?.status;
   const status=actual||(specialDays.has(date)?'HOLIDAY':!workingDays.includes(weekday)?'WEEKEND':'UNMARKED');
   const label=({PRESENT:'Present',LATE:'Late',HALF_DAY:'Half Day',ABSENT:'Absent',ON_LEAVE:'Leave',HOLIDAY:'Holiday',WEEKEND:'Weekend',UNMARKED:'—'})[status]||status;
   const color=({PRESENT:'present',LATE:'present',HALF_DAY:'half',ABSENT:'absent',ON_LEAVE:'leave',HOLIDAY:'holiday',WEEKEND:'weekend',UNMARKED:'unmarked'})[status]||'unmarked';
   const title=specialDays.get(date)||label;
   cells.push('<div class="av-calendar-day '+color+(date===localDay()?' today':'')+'" title="'+esc(date+' — '+title)+'"><strong>'+day+'</strong><small>'+esc(label)+'</small></div>');
  }
  $('#myCalendar').innerHTML=cells.join('');
  $('#myRows').innerHTML=records.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(x=>tRow([esc(x.date),esc(x.status),esc(shortDate(x.check_in)),esc(shortDate(x.check_out)),esc(x.total_hours??'—')])).join('')||'<tr><td colspan="5">No attendance marked this month. Calendar still shows weekends and holidays.</td></tr>';
  $('#myPager').textContent='Showing '+records.length+' records for '+month;
  await loadRequests();
 }
 async function loadRequests(){
  const [corrections,leaves]=await Promise.all([request('/attendance/corrections/me'),request('/leaves/me')]);
  $('#myCorrections').innerHTML=table(corrections.items,r=>'<div class="av-entry"><b>'+esc(r.date)+'</b> <span>'+esc(r.status)+'</span><small>'+esc(r.reason)+'</small></div>','No correction requests');
  $('#myLeaves').innerHTML=table(leaves.items,r=>'<div class="av-entry"><b>'+esc(r.from_date)+' — '+esc(r.to_date)+'</b> <span>'+esc(r.status)+'</span><small>'+esc(r.type)+'</small></div>','No leave applications');
 }
 async function loadStaff(){
  if(!manager())return;
  [staff,departments]=await Promise.all([request('/admin/staff'),request('/admin/departments')]);
  const users=staff.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.full_name)+'</option>').join('');
  $('#markEmployee').innerHTML=users;
  $('#filterEmployee').innerHTML='<option value="">All Employees</option>'+users;
  $('#filterDepartment').innerHTML='<option value="">All Departments</option>'+departments.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join('');
  $('#bulkUsers').innerHTML=staff.map(p=>'<label><input type="checkbox" value="'+esc(p.id)+'"> '+esc(p.full_name)+'</label>').join('');
 }
 async function loadAdmin(){
  if(!manager())return;
  if(!staff.length)await loadStaff();
  const f=$('#adminFilters'),query=params({userId:input(f,'userId'),department:input(f,'department'),from:input(f,'from'),to:input(f,'to'),status:input(f,'status'),page:adminPage,pageSize:20});
  const result=await request('/admin/attendance?'+query);adminItems=result.items;
  $('#adminRows').innerHTML=adminItems.map(r=>tRow([
   esc(r.date),esc(r.gr_profiles?.full_name||staff.find(p=>p.id===r.user_id)?.full_name||r.user_id),
   esc(r.status),esc(shortDate(r.check_in)),esc(shortDate(r.check_out)),
   '<button class="secondary" data-edit="'+esc(r.id)+'">Edit</button> <button class="secondary" data-delete="'+esc(r.id)+'">Delete</button>'
  ])).join('')||'<tr><td colspan="6">No records match these filters.</td></tr>';
  $('#adminPager').textContent='Page '+result.page+' of '+Math.max(1,result.pages)+' · '+result.total+' records';
  $('#adminPrev').disabled=adminPage<=1;$('#adminNext').disabled=adminPage>=result.pages;
  $$('#adminRows [data-edit]').forEach(b=>b.onclick=()=>{
   const r=adminItems.find(x=>x.id===b.dataset.edit);if(!r)return;
   const f=$('#adminMark');f.dataset.recordId=r.id;
   f.elements.namedItem('userId').value=r.user_id;f.elements.namedItem('date').value=r.date;
   f.elements.namedItem('status').value=r.status;
   f.elements.namedItem('checkIn').value=officeLocal(r.check_in);
   f.elements.namedItem('checkOut').value=officeLocal(r.check_out);
   notify('Record loaded. Enter a reason and save to correct the record.');f.scrollIntoView({block:'center',behavior:'smooth'});
  });
  $$('#adminRows [data-delete]').forEach(b=>b.onclick=()=>safe(async()=>{
   const reason=prompt('Reason for deleting this record (mandatory):');if(reason===null)return;
   if(!confirm('Delete this attendance record?'))return;
   await request('/admin/attendance/'+b.dataset.delete,'DELETE',{reason});
   notify('Attendance soft-deleted with audit record.');await loadAdmin();
  }));
  const [corrections,leaves]=await Promise.all([request('/admin/corrections?'+params({status:'PENDING'})),request('/admin/leaves?'+params({status:'PENDING'}))]);
  function approveRows(container,items,kind){
   $(container).innerHTML=table(items,r=>'<div class="av-entry"><strong>'+esc(staff.find(x=>x.id===r.user_id)?.full_name||r.user_id)+'</strong><b>'+esc(kind==='corrections'?r.date:r.from_date+' to '+r.to_date)+'</b><small>'+esc(r.reason)+'</small><div class="av-actions"><button class="secondary" data-review="'+esc(r.id)+'" data-decision="APPROVED">Approve</button><button class="secondary" data-review="'+esc(r.id)+'" data-decision="REJECTED">Reject</button></div></div>','No pending requests');
   $$(container+' [data-review]').forEach(b=>b.onclick=()=>safe(async()=>{
    const note=prompt('Review note (mandatory):');if(note===null)return;
    await request('/admin/'+kind+'/'+b.dataset.review+'/review','PATCH',{decision:b.dataset.decision,note});
    notify('Request '+b.dataset.decision.toLowerCase()+'.');await loadAdmin();
   }));
  }
  approveRows('#adminCorrections',corrections.items,'corrections');approveRows('#adminLeaves',leaves.items,'leaves');
 }
 async function loadConfiguration(){
  if(!manager())return;
  if(actorRole==='Admin'){const setting=await request('/admin/settings/launch');$('#launchStatus').textContent=setting.enabled_from?'Automatic absence marking starts on '+setting.enabled_from+' (office timezone).':'Automatic absence marking is currently disabled.';}
  if(!staff.length)await loadStaff();
  [holidays,shifts,departments]=await Promise.all([request('/admin/holidays'),request('/admin/shifts'),request('/admin/departments')]);
  function render(kind,target,items,desc){
   $(target).innerHTML=table(items,r=>'<div class="av-entry"><strong>'+esc(r.name)+'</strong><span>'+esc(desc(r))+'</span><div class="av-actions"><button class="secondary" data-change="'+esc(r.id)+'">Edit</button><button class="secondary" data-remove="'+esc(r.id)+'">Delete</button></div></div>','No records');
   $$(target+' [data-change]').forEach(b=>b.onclick=()=>{
    const r=items.find(x=>x.id===b.dataset.change),f=$('#'+(kind==='holidays'?'holidayForm':kind==='shifts'?'shiftForm':'departmentForm'));
    f.elements.namedItem('id').value=r.id;f.elements.namedItem('name').value=r.name;
    if(kind==='holidays')f.elements.namedItem('date').value=r.date;
    if(kind==='shifts'){for(const [n,key] of [['startTime','start_time'],['endTime','end_time'],['graceMinutes','grace_minutes'],['halfDayHours','half_day_hours']])f.elements.namedItem(n).value=r[key];
     f.elements.namedItem('workingDays').value=(r.working_days||[]).join(',')}
    f.scrollIntoView({behavior:'smooth',block:'center'});
   });
   $$(target+' [data-remove]').forEach(b=>b.onclick=()=>safe(async()=>{
    const reason=prompt('Reason for deletion:');if(reason===null)return;
    if(!confirm('Delete this '+kind.slice(0,-1)+'?'))return;
    await request('/admin/'+kind+'/'+b.dataset.remove,'DELETE',{reason});notify('Deleted and audited.');await loadConfiguration();
   }));
  }
  $('#assignmentRows').innerHTML=staff.map(p=>
  '<tr><td>'+esc(p.full_name)+'</td><td><select data-dept="'+esc(p.id)+'"><option value="">Unassigned</option>'+
  departments.map(d=>'<option value="'+esc(d.id)+'" '+(d.id===p.department_id?'selected':'')+'>'+esc(d.name)+'</option>').join('')+
  '</select></td><td><select data-shift="'+esc(p.id)+'"><option value="">Standard Office</option>'+
  shifts.map(shift=>'<option value="'+esc(shift.id)+'" '+(shift.id===p.shift_id?'selected':'')+'>'+esc(shift.name)+'</option>').join('')+
  '</select></td><td><input data-reason="'+esc(p.id)+'" placeholder="Reason (required)" aria-label="Assignment reason for '+esc(p.full_name)+'"></td><td><button class="secondary" type="button" data-assign="'+esc(p.id)+'">Save</button></td></tr>'
 ).join('');
 $$('#assignmentRows [data-assign]').forEach(b=>b.onclick=()=>safe(async()=>{
  const id=b.dataset.assign,dept=$('[data-dept="'+id+'"]').value,shift=$('[data-shift="'+id+'"]').value,reason=$('[data-reason="'+id+'"]').value;
  await request('/admin/staff/'+id+'/assignment','PUT',{departmentId:dept||null,shiftId:shift||null,reason});
  notify('Employee department and shift updated.');staff=await request('/admin/staff');await loadConfiguration();
 }));
 render('holidays','#holidayRows',holidays,r=>r.date);
  render('shifts','#shiftRows',shifts,r=>r.start_time+' – '+r.end_time+' · Grace '+r.grace_minutes+' min');
  render('departments','#departmentRows',departments,r=>'Department');
 }
 async function saveConfig(kind,f){
  const id=f.elements.namedItem('id')?.value||'';
  const data={name:input(f,'name'),reason:input(f,'reason')};
  if(kind==='holidays')data.date=input(f,'date');
  if(kind==='shifts'){
   data.startTime=input(f,'startTime');data.endTime=input(f,'endTime');
   data.graceMinutes=Number(input(f,'graceMinutes'));data.halfDayHours=Number(input(f,'halfDayHours'));
   data.workingDays=input(f,'workingDays').split(',').map(v=>Number(v.trim()));
  }
  await request('/admin/'+kind+(id?'/'+id:''),id?'PUT':'POST',data);
  f.reset();if(f.elements.namedItem('id'))f.elements.namedItem('id').value='';
  notify('Configuration saved with audit reason.');await loadConfiguration();
 }
 return {mount:async function(container){container.innerHTML="\n<div class=\"av-tabs\"><button class=\"av-tab active\" type=\"button\" data-tab=\"mine\">My Attendance</button><button id=\"adminTab\" class=\"av-tab\" type=\"button\" data-tab=\"admin\" hidden>Employee Attendance</button><button id=\"manageTab\" class=\"av-tab\" type=\"button\" data-tab=\"config\" hidden>Holidays & Shifts</button></div>\n<section id=\"tab-mine\" class=\"av-section\">\n <div class=\"panel av-clock-panel\">\n  <div class=\"row\"><div><h2>My Daily Attendance</h2><p>Check-in மற்றும் Check-out நேரம் server-ல் பதிவு செய்யப்படும்.</p></div><span class=\"pill\" id=\"todayLabel\"></span></div>\n  <div class=\"av-clock-bar\">\n   <button id=\"checkIn\" type=\"button\" class=\"blue av-clock-button\"><span>↪ Check In</span></button>\n   <button id=\"checkOut\" type=\"button\" class=\"secondary av-clock-button\"><span>↩ Check Out</span></button>\n   <div class=\"av-clock-metric\"><small>CHECK IN</small><strong id=\"checkInTime\">Not marked</strong></div>\n   <div class=\"av-clock-metric\"><small>CHECK OUT</small><strong id=\"checkOutTime\">Not marked</strong></div>\n  </div>\n  <p id=\"clockStatus\" class=\"av-clock-note\">Your attendance is saved securely using office server time.</p>\n </div>\n <div class=\"panel\">\n  <div class=\"row\"><div><h2>My Monthly Attendance Calendar</h2><p>Your attendance only • Present, Absent, Half Day, Leave, Holiday and Weekend</p></div><label>Month<input id=\"myMonth\" type=\"month\"></label></div>\n  <div id=\"mySummary\" class=\"cards av-summary-cards\"></div>\n  <div class=\"av-calendar-legend\"><span><i class=\"av-dot present\"></i> Present</span><span><i class=\"av-dot absent\"></i> Absent</span><span><i class=\"av-dot half\"></i> Half Day</span><span><i class=\"av-dot leave\"></i> Leave</span><span><i class=\"av-dot holiday\"></i> Holiday</span><span><i class=\"av-dot weekend\"></i> Weekend</span></div>\n  <div id=\"myCalendar\" class=\"av-calendar\" aria-label=\"My monthly attendance calendar\"></div>\n </div>\n <div class=\"panel\">\n  <h2>My Check-in / Check-out Time Sheet</h2>\n  <div class=\"tablewrap\"><table><thead><tr><th>Date</th><th>Status</th><th>Check In (IST)</th><th>Check Out (IST)</th><th>Hours</th></tr></thead><tbody id=\"myRows\"></tbody></table></div>\n  <div class=\"av-pager\" hidden><button id=\"myPrev\" type=\"button\">Previous</button><span id=\"myPager\"></span><button id=\"myNext\" type=\"button\">Next</button></div>\n </div>\n <div class=\"av-requests\"><h2>Requests & Approvals</h2><p>Attendance correction or leave requests are sent to the authorised attendance approvers.</p>\n<div class=\"av-grid\"><div class=\"panel\"><h2>Request Attendance Correction</h2><p>For a previous date only. An Office Admin must approve.</p>\n<form id=\"correctionForm\" class=\"av-form\">\n<label>Date<input name=\"date\" type=\"date\" id=\"correctionDate\" required></label>\n<label>Requested Check-in (local office time)<input name=\"in\" type=\"datetime-local\" required></label>\n<label>Requested Check-out (local office time)<input name=\"out\" type=\"datetime-local\"></label>\n<label>Reason<textarea name=\"reason\" required minlength=\"3\" maxlength=\"1000\" rows=\"3\"></textarea></label><button class=\"blue\" type=\"submit\">Submit Correction</button></form></div>\n<div class=\"panel\"><h2>Apply for Leave</h2><form id=\"leaveForm\" class=\"av-form\">\n<label>Leave Type<select name=\"type\"><option>Casual Leave</option><option>Sick Leave</option><option>Earned Leave</option><option>Unpaid Leave</option></select></label>\n<label>From<input name=\"from\" type=\"date\" required></label><label>To<input name=\"to\" type=\"date\" required></label>\n<label>Reason<textarea name=\"reason\" rows=\"3\" minlength=\"3\" maxlength=\"1000\" required></textarea></label>\n<button class=\"blue\">Submit Leave Request</button></form></div></div>\n<div class=\"panel\"><h2>My Correction Requests</h2><div id=\"myCorrections\"></div></div>\n<div class=\"panel\"><h2>My Leave Applications</h2><div id=\"myLeaves\"></div></div>\n</div>\n</section>\n<section id=\"tab-admin\" class=\"av-section\" hidden>\n <div class=\"panel av-approvals-panel\"><div class=\"row\"><h2>Approval Inbox</h2><span class=\"pill\" id=\"pendingBadge\">Checking requests...</span></div><p>Employees' leave and attendance correction requests appear here for authorised approvers.</p><div id=\"approvalPreview\"></div></div>\n <div class=\"panel\"><div class=\"row\"><h2>Employee Attendance & Reports</h2><span class=\"pill\">Admin / Office Admin</span></div>\n <div class=\"av-period-tabs\"><button type=\"button\" class=\"secondary\" data-period=\"day\">Today</button><button type=\"button\" class=\"secondary\" data-period=\"week\">This Week</button><button type=\"button\" class=\"secondary\" data-period=\"month\">This Month</button></div>\n <form id=\"adminFilters\" class=\"av-filter\"><label>Employee<select name=\"userId\" id=\"filterEmployee\"><option value=\"\">All Employees</option></select></label>\n <label>Department<select name=\"department\" id=\"filterDepartment\"><option value=\"\">All Departments</option></select></label>\n <label>From<input name=\"from\" id=\"adminFrom\" type=\"date\"></label><label>To<input name=\"to\" id=\"adminTo\" type=\"date\"></label>\n <label>Status<select name=\"status\"><option value=\"\">All Statuses</option><option>PRESENT</option><option>ABSENT</option><option>LATE</option><option>HALF_DAY</option><option>ON_LEAVE</option><option>HOLIDAY</option><option>WEEKEND</option></select></label>\n <button class=\"blue\">Apply Filters</button></form>\n <div id=\"adminChartSummary\" class=\"cards av-summary-cards\"></div><div id=\"adminChart\" class=\"av-chart\" aria-label=\"Attendance status bar chart\"></div>\n <div class=\"tablewrap\"><table><thead><tr><th>Date</th><th>Employee</th><th>Status</th><th>In (IST)</th><th>Out (IST)</th><th>Actions</th></tr></thead><tbody id=\"adminRows\"></tbody></table></div><div class=\"av-pager\"><button id=\"adminPrev\">Previous</button><span id=\"adminPager\"></span><button id=\"adminNext\">Next</button></div></div>\n <div class=\"av-grid\">\n <div class=\"panel\"><h2>Mark / Correct Attendance</h2><form id=\"adminMark\" class=\"av-form\">\n <label>Employee<select name=\"userId\" id=\"markEmployee\" required></select></label><label>Date<input name=\"date\" type=\"date\" required></label>\n <label>Status<select name=\"status\"><option>PRESENT</option><option>ABSENT</option><option>LATE</option><option>HALF_DAY</option><option>ON_LEAVE</option><option>HOLIDAY</option><option>WEEKEND</option></select></label>\n <label>Check-in (optional)<input name=\"checkIn\" type=\"datetime-local\"></label><label>Check-out (optional)<input name=\"checkOut\" type=\"datetime-local\"></label>\n <label>Reason (required)<textarea name=\"reason\" required minlength=\"3\" rows=\"2\"></textarea></label><button class=\"blue\" type=\"submit\">Save Attendance</button></form></div>\n <div class=\"panel av-bulk-panel\"><h2>Quick Employee Attendance</h2><p>Employee பெயர்களை select செய்து Present / Absent / Half Day ஒரே click-ல் mark செய்யலாம். Date மற்றும் Reason ஒருமுறை கொடுத்தால் போதும்.</p>\n <form class=\"av-form\" id=\"bulkForm\">\n <label>Date<input name=\"date\" type=\"date\" required></label>\n <label class=\"av-bulk-hidden\">Status<select name=\"status\"><option>PRESENT</option><option>ABSENT</option><option>HALF_DAY</option></select></label>\n <label class=\"av-select-all\"><input type=\"checkbox\" id=\"selectAllEmployees\"> Select All Employees <small id=\"selectedStaffCount\">0 selected</small></label>\n <div class=\"av-bulklist av-bulk-table\" id=\"bulkUsers\"></div><label>Reason<textarea name=\"reason\" required minlength=\"3\"></textarea></label>\n <div class=\"av-actions\"><button type=\"button\" data-bulk-status=\"PRESENT\" class=\"blue\">✓ Mark Present</button><button type=\"button\" data-bulk-status=\"ABSENT\" class=\"secondary\">Mark Absent</button><button type=\"button\" data-bulk-status=\"HALF_DAY\" class=\"secondary\">Mark Half Day</button><button type=\"submit\" class=\"av-hidden-submit\" hidden>Save Selected</button></div></form></div></div>\n <div class=\"panel\"><div class=\"row\"><h2>Download Attendance Report</h2><label>Month<input id=\"reportMonth\" type=\"month\"></label></div>\n <p>Report uses the selected employee, date range and status filters above (day / week / month).</p><div class=\"av-actions\"><button type=\"button\" data-export=\"csv\" class=\"secondary\">Export CSV</button><button type=\"button\" data-export=\"xls\" class=\"secondary\">Export Excel</button><button type=\"button\" data-export=\"pdf\" class=\"secondary\">Export PDF</button></div></div>\n <div class=\"av-grid\">\n <div class=\"panel\"><h2>Attendance Corrections for Approval</h2><div id=\"adminCorrections\"></div></div>\n <div class=\"panel\"><h2>Leave Requests for Approval</h2><div id=\"adminLeaves\"></div></div></div>\n</section>\n<section id=\"tab-config\" class=\"av-section\" hidden>\n <div class=\"panel\" id=\"launchPanel\" hidden>\n  <h2>Automatic ABSENT Attendance</h2>\n  <p id=\"launchStatus\">Automatic marking is currently disabled until the company launches Attendance V3.</p>\n  <form id=\"launchForm\" class=\"av-filter\">\n   <label>Start from this date<input name=\"startDate\" type=\"date\" id=\"launchDate\" required></label>\n   <label>Reason<input name=\"reason\" minlength=\"3\" maxlength=\"250\" required placeholder=\"Attendance V3 launch approval\"></label>\n   <button class=\"blue\" type=\"submit\">Activate Daily Absence Marking</button>\n   <button class=\"secondary\" id=\"disableLaunch\" type=\"button\">Disable Auto Marking</button>\n  </form>\n  <p>Only the main Admin can activate this feature. Employees are marked absent only after a completed working day, excluding holidays and approved leave.</p>\n </div>\n <div class=\"av-grid\"><div class=\"panel\"><h2>Office Holidays</h2><form id=\"holidayForm\" class=\"av-form\">\n <input type=\"hidden\" name=\"id\"><label>Holiday Date<input name=\"date\" type=\"date\" required></label><label>Holiday Name<input name=\"name\" required maxlength=\"120\"></label>\n <label>Reason<input name=\"reason\" required minlength=\"3\"></label><button class=\"blue\" type=\"submit\">Save Holiday</button></form><div id=\"holidayRows\"></div></div>\n <div class=\"panel\"><h2>Office Working Shifts</h2><form id=\"shiftForm\" class=\"av-form\">\n <input type=\"hidden\" name=\"id\"><label>Shift Name<input name=\"name\" required maxlength=\"120\"></label>\n <label>Start Time<input name=\"startTime\" type=\"time\" required></label><label>End Time<input name=\"endTime\" type=\"time\" required></label>\n <label>Grace Minutes<input name=\"graceMinutes\" type=\"number\" min=\"0\" max=\"240\" value=\"10\" required></label>\n <label>Half-day Hours<input name=\"halfDayHours\" type=\"number\" min=\"0.5\" max=\"24\" step=\"0.5\" value=\"4\" required></label>\n <label>Working Days (1=Mon … 7=Sun)<input name=\"workingDays\" placeholder=\"1,2,3,4,5,6\" value=\"1,2,3,4,5,6\" required></label>\n <label>Reason<input name=\"reason\" required minlength=\"3\"></label><button class=\"blue\" type=\"submit\">Save Shift</button></form>\n <div id=\"shiftRows\"></div></div></div>\n <div class=\"panel\"><h2>Employee Shift & Department Assignments</h2><p>Choose the department and shift for each active employee. Changes are audited.</p><div class=\"tablewrap\"><table><thead><tr><th>Employee</th><th>Department</th><th>Shift</th><th>Reason</th><th>Action</th></tr></thead><tbody id=\"assignmentRows\"></tbody></table></div></div>\n<div class=\"panel\"><h2>Departments</h2><form class=\"av-filter\" id=\"departmentForm\"><label>Name<input name=\"name\" required></label><label>Reason<input name=\"reason\" minlength=\"3\" required></label><button class=\"blue\">Add Department</button></form><div id=\"departmentRows\"></div></div>\n</section>\n<div id=\"alert\" class=\"av-alert\" role=\"alert\" hidden></div>\n";await init();}};
})();