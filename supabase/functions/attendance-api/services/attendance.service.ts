// Attendance business rules and role checks; writes go via transactional PostgreSQL RPCs.
import {assertDb,invoke,pageQuery,staff,active,audit,type Db,type Actor,type Page} from '../repositories/attendance.repository.ts';
const bad=(message:string,status=400)=>{throw Object.assign(new Error(message),{status})};
export const isManager=(actor:Actor)=>actor.role==='Admin'||actor.role==='Office Admin';
export function requireManager(actor:Actor){if(!isManager(actor))bad('Office Admin role required',403)}
const monthBounds=(month:string)=>{const from=month+'-01',d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);return [from,d.toISOString().slice(0,10)]};
export async function clock(db:Db,actor:Actor,mode:'in'|'out',ip:string|null){
 return invoke(db,'grm_clock',{p_actor:actor.id,p_mode:mode,p_ip:ip});
}
export async function myHistory(db:Db,actor:Actor,from:string,to:string,page:Page){
 return pageQuery(db.from('grm_attendance').select('*',{count:'exact'}).eq('user_id',actor.id).is('deleted_at',null).gte('date',from).lte('date',to).order('date',{ascending:false}),page);
}
export async function mySummary(db:Db,actor:Actor,month:string){
 const [from,after]=monthBounds(month);
 const r=await db.from('grm_attendance').select('date,status,total_hours').eq('user_id',actor.id).is('deleted_at',null).gte('date',from).lt('date',after);assertDb(r);
 const summary={month,total:(r.data||[]).length,present:0,late:0,half_day:0,absent:0,leave:0,holiday:0,weekend:0,hours:0};
 for(const a of r.data||[]){
  if(a.status==='PRESENT')summary.present++;if(a.status==='LATE')summary.late++;
  if(a.status==='HALF_DAY')summary.half_day++;if(a.status==='ABSENT')summary.absent++;
  if(a.status==='ON_LEAVE')summary.leave++;if(a.status==='HOLIDAY')summary.holiday++;
  if(a.status==='WEEKEND')summary.weekend++;summary.hours+=Number(a.total_hours||0);
 }
 summary.hours=Math.round(summary.hours*100)/100;return summary;
}
export async function correctionCreate(db:Db,actor:Actor,body:any){
 if(!body.reason?.trim()||body.reason.trim().length<3)bad('Correction reason required');
 const existing=await db.from('grm_attendance').select('id').eq('user_id',actor.id).eq('date',body.date).is('deleted_at',null).maybeSingle();
 assertDb(existing);
 const result=await db.from('grm_corrections').insert({
  attendance_id:existing.data?.id||null,user_id:actor.id,date:body.date,
  requested_check_in:body.checkIn||null,requested_check_out:body.checkOut||null,reason:body.reason.trim()
 }).select('*').single();assertDb(result);return result.data;
}
export async function leaveCreate(db:Db,actor:Actor,body:any){
 const r=await db.from('grm_leaves').insert({user_id:actor.id,type:body.type,from_date:body.fromDate,to_date:body.toDate,reason:body.reason.trim()}).select('*').single();assertDb(r);return r.data;
}
export async function ownRequests(db:Db,actor:Actor,kind:'grm_corrections'|'grm_leaves',page:Page){
 return pageQuery(db.from(kind).select('*',{count:'exact'}).eq('user_id',actor.id).order('created_at',{ascending:false}),page);
}
export async function attendanceSearch(db:Db,actor:Actor,filters:any,page:Page){
 requireManager(actor);
 let ids:string[]|null=null;
 if(filters.department){
  const r=await db.from('gr_profiles').select('id').eq('department_id',filters.department);assertDb(r);ids=(r.data||[]).map(x=>x.id);
  if(!ids.length)return {items:[],page:page.page,pageSize:page.pageSize,total:0,pages:0};
 }
 let q=db.from('grm_attendance').select('*,gr_profiles!grm_attendance_user_id_fkey(full_name,department_id)',{count:'exact'}).is('deleted_at',null).order('date',{ascending:false}).order('user_id');
 if(filters.userId)q=q.eq('user_id',filters.userId);
 if(filters.status)q=q.eq('status',filters.status);
 if(filters.from)q=q.gte('date',filters.from);
 if(filters.to)q=q.lte('date',filters.to);
 if(ids)q=q.in('user_id',ids);
 return pageQuery(q,page);
}
export async function manual(db:Db,actor:Actor,body:any,ip:string|null,deleted=false){
 requireManager(actor);
 if(!body.reason||String(body.reason).trim().length<3)bad('Admin action reason required (at least 3 characters)');
 await active(db,body.userId);
 return invoke(db,'grm_admin_attendance',{
  p_actor:actor.id,p_user:body.userId,p_day:body.date,p_status:body.status||null,
  p_check_in:body.checkIn||null,p_check_out:body.checkOut||null,
  p_reason:String(body.reason).trim(),p_delete:deleted,p_ip:ip
 });
}
export async function manualById(db:Db,actor:Actor,id:string,body:any,ip:string|null,deleted=false){
 requireManager(actor);
 const existing=await db.from('grm_attendance').select('*').eq('id',id).is('deleted_at',null).maybeSingle();assertDb(existing);
 if(!existing.data)bad('Attendance record not found',404);
 return manual(db,actor,{userId:existing.data.user_id,date:existing.data.date,
  status:body.status||existing.data.status,checkIn:body.checkIn===undefined?existing.data.check_in:body.checkIn,
  checkOut:body.checkOut===undefined?existing.data.check_out:body.checkOut,reason:body.reason},ip,deleted);
}
export async function bulk(db:Db,actor:Actor,body:any,ip:string|null){
 requireManager(actor);
 if(!Array.isArray(body.userIds)||body.userIds.length<1||body.userIds.length>200)bad('Choose 1–200 employees');
 if(String(body.reason||'').trim().length<3)bad('Bulk marking reason required');
 return invoke(db,'grm_admin_bulk',{p_actor:actor.id,p_user_ids:body.userIds,p_day:body.date,p_status:body.status,p_reason:body.reason.trim(),p_ip:ip});
}
export async function reviewList(db:Db,actor:Actor,kind:'grm_corrections'|'grm_leaves',status:string|undefined,page:Page){
 requireManager(actor);
 let q=db.from(kind).select('*',{count:'exact'}).order('created_at',{ascending:false});
 if(status)q=q.eq('status',status);
 return pageQuery(q,page);
}
export async function review(db:Db,actor:Actor,kind:'correction'|'leave',id:string,body:any,ip:string|null){
 requireManager(actor);
 if(!['APPROVED','REJECTED'].includes(body.decision))bad('Decision must be APPROVED or REJECTED');
 if(!body.note||body.note.trim().length<3)bad('Review note required');
 return invoke(db,kind==='correction'?'grm_review_correction':'grm_review_leave',{
  p_actor:actor.id,p_id:id,p_decision:body.decision,p_note:body.note.trim(),p_ip:ip
 });
}
export async function directory(db:Db,actor:Actor){requireManager(actor);return staff(db)}
export async function reference(db:Db,table:'grm_departments'|'grm_shifts'|'grm_holidays'){
 const order=table==='grm_holidays'?'date':'name';
 const r=await db.from(table).select('*').order(order);assertDb(r);return r.data||[];
}
export async function configChange(db:Db,actor:Actor,entity:string,operation:string,id:string|null,body:any,ip:string|null){
 requireManager(actor);
 if(!body.reason||body.reason.trim().length<3)bad('Reason required');
 return invoke(db,'grm_admin_config',{p_actor:actor.id,p_entity:entity,p_operation:operation,p_id:id,p_data:body,p_reason:body.reason.trim(),p_ip:ip});
}
export async function assignEmployee(db:Db,actor:Actor,userId:string,departmentId:string|null,shiftId:string|null,reason:string,ip:string|null){
 requireManager(actor);
 if(!reason||reason.trim().length<3)bad('Reason required');
 return invoke(db,'grm_assign_employee',{p_actor:actor.id,p_target:userId,p_department:departmentId,p_shift:shiftId,p_reason:reason.trim(),p_ip:ip});
}
export async function reportRows(db:Db,actor:Actor,month:string){
 requireManager(actor);const [from,after]=monthBounds(month),rows:any[]=[];
 for(let offset=0;offset<30000;offset+=1000){
  const r=await db.from('grm_attendance').select('date,user_id,status,check_in,check_out,total_hours,remarks,gr_profiles!grm_attendance_user_id_fkey(full_name)').is('deleted_at',null).gte('date',from).lt('date',after).order('date',{ascending:true}).range(offset,offset+999);
  assertDb(r);rows.push(...r.data||[]);
  if((r.data||[]).length<1000)break;
  if(offset+1000>=30000)bad('Report too large. Narrow reporting period.',413);
 }
 return rows.map(r=>[r.date,(r.gr_profiles as any)?.full_name||r.user_id,r.status,r.check_in||'',r.check_out||'',r.total_hours??'',r.remarks||'']);
}
