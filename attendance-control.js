'use strict';
(()=>{
 const $=q=>document.querySelector(q);
 const clean=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nowIST=()=>{let parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>parts.find(p=>p.type===t)?.value;return get('year')+'-'+get('month')+'-'+get('day')};
 let client,user,profile,role,access=[],staff=[],rows=[];
 const show=(message,error=false)=>{const n=$('#notice');n.hidden=false;n.textContent=message;n.style.borderColor=error?'#e99':'#b7d8bb';n.style.color=error?'#a22':'#205a37'};
 const permission=action=>access.find(p=>p.module==='attendance'&&p.action===action&&p.allowed);
 const can=(action,id)=>{
  if(role==='Admin')return true;
  const p=permission(action);if(!p)return false;
  if(id===user.id)return true;
  if(p.data_scope==='all')return true;
  return p.data_scope==='team'&&staff.some(e=>e.id===id&&e.manager_id===user.id);
 };
 const fullname=id=>staff.find(p=>p.id===id)?.full_name||'Employee ('+String(id).slice(0,8)+')';
 async function init(){
  const url=localStorage.getItem('gr-supabase-url'),key=localStorage.getItem('gr-supabase-key');
  if(!url||!key)throw Error('Connect the Supabase project on the secure login page first.');
  if(!window.supabase)throw Error('Supabase login library unavailable.');
  client=window.supabase.createClient(url,key);
  const identity=await client.auth.getUser();
  if(identity.error||!identity.data.user)throw Error('Sign in to GreenRich ONE secure login first.');
  user=identity.data.user;
  const prof=await client.from('gr_profiles').select('id,full_name,role_id,active').eq('id',user.id).single();
  if(prof.error||!prof.data?.active)throw Error('No active employee profile.');
  profile=prof.data;
  const roleResponse=await client.from('gr_roles').select('name').eq('id',profile.role_id).single();
  if(roleResponse.error)throw Error(roleResponse.error.message);
  role=roleResponse.data.name;
  const rights=await client.from('gr_role_permissions').select('module,action,allowed,data_scope').eq('role_id',profile.role_id);
  if(rights.error)throw Error(rights.error.message);
  access=rights.data||[];
  if(role!=='Admin'&&!['view','create','edit','delete','export'].some(a=>permission(a)))throw Error('Your role does not have attendance access. Contact Admin.');
  $('#who').textContent=profile.full_name;$('#roleLabel').textContent=role;$('#myRole').textContent=role;
  $('#day').value=nowIST();$('#day').max=nowIST();$('#month').value=nowIST().slice(0,7);
  $('#workspace').hidden=false;$('#loading').hidden=true;
  $('#markForm').onsubmit=save;
  $('#month').onchange=draw;
  $('#employee').onchange=()=>{const id=$('#employee').value;const exists=rows.find(r=>r.user_id===id&&r.attendance_date===$('#day').value);$('#save').disabled=!can(exists?'edit':'create',id)};
  $('#day').onchange=()=>$('#employee').onchange();
  $('#export').onclick=exportCSV;
  await refresh();
 }
 async function refresh(){
  const eligible=await client.rpc('gr_attendance_people');
  if(eligible.error)throw Error('One-time attendance permission upgrade is needed in Supabase: '+eligible.error.message);
  staff=eligible.data||[];
  const r=await client.from('gr_attendance').select('id,user_id,attendance_date,status,marked_at,remark,deleted_at').order('attendance_date',{ascending:false}).limit(2000);
  if(r.error)throw Error(r.error.message);
  rows=(r.data||[]).filter(x=>!x.deleted_at);
  const writable=staff.filter(p=>can('create',p.id)||can('edit',p.id));
  const chosen=$('#employee').value;
  $('#employee').innerHTML=writable.map(p=>'<option value="'+clean(p.id)+'">'+clean(p.full_name)+'</option>').join('');
  if(writable.some(p=>p.id===chosen))$('#employee').value=chosen;
  $('#markForm').querySelectorAll('input,select,button').forEach(control=>control.disabled=!writable.length);
  $('#peopleCount').textContent=writable.length+' eligible employees';
  $('#scopeNotice').textContent=writable.length?'You can mark authorized employees, including yourself if Own/Team/All access allows it.':'No create/edit attendance access. You can still view permitted records.';
  $('#myStatus').textContent=rows.find(r=>r.user_id===user.id&&r.attendance_date===nowIST())?.status?.replace('_',' ')||'No attendance entry visible for today.';
  $('#employee').onchange();draw();
 }
 function draw(){
  const month=$('#month').value,selected=rows.filter(r=>r.attendance_date.startsWith(month));
  const counts=['present','absent','half_day'];
  $('#stats').innerHTML=counts.map(s=>'<div class="card"><small>'+s.replace('_',' ').toUpperCase()+'</small><strong>'+selected.filter(x=>x.status===s).length+'</strong></div>').join('');
  $('#records').innerHTML=selected.map(r=>{
   const isWritable=can('edit',r.user_id),isDeletable=can('delete',r.user_id);
   return '<tr><td>'+clean(r.attendance_date)+'</td><td>'+clean(fullname(r.user_id))+'</td><td>'+clean(r.status.replace('_',' '))+'</td><td>'+clean((r.marked_at||'').slice(0,10))+'</td><td>'+(isWritable?'<button class="secondary" data-edit="'+clean(r.id)+'">Edit</button> ':'')+(isDeletable?'<button class="secondary" data-delete="'+clean(r.id)+'">Delete</button>':'')+(!isWritable&&!isDeletable?'View only':'')+'</td></tr>';
  }).join('')||'<tr><td colspan="5">No records for this month in your allowed scope.</td></tr>';
  $('#records').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
   const r=rows.find(x=>x.id===b.dataset.edit);if(!r)return;
   $('#employee').value=r.user_id;$('#day').value=r.attendance_date;$('#attendanceStatus').value=r.status;$('#remark').value=r.remark||'';
   $('#employee').onchange();$('#markForm').scrollIntoView({behavior:'smooth',block:'center'});
  });
  $('#records').querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{
   const record=rows.find(x=>x.id===b.dataset.delete);if(!record||!can('delete',record.user_id))return;
   if(!confirm('Delete '+fullname(record.user_id)+' attendance for '+record.attendance_date+'?'))return;
   const resp=await client.rpc('gr_attendance_remove',{p_user:record.user_id,p_date:record.attendance_date});
   if(resp.error)return show(resp.error.message,true);
   show('Attendance deleted. The database saved an audit entry.');await refresh();
  });
  $('#export').disabled=role!=='Admin'&&!permission('export');
 }
 async function save(event){
  event.preventDefault();
  const target=$('#employee').value,date=$('#day').value,status=$('#attendanceStatus').value;
  const exists=rows.find(r=>r.user_id===target&&r.attendance_date===date);
  if(!can(exists?'edit':'create',target))return show('Your role cannot change this employee\'s attendance.',true);
  $('#save').disabled=true;
  const r=await client.rpc('gr_attendance_save',{p_user:target,p_date:date,p_status:status,p_remark:$('#remark').value.trim()});
  if(r.error){show(r.error.message,true);$('#save').disabled=false;return}
  show('Attendance saved for '+fullname(target)+' on '+date+'.');await refresh();
 }
 function exportCSV(){
  if(role!=='Admin'&&!permission('export'))return show('Export permission is disabled.',true);
  const filtered=rows.filter(r=>r.attendance_date.startsWith($('#month').value)&&can('export',r.user_id));
  const quote=s=>{let x=String(s??'');if(/^[=+@\-\t\r]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"'};
  const csv=[['Date','Employee','Status','Marked At','Remark'],...filtered.map(r=>[r.attendance_date,fullname(r.user_id),r.status,r.marked_at,r.remark])].map(row=>row.map(quote).join(',')).join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='greenrich-attendance-'+$('#month').value+'.csv';a.click();URL.revokeObjectURL(url);
  show('Exported '+filtered.length+' attendance records.');
 }
 init().catch(e=>{$('#status').textContent=e.message});
})();