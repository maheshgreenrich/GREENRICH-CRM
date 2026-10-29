'use strict';
(() => {
 const $=sel=>document.querySelector(sel);
 const modules=[
  ['dashboard','Dashboard'],['users','User Management'],['roles','Roles & Permissions'],
  ['settings','Company Settings'],['attendance','Attendance'],['leads','Leads'],
  ['customers','Customers'],['sales','Sales'],['marketing','Marketing'],
  ['orders','Sales Orders'],['stock','Stock & Products'],['purchase','Purchase Orders'],
  ['accounts','Accounts'],['reports','Reports']
 ];
 const actions=['view','create','edit','delete','approve','export'];
 const scopes=['own','team','all'];
 const builtin=new Set(['Admin','Director','Sales','Telecaller','Marketing','Operation','Accounts','Developer']);
 const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let db=null,account=null,roles=[],perms=[],employeeRoles=[],selected=null,draft=new Map(),dirty=false,busy=false;
 const key=(m,a)=>m+':'+a;
 const status=message=>{$('#roleStatus').innerHTML='<div class="role-status-inner">'+html(message)+'<p><a href="secure.html">Open GreenRich ONE secure login</a></p></div>'};
 const notice=(message,error=false)=>{const box=$('#feedback');box.textContent=message;box.hidden=false;box.classList.toggle('error',error);box.scrollIntoView({block:'nearest',behavior:'smooth'})};
 const clearNotice=()=>{$('#feedback').hidden=true};
 async function call(table,method,args){const r=await method(db.from(table),args);if(r.error)throw Error(r.error.message);return r.data}
 async function load(){
  const url=localStorage.getItem('gr-supabase-url');
  const publicKey=localStorage.getItem('gr-supabase-key');
  if(!url||!publicKey){status('Connect your Supabase project through GreenRich ONE secure login first.');return}
  if(!window.supabase){status('Supabase authentication library could not load. Refresh this page.');return}
  db=window.supabase.createClient(url,publicKey);
  const auth=await db.auth.getUser();
  if(auth.error||!auth.data.user){status('You must sign in to GreenRich ONE before managing roles.');return}
  account=auth.data.user;
  const p=await db.from('gr_profiles').select('id,full_name,role_id,active').eq('id',account.id).single();
  if(p.error||!p.data?.active){status('No active employee account for this login.');return}
  const assignedRole=await db.from('gr_roles').select('name').eq('id',p.data.role_id).single();
  if(assignedRole.error||assignedRole.data?.name!=='Admin'){status('This page is available to GreenRich ONE Administrators only.');return}
  $('#currentAdmin').textContent=p.data.full_name;
  await reload();
  $('#roleStatus').hidden=true;
  $('#roleApp').hidden=false;
 }
 async function reload(){
  const [rs,ps,es]=await Promise.all([
   db.from('gr_roles').select('id,name,description').order('name'),
   db.from('gr_role_permissions').select('role_id,module,action,allowed,data_scope'),
   db.from('gr_profiles').select('id,role_id')
  ]);
  if(rs.error)throw Error(rs.error.message);
  if(ps.error)throw Error(ps.error.message);
  if(es.error)throw Error(es.error.message);
  roles=rs.data||[];perms=ps.data||[];employeeRoles=es.data||[];
  listRoles();
 }
 function listRoles(){
  $('#roleCount').textContent=roles.length+' roles';
  $('#rolesList').innerHTML=roles.map(r=>{
   const count=employeeRoles.filter(p=>p.role_id===r.id).length;
   return '<button type="button" data-role="'+html(r.id)+'" class="role-choice '+(selected===r.id?'selected':'')+'"><strong>'+html(r.name)+'</strong><span>'+count+' employee'+(count===1?'':'s')+(builtin.has(r.name)?' · Built-in':' · Custom')+'</span></button>'
  }).join('');
  $('#rolesList').querySelectorAll('button').forEach(el=>el.onclick=()=>{
   if(dirty&&!confirm('Discard unsaved capability changes?'))return;
   selectRole(el.dataset.role);
  });
 }
 function getPermission(module,action){
  return perms.find(p=>p.role_id===selected&&p.module===module&&p.action===action);
 }
 function selectRole(id){
  selected=id;dirty=false;clearNotice();
  const role=roles.find(r=>r.id===id);
  if(!role)return;
  draft=new Map();
  modules.forEach(([m])=>actions.forEach(a=>{
   const p=getPermission(m,a);
   draft.set(key(m,a),{allowed:p?.allowed||false,data_scope:scopes.includes(p?.data_scope)?p.data_scope:'own'});
  }));
  $('#selectedRoleTitle').textContent=role.name+' — Capabilities';
  const assigned=employeeRoles.filter(p=>p.role_id===role.id).length;
  $('#roleSubtext').textContent=assigned+' employee'+(assigned===1?'':'s')+' assigned';
  $('#roleEditor').hidden=false;
  const protectedRole=builtin.has(role.name);
  $('#deleteRoleButton').hidden=protectedRole;
  $('#deleteRoleButton').disabled=assigned>0;
  $('#deleteRoleButton').title=assigned>0?'Reassign employees before deleting this role':'Delete custom role';
  $('#editRoleForm').hidden=protectedRole;
  $('#editRoleName').value=role.name;
  $('#editRoleDescription').value=role.description||'';
  $('#savePermissions').disabled=role.name==='Admin';
  $('#saveState').textContent=role.name==='Admin'?'Admin permissions are protected.':'Make changes and click Save All Permissions.';
  listRoles();renderMatrix();
 }
 function renderMatrix(){
  const role=roles.find(r=>r.id===selected),locked=role?.name==='Admin';
  $('#permissionRows').innerHTML=modules.map(([m,label])=>
   '<tr><th scope="row">'+html(label)+'<div class="role-row-actions"><button type="button" data-enable="'+m+'" '+(locked?'disabled':'')+'>Enable all</button><button type="button" data-clear="'+m+'" '+(locked?'disabled':'')+'>Clear</button></div></th>'+
   actions.map(action=>{
    const p=draft.get(key(m,action))||{allowed:false,data_scope:'own'};
    return '<td><div class="role-cap"><label class="role-check"><input type="checkbox" data-module="'+m+'" data-action="'+action+'" '+(p.allowed?'checked':'')+' '+(locked?'disabled':'')+'> Allow</label><select aria-label="'+html(label)+' '+action+' data scope" data-module="'+m+'" data-action="'+action+'" '+(locked?'disabled':'')+'>'+
      scopes.map(scope=>'<option value="'+scope+'" '+(scope===p.data_scope?'selected':'')+'>'+scope[0].toUpperCase()+scope.slice(1)+'</option>').join('')+'</select></div></td>';
   }).join('')+'</tr>'
  ).join('');
  $('#permissionRows').querySelectorAll('input,select').forEach(control=>{
   control.onchange=()=>{
    const p=draft.get(key(control.dataset.module,control.dataset.action));
    if(control.tagName==='SELECT')p.data_scope=control.value;
    else p.allowed=control.checked;
    dirty=true;$('#saveState').textContent='Unsaved changes — click Save All Permissions.';
   }
  });
  $('#permissionRows').querySelectorAll('[data-enable],[data-clear]').forEach(button=>{
   button.onclick=()=>{
    const module=button.dataset.enable||button.dataset.clear;
    actions.forEach(action=>draft.get(key(module,action)).allowed=!!button.dataset.enable);
    dirty=true;$('#saveState').textContent='Unsaved changes — click Save All Permissions.';
    renderMatrix();
   }
  });
 }
 function setBusy(value){busy=value;['#createButton','#savePermissions','#deleteRoleButton','#editRoleSave'].forEach(s=>{const el=$(s);if(el)el.disabled=value||(s==='#savePermissions'&&roles.find(r=>r.id===selected)?.name==='Admin')||(s==='#deleteRoleButton'&&employeeRoles.some(p=>p.role_id===selected))})}
 async function createRole(event){
  event.preventDefault();if(busy)return;
  const name=$('#newRoleName').value.trim(),description=$('#newRoleDescription').value.trim();
  if(name.length<2||name.length>50)return notice('Role name must contain 2 to 50 characters.',true);
  if(roles.some(r=>r.name.toLowerCase()===name.toLowerCase()))return notice('A role with that name already exists.',true);
  setBusy(true);
  try{
   const r=await db.from('gr_roles').insert({name,description}).select('id,name,description').single();
   if(r.error)throw Error(r.error.message);
   const records=modules.flatMap(([module])=>actions.map(action=>({role_id:r.data.id,module,action,allowed:false,data_scope:'own'})));
   const saved=await db.from('gr_role_permissions').upsert(records,{onConflict:'role_id,module,action'});
   if(saved.error){await reload();selectRole(r.data.id);notice('Role created, but default permission setup failed: '+saved.error.message,true);return}
   await reload();selectRole(r.data.id);$('#createForm').reset();$('#createSection').hidden=true;
   notice('Role '+name+' created. All permissions are initially OFF. Select capabilities and Save All Permissions.');
  }catch(err){notice('Could not create role: '+err.message,true)}finally{setBusy(false)}
 }
 async function savePermissions(){
  if(busy||!selected)return;
  if(roles.find(r=>r.id===selected)?.name==='Admin')return notice('Admin permissions are protected.',true);
  setBusy(true);
  const roleId=selected;
  const rows=modules.flatMap(([module])=>actions.map(action=>({role_id:roleId,module,action,...draft.get(key(module,action))})));
  try{
   const result=await db.from('gr_role_permissions').upsert(rows,{onConflict:'role_id,module,action'}).select('role_id,module,action,allowed,data_scope');
   if(result.error)throw Error(result.error.message);
   if(result.data?.length!==rows.length)throw Error('Only '+(result.data?.length||0)+' of '+rows.length+' settings returned; refresh and check before using this role.');
   perms=perms.filter(p=>p.role_id!==roleId).concat(result.data);
   dirty=false;$('#saveState').textContent='All '+rows.length+' capability settings saved to Supabase.';
   notice('Permissions saved for '+roles.find(r=>r.id===roleId)?.name+'. Employees may need to refresh their session to see UI changes.');
  }catch(err){notice('Could not save permissions: '+err.message,true)}finally{setBusy(false)}
 }
 async function editRole(event){
  event.preventDefault();if(busy||!selected)return;
  const role=roles.find(r=>r.id===selected);
  if(!role||builtin.has(role.name))return notice('Built-in role names cannot be changed.',true);
  const name=$('#editRoleName').value.trim(),description=$('#editRoleDescription').value.trim();
  if(name.length<2||name.length>50)return notice('Role name must contain 2 to 50 characters.',true);
  if(roles.some(r=>r.id!==selected&&r.name.toLowerCase()===name.toLowerCase()))return notice('Role name already in use.',true);
  setBusy(true);
  try{
   const result=await db.from('gr_roles').update({name,description}).eq('id',selected).select('id,name,description').single();
   if(result.error)throw Error(result.error.message);
   roles=roles.map(r=>r.id===selected?result.data:r);selectRole(selected);notice('Role details saved.');
  }catch(err){notice('Could not update role: '+err.message,true)}finally{setBusy(false)}
 }
 async function deleteRole(){
  if(busy||!selected)return;
  const role=roles.find(r=>r.id===selected);
  if(!role||builtin.has(role.name))return notice('Built-in roles cannot be deleted.',true);
  if(employeeRoles.some(p=>p.role_id===selected))return notice('Reassign employees before deleting this role.',true);
  if(!confirm('Permanently delete '+role.name+' and all of its permissions?'))return;
  setBusy(true);
  try{
   const session=(await db.auth.getSession()).data.session;
   if(!session)throw Error('Sign in again to continue');
   const result=await db.functions.invoke('greenrich-admin-users',{body:{action:'deleteRole',roleId:role.id},headers:{Authorization:'Bearer '+session.access_token}});
   if(result.error){
    let detail=result.error.message;
    try{detail=(await result.error.context?.clone().json())?.error||detail}catch(_){}
    throw Error(detail);
   }
   if(result.data?.error)throw Error(result.data.error);
   selected=null;dirty=false;
   await reload();
   $('#roleEditor').hidden=true;$('#selectedRoleTitle').textContent='Select a role';
   $('#roleSubtext').textContent='';
   notice('Role deleted. The other roles are unchanged.');
  }catch(err){notice('Could not delete role: '+err.message+'. Ensure the current greenrich-admin-users Edge Function is deployed.',true)}
  finally{setBusy(false)}
 }
 $('#showCreate').onclick=()=>{$('#createSection').hidden=false;$('#newRoleName').focus()};
 $('#cancelCreate').onclick=()=>{$('#createSection').hidden=true};
 $('#createForm').onsubmit=createRole;
 $('#editRoleForm').onsubmit=editRole;
 $('#savePermissions').onclick=savePermissions;
 $('#deleteRoleButton').onclick=deleteRole;
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue=''}});
 load().catch(err=>status('Unable to load roles: '+err.message));
})();