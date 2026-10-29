'use strict';
(()=>{
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const localDay=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>p.find(x=>x.type===t).value;return get('year')+'-'+get('month')+'-'+get('day')};
 const iso=value=>value?new Date(value.length===16?value+':00+05:30':value).toISOString():null;
 const shortDate=s=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:true}):'—';
 const officeLocal=s=>{if(!s)return '';const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(s));const v=t=>p.find(x=>x.type===t).value;return v('year')+'-'+v('month')+'-'+v('day')+'T'+v('hour')+':'+v('minute')};
 const input=(form,name)=>form.elements.namedItem(name).value;
 const today=localDay();
 let db,apiRoot,apiKey,actorRole='',actorName='',staff=[],departments=[],shifts=[],holidays=[],adminItems=[],myPage=1,adminPage=1;
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
  const p=await db.from('gr_profiles').select('full_name,active,role_id').eq('id',user.id).single();
  if(p.error||!p.data?.active)throw Error('Employee account is not active.');
  const role=await db.from('gr_roles').select('name').eq('id',p.data.role_id).single();
  if(role.error)throw Error(role.error.message);
  actorRole=role.data.name;actorName=p.data.full_name;
  $('#employeeName').textContent=actorName;$('#employeeRole').textContent=actorRole;$('#todayLabel').textContent='Today · '+today;
  $('#adminTab').hidden=!manager();$('#manageTab').hidden=!manager();$('#launchPanel').hidden=actorRole!=='Admin';$('#launchDate').min=today;$('#launchDate').value=today;$('#roleLink').hidden=actorRole!=='Admin';$('#userLink').hidden=actorRole!=='Admin';
  $('#myMonth').value=today.slice(0,7);$('#reportMonth').value=today.slice(0,7);
  $('#adminFrom').value=today.slice(0,7)+'-01';$('#adminTo').value=today;
  $('#correctionDate').max=new Date(new Date(today+'T00:00:00Z').getTime()-86400000).toISOString().slice(0,10);
  $('#authNotice').hidden=true;$('#attendanceApp').hidden=false;
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
  try{await loadMine()}catch(e){notify('Attendance V3 backend is not ready: '+e.message+'. Deploy the V3 SQL migrations and attendance-api Edge Function first.',true)}
 }
 async function loadMine(){
  const month=$('#myMonth').value,from=month+'-01',to=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  const [items,summary]=await Promise.all([
   request('/attendance/me?'+params({from,to,page:myPage,pageSize:20})),
   request('/attendance/me/summary?'+params({month}))
  ]);
  $('#mySummary').innerHTML=[['Present',summary.present],['Late',summary.late],['Half Day',summary.half_day],['Absent',summary.absent],['Total Hours',summary.hours]].map(([t,n])=>'<div class="card"><small>'+esc(t)+'</small><strong>'+esc(n)+'</strong></div>').join('');
  $('#myRows').innerHTML=items.items.map(r=>tRow([esc(r.date),esc(r.status),esc(shortDate(r.check_in)),esc(shortDate(r.check_out)),esc(r.total_hours??'—')])).join('')||'<tr><td colspan="5">No attendance records this month.</td></tr>';
  $('#myPager').textContent='Page '+items.page+' of '+Math.max(1,items.pages)+' · '+items.total+' records';
  $('#myPrev').disabled=myPage<=1;$('#myNext').disabled=myPage>=items.pages;
  $('#clockStatus').textContent='Your records are stored securely in Supabase.';
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
 $('#assignmentRows [data-assign]').forEach(b=>b.onclick=()=>safe(async()=>{
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
 init().catch(e=>$('#authStatus').textContent=e.message);
})();