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
 let db,apiRoot,apiKey,actorRole='',actorName='',staff=[],departments=[],shifts=[],holidays=[],adminItems=[],myPage=1,adminPage=1,ownId='',workingDays=[1,2,3,4,5,6],pendingRefreshTimer=null,adminRefreshTimer=null,attendanceRights=[],selectedMonthlyEmployeeId=null,monthlyReportVersion=0;
 const canAdmin=action=>actorRole==='Admin'||actorRole==='Office Admin'||attendanceRights.includes(action);
 const manager=()=>canAdmin('view');
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
  if(adminRefreshTimer){clearInterval(adminRefreshTimer);adminRefreshTimer=null}
  if(which==='mine')safe(loadMine);
  if(which==='admin'){
   safe(loadAdmin);
   adminRefreshTimer=setInterval(()=>{
    if(!document.querySelector('#adminTab')){clearInterval(adminRefreshTimer);adminRefreshTimer=null;return}
    if(!$('#tab-admin').hidden&&!$('#attendanceEditDialog').open)safe(loadAdmin);
   },30000);
  }
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
  const rights=await db.from('gr_role_permissions').select('action,allowed,data_scope').eq('role_id',p.data.role_id).eq('module','attendance').eq('allowed',true).eq('data_scope','all');
  if(rights.error)throw Error('Attendance permissions could not be loaded: '+rights.error.message);
  attendanceRights=(rights.data||[]).map(p=>p.action);
  if(p.data.shift_id){const assignedShift=await db.from('grm_shifts').select('working_days').eq('id',p.data.shift_id).maybeSingle();if(!assignedShift.error&&Array.isArray(assignedShift.data?.working_days))workingDays=assignedShift.data.working_days;}
  $('#todayLabel').textContent='Today · '+today;
  $('#adminTab').hidden=!manager();
  $('#adminMark').closest('.panel').hidden=!canAdmin('create')&&!canAdmin('edit');
  $('.av-bulk-panel').hidden=!canAdmin('create')&&!canAdmin('edit');
  $$('[data-export]').forEach(b=>b.disabled=!canAdmin('export'));
  $('#myMonth').value=today.slice(0,7);$('#reportMonth').value=today.slice(0,7);
  $('#adminFrom').value=today.slice(0,7)+'-01';$('#adminTo').value=today;
  $('#correctionDate').max=new Date(new Date(today+'T00:00:00Z').getTime()-86400000).toISOString().slice(0,10);
  $$('.av-tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
  $('#checkIn').onclick=()=>safe(async()=>{await request('/attendance/check-in','POST',{});notify('Check-in recorded using server time');await loadMine()});
  $('#checkOut').onclick=()=>safe(async()=>{await request('/attendance/check-out','POST',{});notify('Check-out recorded using server time');await loadMine()});
  $('#myMonth').onchange=()=>{myPage=1;safe(loadMine)};
  $('#myPrev').onclick=()=>{myPage=Math.max(1,myPage-1);safe(loadMine)};
  $('#myNext').onclick=()=>{myPage++;safe(loadMine)};
  const correctionForm=$('#correctionForm');
  // Keep the correction request tied to its selected office date when the date is changed.
  $('#correctionDate').onchange=()=>{
   const selected=$('#correctionDate').value,checkIn=correctionForm.elements.namedItem('in'),checkOut=correctionForm.elements.namedItem('out');
   if(!selected)return;
   const oldInDate=checkIn.value?.slice(0,10);
   if(checkIn.value)checkIn.value=selected+checkIn.value.slice(10);
   if(checkOut.value){
    const oldOutDate=checkOut.value.slice(0,10);
    const overnight=oldInDate&&Math.round((Date.parse(oldOutDate+'T00:00:00Z')-Date.parse(oldInDate+'T00:00:00Z'))/86400000)===1;
    const nextDay=new Date(Date.parse(selected+'T00:00:00Z')+86400000).toISOString().slice(0,10);
    checkOut.value=(overnight?nextDay:selected)+checkOut.value.slice(10);
   }
  };
  correctionForm.onsubmit=e=>{e.preventDefault();safe(async()=>{
   const f=e.currentTarget,selected=input(f,'date'),checkIn=input(f,'in'),checkOut=input(f,'out');
   if(!checkIn||checkIn.slice(0,10)!==selected){
    throw Error('Requested check-in must use the selected attendance date ('+selected+'). Please update the check-in date.');
   }
   if(checkOut&&Date.parse(checkOut)<Date.parse(checkIn)){
    throw Error('Requested check-out must be after check-in.');
   }
   await request('/attendance/corrections','POST',{date:selected,requestedCheckIn:iso(checkIn),requestedCheckOut:iso(checkOut),reason:input(f,'reason')});
   f.reset();notify('Correction submitted for approval');await loadRequests();
  })};
  $('#leaveForm').onsubmit=e=>{e.preventDefault();safe(async()=>{
   const f=e.currentTarget;await request('/leaves','POST',{type:input(f,'type'),fromDate:input(f,'from'),toDate:input(f,'to'),reason:input(f,'reason')});
   f.reset();notify('Leave request submitted');await loadRequests();
  })};
  // Monthly attendance reports: an employee calendar popup and count-only Excel summary.
  $('#allMonthlyReportMonth').value=today.slice(0,7);
  $('#monthlyEmployeeMonth').value=today.slice(0,7);
  $('#allMonthlyReportMonth').onchange=()=>safe(loadAllMonthlyReportInfo);
  $('#downloadAllMonthlyExcel').disabled=!canAdmin('export');
  $('#downloadAllMonthlyExcel').onclick=()=>safe(async()=>{
    const month=$('#allMonthlyReportMonth').value,btn=$('#downloadAllMonthlyExcel');
    if(!month)throw Error('Choose a month');
    btn.disabled=true;
    try{await downloadMonthlyReport('/admin/reports/monthly-summary/download?'+params({month,format:'xls'}),'greenrich-all-employees-'+month+'.xls')}
    finally{btn.disabled=!canAdmin('export')}
  });
  $('#monthlyEmployeeClose').onclick=()=>$('#monthlyEmployeeDialog').close();
  $('#monthlyEmployeeMonth').onchange=()=>safe(loadSelectedMonthlyEmployee);
  $('[data-monthly-export]').forEach(button=>{
   button.disabled=!canAdmin('export');
   button.onclick=()=>safe(async()=>{
    if(!selectedMonthlyEmployeeId)throw Error('Select an employee first');
    const month=$('#monthlyEmployeeMonth').value,format=button.dataset.monthlyExport;
    const filename='greenrich-'+(staff.find(p=>p.id===selectedMonthlyEmployeeId)?.full_name||'employee').replace(/[^a-z0-9_-]/gi,'-')+'-'+month+'.'+format;
    button.disabled=true;
    try{await downloadMonthlyReport('/admin/reports/employee/download?'+params({userId:selectedMonthlyEmployeeId,month,format}),filename)}
    finally{button.disabled=!canAdmin('export')}
   });
  });
  $('#adminFilters').onsubmit=e=>{e.preventDefault();adminPage=1;safe(loadAdmin)};
  $('#adminPrev').onclick=()=>{adminPage=Math.max(1,adminPage-1);safe(loadAdmin)};
  $('#adminNext').onclick=()=>{adminPage++;safe(loadAdmin)};
  $('#adminMark').onsubmit=e=>{e.preventDefault();safe(async()=>{
   const f=e.currentTarget;
   await request('/admin/attendance','POST',{userId:input(f,'userId'),date:input(f,'date'),status:input(f,'status'),checkIn:iso(input(f,'checkIn')),checkOut:iso(input(f,'checkOut')),reason:input(f,'reason')});
   notify('Attendance saved and audit recorded');f.elements.namedItem('reason').value='';await loadAdmin();
  })};
  const editDialog=$('#attendanceEditDialog'),editForm=$('#attendanceEditForm');
  $('#attendanceEditClose').onclick=$('#attendanceEditCancel').onclick=()=>editDialog.close();
  editForm.onsubmit=e=>{e.preventDefault();safe(async()=>{
   const button=$('#attendanceEditSave');button.disabled=true;
   try{
    const f=e.currentTarget;
    await request('/admin/attendance/'+input(f,'recordId'),'PUT',{status:input(f,'status'),checkIn:iso(input(f,'checkIn')),checkOut:iso(input(f,'checkOut')),reason:input(f,'reason')});
    editDialog.close();notify('Attendance updated and recorded in the audit log');
    await Promise.all([loadAdmin(),loadMine()]);
   }finally{button.disabled=false}
  })};
  $('#bulkForm').elements.namedItem('date').value=today;
  $('#adminMark').elements.namedItem('date').value=today;
  $('#selectAllEmployees').onchange=e=>{$$('#bulkUsers .av-employee-check:not(:disabled)').forEach(b=>b.checked=e.target.checked);updateSelected()};
  $$('[data-bulk-status]').forEach(b=>b.onclick=()=>{const form=$('#bulkForm');form.elements.namedItem('status').value=b.dataset.bulkStatus;form.requestSubmit()});
  $('#bulkForm').elements.namedItem('date').onchange=()=>safe(drawDailyRoster);
  $$('[data-period]').forEach(b=>b.onclick=()=>{
   const now=new Date(today+'T12:00:00+05:30'),fmt=d=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const f=t=>p.find(x=>x.type===t)?.value;return f('year')+'-'+f('month')+'-'+f('day')};
   if(b.dataset.period==='day'){$('#adminFrom').value=today;$('#adminTo').value=today}
   else if(b.dataset.period==='week'){const monday=new Date(now);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));$('#adminFrom').value=fmt(monday);$('#adminTo').value=today}
   else{$('#adminFrom').value=today.slice(0,7)+'-01';$('#adminTo').value=today}
   $$('.av-period-tabs button').forEach(x=>x.classList.toggle('av-period-active',x===b));adminPage=1;safe(loadAdmin);
  });
  $('#bulkForm').onsubmit=e=>{e.preventDefault();safe(async()=>{
   const f=e.currentTarget,ids=$$('#bulkUsers input.av-employee-check:not(:disabled):checked').map(el=>el.value);
   if(!ids.length)throw Error('Select at least one employee');
   if(!confirm('Mark '+ids.length+' employees as '+input(f,'status')+'?'))return;
   const result=await request('/admin/attendance/bulk','POST',{userIds:ids,date:input(f,'date'),status:input(f,'status'),reason:input(f,'reason')});
   notify('Saved '+result.updated+' attendance records. Existing actual check-ins are protected.');await loadAdmin();
  })};
  $$('[data-export]').forEach(b=>b.onclick=()=>safe(async()=>{
   const ext=b.dataset.export,f=$('#adminFilters');
   const filters={from:input(f,'from'),to:input(f,'to'),userId:input(f,'userId'),roleId:input(f,'roleId'),status:input(f,'status'),format:ext};
   const response=await request('/admin/reports/range?'+params(filters),'GET',null,true);
   const blob=await response.blob(),link=document.createElement('a'),url=URL.createObjectURL(blob);
   link.href=url;link.download='greenrich-attendance-'+filters.from+'-to-'+filters.to+'.'+ext;link.click();setTimeout(()=>URL.revokeObjectURL(url),500);
  }));
  try{await loadMine();if(manager()&&canAdmin('approve')){safe(loadPendingCount);if(pendingRefreshTimer)clearInterval(pendingRefreshTimer);pendingRefreshTimer=setInterval(()=>{if(document.querySelector('#adminTab'))safe(loadPendingCount);else clearInterval(pendingRefreshTimer)},60000);}}catch(e){notify('Attendance could not load: '+e.message+'. Check your login and Attendance API access.',true)}
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
  const currentDate=localDay();
  const todaysHistory=month===currentDate.slice(0,7)?null:await request('/attendance/me?'+params({from:currentDate,to:currentDate,page:1,pageSize:1}));
  const todayRecord=byDate.get(currentDate)||todaysHistory?.items?.[0];
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
   const label=({PRESENT:'Present',LATE:'Late',HALF_DAY:'Half Day',ABSENT:'Absent',ON_LEAVE:'Leave',PAID_LEAVE:'Paid Leave',PERMISSION:'Permission',HOLIDAY:'Holiday',WEEKEND:'Weekend',UNMARKED:'—'})[status]||status;
   const color=({PRESENT:'present',LATE:'present',HALF_DAY:'half',ABSENT:'absent',ON_LEAVE:'leave',PAID_LEAVE:'leave',PERMISSION:'permission',HOLIDAY:'holiday',WEEKEND:'weekend',UNMARKED:'unmarked'})[status]||'unmarked';
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
  const [employees,rolesResponse]=await Promise.all([request('/admin/staff'),db.from('gr_roles').select('id,name').order('name')]);
  if(rolesResponse.error)throw Error('Unable to load user roles: '+rolesResponse.error.message);
  staff=employees||[];
  const userRoles=rolesResponse.data||[],roleName=id=>userRoles.find(r=>r.id===id)?.name||'Employee';
  const users=staff.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.full_name)+'</option>').join('');
  $('#markEmployee').innerHTML=users;
  const previousEmployee=$('#filterEmployee').value,previousRole=$('#filterRole').value;
  $('#filterEmployee').innerHTML='<option value="">All Employees</option>'+users;
  $('#filterRole').innerHTML='<option value="">All Roles</option>'+userRoles.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>').join('');
  $('#filterEmployee').value=previousEmployee;$('#filterRole').value=previousRole;
  const actions=[
   {status:'PRESENT',text:'Present',color:'present'},
   {status:'ABSENT',text:'Absent',color:'absent'},
   {status:'HALF_DAY',text:'Half Day',color:'half'},
   {status:'WEEKEND',text:'Weekend',color:'weekend'},
   {status:'HOLIDAY',text:'Holiday',color:'holiday'},
   {status:'PAID_LEAVE',text:'Paid Leave',color:'leave'}
  ];
  $('#bulkUsers').innerHTML=staff.map(p=>'<div class="av-staff-row" data-staff="'+esc(p.id)+'"><label class="av-staff-identity"><input class="av-employee-check" type="checkbox" value="'+esc(p.id)+'" '+(p.id===ownId?'disabled title="Use the Check In / Check Out buttons for your own attendance"':'')+'><span><strong>'+esc(p.full_name)+'</strong><small>'+esc(roleName(p.role_id))+'</small></span></label><small data-current="'+esc(p.id)+'">Not marked</small><div class="av-row-quick">'+actions.map(a=>'<button type="button" class="av-status-btn av-status-'+a.color+'" data-quick-id="'+esc(p.id)+'" data-quick-status="'+a.status+'" title="'+a.text+'">'+a.text+'</button>').join('')+'</div></div>').join('')||'<p>No active employee accounts found.</p>';
  $$('#bulkUsers .av-employee-check').forEach(b=>b.onchange=updateSelected);
  $$('#bulkUsers [data-quick-id]').forEach(b=>b.onclick=()=>safe(async()=>{
    const form=$('#bulkForm'),date=input(form,'date'),reason=input(form,'reason').trim();
    if(!date)throw Error('Select an attendance date');
    if(!confirm('Mark '+staff.find(p=>p.id===b.dataset.quickId)?.full_name+' as '+b.dataset.quickStatus.replace('_',' ')+' on '+date+'?'))return;
    b.disabled=true;
    try{
     await request('/admin/attendance','POST',{userId:b.dataset.quickId,date,status:b.dataset.quickStatus,reason});
     notify('Attendance updated. Changes are saved immediately.');
     await loadAdmin();
    }finally{b.disabled=false}
  }));
  updateSelected();
 }
 function updateSelected(){
  const checkboxes=$$('#bulkUsers .av-employee-check:not(:disabled)'),selected=checkboxes.filter(b=>b.checked);
  $('#selectedStaffCount').textContent=selected.length+' / '+checkboxes.length+' selected';
  $('#selectAllEmployees').checked=checkboxes.length>0&&selected.length===checkboxes.length;
  $('#selectAllEmployees').indeterminate=selected.length>0&&selected.length<checkboxes.length;
 }
 async function loadPendingCount(){
  if(!manager()||!canAdmin('approve'))return;
  const [corr,leave]=await Promise.all([request('/admin/corrections?status=PENDING&pageSize=1'),request('/admin/leaves?status=PENDING&pageSize=1')]);
  const total=(corr.total||0)+(leave.total||0);
  $('#adminTab').textContent='Employee Attendance'+(total?' · '+total+' pending':'');
  $('#pendingBadge').textContent=total?total+' approval requests pending':'No pending requests';
 }
 async function drawDailyRoster(){
  const date=input($('#bulkForm'),'date');
  const list=await request('/admin/attendance?'+params({from:date,to:date,page:1,pageSize:100}));
  const map=new Map((list.items||[]).map(x=>[x.user_id,x]));
  for(const el of $$('#bulkUsers [data-current]')){
   const record=map.get(el.dataset.current);el.textContent=record?record.status.replace('_',' ')+(record.check_in?' · In '+shortDate(record.check_in):''):'Not marked';
   const row=el.closest('.av-staff-row');
   row?.querySelectorAll('[data-quick-status]').forEach(b=>{b.classList.toggle('av-quick-active',record?.status===b.dataset.quickStatus);b.disabled=b.dataset.quickId===ownId||(!!record?.check_in&&record?.source==='SELF');b.title=b.dataset.quickId===ownId?'Mark your own attendance from My Attendance':b.disabled?'Employee has already checked in. Use Edit with a reason to correct this record.':'Quick attendance marking';});
  }
 }
 async function drawAdminChart(){
  const f=$('#adminFilters'),query={userId:input(f,'userId'),roleId:input(f,'roleId'),from:input(f,'from'),to:input(f,'to'),status:input(f,'status'),pageSize:100},all=[];
  let pages=1;
  for(let index=1;index<=Math.min(pages,10);index++){
   const part=await request('/admin/attendance?'+params({...query,page:index}));
   all.push(...part.items);pages=part.pages||1;
  }
  const categories=[
   ['PRESENT','Present','#319f66'],['LATE','Late','#6cba80'],['HALF_DAY','Half Day','#e2ae3d'],
   ['ABSENT','Absent','#dd615b'],['ON_LEAVE','On Leave','#9875c8'],['PAID_LEAVE','Paid Leave','#e88bac'],
   ['HOLIDAY','Holiday','#3676d9'],['WEEKEND','Weekend','#535963']
  ];
  const active=categories.map(([key,label,color])=>({key,label,color,count:all.filter(r=>r.status===key).length})).filter(v=>v.count>0);
  const total=active.reduce((n,r)=>n+r.count,0);
  $('#adminChartSummary').innerHTML=[['Employees',new Set(all.map(x=>x.user_id)).size],['Attendance Records',all.length]].map(([name,count])=>'<div class="card"><small>'+esc(name)+'</small><strong>'+count+'</strong></div>').join('');
  if(!total){$('#adminChart').innerHTML='<p class="av-empty">No attendance records for the selected dates and filters.</p>';return}
  let offset=0;
  const gradient=active.map(part=>{const beginning=offset;offset+=part.count/total*100;return part.color+' '+beginning.toFixed(3)+'% '+offset.toFixed(3)+'%'}).join(', ');
  $('#adminChart').innerHTML='<div class="av-round-report"><div class="av-donut" role="img" aria-label="Attendance breakdown: '+esc(active.map(x=>x.label+' '+x.count).join(', '))+'" style="background:conic-gradient('+gradient+')"><div class="av-donut-hole"><strong>'+total+'</strong><small>Total Records</small></div></div><div class="av-donut-legend">'+active.map(x=>'<div class="av-donut-legend-item"><span class="av-legend-name"><i style="background:'+x.color+'"></i>'+esc(x.label)+'</span><b>'+x.count+'</b></div>').join('')+'</div></div>'+(pages>10?'<small>Showing first 1,000 records. Download the report for the full date range.</small>':'');
 }
 
 async function downloadMonthlyReport(path,filename){
  const response=await request(path,'GET',null,true);
  const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
 }
 function renderMonthlyEmployeeList(){
  const area=$('#monthlyEmployeeList');if(!area)return;
  area.innerHTML=staff.map(person=>'<button class="av-report-employee" type="button" data-monthly-person="'+esc(person.id)+'"><span class="av-report-employee-icon" aria-hidden="true">👤</span><span class="av-report-employee-name">'+esc(person.full_name)+'</span><span class="av-report-employee-action">View Calendar & Report →</span></button>').join('')||'<p class="av-empty">No active employees found.</p>';
  $('#monthlyEmployeeList [data-monthly-person]').forEach(button=>button.onclick=()=>safe(async()=>{
   selectedMonthlyEmployeeId=button.dataset.monthlyPerson;
   $('#monthlyEmployeeMonth').value=$('#allMonthlyReportMonth').value||today.slice(0,7);
   const name=staff.find(person=>person.id===selectedMonthlyEmployeeId)?.full_name||'Employee';
   $('#monthlyEmployeeHeading').textContent=name+' · Monthly Attendance';
   $('#monthlyEmployeeSubheading').textContent='Loading attendance...';
   $('#monthlyEmployeeDialog').showModal();
   await loadSelectedMonthlyEmployee();
  }));
 }
 async function loadAllMonthlyReportInfo(){
  if(!manager())return;
  const month=$('#allMonthlyReportMonth').value,display=$('#allMonthlyReportInfo');
  if(!month)return;
  display.textContent='Loading monthly summary...';
  const result=await request('/admin/reports/monthly-summary?'+params({month}));
  const counts={present:0,absent:0,paidLeave:0,unpaidLeave:0,late:0,permissions:0};
  (result.employees||[]).forEach(p=>Object.keys(counts).forEach(k=>counts[k]+=Number(p.counts[k]||0)));
  display.textContent=result.totalEmployees+' employees · '+counts.present+' present days · '+counts.absent+' absent days · '+(counts.paidLeave+counts.unpaidLeave)+' leave days · '+counts.late+' late days · '+counts.permissions+' permission days (recorded statuses only)';
 }
 async function loadSelectedMonthlyEmployee(){
  if(!selectedMonthlyEmployeeId)return;
  const version=++monthlyReportVersion;
  const month=$('#monthlyEmployeeMonth').value;
  const data=await request('/admin/reports/employee?'+params({userId:selectedMonthlyEmployeeId,month}));
  if(version!==monthlyReportVersion||!$('#monthlyEmployeeDialog').open)return;
  $('#monthlyEmployeeHeading').textContent=data.name+' · Monthly Attendance';
  $('#monthlyEmployeeSubheading').textContent=month+' · Recorded attendance only; unmarked dates are not counted as absent.';
  const c=data.counts||{};
  const countLabels=[['Present',c.present],['Absent',c.absent],['Half Day',c.halfDay],['Paid Leave',c.paidLeave],['Unpaid Leave',c.unpaidLeave],['Late',c.late],['Permissions',c.permissions],['Holiday',c.holidays],['Weekend',c.weekends]];
  $('#monthlyEmployeeCounts').innerHTML=countLabels.map(([label,count])=>'<div class="av-report-count"><small>'+esc(label)+'</small><strong>'+Number(count||0)+'</strong></div>').join('');
  const records=data.records||[],byDate=new Map(records.map(r=>[r.date,r]));
  const holidays=new Map((data.holidays||[]).map(h=>[h.date,h.name]));
  const daysWorking=new Set(data.workingDays||[1,2,3,4,5,6]);
  const year=Number(month.slice(0,4)),mo=Number(month.slice(5,7));
  const days=new Date(Date.UTC(year,mo,0)).getUTCDate();
  let cells=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>'<div class="av-calendar-weekday">'+d+'</div>');
  const offset=(new Date(Date.UTC(year,mo-1,1)).getUTCDay()+6)%7;
  for(let i=0;i<offset;i++)cells.push('<div class="av-calendar-empty"></div>');
  const labels={PRESENT:'Present',ABSENT:'Absent',LATE:'Late',HALF_DAY:'Half Day',ON_LEAVE:'Unpaid Leave',PAID_LEAVE:'Paid Leave',PERMISSION:'Permission',HOLIDAY:'Holiday',WEEKEND:'Weekend',UNMARKED:'—'};
  const colors={PRESENT:'present',ABSENT:'absent',LATE:'present',HALF_DAY:'half',ON_LEAVE:'leave',PAID_LEAVE:'leave',PERMISSION:'permission',HOLIDAY:'holiday',WEEKEND:'weekend',UNMARKED:'unmarked'};
  for(let n=1;n<=days;n++){
   const date=month+'-'+String(n).padStart(2,'0'),record=byDate.get(date);
   const dow=new Date(date+'T00:00:00Z').getUTCDay(),weekday=dow===0?7:dow;
   const status=record?.status||(date<(data.joiningDate||'0000-01-01')?'UNMARKED':holidays.has(date)?'HOLIDAY':!daysWorking.has(weekday)?'WEEKEND':'UNMARKED');
   cells.push('<div class="av-calendar-day '+(colors[status]||'unmarked')+'" title="'+esc(date+' — '+(holidays.get(date)||labels[status]||status))+'"><strong>'+n+'</strong><small>'+esc(labels[status]||status)+'</small></div>');
  }
  $('#monthlyEmployeeCalendar').innerHTML=cells.join('');
  $('#monthlyEmployeeTimeSheet').innerHTML=records.map(r=>tRow([
   esc(r.date),esc((labels[r.status]||r.status)),esc(shortDate(r.check_in)),
   esc(shortDate(r.check_out)),esc(r.total_hours??'—')
  ])).join('')||'<tr><td colspan="5">No recorded attendance for this month.</td></tr>';
  $('#monthlyEmployeeDownloadNote').textContent='Download '+data.name+' · '+month;
 }
