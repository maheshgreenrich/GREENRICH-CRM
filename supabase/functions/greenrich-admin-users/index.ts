// Deploy via Supabase CLI: supabase functions deploy greenrich-admin-users
// Requires SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY as Supabase function secrets.
// Never place the service role key in GitHub Pages or in browser code.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'https://maheshgreenrich.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return response({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!secret)return response({error:'Server configuration incomplete'},503);
  const bearer=req.headers.get('Authorization')||'';
  if(!bearer.startsWith('Bearer '))return response({error:'Sign in required'},401);
  const auth=createClient(url,anon,{global:{headers:{Authorization:bearer}}});
  const {data:{user},error:authError}=await auth.auth.getUser();
  if(authError||!user)return response({error:'Session invalid'},401);
  const admin=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:profile,error:pe}=await admin.from('gr_profiles').select('active,gr_roles(name)').eq('id',user.id).single();
  if(pe||!profile?.active)return response({error:'Active employee profile required'},403);
  const superAdmin=profile.gr_roles?.name==='Admin';
  const {data:actor}=await admin.from('gr_profiles').select('role_id').eq('id',user.id).single();
  const {data:actorRights}=await admin.from('gr_role_permissions').select('action,allowed,data_scope').eq('role_id',actor?.role_id||'00000000-0000-0000-0000-000000000000').eq('module','users');
  const userScope=(action)=>superAdmin?'all':actorRights?.find(p=>p.action===action&&p.allowed)?.data_scope;
  const allowedUser=(action,target)=>{const scope=userScope(action);return !!scope&&(scope==='all'||(scope==='team'&&target?.manager_id===user.id)||target?.id===user.id)};
  const elevatedRole=async(roleId)=>{
   const r=await admin.from('gr_roles').select('name').eq('id',roleId).single();
   if(!r.data||['Admin','Director','Developer'].includes(r.data.name))return true;
   const p=await admin.from('gr_role_permissions').select('module').eq('role_id',roleId).eq('allowed',true).in('module',['users','roles','settings']);
   return !!p.error||!!p.data?.length;
  };
  const body=await req.json(),action=body.action;
  const companyIds=(ids:unknown)=>{
   if(!Array.isArray(ids)||ids.length<1||ids.length>2)return null;
   const allowed=['grow-india','enviro-solutions'];
   const items=ids.map(x=>String(x));
   return items.every(x=>allowed.includes(x))&&new Set(items).size===items.length?items:null;
  };
  if(['create','edit','delete'].includes(action)&&!superAdmin)return response({error:'Only an Admin can manage employee accounts'},403);
  if(action==='deleteRole'){
   if(!superAdmin)return response({error:'Only the built-in Admin can delete roles'},403);
   const roleId=String(body.roleId||'');
   if(!/^[0-9a-f-]{36}$/i.test(roleId))return response({error:'Invalid role ID'},400);
   const roleResult=await admin.from('gr_roles').select('id,name').eq('id',roleId).maybeSingle();
   if(roleResult.error||!roleResult.data)return response({error:'Role not found'},404);
   const builtIn=['Admin','Director','Sales','Telecaller','Marketing','Operation','Accounts','Developer'];
   if(builtIn.includes(roleResult.data.name))return response({error:'Built-in roles cannot be deleted'},403);
   const assigned=await admin.from('gr_profiles').select('id',{count:'exact',head:true}).eq('role_id',roleId);
   if(assigned.error)return response({error:assigned.error.message},500);
   if(assigned.count>0)return response({error:'Move employees out of this role first'},409);
   const removed=await admin.from('gr_roles').delete().eq('id',roleId);
   if(removed.error)return response({error:removed.error.message},400);
   await admin.from('gr_audit_log').insert({actor_id:user.id,entity:'gr_roles',entity_id:roleId,operation:'DELETE',old_value:{name:roleResult.data.name}});
   return response({message:'Custom role deleted'});
  }
  if(action==='create'){
   if(!superAdmin&&!['all','team'].includes(userScope('create')))return response({error:'Users > Create permission with Team or All scope is required'},403);
   const email=String(body.email||'').trim().toLowerCase(),username=String(body.username||'').trim(),name=String(body.name||'').trim(),role=String(body.role||''),password=String(body.password||'');
   if(!/^\S+@\S+\.\S+$/.test(email)||username.length<3||name.length<2||password.length<10)return response({error:'Enter valid name, username, email and a password of at least 10 characters'},400);
   const {data:roleRecord}=await admin.from('gr_roles').select('id').eq('name',role).maybeSingle();
   if(!roleRecord)return response({error:'Invalid role'},400);
   if(!superAdmin&&await elevatedRole(roleRecord.id))return response({error:'This role requires built-in Admin approval'},403);
   const companies=companyIds(body.companyIds);
   if(!companies)return response({error:'Select one or both companies for this employee'},400);
   const {data:exists}=await admin.from('gr_profiles').select('id').eq('username',username).maybeSingle();
   if(exists)return response({error:'Username already exists'},409);
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
   if(created.error)return response({error:created.error.message},400);
   const id=created.data.user.id;
   const inserted=await admin.from('gr_profiles').insert({id,username,full_name:name,email,role_id:roleRecord.id,company_ids:companies,active:true,manager_id:superAdmin?null:user.id});
   if(inserted.error){await admin.auth.admin.deleteUser(id);return response({error:'Employee profile could not be created: '+inserted.error.message},409);}
   await admin.from('gr_audit_log').insert({actor_id:user.id,entity:'gr_profiles',entity_id:id,operation:'CREATE',new_value:{username,email,role,company_ids:companies}});
   return response({message:'Employee created. They can sign in using their email and password.'});
  }
  const id=String(body.userId||'');
  if(!/^[0-9a-f-]{36}$/i.test(id))return response({error:'Invalid employee identifier'},400);
  if(id===user.id&&action!=='reset')return response({error:'Cannot change your own Admin account here'},400);
  const {data:target,error:te}=await admin.from('gr_profiles').select('id,username,active').eq('id',id).maybeSingle();
  if(te||!target)return response({error:'Employee not found'},404);
  if(action==='edit'){
   const fields={};if(body.name!==undefined){fields.full_name=String(body.name).trim();if(!fields.full_name)return response({error:'Name required'},400)}
   if(body.username!==undefined){fields.username=String(body.username).trim();if(fields.username.length<3)return response({error:'Username too short'},400)}
   if(body.role!==undefined){const rr=await admin.from('gr_roles').select('id').eq('name',String(body.role)).maybeSingle();if(!rr.data)return response({error:'Invalid role'},400);fields.role_id=rr.data.id}
   if(body.companyIds!==undefined){const ids=companyIds(body.companyIds);if(!ids)return response({error:'Choose one or both companies'},400);fields.company_ids=ids}
   const updated=await admin.from('gr_profiles').update(fields).eq('id',id);if(updated.error)return response({error:updated.error.message},400);
   await admin.from('gr_audit_log').insert({actor_id:user.id,entity:'gr_profiles',entity_id:id,operation:'UPDATE',new_value:fields});
   return response({message:'Employee updated'});
  }
  if(action==='disable'||action==='enable'){
   const active=action==='enable';
   const changed=await admin.from('gr_profiles').update({active}).eq('id',id);if(changed.error)return response({error:changed.error.message},400);
   await admin.auth.admin.updateUserById(id,{ban_duration:active?'none':'876000h'});
   await admin.from('gr_audit_log').insert({actor_id:user.id,entity:'gr_profiles',entity_id:id,operation:active?'ENABLE':'DISABLE',new_value:{active}});
   return response({message:active?'Account enabled':'Account disabled'});
  }
  if(action==='delete'){
   if(id===user.id)return response({error:'You cannot delete your own account'},403);
   // Do not change or remove Attendance or audit records. Block deletion if linked history exists.
   const refs=[
    ['gr_attendance','user_id'],['gr_attendance','marked_by'],
    ['grm_attendance','user_id'],['grm_attendance','marked_by'],
    ['grm_corrections','user_id'],['grm_corrections','reviewed_by'],
    ['grm_leaves','user_id'],['grm_leaves','reviewed_by'],
    ['grm_audit_logs','actor_id'],['gr_profiles','manager_id']
   ];
   for(const [table,column] of refs){
    const result=await admin.from(table).select(column,{count:'exact',head:true}).eq(column,id);
    if(result.error)return response({error:'Unable to verify account history. Delete cancelled: '+result.error.message},409);
    if(result.count)return response({error:'This employee has linked attendance, approval or staff history and cannot be permanently deleted. Use Deactivate to preserve records.'},409);
   }
   const deleted=await admin.auth.admin.deleteUser(id);
   if(deleted.error)return response({error:'Account deletion failed: '+deleted.error.message},409);
   await admin.from('gr_audit_log').insert({actor_id:user.id,entity:'gr_profiles',entity_id:id,operation:'DELETE',old_value:{username:target.username}});
   return response({message:'Employee login and profile permanently deleted'});
  }
  if(action==='reset'){
   const {data:account,error:accountError}=await admin.auth.admin.getUserById(id);
   if(accountError||!account?.user?.email)return response({error:'Email unavailable'},400);
   const reset=await admin.auth.resetPasswordForEmail(account.user.email,{redirectTo:'https://maheshgreenrich.github.io/GREENRICH-CRM/secure.html'});
   if(reset.error)return response({error:reset.error.message},400);
   await admin.from('gr_audit_log').insert({actor_id:user.id,entity:'gr_profiles',entity_id:id,operation:'PASSWORD_RESET_REQUEST'});
   return response({message:'Password reset email requested'});
  }
  return response({error:'Unsupported action'},400);
 }catch(error){return response({error:String(error?.message||error)},500)}
});