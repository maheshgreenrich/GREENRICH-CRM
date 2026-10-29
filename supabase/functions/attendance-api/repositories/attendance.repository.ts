// Attendance V3 repository: Supabase service-role operations. Never import in browser code.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
export type Db = SupabaseClient;
export type Actor = { id:string;role:string;name:string;attendanceRights?:string[] };
export type Page = {page:number;pageSize:number};
export function assertDb(result:{data?:unknown,error?:{message:string},count?:number|null}){
 if(result.error)throw Object.assign(new Error(result.error.message),{status:400});
 return result;
}
export async function invoke(db:Db,name:string,values:Record<string,unknown>){
 const out=await db.rpc(name,values);assertDb(out);return out.data;
}
export async function pageQuery(q:any,options:Page){
 const from=(options.page-1)*options.pageSize;
 const out=await q.range(from,from+options.pageSize-1);
 assertDb(out);
 return {items:out.data||[],page:options.page,pageSize:options.pageSize,total:out.count||0,pages:Math.ceil((out.count||0)/options.pageSize)};
}
export async function audit(db:Db,actor:string,action:string,entity:string,id:string,oldValue:unknown,newValue:unknown,ip:string|null){
 const out=await db.from('grm_audit_logs').insert({actor_id:actor,action,entity,entity_id:id,old_value:oldValue,new_value:newValue,ip_address:ip});
 assertDb(out);
}
export async function staff(db:Db){
 const r=await db.from('gr_profiles').select('id,full_name,username,department_id,shift_id,active').eq('active',true).order('full_name');
 assertDb(r);return r.data||[];
}
export async function active(db:Db,id:string){
 const r=await db.from('gr_profiles').select('id,active,shift_id,department_id').eq('id',id).maybeSingle();
 assertDb(r);if(!r.data?.active)throw Object.assign(new Error('Active employee not found'),{status:404});return r.data;
}
