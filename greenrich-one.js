'use strict';
(()=>{const $=s=>document.querySelector(s);let db=null,user=null,profile=null,roles=[],permissions=[],people=[],page=(['#users','#roles','#settings-users','#settings-roles'].includes(location.hash)?'settings':'dashboard'),company=null;
let settingsInitialTab=({'#users':'users','#roles':'roles','#settings-users':'users','#settings-roles':'roles'})[location.hash]||'companies';
const modules=['dashboard','crm','attendance','users','roles','leads','customers','sales','tasks','orders','stock','purchase','accounts','settings'];
const labels={dashboard:'Dashboard',crm:'Sales & CRM Overview',tasks:'Follow-ups',channels:'Sales Channels',attendance:'Attendance',users:'Users',roles:'Create & Manage Roles',leads:'Leads & CRM',customers:'Customers',sales:'Sales',marketing:'Marketing',orders:'Sales Orders',stock:'Stock & Products',purchase:'Purchase Orders',accounts:'Accounts',settings:'Settings',reports:'Reports'};
const crmMap={crm:'dashboard',leads:'leads',customers:'customers',sales:'sales',tasks:'tasks',marketing:'tasks',orders:'sales',stock:'products'};
const crmAccess=()=>({
 dashboard:can('sales')&&can('customers')&&can('leads'),
 sales:can('sales')||can('orders'),
 customers:can('customers'),
 leads:can('leads'),
 tasks:can('leads')||can('marketing'),
 products:can('stock'),
 channels:roleName()==='Admin',
 reports:roleName()==='Admin'
});
const canOpenPage=m=>['channels','reports','users','roles'].includes(m)?false:m==='settings'?roleName()==='Admin':m==='attendance'||can(m)||
 (m==='crm'&&crmAccess().dashboard)||
 (m==='tasks'&&crmAccess().tasks)||
 (m==='channels'&&crmAccess().channels);
const act=['view','create','edit','delete','approve','export'];const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});const today=()=>new Date().toLocaleDateString('en-CA');const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const show=(id)=>['setup','login','app'].forEach(k=>$('#'+k).hidden=k!==id);const toast=x=>{let t=$('#toast');t.textContent=x;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),4500)};const can=(m,a='view')=>profile&&((roleName()==='Admin')||permissions.some(p=>p.role_id===profile.role_id&&p.module===m&&p.action===a&&p.allowed));const roleName=()=>roles.find(r=>r.id===profile?.role_id)?.name||'Employee';
const query=async(t)=>{let {data,error}=await db.from(t).select('*');if(error)throw Error(error.message);return data||[]};
async function start(){const publicConfig=window.GREENRICH_PUBLIC_CONFIG;if(publicConfig?.supabaseUrl&&publicConfig?.publishableKey){localStorage.setItem('gr-supabase-url',publicConfig.supabaseUrl);localStorage.setItem('gr-supabase-key',publicConfig.publishableKey);}const url=localStorage.getItem('gr-supabase-url'),key=localStorage.getItem('gr-supabase-key');if(!url||!key){show('setup');return}if(!window.supabase){show('setup');toast('Authentication library unavailable');return}db=window.supabase.createClient(url,key);let {data}=await db.auth.getSession();if(data.session)await enter();else show('login')}
async function enter(){
 const auth=await db.auth.getUser();
 if(!auth.data.user){show('login');return}
 user=auth.data.user;
 try{
  // Independent authenticated reads run concurrently instead of five sequential requests.
  const [roleRows,profileResult,permissionRows,employeeRows,settingsRows]=await Promise.all([
   query('gr_roles'),
   db.from('gr_profiles').select('*').eq('id',user.id).single(),
   query('gr_role_permissions'),
   query('gr_profiles'),
   query('gr_company_settings')
  ]);
  if(profileResult.error||!profileResult.data?.active)throw Error('No active employee profile. Ask your Admin to set up your profile.');
  profile=profileResult.data;roles=roleRows;permissions=permissionRows;people=employeeRows;company=settingsRows[0]||null;
  $('#userName').textContent=profile.full_name;$('#userRole').textContent=roleName();const companyLabel=$('#activeCompanyLabel');if(companyLabel)companyLabel.textContent=window.GreenRichCompanies?.name(user?.id)||'GreenRich Grow India Pvt Ltd';
  document.title='GreenRich ONE · '+(company?.company_name||'CRM');
  if(window.GreenRichAttendance?.configure)window.GreenRichAttendance.configure({client:db,user,profile,roles,permissions});
  show('app');navigation();
  // Attendance status is useful but should never block dashboard navigation or first paint.
  void attendanceQuick().catch(e=>{console.warn('Attendance switch could not initialize',e)});
  await render();
 }catch(e){await db.auth.signOut();show('login');toast(e.message)}
}
const menuIcons={
 crm:'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 2 5-7"/><circle cx="19" cy="6" r="1"/>',
 tasks:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
 channels:'<rect x="2" y="3" width="8" height="8" rx="1"/><rect x="14" y="3" width="8" height="8" rx="1"/><rect x="8" y="15" width="8" height="6" rx="1"/><path d="M6 11v2h12v-2M12 13v2"/>',
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
 attendance:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 16l2.2 2.2L16 13"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 roles:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
 leads:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M6 17a3 3 0 0 1 6 0M15 9h4M15 13h4"/>',
 customers:'<path d="M3 21V5l9-3 9 3v16M3 9h18M8 21v-5h8v5"/>',
 sales:'<path d="M3 7h18M6 3v4M18 3v4M5 11h14v10H5zM9 15h6"/>',
 marketing:'<path d="m3 11 18-7-7 18-3-9-8-2Zm8 2 10-9"/>',
 orders:'<path d="M4 7h16l-1 13H5L4 7ZM8 7a4 4 0 0 1 8 0"/>',
 stock:'<path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10"/>',
 purchase:'<path d="M3 4h2l2.2 11h11l2.1-8H6M10 20h.01M18 20h.01"/>',
 accounts:'<rect x="2" y="5" width="20" height="16" rx="2"/><path d="M2 10h20M16 15h3"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .8 1.4-2 2-.9-.9a8 8 0 0 1-2.3 1l-.3 1.5h-3l-.3-1.5a8 8 0 0 1-2.3-1l-.9.9-2-2 .8-1.4a8 8 0 0 1-.4-2.5L5 12l1.6-.5a8 8 0 0 1 .4-2.5L6.2 7.6l2-2 .9.9a8 8 0 0 1 2.3-1l.3-1.5h3l.3 1.5a8 8 0 0 1 2.3 1l.9-.9 2 2-.8 1.4a8 8 0 0 1 .4 2.5L21 12l-1.6.5a8 8 0 0 1 0 2.5Z"/>',
 reports:'<path d="M3 3v18h18M7 15l5-5 4 3 5-7"/>'
};
function navigation(){
 const visible=modules.filter(canOpenPage);
 $('#nav').innerHTML=visible.map(m=>'<button type="button" data-page="'+m+'" aria-current="'+(page===m?'page':'false')+'" class="'+(page===m?'active':'')+'"><svg class="gr-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(menuIcons[m]||menuIcons.dashboard)+'</svg><span>'+labels[m]+'</span></button>').join('');
 $('#nav').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(page===b.dataset.page){$('#sidebar').classList.remove('open');return}page=b.dataset.page;$('#sidebar').classList.remove('open');navigation();void render()});
}
async function attendanceQuick(){
 const area=$('#attendanceQuick');
 area.innerHTML='<div class="gr-attendance-switch-wrap"><span class="gr-switch-label">Attendance</span><button id="grAttendanceSwitch" type="button" role="switch" aria-checked="false" aria-label="Loading attendance" disabled><span class="gr-switch-track"><span class="gr-switch-thumb"></span></span><span id="grSwitchAction">Loading</span></button><small id="grClockInfo" aria-live="polite"></small></div>';
 const button=$('#grAttendanceSwitch'),actionText=$('#grSwitchAction'),info=$('#grClockInfo');
 const key=localStorage.getItem('gr-supabase-key'),url=localStorage.getItem('gr-supabase-url');
 if(!key||!url){info.textContent='Not configured';return}
 const session=(await db.auth.getSession()).data.session;
 if(!session){info.textContent='Sign in required';return}
 const headers={Authorization:'Bearer '+session.access_token,apikey:key};
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date());
 const part=t=>parts.find(p=>p.type===t)?.value,day=part('year')+'-'+part('month')+'-'+part('day');
 const api=(url.endsWith('/')?url.slice(0,-1):url)+'/functions/v1/attendance-api';
 const send=async(path,method='GET')=>{
  const r=await fetch(api+path,{method,headers:{...headers,...(method==='POST'?{'Content-Type':'application/json'}:{})},body:method==='POST'?'{}':undefined,cache:'no-store'});
  const payload=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(payload?.error?.message||'Attendance service unavailable');
  return payload.data;
 };
 try{
  const history=await send('/attendance/me?from='+day+'&to='+day+'&pageSize=1');
  if(!button.isConnected)return;
  const record=history?.items?.[0],checkedIn=!!record?.check_in,checkedOut=!!record?.check_out;
  const canCheckIn=!record,canCheckOut=checkedIn&&!checkedOut;
  const state=checkedOut?'finished':canCheckOut?'in':record?'marked':'out';
  button.dataset.state=state;button.setAttribute('aria-checked',String(canCheckOut||checkedOut));
  button.setAttribute('aria-label',canCheckIn?'Check in for today':canCheckOut?'Check out for today':checkedOut?'Attendance completed for today':'Attendance already marked for today');
  button.disabled=!canCheckIn&&!canCheckOut;
  actionText.textContent=canCheckIn?'Check In':canCheckOut?'Check Out':checkedOut?'Completed':'Marked';
  info.textContent=checkedOut?'Checked out':canCheckOut?'Checked in':record?'Recorded':'Not checked in';
  button.onclick=async()=>{
   if(button.disabled)return;
   const mode=canCheckIn?'in':'out';
   button.disabled=true;button.dataset.state='busy';actionText.textContent='Saving';
   try{
    await send('/attendance/check-'+mode,'POST');
    toast(mode==='in'?'Check-in recorded':'Check-out recorded');
    await attendanceQuick();
    if(page==='attendance')window.GreenRichAttendance?.refreshOwn?.();
   }catch(error){toast(error.message);await attendanceQuick()}
  };
 }catch(error){
  if(!button.isConnected)return;
  info.textContent='Unavailable';button.title=error.message;actionText.textContent='Offline';
 }
}
let attendancePeople=[];
function scopeAllows(module,action,id,staff=people){
 if(!can(module,action))return false;
 if(roleName()==='Admin')return true;
 const p=permissions.find(x=>x.role_id===profile.role_id&&x.module===module&&x.action===action);
 return !!p?.allowed&&(id===user.id||p.data_scope==='all'||(p.data_scope==='team'&&staff.some(x=>x.id===id&&x.manager_id===user.id)));
}
async function mark(id,status,date){
 try{
  const r=await db.rpc('gr_attendance_save',{p_user:id,p_date:date,p_status:status,p_remark:''});
  if(r.error)throw Error(r.error.message);
  toast('Attendance saved');await attendanceQuick();await render();
 }catch(e){toast(e.message)}
}
async function removeAttendance(id,date){
 if(!scopeAllows('attendance','delete',id,attendancePeople))return toast('Delete permission denied');
 if(!confirm('Delete this attendance entry?'))return;
 const r=await db.rpc('gr_attendance_remove',{p_user:id,p_date:date});
 if(r.error)return toast(r.error.message);
 toast('Attendance removed');await attendanceQuick();await render();
}
function card(t,v,sub=''){return '<div class="card"><small>'+esc(t)+'</small><strong>'+esc(v)+'</strong><small>'+esc(sub)+'</small></div>'}
async function render(){if(!canOpenPage(page)){page='dashboard';navigation()}$('#title').textContent=labels[page];let c=$('#content');c.innerHTML='<div class="panel">Loading...</div>';try{if(page==='dashboard')await dashboard(c);else if(page==='attendance')await attendance(c);else if(page==='settings')await settings(c);else if(crmMap[page])await crmWorkspace(c,crmMap[page]);else await placeholder(c)}catch(e){c.innerHTML='<div class="notice">'+esc(e.message)+'</div>'}}
async function dashboard(c){const [daily,ownTotal]=await Promise.all([db.from('gr_attendance').select('user_id,status').eq('attendance_date',today()),db.from('gr_attendance').select('user_id',{count:'exact',head:true}).eq('user_id',user.id)]);if(daily.error||ownTotal.error)throw Error(daily.error?.message||ownTotal.error?.message);let todays=daily.data||[];let own={length:ownTotal.count||0};c.innerHTML='<div class="notice">GreenRich ONE combines employee management, attendance and Sales & CRM in this workspace. Sales and customer data currently stays in this browser and is not yet synced across devices.</div><div class="cards">'+card('Active employees',people.filter(p=>p.active).length)+card('Present today',todays.filter(x=>x.status==='present').length)+card('Half day today',todays.filter(x=>x.status==='half_day').length)+card('Your attendance records',own.length)+'</div><div class="panel"><h2>Department workspace</h2><p>Signed in as '+esc(profile.full_name)+' · '+esc(roleName())+'</p><div class="row"><button class="blue" id="goAttendance">View attendance</button><button class="secondary" type="button" id="goCrm">Open Sales & CRM</button></div></div>';$('#goAttendance').onclick=()=>{page='attendance';navigation();render()};$('#goCrm').onclick=()=>{page='crm';navigation();render()};$('#goCrm').hidden=!canOpenPage('crm')}
async function attendance(c){
 if(!window.GreenRichAttendance)throw Error('Attendance module script has not loaded. Refresh GreenRich ONE.');
 await window.GreenRichAttendance.mount(c);
}
let crmAssetsPromise=null;
const loadCrmAssets=()=>{
 if(crmAssetsPromise)return crmAssetsPromise;
 const load=(url,test)=>test()?Promise.resolve():new Promise((resolve)=>{
  const script=document.createElement('script');script.src=url;script.async=true;
  script.onload=resolve;script.onerror=resolve;document.head.append(script);
 });
 // Load only when CRM opens, leaving login and attendance fast.
 return crmAssetsPromise=Promise.all([
  load('https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js',()=>!!window.Chart),
  load('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',()=>!!window.XLSX)
 ]);
};
async function crmWorkspace(container,view,adminTools=false){
 if(adminTools&&roleName()!=='Admin')throw Error('Only Admin can open company administration tools');
 if(!window.GreenRichCRM)throw Error('Sales & CRM module has not loaded. Refresh the page.');
 const access=crmAccess(),allowed=adminTools?['channels','reports']:Object.entries(access).filter(([key,v])=>v&&key!=='channels'&&key!=='reports').map(([key])=>key);
 if(!allowed.includes(view))throw Error('You do not have permission to open this CRM section');
 window.GreenRichCRM.mount(container,view,allowed,window.GreenRichCompanies?.selected(user?.id)||'grow-india',window.GreenRichCompanies?.name(user?.id)||'GreenRich Grow India Pvt Ltd',adminTools===true);
 // Draw the CRM immediately. Charts/Excel helpers load without blocking navigation.
 void loadCrmAssets().then(()=>window.GreenRichCRM?.refresh?.()).catch(()=>{});
}
function exportCSV(filename,cols,rows){let csv=[cols,...rows].map(r=>r.map(x=>{let v=String(x??'');if(/^[=+@\-\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}).join(',')).join('\r\n');let blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href)}
async function employeeAction(data){
 const session=(await db.auth.getSession()).data.session;
 if(!session?.access_token)throw Error('Please sign in again');
 const {data:result,error}=await db.functions.invoke('greenrich-admin-users',{body:data,headers:{Authorization:'Bearer '+session.access_token}});
 if(error){
  let details=result?.error||'';
  let status=error.context?.status;
  if(error.context && typeof error.context.clone==='function'){
   try{const payload=await error.context.clone().json();details=payload?.error||payload?.message||details}catch(_){}
  }
  if(!details)details=error.message||'Unknown server error';
  if(/Failed to send a request|Failed to fetch|FunctionsFetchError/i.test(details))details='The employee account service is unreachable. Confirm function deployment and browser network access.';
  if(/non-2xx status code/i.test(details))details='The server rejected this request'+(status?' (HTTP '+status+')':'')+'. Check the employee account service logs.';
  throw Error(details);
 }
 if(result?.error)throw Error(result.error);
 return result;
}
async function users(c){
 if(roleName()!=='Admin')throw Error('Only Admin can manage users');
 c.innerHTML='<div class="panel"><div class="row"><h2>User Management</h2><div class="row"><button class="secondary" type="button" id="openRoleSettings">Manage User Roles</button><button class="blue" type="button" id="newEmployeeButton">+ Create New User</button></div></div><div id="newEmployeePanel" hidden><h3>Create Employee</h3><span class="pill">Direct account creation</span><p>Enter username, login email and password. No invitation or email verification is required. Every employee login must use a unique email.</p><form id="employeeForm" class="fields"><label>Username<input name="username" required minlength="3" placeholder="e.g. ezhil"></label><label>Email for Login<input name="email" type="email" required placeholder="employee@company.com"></label><label>Password<input name="password" type="password" minlength="10" required></label><label>Assign Role<select name="role">'+roles.map(r=>'<option>'+esc(r.name)+'</option>').join('')+'</select></label><div style="align-self:end"><button class="blue" type="submit">Create Employee</button></div></form></div><div class="notice">One-time setup: deploy the protected greenrich-admin-users employee service from this repository. The button will work only after that one-time deployment. <a href="https://github.com/maheshgreenrich/GREENRICH-CRM/blob/main/supabase/functions/greenrich-admin-users/index.ts" target="_blank" rel="noopener">Open deployment code</a>.</div></div><div class="panel"><div class="row"><h2>Manage Users</h2><span class="pill">'+people.length+' profiles</span></div><div class="tablewrap"><table><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Admin Actions</th></tr></thead><tbody>'+people.map(p=>'<tr><td>'+esc(p.full_name)+'</td><td>'+esc(p.username)+'</td><td>'+esc(p.email)+'</td><td>'+esc(roles.find(x=>x.id===p.role_id)?.name)+'</td><td>'+esc(p.active?'Active':'Disabled')+'</td><td><button class="secondary" data-emp-edit="'+p.id+'">Edit / Role</button> <button class="secondary" data-emp-reset="'+p.id+'">Reset Password</button> <button class="secondary" data-emp-toggle="'+p.id+'">'+(p.active?'Deactivate':'Reactivate')+'</button></td></tr>').join('')+'</tbody></table></div></div>';
 const openRoleSettings=c.querySelector('#openRoleSettings');if(openRoleSettings)openRoleSettings.onclick=()=>c.closest('#gr-company-admin')?.querySelector('[data-settings-tab="roles"]')?.click();
 $('#newEmployeeButton').onclick=()=>{const panel=$('#newEmployeePanel');panel.hidden=!panel.hidden;if(!panel.hidden)panel.querySelector('input').focus()};const refresh=async()=>{people=await query('gr_profiles');permissions=await query('gr_role_permissions');await users(c)};
 $('#employeeForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');const f=new FormData(form);button.disabled=true;try{const result=await employeeAction({action:'create',password:f.get('password'),name:f.get('username'),username:f.get('username'),email:f.get('email'),role:f.get('role')});toast(result.message||'Employee created');await refresh()}catch(e){toast(e.message)}finally{button.disabled=false}};
 c.querySelectorAll('[data-emp-edit]').forEach(button=>button.onclick=async()=>{const p=people.find(x=>x.id===button.dataset.empEdit);if(!p)return;const name=prompt('Employee name',p.full_name);if(name===null)return;const username=prompt('Username',p.username);if(username===null)return;const selected=prompt('Role: '+roles.map(x=>x.name).join(', '),roles.find(x=>x.id===p.role_id)?.name||'Sales');if(selected===null)return;const role=roles.find(r=>r.name.toLowerCase()===selected.trim().toLowerCase());if(!role)return toast('Role not found');try{const out=await employeeAction({action:'edit',userId:p.id,name,username,role:role.name});toast(out.message);await refresh()}catch(e){toast(e.message)}});
 c.querySelectorAll('[data-emp-reset]').forEach(button=>button.onclick=async()=>{const p=people.find(x=>x.id===button.dataset.empReset);if(!p)return;if(!confirm('Send a password reset email to '+p.email+'?'))return;try{const out=await employeeAction({action:'reset',userId:p.id});toast(out.message)}catch(e){toast(e.message)}});
 c.querySelectorAll('[data-emp-toggle]').forEach(button=>button.onclick=async()=>{const p=people.find(x=>x.id===button.dataset.empToggle);if(!p)return;const action=p.active?'disable':'enable';if(!confirm((p.active?'Deactivate':'Reactivate')+' '+p.username+'?'))return;try{const out=await employeeAction({action,userId:p.id});toast(out.message);await refresh()}catch(e){toast(e.message)}});
}
async function permissionPage(c){
 if(roleName()!=='Admin')throw Error('Admin only');
 c.innerHTML='<div class="panel"><div class="row"><h2>Manage User Roles</h2><button class="blue" id="addRole">+ Add New Role</button></div><p>Create custom roles, edit their capabilities, and remove unused custom roles. Built-in roles cannot be deleted.</p><div class="row"><label>Choose role <select id="roleSelect">'+roles.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>').join('')+'</select></label><button class="secondary" id="deleteRole">Delete Selected Role</button></div><div id="roleFeedback" class="notice" hidden></div></div><div class="panel"><h2>Capabilities & Record Access</h2><p>Each action has its own access scope: Own, Team or All. Scope applies to data access only where the module has server-side rules. Unconnected ERP modules are not secure yet.</p><div class="tablewrap"><table><thead><tr><th>Module</th>'+act.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody id="permBody"></tbody></table></div></div>';
 const select=$('#roleSelect'),feedback=$('#roleFeedback');
 const note=msg=>{feedback.hidden=false;feedback.textContent=msg;toast(msg)};
 const builtin=new Set(['Admin','Director','Sales','Telecaller','Marketing','Operation','Accounts','Developer']);
 function draw(){
  const selected=select.value,role=roles.find(x=>x.id===selected);$('#deleteRole').disabled=!role||builtin.has(role.name)||people.some(p=>p.role_id===selected);
  $('#permBody').innerHTML=modules.map(m=>'<tr><td>'+esc(labels[m])+'</td>'+act.map(action=>{
   const p=permissions.find(x=>x.role_id===selected&&x.module===m&&x.action===action);
   const locked=role?.name==='Admin';
   return '<td><label style="display:flex;align-items:center;gap:5px"><input type="checkbox" data-module="'+m+'" data-action="'+action+'" '+(p?.allowed?'checked':'')+' '+(locked?'disabled':'')+'> Allow</label><select data-module="'+m+'" data-action="'+action+'" '+(locked?'disabled':'')+'>'+['own','team','all'].map(v=>'<option value="'+v+'" '+((p?.data_scope||'own')===v?'selected':'')+'>'+v+'</option>').join('')+'</select></td>'
  }).join('')+'</tr>').join('');
  $('#permBody').querySelectorAll('input,select').forEach(el=>el.onchange=async()=>{
   const selectedRole=select.value,module=el.dataset.module,action=el.dataset.action;
   const existing=permissions.find(x=>x.role_id===selectedRole&&x.module===module&&x.action===action);
   const values=el.tagName==='SELECT'?{data_scope:el.value}:{allowed:el.checked};
   el.disabled=true;
   const res=await db.from('gr_role_permissions').upsert({role_id:selectedRole,module,action,allowed:existing?.allowed||false,data_scope:existing?.data_scope||'own',...values},{onConflict:'role_id,module,action'}).select().single();
   el.disabled=false;
   if(res.error){note('Could not save: '+res.error.message);draw();return}
   const ix=permissions.findIndex(x=>x.role_id===selectedRole&&x.module===module&&x.action===action);
   if(ix<0)permissions.push(res.data);else permissions[ix]=res.data;
   note('Saved '+labels[module]+' / '+action+': '+(res.data.allowed?'Allowed':'Not allowed')+', '+res.data.data_scope.toUpperCase());
  });
 }
 $('#addRole').onclick=async()=>{
  const raw=prompt('Enter new role name (example: Supervisor)');if(raw===null)return;
  const name=raw.trim();if(name.length<2||name.length>50)return note('Role name must be 2–50 characters');
  if(roles.some(x=>x.name.toLowerCase()===name.toLowerCase()))return note('That role already exists');
  const result=await db.from('gr_roles').insert({name,description:'Custom GreenRich company role'}).select().single();
  if(result.error)return note('Create failed: '+result.error.message);
  roles.push(result.data);select.innerHTML=roles.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>').join('');select.value=result.data.id;
  note('Role created. All capabilities are disabled until you enable them.');draw();
 };
 $('#deleteRole').onclick=async()=>{
  const r=roles.find(x=>x.id===select.value);if(!r||builtin.has(r.name))return note('Built-in roles cannot be deleted');
  if(people.some(p=>p.role_id===r.id))return note('Move employees to another role before deleting it');
  if(!confirm('Permanently delete custom role '+r.name+' and its permissions?'))return;
  try{const response=await employeeAction({action:'deleteRole',roleId:r.id});roles=roles.filter(x=>x.id!==r.id);permissions=permissions.filter(x=>x.role_id!==r.id);select.innerHTML=roles.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');note(response.message||'Role deleted');draw()}catch(error){note('Delete failed: '+error.message)}
 };
 select.onchange=draw;draw();
}
async function settings(c){
 if(roleName()!=='Admin')throw Error('Administrator access only');
 if(!window.GreenRichCompanies?.mount)throw Error('Settings module is not loaded. Reload the page.');
 const initialTab=settingsInitialTab;settingsInitialTab='companies';
 await window.GreenRichCompanies.mount(c,{
  db,user,role:roleName(),notify:toast,initialTab,
  openUsers:host=>users(host),
  openRoles:host=>permissionPage(host),
   openTags:(host,companyId)=>window.GreenRichCustomerTags.mount(host,{companyId,notify:toast}),
  openCRM:(host,view,adminTools)=>crmWorkspace(host,view,adminTools),
  onCompanyChange:(id,name)=>{
   document.title='GreenRich ONE · '+name;
   const label=$('#activeCompanyLabel');if(label)label.textContent=name;
  }
 });
}
async function placeholder(c){c.innerHTML='<div class="panel"><h2>'+labels[page]+'</h2><div class="notice">This ERP module is not yet connected to a secured server-side database. Sales & CRM features are available in this same workspace. Browser-local records are not shared across devices.</div><p>Other connected CRM features are available from the GreenRich ONE sidebar.</p></div>'}
$('#setupForm').onsubmit=e=>{e.preventDefault();localStorage.setItem('gr-supabase-url',$('#url').value.trim());localStorage.setItem('gr-supabase-key',$('#key').value.trim());start()};$('#loginForm').onsubmit=async e=>{e.preventDefault();let r=await db.auth.signInWithPassword({email:$('#email').value,password:$('#password').value});if(r.error)toast(r.error.message);else await enter()};$('#reset').onclick=async()=>{let email=$('#email').value;if(!email)return toast('Enter your email first');let r=await db.auth.resetPasswordForEmail(email);toast(r.error?.message||'If the account exists, check your email')};$('#reconnect').onclick=()=>{localStorage.removeItem('gr-supabase-url');localStorage.removeItem('gr-supabase-key');show('setup')};$('#logout').onclick=async()=>{await db.auth.signOut();show('login')};document.addEventListener('click',e=>{const link=e.target.closest('a[href="roles.html"]');if(link){e.preventDefault();page='settings';settingsInitialTab='roles';navigation();void render()}});
$('#hamburger').onclick=()=>$('#sidebar').classList.toggle('open');start().catch(e=>{show('setup');toast(e.message)});
})();