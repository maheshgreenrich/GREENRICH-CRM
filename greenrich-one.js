'use strict';
(()=>{const $=s=>document.querySelector(s);let db=null,user=null,profile=null,roles=[],permissions=[],people=[],page=(['#users','#roles','#settings-users','#settings-roles'].includes(location.hash)?'settings':'dashboard'),company=null;
let settingsInitialTab=({'#users':'users','#roles':'roles','#settings-users':'users','#settings-roles':'roles'})[location.hash]||'companies';
const modules=['dashboard','crm','attendance','users','roles','leads','customers','tasks','orders','dispatch','stock','marketing','operations','purchase','accounts','settings'];
const labels={dashboard:'Dashboard',crm:'Sales & CRM Overview',tasks:'Follow-ups',channels:'Sales Channels',attendance:'Attendance',users:'Users',roles:'Create & Manage Roles',leads:'Leads & CRM',customers:'Customers',sales:'Sales',marketing:'Marketing',orders:'Sales Orders',dispatch:'Dispatch',stock:'Stock & Products',operations:'Operations & Production',purchase:'Purchase Orders',accounts:'Accounts',settings:'Settings',reports:'Reports'};
const crmMap={crm:'dashboard',leads:'leads',customers:'customers',sales:'sales',tasks:'tasks',orders:'sales',dispatch:'dispatch',stock:'products'};
const crmAccess=()=>({
 dashboard:can('sales')&&can('customers')&&can('leads'),
 sales:can('sales')||can('orders'),
 customers:true,
 leads:can('leads'),
 tasks:can('leads')||can('marketing'),
 products:can('stock'),
 dispatch:can('dispatch')||can('orders')||can('stock'),
 channels:roleName()==='Admin',
 reports:roleName()==='Admin'
});
const canOpenPage=m=>['channels','reports','users','roles'].includes(m)?false:m==='settings'?roleName()==='Admin':m==='attendance'||can(m)||(m==='operations'&&(can('stock')||can('purchase')||can('dispatch')||can('accounts')))||
 (m==='crm'&&crmAccess().dashboard)||
 (m==='customers'&&crmAccess().customers)||
 (m==='orders'&&crmAccess().sales)||
 (m==='dispatch'&&crmAccess().dispatch)||
 (m==='tasks'&&crmAccess().tasks)||
 (m==='channels'&&crmAccess().channels);
const act=['view','create','edit','delete','approve','export'];const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});const today=()=>new Date().toLocaleDateString('en-CA');const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const show=(id)=>['setup','login','app'].forEach(k=>$('#'+k).hidden=k!==id);const toast=(x,type)=>window.GreenRichNotify?.(x,type);const can=(m,a='view')=>profile&&((roleName()==='Admin')||permissions.some(p=>p.role_id===profile.role_id&&p.module===m&&p.action===a&&p.allowed));const roleName=()=>roles.find(r=>r.id===profile?.role_id)?.name||'Employee';
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
  await window.GreenRichCompanies.configure({userId:user.id,companyIds:profile.company_ids,db});
  $('#userName').textContent=profile.full_name;$('#userRole').textContent=roleName();configureCompanySelector();
  document.title='GreenRich ONE · '+(company?.company_name||'CRM');
  if(window.GreenRichAttendance?.configure)window.GreenRichAttendance.configure({client:db,user,profile,roles,permissions});
  show('app');window.GreenRichFollowupAlarm?.start({db,userId:user.id,companyIds:window.GreenRichCompanies.allowed(),role:roleName()});window.GreenRichSidebar?.init({userId:user.id});navigation();window.GreenRichBranding?.configure(db);
  // Attendance status is useful but should never block dashboard navigation or first paint.
  void attendanceQuick().catch(e=>{console.warn('Attendance switch could not initialize',e)});
  await render();
 }catch(e){window.GreenRichFollowupAlarm?.stop();await db.auth.signOut();show('login');toast(e.message)}
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
 marketing:'<path d="M12 3C6.8 3 2.5 6.9 2.5 11.7c0 1.8.6 3.5 1.6 4.9L3 21l4.8-1.3c1.3.7 2.8 1 4.2 1 5.3 0 9.5-3.8 9.5-8.8S17.2 3 12 3Z"/><path d="M8 8.8c.5 3 3.1 5.6 6.2 6.4l1.8-1.4-2.2-1.2-1.2 1-2.3-2.1.8-1.3-1.5-2Z"/>',
 orders:'<path d="M4 7h16l-1 13H5L4 7ZM8 7a4 4 0 0 1 8 0"/>',
 stock:'<path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10"/>',
 operations:'<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7zM11 7h2M7 11v2M17 11v2"/>',
 purchase:'<path d="M3 4h2l2.2 11h11l2.1-8H6M10 20h.01M18 20h.01"/>',
 accounts:'<rect x="2" y="5" width="20" height="16" rx="2"/><path d="M2 10h20M16 15h3"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .8 1.4-2 2-.9-.9a8 8 0 0 1-2.3 1l-.3 1.5h-3l-.3-1.5a8 8 0 0 1-2.3-1l-.9.9-2-2 .8-1.4a8 8 0 0 1-.4-2.5L5 12l1.6-.5a8 8 0 0 1 .4-2.5L6.2 7.6l2-2 .9.9a8 8 0 0 1 2.3-1l.3-1.5h3l.3 1.5a8 8 0 0 1 2.3 1l.9-.9 2 2-.8 1.4a8 8 0 0 1 .4 2.5L21 12l-1.6.5a8 8 0 0 1 0 2.5Z"/>',
 reports:'<path d="M3 3v18h18M7 15l5-5 4 3 5-7"/>'
};
function configureCompanySelector(){
 const select=$('#headerCompanySelect'),manager=window.GreenRichCompanies;if(!select||!manager)return;
 const valid=manager.allowed(),selected=manager.selected(user?.id);
 select.replaceChildren();
 manager.list().filter(c=>valid.includes(c.id)).forEach(c=>{const option=document.createElement('option');option.value=c.id;option.textContent=c.name;select.append(option)});
 if(valid.length===2){const option=document.createElement('option');option.value='all';option.textContent='Both Companies';select.append(option)}
 select.value=selected;
 const label=$('#activeCompanyLabel');if(label)label.textContent=manager.name(user?.id);
 select.disabled=valid.length<=1;
 select.onchange=()=>{
  try{
   manager.choose(select.value,user.id);
   if(label)label.textContent=manager.name(user.id);
   document.title='GreenRich ONE · '+manager.name(user.id);
   if(crmMap[page]||page==='marketing')void render();
   // Attendance is a completed module: changing company never re-renders it.
  }catch(error){toast(error.message);select.value=manager.selected(user.id)}
 };
}
function navigation(){
 const visible=modules.filter(canOpenPage);
 $('#nav').innerHTML=visible.map(m=>'<button type="button" data-page="'+m+'" aria-label="'+esc(labels[m])+'" title="'+esc(labels[m])+'" aria-current="'+(page===m?'page':'false')+'" class="'+(page===m?'active':'')+'"><svg class="gr-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(menuIcons[m]||menuIcons.dashboard)+'</svg><span>'+labels[m]+'</span></button>').join('');
 $('#nav').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(page===b.dataset.page){window.GreenRichSidebar?.collapseMobile();return}page=b.dataset.page;window.GreenRichSidebar?.collapseMobile();navigation();void render()});
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
async function render(){
 if(!canOpenPage(page)){page='dashboard';navigation()}
 // The persistent #content element does not tell background dashboard
 // refreshes whether Dashboard is still open. Stop them on page changes.
 if(page!=='dashboard')window.GreenRichDashboardV2?.stop?.();
 $('#title').textContent=labels[page];const c=$('#content');
 if(crmMap[page]&&crmCache&&crmCache.company===window.GreenRichCompanies?.selected(user?.id)){
  c.replaceChildren(crmCache.host);window.GreenRichCRM.switchPage(crmMap[page]);return;
 }
 c.replaceChildren();
 try{
  if(page==='dashboard')await dashboard(c);
  else if(page==='attendance')await attendance(c);
  else if(page==='settings'){crmCache=null;await settings(c)}
  else if(page==='operations')await operations(c)
  else if(page==='accounts')await window.GreenRichAccounts.mount(c,{db,companyId:window.GreenRichCompanies.selected(user.id)})
   else if(page==='marketing'){
    if(!window.GreenRichWhatsAppMarketing)throw Error('WhatsApp Marketing module is not loaded. Refresh GreenRich ONE.');
    await window.GreenRichWhatsAppMarketing.mount(c,{db,companies:window.GreenRichCompanies.allowed(),
      selectedCompany:window.GreenRichCompanies.selected(user.id),userId:user.id,admin:roleName()==='Admin',
      permission:action=>can('marketing',action),
      crmPermissions:{customers:can('customers','view'),leads:can('leads','view')},notify:toast});
   }
  else if(crmMap[page])await crmWorkspace(c,crmMap[page]);
  else await placeholder(c)
 }catch(e){c.innerHTML='<div class="notice">'+esc(e.message)+'</div>'}
}
async function dashboard(c){
 if(!window.GreenRichExecutiveDashboard)throw Error('Dashboard not loaded. Refresh GreenRich ONE.');
 await window.GreenRichExecutiveDashboard.mount(c,{db,userId:user.id,
 companyIds:window.GreenRichCompanies.allowed(),selectedCompany:window.GreenRichCompanies.selected(user.id),notify:toast,admin:roleName()==='Admin',role:roleName(),canExport:roleName()==='Admin'||can('dashboard','export'),canModule:module=>can(module)});
}
async function attendance(c){
 if(!window.GreenRichAttendance)throw Error('Attendance module script has not loaded. Refresh GreenRich ONE.');
 await window.GreenRichAttendance.mount(c);
}
let crmCache=null,crmAssetsPromise=null;
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
 if(!adminTools){
  const host=document.createElement('div');
  crmCache={host,company:window.GreenRichCompanies?.selected(user?.id)||'grow-india'};
  container.append(host);container=host;
 }
 await window.GreenRichCRM.mount(container,view,allowed,window.GreenRichCompanies?.selected(user?.id)||'grow-india',window.GreenRichCompanies?.name(user?.id)||'GreenRich Grow India Pvt Ltd',adminTools===true,db,roleName()==='Admin',roleName()==='Admin'||can('sales','export')||can('orders','export'),window.GreenRichCompanies.allowed(),roleName()==='Admin'||can('sales','create')||can('sales','edit'),roleName()==='Admin'||can('sales','approve')||can('orders','approve'),roleName()==='Admin'||can('dispatch','edit')||can('stock','edit')||can('orders','edit'),{
 customer:Object.fromEntries(['view','create','edit','delete','export'].map(action=>[action,roleName()==='Admin'||can('customers',action)])),
 lead:Object.fromEntries(['view','create','edit','delete','export'].map(action=>[action,roleName()==='Admin'||can('leads',action)]))
},{userId:user.id,admin:roleName()==='Admin',scope:permissions.find(p=>p.role_id===profile.role_id&&p.module==='leads'&&p.action==='view')?.data_scope||'own'});
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
 const companies=window.GreenRichCompanies.list(),active=companies.filter(c=>c.active!==false);
 const fields=(ids,name)=>'<div class="gr-user-company-field" role="group" aria-label="Employee company access">'+active.map(company=>'<label><input type="checkbox" name="'+esc(name)+'" value="'+esc(company.id)+'" '+(ids.includes(company.id)?'checked':'')+'><span>'+esc(company.name)+'</span></label>').join('')+'</div>';
 c.innerHTML='<div class="panel"><div class="row"><h2>User Management</h2><div class="row"><button class="secondary" type="button" id="openRoleSettings">Manage User Roles</button><button class="blue" type="button" id="newEmployeeButton">+ Create New User</button></div></div>'+
  '<div id="newEmployeePanel" hidden><h3>Create Employee</h3><p>Choose each employee\'s company access separately from their role.</p><form id="employeeForm" class="fields"><label>Username<input name="username" required minlength="3" placeholder="Employee username"></label><label>Email for Login<input name="email" type="email" required></label><label>Password<input name="password" type="password" minlength="10" required></label><label>Assign Role<select name="role">'+roles.map(r=>'<option>'+esc(r.name)+'</option>').join('')+'</select></label><div class="gr-user-company-create"><strong>Company Access (required)</strong>'+fields(active.map(c=>c.id),'companyIds')+'</div><div style="align-self:end"><button class="blue" type="submit">Create Employee</button></div></form></div>'+
  '<p class="notice">Company assignments are set for each employee, independently of their user role. Users assigned to both companies can switch between either company or Both Companies. Customers remain a shared master.</p></div>'+
  '<div class="panel"><div class="row"><h2>Manage Users</h2><span class="pill">'+people.length+' profiles</span></div><div class="tablewrap"><table><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Company Access</th><th>Status</th><th>Admin Actions</th></tr></thead><tbody>'+
  people.map(p=>'<tr><td>'+esc(p.full_name)+'</td><td>'+esc(p.username)+'</td><td>'+esc(p.email)+'</td><td>'+esc(roles.find(x=>x.id===p.role_id)?.name)+'</td><td>'+fields(Array.isArray(p.company_ids)?p.company_ids:active.map(c=>c.id),'companyAccess')+
  '<button class="secondary gr-save-companies" type="button" data-emp-companies="'+esc(p.id)+'" '+(p.id===user.id?'disabled title="Your own assignment cannot be changed"':'')+'>Save Access</button></td><td>'+esc(p.active?'Active':'Disabled')+'</td>'+
  '<td class="gr-user-actions"><button class="secondary" data-emp-edit="'+esc(p.id)+'">Edit / Role</button><button class="secondary" data-emp-reset="'+esc(p.id)+'">Reset Password</button><button class="secondary" data-emp-toggle="'+esc(p.id)+'" '+(p.id===user.id?'disabled':'')+'>'+(p.active?'Deactivate':'Reactivate')+'</button><button class="gr-delete-user" data-emp-delete="'+esc(p.id)+'" '+(p.id===user.id?'disabled title="You cannot delete your own account"':'')+'>Delete User</button></td></tr>').join('')+
  '</tbody></table></div></div>';
 const roleButton=c.querySelector('#openRoleSettings');if(roleButton)roleButton.onclick=()=>c.closest('#gr-company-admin')?.querySelector('[data-settings-tab="roles"]')?.click();
 const refresh=async()=>{people=await query('gr_profiles');permissions=await query('gr_role_permissions');await users(c)};
 const panel=c.querySelector('#newEmployeePanel');c.querySelector('#newEmployeeButton').onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)panel.querySelector('input').focus()};
 c.querySelector('#employeeForm').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,f=new FormData(form),companyIds=f.getAll('companyIds'),button=form.querySelector('button[type="submit"]');
  if(!companyIds.length)return toast('Select at least one company for the employee');
  button.disabled=true;
  try{const result=await employeeAction({action:'create',password:f.get('password'),name:f.get('username'),username:f.get('username'),email:f.get('email'),role:f.get('role'),companyIds});toast(result.message||'Employee created');await refresh()}
  catch(error){toast(error.message)}finally{button.disabled=false}
 };
 c.querySelectorAll('[data-emp-companies]').forEach(button=>button.onclick=async()=>{
  const p=people.find(x=>x.id===button.dataset.empCompanies);if(!p||p.id===user.id)return;
  const row=button.closest('tr'),companyIds=[...row.querySelectorAll('input[name="companyAccess"]:checked')].map(x=>x.value);
  if(!companyIds.length)return toast('Select at least one company');
  if(!confirm('Update company access for '+p.full_name+'?'))return;
  button.disabled=true;
  try{const out=await employeeAction({action:'edit',userId:p.id,companyIds});toast(out.message||'Company access updated');await refresh()}
  catch(e){toast('Unable to change company access: '+e.message)}finally{button.disabled=false}
 });
 c.querySelectorAll('[data-emp-edit]').forEach(button=>button.onclick=async()=>{
  const p=people.find(x=>x.id===button.dataset.empEdit);if(!p)return;
  const name=prompt('Employee name',p.full_name);if(name===null)return;
  const username=prompt('Username',p.username);if(username===null)return;
  const selected=prompt('Role: '+roles.map(x=>x.name).join(', '),roles.find(x=>x.id===p.role_id)?.name||'Sales');if(selected===null)return;
  const role=roles.find(r=>r.name.toLowerCase()===selected.trim().toLowerCase());if(!role)return toast('Role not found');
  try{const out=await employeeAction({action:'edit',userId:p.id,name,username,role:role.name});toast(out.message||'User updated');await refresh()}
  catch(e){toast(e.message)}
 });
 c.querySelectorAll('[data-emp-reset]').forEach(button=>button.onclick=async()=>{
  const p=people.find(x=>x.id===button.dataset.empReset);if(!p)return;
  if(!confirm('Send a password reset email to '+p.email+'?'))return;
  try{const out=await employeeAction({action:'reset',userId:p.id});toast(out.message)}catch(e){toast(e.message)}
 });
 c.querySelectorAll('[data-emp-toggle]').forEach(button=>button.onclick=async()=>{
  const p=people.find(x=>x.id===button.dataset.empToggle);if(!p||p.id===user.id)return;
  const action=p.active?'disable':'enable';
  if(!confirm((p.active?'Deactivate':'Reactivate')+' '+p.username+'?'))return;
  try{const out=await employeeAction({action,userId:p.id});toast(out.message);await refresh()}catch(e){toast(e.message)}
 });
 c.querySelectorAll('[data-emp-delete]').forEach(button=>button.onclick=async()=>{
  const p=people.find(x=>x.id===button.dataset.empDelete);if(!p||p.id===user.id)return;
  const answer=prompt('Permanently delete '+p.full_name+'? This is irreversible. Employee records with attendance or audit history are protected. Type the exact username to confirm:',p.username);
  if(answer!==p.username)return toast('Deletion cancelled: username confirmation did not match');
  if(!confirm('Final confirmation: permanently delete '+p.username+'?'))return;
  button.disabled=true;
  try{const out=await employeeAction({action:'delete',userId:p.id});toast(out.message||'Employee deleted');await refresh()}
  catch(e){toast('Delete blocked: '+e.message)}finally{button.disabled=false}
 });
}
async function permissionPage(c){
 if(roleName()!=='Admin')throw Error('Admin only');
 c.innerHTML='<div class="panel"><div class="row"><h2>Manage User Roles</h2><button class="blue" id="addRole">+ Add New Role</button></div><p>Create custom roles, edit their capabilities, and remove unused custom roles. Built-in roles cannot be deleted.</p><div class="row"><label>Choose role <select id="roleSelect">'+roles.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>').join('')+'</select></label><button class="secondary" id="deleteRole">Delete Selected Role</button></div><div id="roleFeedback" class="notice" hidden></div></div><div class="panel"><h2>Capabilities & Record Access</h2><p>Each action has its own access scope: Own, Team or All. For Leads & CRM: Own shows assigned leads, Team includes employees reporting to you, and All shows every lead in the assigned company. Give Sales staff View/Create/Edit as needed. Only managers with Team/All Edit access can reassign leads. Every stage movement records a required conversation note. Other unconnected ERP modules may not enforce these scopes yet.</p><div class="tablewrap"><table><thead><tr><th>Module</th>'+act.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody id="permBody"></tbody></table></div></div>';
 const select=$('#roleSelect'),feedback=$('#roleFeedback');
 const note=msg=>{feedback.hidden=false;feedback.textContent=msg;toast(msg)};
 const builtin=new Set(['Admin','Director','Sales','Telecaller','Marketing','Operation','Accounts','Developer']);
 function draw(){
  const selected=select.value,role=roles.find(x=>x.id===selected);$('#deleteRole').disabled=!role||builtin.has(role.name)||people.some(p=>p.role_id===selected);
  $('#permBody').innerHTML=modules.filter(m=>m!=='operations').map(m=>'<tr><td>'+esc(labels[m])+'</td>'+act.map(action=>{
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
   openTags:host=>window.GreenRichCustomerTags.mount(host,{db,notify:toast}),
  openInvoiceSettings:host=>window.GreenRichInvoices.settings(host,{db,notify:toast}),
  openCRM:(host,view,adminTools)=>crmWorkspace(host,view,adminTools),
   openDashboardAccess:host=>window.GreenRichExecutiveDashboard.preferences(host,{db,people,notify:toast}),
   openBranding:host=>window.GreenRichBranding.mount(host,{client:db,notify:toast}),
   openSources:host=>window.GreenRichSources.mount(host,{db,notify:toast}),
   openSheetIntegrations:host=>window.GreenRichSheetManager.mount(host,{db,companyIds:window.GreenRichCompanies.allowed(),notify:toast}),
  onCompanyChange:(id,name)=>{
   document.title='GreenRich ONE · '+name;
   configureCompanySelector();
  }
 });
}
async function operations(c){
 if(!window.GreenRichOperations)throw Error('Operations module is missing. Refresh GreenRich ONE.');
 await window.GreenRichOperations.mount(c,{client:db,companies:window.GreenRichCompanies.allowed(),selection:window.GreenRichCompanies.selected(user.id),role:roleName(),can});
}
async function placeholder(c){c.innerHTML='<div class="panel"><h2>'+labels[page]+'</h2><div class="notice">This ERP module is not yet connected to a secured server-side database. Sales & CRM features are available in this same workspace. Connected CRM records are shared across authorized browsers and devices.</div><p>Other connected CRM features are available from the GreenRich ONE sidebar.</p></div>'}
$('#setupForm').onsubmit=e=>{e.preventDefault();localStorage.setItem('gr-supabase-url',$('#url').value.trim());localStorage.setItem('gr-supabase-key',$('#key').value.trim());start()};$('#loginForm').onsubmit=async e=>{e.preventDefault();let r=await db.auth.signInWithPassword({email:$('#email').value,password:$('#password').value});if(r.error)toast(r.error.message);else await enter()};$('#reset').onclick=async()=>{let email=$('#email').value;if(!email)return toast('Enter your email first');let r=await db.auth.resetPasswordForEmail(email);toast(r.error?.message||'If the account exists, check your email')};$('#reconnect').onclick=()=>{window.GreenRichDashboardV2?.stop?.();localStorage.removeItem('gr-supabase-url');localStorage.removeItem('gr-supabase-key');show('setup')};$('#logout').onclick=async()=>{window.GreenRichDashboardV2?.stop?.();window.GreenRichFollowupAlarm?.stop();await db.auth.signOut();show('login')};document.addEventListener('click',e=>{const link=e.target.closest('a[href="roles.html"]');if(link){e.preventDefault();page='settings';settingsInitialTab='roles';navigation();void render()}});
window.GreenRichShell={
 setPageWithoutRemount:target=>{
  if(!crmMap[target]||!canOpenPage(target))return;
  page=target;navigation();$('#title').textContent=labels[target];
 }
};
$('#hamburger').onclick=()=>window.GreenRichSidebar?.toggle();start().catch(e=>{show('setup');toast(e.message)});
})();