async function loadAdmin(){
  if(!manager())return;
  if(!staff.length)await loadStaff();
  renderMonthlyEmployeeList();
  if(!$('#allMonthlyReportInfo').dataset.month||$('#allMonthlyReportInfo').dataset.month!==$('#allMonthlyReportMonth').value){$('#allMonthlyReportInfo').dataset.month=$('#allMonthlyReportMonth').value;safe(loadAllMonthlyReportInfo)}
  const f=$('#adminFilters'),query=params({userId:input(f,'userId'),roleId:input(f,'roleId'),from:input(f,'from'),to:input(f,'to'),status:input(f,'status'),page:adminPage,pageSize:20});
  const result=await request('/admin/attendance?'+query);adminItems=result.items;
  $('#adminRows').innerHTML=adminItems.map(r=>tRow([
   esc(r.date),esc(r.gr_profiles?.full_name||staff.find(p=>p.id===r.user_id)?.full_name||r.user_id),
   esc(r.status),esc(shortDate(r.check_in)),esc(shortDate(r.check_out)),
   (canAdmin('edit')?'<button class="secondary" data-edit="'+esc(r.id)+'">Edit</button> ':'')+(canAdmin('delete')?'<button class="secondary" data-delete="'+esc(r.id)+'">Delete</button>':'—')
  ])).join('')||'<tr><td colspan="6">No records match these filters.</td></tr>';
  $('#adminPager').textContent='Page '+result.page+' of '+Math.max(1,result.pages)+' · '+result.total+' records';
  $('#adminPrev').disabled=adminPage<=1;$('#adminNext').disabled=adminPage>=result.pages;
  await Promise.all([drawAdminChart(),drawDailyRoster()]);
  $$('#adminRows [data-edit]').forEach(b=>b.onclick=()=>{
   const r=adminItems.find(x=>x.id===b.dataset.edit);if(!r)return;
   const f=$('#attendanceEditForm');
   f.elements.namedItem('recordId').value=r.id;
   f.elements.namedItem('employee').value=staff.find(p=>p.id===r.user_id)?.full_name||r.user_id;
   f.elements.namedItem('date').value=r.date;
   f.elements.namedItem('status').value=r.status;
   f.elements.namedItem('checkIn').value=officeLocal(r.check_in);
   f.elements.namedItem('checkOut').value=officeLocal(r.check_out);
   f.elements.namedItem('reason').value='';
   $('#attendanceEditDialog').showModal();
  });
  $$('#adminRows [data-delete]').forEach(b=>b.onclick=()=>safe(async()=>{
   if(!confirm('Remove this attendance entry? The deletion is recorded in the audit log.'))return;
   await request('/admin/attendance/'+b.dataset.delete,'DELETE',{reason:''});
   notify('Attendance soft-deleted with audit record.');await loadAdmin();
  }));
  const [corrections,leaves]=canAdmin('approve')?await Promise.all([request('/admin/corrections?'+params({status:'PENDING'})),request('/admin/leaves?'+params({status:'PENDING'}))]):[{items:[],total:0},{items:[],total:0}];
  $('.av-approvals-panel').hidden=!canAdmin('approve');$('#adminCorrections').closest('.panel').hidden=!canAdmin('approve');$('#adminLeaves').closest('.panel').hidden=!canAdmin('approve');
  function approveRows(container,items,kind){
   $(container).innerHTML=table(items,r=>{
    const name=esc(staff.find(x=>x.id===r.user_id)?.full_name||r.user_id);
    const isCorrection=kind==='corrections';
    const requestedIn=isCorrection&&r.requested_check_in?officeLocal(r.requested_check_in):'';
    const requestedOut=isCorrection&&r.requested_check_out?officeLocal(r.requested_check_out):'';
    const mismatched=!!(requestedIn&&requestedIn.slice(0,10)!==r.date);
    const details=isCorrection?'<div class="av-correction-dates"><span>Requested check-in: '+esc(requestedIn||'Not provided')+'</span><span>Requested check-out: '+esc(requestedOut||'Not provided')+'</span></div>':'';
    const warning=mismatched?'<div class="av-correction-date-alert">The submitted times have a different date. On approval, the original times will be recorded under <b>'+esc(r.date)+'</b>, the selected attendance date. The original request is preserved in the audit log.</div>':'';
    return '<div class="av-entry"><strong>'+name+'</strong><b>'+esc(isCorrection?r.date:r.from_date+' to '+r.to_date)+'</b><small>'+esc(r.reason)+'</small>'+details+warning+'<div class="av-actions"><button class="secondary" data-review="'+esc(r.id)+'" data-decision="APPROVED">Approve</button><button class="secondary" data-review="'+esc(r.id)+'" data-decision="REJECTED">Reject</button></div></div>';
   },'No pending requests');
   $$(container+' [data-review]').forEach(button=>button.onclick=()=>safe(async()=>{
    const selected=items.find(item=>item.id===button.dataset.review);
    const approving=button.dataset.decision==='APPROVED';
    const inDate=kind==='corrections'&&selected?.requested_check_in?officeLocal(selected.requested_check_in).slice(0,10):null;
    const mismatch=approving&&inDate&&inDate!==selected.date;
    const message=mismatch
     ?'The submitted check-in date is '+inDate+' but the selected attendance date is '+selected.date+'. Approving will use '+selected.date+' and preserve the entered clock times. Proceed?'
     :approving?'Approve this request?':'Reject this request?';
    if(!confirm(message))return;
    button.disabled=true;
    try{
     await request('/admin/'+kind+'/'+button.dataset.review+'/review','PATCH',{decision:button.dataset.decision,note:''});
     notify('Request '+button.dataset.decision.toLowerCase()+'.');await loadAdmin();
    }finally{button.disabled=false}
   }));
  }
  const pending=(corrections.total||0)+(leaves.total||0);
  $('#pendingBadge').textContent=pending?pending+' pending approval request'+(pending===1?'':'s'):'All requests reviewed';
  $('#adminTab').textContent='Employee Attendance'+(pending?' · '+pending+' pending':'');
  $('#approvalPreview').innerHTML=pending?'<div class="av-pending-links"><button type="button" class="secondary" data-go-approval="adminCorrections">'+corrections.total+' attendance corrections</button><button type="button" class="secondary" data-go-approval="adminLeaves">'+leaves.total+' leave requests</button></div>':'<p>There are no pending requests at the moment.</p>';
  $$('#approvalPreview [data-go-approval]').forEach(b=>b.onclick=()=>$('#'+b.dataset.goApproval).scrollIntoView({behavior:'smooth',block:'center'}));
 approveRows('#adminCorrections',corrections.items,'corrections');approveRows('#adminLeaves',leaves.items,'leaves');
 }
 return {mount:async function(container){container.innerHTML="\n<div class=\"av-tabs\"><button class=\"av-tab active\" type=\"button\" data-tab=\"mine\">My Attendance</button><button id=\"adminTab\" class=\"av-tab\" type=\"button\" data-tab=\"admin\" hidden>Employee Attendance</button></div>\n<section id=\"tab-mine\" class=\"av-section\">\n <div class=\"panel av-clock-panel\">\n  <div class=\"row\"><div><h2>My Daily Attendance</h2><p>Check-in மற்றும் Check-out நேரம் server-ல் பதிவு செய்யப்படும்.</p></div><span class=\"pill\" id=\"todayLabel\"></span></div>\n  <div class=\"av-clock-bar\">\n   <button id=\"checkIn\" type=\"button\" class=\"blue av-clock-button\"><span>↪ Check In</span></button>\n   <button id=\"checkOut\" type=\"button\" class=\"secondary av-clock-button\"><span>↩ Check Out</span></button>\n   <div class=\"av-clock-metric\"><small>CHECK IN</small><strong id=\"checkInTime\">Not marked</strong></div>\n   <div class=\"av-clock-metric\"><small>CHECK OUT</small><strong id=\"checkOutTime\">Not marked</strong></div>\n  </div>\n  <p id=\"clockStatus\" class=\"av-clock-note\">Your attendance is saved securely using office server time.</p>\n </div>\n <div class=\"panel\">\n  <div class=\"row\"><div><h2>My Monthly Attendance Calendar</h2><p>Your attendance only • Present, Absent, Half Day, Leave, Holiday and Weekend</p></div><label>Month<input id=\"myMonth\" type=\"month\"></label></div>\n  <div id=\"mySummary\" class=\"cards av-summary-cards\"></div>\n  <div class=\"av-calendar-legend\"><span><i class=\"av-dot present\"></i> Present</span><span><i class=\"av-dot absent\"></i> Absent</span><span><i class=\"av-dot half\"></i> Half Day</span><span><i class=\"av-dot leave\"></i> Leave</span><span><i class=\"av-dot holiday\"></i> Holiday</span><span><i class=\"av-dot weekend\"></i> Weekend</span></div>\n  <div id=\"myCalendar\" class=\"av-calendar\" aria-label=\"My monthly attendance calendar\"></div>\n </div>\n <div class=\"panel\">\n  <h2>My Check-in / Check-out Time Sheet</h2>\n  <div class=\"tablewrap\"><table><thead><tr><th>Date</th><th>Status</th><th>Check In (IST)</th><th>Check Out (IST)</th><th>Hours</th></tr></thead><tbody id=\"myRows\"></tbody></table></div>\n  <div class=\"av-pager\" hidden><button id=\"myPrev\" type=\"button\">Previous</button><span id=\"myPager\"></span><button id=\"myNext\" type=\"button\">Next</button></div>\n </div>\n <div class=\"av-requests\"><h2>Requests & Approvals</h2><p>Attendance correction or leave requests are sent to the authorised attendance approvers.</p>\n<div class=\"av-grid\"><div class=\"panel\"><h2>Request Attendance Correction</h2><p>For a previous date only. An Office Admin must approve.</p>\n<form id=\"correctionForm\" class=\"av-form\">\n<label>Date<input name=\"date\" type=\"date\" id=\"correctionDate\" required></label>\n<label>Requested Check-in (local office time)<input name=\"in\" type=\"datetime-local\" required></label>\n<label>Requested Check-out (local office time)<input name=\"out\" type=\"datetime-local\"></label>\n<label>Note (optional)<textarea name=\"reason\" maxlength=\"1000\" rows=\"3\"></textarea></label><button class=\"blue\" type=\"submit\">Submit Correction</button></form></div>\n<div class=\"panel\"><h2>Apply for Leave</h2><form id=\"leaveForm\" class=\"av-form\">\n<label>Leave Type<select name=\"type\"><option>Casual Leave</option><option>Sick Leave</option><option>Earned Leave</option><option>Unpaid Leave</option></select></label>\n<label>From<input name=\"from\" type=\"date\" required></label><label>To<input name=\"to\" type=\"date\" required></label>\n<label>Note (optional)<textarea name=\"reason\" rows=\"3\" maxlength=\"1000\"></textarea></label>\n<button class=\"blue\">Submit Leave Request</button></form></div></div>\n<div class=\"panel\"><h2>My Correction Requests</h2><div id=\"myCorrections\"></div></div>\n<div class=\"panel\"><h2>My Leave Applications</h2><div id=\"myLeaves\"></div></div>\n</div>\n</section>\n<section id=\"tab-admin\" class=\"av-section\" hidden>\n <div class=\"panel av-approvals-panel\"><div class=\"row\"><h2>Approval Inbox</h2><span class=\"pill\" id=\"pendingBadge\">Checking requests...</span></div><p>Employees' leave and attendance correction requests appear here for authorised approvers.</p><div id=\"approvalPreview\"></div></div>\n <div class=\"panel\"><div class=\"row\"><h2>Employee Attendance & Reports</h2><span class=\"pill\">Admin / Office Admin</span></div>\n <div class=\"av-period-tabs\"><button type=\"button\" class=\"secondary\" data-period=\"day\">Today</button><button type=\"button\" class=\"secondary\" data-period=\"week\">This Week</button><button type=\"button\" class=\"secondary\" data-period=\"month\">This Month</button></div>\n <form id=\"adminFilters\" class=\"av-filter\"><label>Employee<select name=\"userId\" id=\"filterEmployee\"><option value=\"\">All Employees</option></select></label>\n <label>User Role<select name=\"roleId\" id=\"filterRole\"><option value=\"\">All Roles</option></select></label>\n <label>From<input name=\"from\" id=\"adminFrom\" type=\"date\"></label><label>To<input name=\"to\" id=\"adminTo\" type=\"date\"></label>\n <label>Status<select name=\"status\"><option value=\"\">All Statuses</option><option>PRESENT</option><option>ABSENT</option><option>LATE</option><option>PERMISSION</option><option>PERMISSION</option><option>HALF_DAY</option><option>ON_LEAVE</option><option>HOLIDAY</option><option>WEEKEND</option></select></label>\n <button class=\"blue\">Apply Filters</button></form>\n <div id=\"adminChartSummary\" class=\"cards av-summary-cards\"></div><div id=\"adminChart\" class=\"av-donut-view\" aria-label=\"Attendance status round chart\"></div>\n <div class=\"tablewrap\"><table><thead><tr><th>Date</th><th>Employee</th><th>Status</th><th>In (IST)</th><th>Out (IST)</th><th>Actions</th></tr></thead><tbody id=\"adminRows\"></tbody></table></div><div class=\"av-pager\"><button id=\"adminPrev\">Previous</button><span id=\"adminPager\"></span><button id=\"adminNext\">Next</button></div></div>\n <div class=\"av-grid av-attendance-admin-actions\">\n <div class=\"panel\"><h2>Mark / Correct Attendance</h2><form id=\"adminMark\" class=\"av-form\">\n <label>Employee<select name=\"userId\" id=\"markEmployee\" required></select></label><label>Date<input name=\"date\" type=\"date\" required></label>\n <label>Status<select name=\"status\"><option>PRESENT</option><option>ABSENT</option><option>LATE</option><option>HALF_DAY</option><option>ON_LEAVE</option><option>HOLIDAY</option><option>WEEKEND</option></select></label>\n <label>Check-in (optional)<input name=\"checkIn\" type=\"datetime-local\"></label><label>Check-out (optional)<input name=\"checkOut\" type=\"datetime-local\"></label>\n <label>Note (optional)<textarea name=\"reason\" rows=\"2\" maxlength=\"1000\"></textarea></label><button class=\"blue\" type=\"submit\">Save Attendance</button></form></div>\n <div class=\"panel av-bulk-panel\"><h2>Quick Employee Attendance</h2><p>Select employees and mark their attendance individually or in bulk. Choose a date and a status; notes are optional.</p>\n <form class=\"av-form\" id=\"bulkForm\">\n <label>Date<input name=\"date\" type=\"date\" required></label>\n <label class=\"av-bulk-hidden\">Status<select name=\"status\"><option>PRESENT</option><option>ABSENT</option><option>HALF_DAY</option><option>WEEKEND</option><option>HOLIDAY</option><option>PAID_LEAVE</option></select></label>\n <label class=\"av-select-all\"><input type=\"checkbox\" id=\"selectAllEmployees\"> Select All Employees <small id=\"selectedStaffCount\">0 selected</small></label>\n <div class=\"av-bulklist av-bulk-table\" id=\"bulkUsers\"></div><label>Note (optional)<textarea name=\"reason\" maxlength=\"1000\"></textarea></label>\n <div class=\"av-actions\"><button type=\"button\" data-bulk-status=\"PRESENT\" class=\"blue\">✓ Mark Present</button><button type=\"button\" data-bulk-status=\"ABSENT\" class=\"secondary\">Mark Absent</button><button type=\"button\" data-bulk-status=\"HALF_DAY\" class=\"secondary\">Mark Half Day</button><button type=\"button\" data-bulk-status=\"WEEKEND\" class=\"secondary\">Mark Weekend</button><button type=\"button\" data-bulk-status=\"HOLIDAY\" class=\"secondary\">Mark Holiday</button><button type=\"button\" data-bulk-status=\"PAID_LEAVE\" class=\"secondary\">Mark Paid Leave</button><button type=\"submit\" class=\"av-hidden-submit\" hidden>Save Selected</button></div></form></div></div>\n <div class=\"panel\"><div class=\"row\"><h2>Download Attendance Report</h2><input id=\"reportMonth\" type=\"hidden\"></div>\n <p>Report uses the selected employee, date range and status filters above (day / week / month).</p><div class=\"av-actions\"><button type=\"button\" data-export=\"csv\" class=\"secondary\">Export CSV</button><button type=\"button\" data-export=\"xls\" class=\"secondary\">Export Excel</button><button type=\"button\" data-export=\"pdf\" class=\"secondary\">Export PDF</button></div></div>\n <section class=\"panel av-monthly-reports\" id=\"monthlyReportsSection\">\n <div class=\"row\"><div><h2>Monthly Attendance Reports</h2><p>Select an employee to open their monthly attendance calendar and download their report.</p></div></div>\n <div class=\"av-monthly-selector-row\">\n  <label>Report Month<input id=\"allMonthlyReportMonth\" type=\"month\" aria-label=\"Month for all employees summary\"></label>\n  <button id=\"downloadAllMonthlyExcel\" type=\"button\" class=\"blue\"><span>Download All Employees Summary · Excel</span></button>\n </div>\n <p class=\"av-report-helper\">The company Excel summary contains employee names and attendance counts only — no daily check-in/out log.</p>\n <div id=\"allMonthlyReportInfo\" class=\"av-report-info\" aria-live=\"polite\"></div>\n <h3 class=\"av-employee-list-title\">Employee List</h3>\n <div id=\"monthlyEmployeeList\" class=\"av-monthly-employee-list\" aria-label=\"Employees for monthly attendance reports\"></div>\n</section>\n<div class=\"av-grid\">\n <div class=\"panel\"><h2>Attendance Corrections for Approval</h2><div id=\"adminCorrections\"></div></div>\n <div class=\"panel\"><h2>Leave Requests for Approval</h2><div id=\"adminLeaves\"></div></div></div>\n</section>\n<dialog id=\"monthlyEmployeeDialog\" class=\"av-edit-dialog av-monthly-dialog\" aria-labelledby=\"monthlyEmployeeHeading\">\n <div class=\"av-monthly-dialog-header\"><div><h2 id=\"monthlyEmployeeHeading\">Employee Monthly Attendance</h2><p id=\"monthlyEmployeeSubheading\">Selected employee attendance report</p></div><button id=\"monthlyEmployeeClose\" type=\"button\" class=\"secondary\" aria-label=\"Close employee monthly report\">✕</button></div>\n <div class=\"av-monthly-selector-row\"><label>Choose Month<input type=\"month\" id=\"monthlyEmployeeMonth\"></label></div>\n <div id=\"monthlyEmployeeCounts\" class=\"av-monthly-counts\" aria-live=\"polite\"></div>\n <div class=\"av-calendar-legend\"><span><i class=\"av-dot present\"></i> Present</span><span><i class=\"av-dot absent\"></i> Absent</span><span><i class=\"av-dot half\"></i> Half Day</span><span><i class=\"av-dot leave\"></i> Leave</span><span><i class=\"av-dot holiday\"></i> Holiday</span><span><i class=\"av-dot weekend\"></i> Weekend</span><span><i class=\"av-dot permission\"></i> Permission</span></div>\n <div id=\"monthlyEmployeeCalendar\" class=\"av-calendar av-employee-report-calendar\" aria-label=\"Selected employee monthly attendance calendar\"></div>\n <h3>Monthly Check-in / Check-out Details</h3>\n <div class=\"tablewrap\"><table><thead><tr><th>Date</th><th>Status</th><th>Check In (IST)</th><th>Check Out (IST)</th><th>Hours</th></tr></thead><tbody id=\"monthlyEmployeeTimeSheet\"></tbody></table></div>\n <div class=\"av-monthly-dialog-actions\"><span id=\"monthlyEmployeeDownloadNote\">Choose a download format for the selected month.</span><button type=\"button\" class=\"secondary\" data-monthly-export=\"csv\">CSV</button><button type=\"button\" class=\"secondary\" data-monthly-export=\"xls\">Excel</button><button type=\"button\" class=\"blue\" data-monthly-export=\"pdf\">PDF</button></div>\n</dialog>\n<dialog id=\"attendanceEditDialog\" class=\"av-edit-dialog\" aria-labelledby=\"attendanceEditTitle\">\n <form id=\"attendanceEditForm\" class=\"av-form\">\n  <div class=\"av-modal-head\"><h2 id=\"attendanceEditTitle\">Edit Employee Attendance</h2><button type=\"button\" id=\"attendanceEditClose\" class=\"secondary\">✕</button></div>\n  <input type=\"hidden\" name=\"recordId\">\n  <label>Employee<input name=\"employee\" readonly></label>\n  <label>Attendance Date<input name=\"date\" type=\"date\" readonly></label>\n  <label>Status<select name=\"status\" required><option value=\"PRESENT\">Present</option><option value=\"ABSENT\">Absent</option><option value=\"LATE\">Late</option><option value=\"HALF_DAY\">Half Day</option><option value=\"WEEKEND\">Weekend</option><option value=\"HOLIDAY\">Holiday</option><option value=\"PAID_LEAVE\">Paid Leave</option><option value=\"ON_LEAVE\">On Leave (Unpaid)</option><option value=\"PERMISSION\">Permission</option></select></label>\n  <label>Check-in Date and Time<input name=\"checkIn\" type=\"datetime-local\"></label>\n  <label>Check-out Date and Time<input name=\"checkOut\" type=\"datetime-local\"></label>\n  <label>Note (optional)<textarea name=\"reason\" rows=\"2\" maxlength=\"1000\"></textarea></label>\n  <div class=\"av-modal-actions\"><button type=\"button\" class=\"secondary\" id=\"attendanceEditCancel\">Cancel</button><button type=\"submit\" class=\"blue\" id=\"attendanceEditSave\">Update Attendance</button></div>\n </form>\n</dialog>\n<div id=\"alert\" class=\"av-alert\" role=\"alert\" hidden></div>\n";await init();}};
})();