// Routes/controllers: request validation, pagination and REST endpoint mapping.
import type {Db,Actor} from '../repositories/attendance.repository.ts';
import * as service from '../services/attendance.service.ts';
import {buildReport} from '../services/report.service.ts';
const fail=(m:string,status=400)=>{throw Object.assign(new Error(m),{status})};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validUUID=(v:any,required=true)=>{if(!v&&!required)return null;if(typeof v!=='string'||!UUID.test(v))fail('Invalid UUID');return v as string};
const date=(v:any,name='date')=>{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('Invalid '+name+' (YYYY-MM-DD)');
 const d=new Date(v+'T00:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)fail('Invalid '+name);
 return v as string;
};
const month=(v:any)=>{if(typeof v!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))fail('Month must be YYYY-MM');return v as string};
const dateTime=(v:any,optional=true)=>{
 if(!v&&optional)return null;
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))fail('Timestamp must include timezone offset or Z');
 return new Date(v).toISOString();
};
const status=(v:any)=>{const values=['PRESENT','ABSENT','LATE','HALF_DAY','ON_LEAVE','HOLIDAY','WEEKEND'];if(!values.includes(v))fail('Invalid attendance status');return v as string};
const decision=(v:any)=>{if(!['APPROVED','REJECTED'].includes(v))fail('Decision must be APPROVED or REJECTED');return v as string};
const reason=(v:any)=>{if(typeof v!=='string'||v.trim().length<3||v.trim().length>1000)fail('Reason is required (3–1000 characters)');return v.trim()};
const page=(q:URLSearchParams)=>{
 const p=Number(q.get('page')||1),size=Number(q.get('pageSize')||20);
 if(!Number.isInteger(p)||p<1||p>100000||!Number.isInteger(size)||size<1||size>100)fail('Invalid pagination (page>=1, pageSize 1–100)');
 return {page:p,pageSize:size};
};
const dateRange=(q:URLSearchParams)=>{
 const now=new Date(),from=date(q.get('from')||new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString().slice(0,10),'from'),to=date(q.get('to')||now.toISOString().slice(0,10),'to');
 if(from>to)fail('from must be <= to');
 if((Date.parse(to)-Date.parse(from))/86400000>366)fail('Maximum date range is 366 days');
 return {from,to};
};
const txt=(v:any,label:string,max=250)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(label+' is required (max '+max+' chars)');return v.trim()};
const bodyJSON=async(req:Request)=>{
 const raw=await req.text();if(raw.length>64000)fail('Request body too large',413);
 if(!raw)return {};
 try{const value=JSON.parse(raw);if(!value||Array.isArray(value)||typeof value!=='object')fail('Expected JSON object');return value}catch(e){fail('Invalid JSON body')}
};
const response=(value:any,status=200)=>Response.json({data:value},{status,headers:{'Cache-Control':'no-store'}});
const qString=(q:URLSearchParams,name:string)=>q.get(name)||undefined;
const statusFilter=(value:string|undefined)=>{
 if(value&& !['PENDING','APPROVED','REJECTED'].includes(value))fail('Invalid request status');return value;
};
const ipAddress=(req:Request):string|null=>{
 const forwarded=req.headers.get('x-forwarded-for');
 const ip=forwarded?.split(',')[0]?.trim()||null;
 return ip&&/^[\da-fA-F.:]+$/.test(ip)?ip:null;
};
export async function handle(req:Request,db:Db,actor:Actor):Promise<Response>{
 const url=new URL(req.url),q=url.searchParams;
 const route=url.pathname.split('/attendance-api')[1]||'/';
 const method=req.method.toUpperCase(),pagination=page(q),ip=ipAddress(req);
 if(method==='POST'&&route==='/attendance/check-in')return response(await service.clock(db,actor,'in',ip),201);
 if(method==='POST'&&route==='/attendance/check-out')return response(await service.clock(db,actor,'out',ip));
 if(method==='GET'&&route==='/attendance/me')return response(await service.myHistory(db,actor,...Object.values(dateRange(q)) as [string,string],pagination));
 if(method==='GET'&&route==='/attendance/me/summary')return response(await service.mySummary(db,actor,month(q.get('month')||new Date().toISOString().slice(0,7))));
 if(method==='POST'&&route==='/attendance/corrections'){
  const b=await bodyJSON(req);
  return response(await service.correctionCreate(db,actor,{date:date(b.date),checkIn:dateTime(b.requestedCheckIn),checkOut:dateTime(b.requestedCheckOut),reason:reason(b.reason)}),201);
 }
 if(method==='GET'&&route==='/attendance/corrections/me')return response(await service.ownRequests(db,actor,'grm_corrections',pagination));
 if(method==='POST'&&route==='/leaves'){
  const b=await bodyJSON(req),fromDate=date(b.fromDate),toDate=date(b.toDate);
  if(toDate<fromDate)fail('Leave end date cannot precede start date');
  if((Date.parse(toDate)-Date.parse(fromDate))/86400000>366)fail('Leave request exceeds 366 days');
  return response(await service.leaveCreate(db,actor,{type:txt(b.type,'Leave type',40),fromDate,toDate,reason:reason(b.reason)}),201);
 }
 if(method==='GET'&&route==='/leaves/me')return response(await service.ownRequests(db,actor,'grm_leaves',pagination));
 if(method==='GET'&&route==='/admin/staff')return response(await service.directory(db,actor));
 if(method==='GET'&&route==='/admin/attendance'){
  const range=dateRange(q),filters={...range,userId:qString(q,'userId'),department:qString(q,'department'),status:qString(q,'status')};
  if(filters.userId)validUUID(filters.userId);if(filters.department)validUUID(filters.department);if(filters.status)status(filters.status);
  return response(await service.attendanceSearch(db,actor,filters,pagination));
 }
 if(method==='POST'&&route==='/admin/attendance'){
  const b=await bodyJSON(req);
  return response(await service.manual(db,actor,{userId:validUUID(b.userId),date:date(b.date),status:status(b.status),
    checkIn:dateTime(b.checkIn),checkOut:dateTime(b.checkOut),reason:reason(b.reason)},ip),201);
 }
 if(method==='POST'&&route==='/admin/attendance/bulk'){
  const b=await bodyJSON(req);
  if(!Array.isArray(b.userIds))fail('userIds array required');
  return response({updated:await service.bulk(db,actor,{userIds:b.userIds.map((v:any)=>validUUID(v)),date:date(b.date),
   status:status(b.status),reason:reason(b.reason)},ip)},201);
 }
 const record=route.match(/^\/admin\/attendance\/([a-f0-9-]{36})$/i);
 if(record&&(method==='PUT'||method==='DELETE')){
  const b=await bodyJSON(req);return response(await service.manualById(db,actor,validUUID(record[1]),{
   status:method==='PUT'?status(b.status):undefined,checkIn:dateTime(b.checkIn),checkOut:dateTime(b.checkOut),reason:reason(b.reason)
  },ip,method==='DELETE'));
 }
 if(method==='GET'&&route==='/admin/corrections')return response(await service.reviewList(db,actor,'grm_corrections',statusFilter(qString(q,'status')),pagination));
 const correction=route.match(/^\/admin\/corrections\/([a-f0-9-]{36})\/review$/i);
 if(method==='PATCH'&&correction){
  const b=await bodyJSON(req);return response(await service.review(db,actor,'correction',validUUID(correction[1]),{decision:decision(b.decision),note:reason(b.note)},ip));
 }
 if(method==='GET'&&route==='/admin/leaves')return response(await service.reviewList(db,actor,'grm_leaves',statusFilter(qString(q,'status')),pagination));
 const leave=route.match(/^\/admin\/leaves\/([a-f0-9-]{36})\/review$/i);
 if(method==='PATCH'&&leave){
  const b=await bodyJSON(req);return response(await service.review(db,actor,'leave',validUUID(leave[1]),{decision:decision(b.decision),note:reason(b.note)},ip));
 }
 if(method==='GET'&&route==='/admin/reports/monthly'){
  const m=month(q.get('month')||''),format=q.get('format')||'csv';
  if(!['csv','xls','pdf'].includes(format))fail('format must be csv, xls or pdf');
  return buildReport(m,format,await service.reportRows(db,actor,m));
 }
 const reference=route.match(/^\/admin\/(departments|shifts|holidays)(?:\/([a-f0-9-]{36}))?$/i);
 if(reference){
  const entity=reference[1],id=reference[2]?validUUID(reference[2]):null;
  const table=('grm_'+entity) as 'grm_departments'|'grm_shifts'|'grm_holidays';
  if(method==='GET'&&!id)return response(await service.reference(db,table));
  if(['POST','PUT','DELETE'].includes(method)){
   if(method==='POST'&&id || method!=='POST'&&!id)fail('Invalid configuration resource');
   const b=await bodyJSON(req),data:any={reason:reason(b.reason)};
   if(method!=='DELETE'){
    data.name=txt(b.name,'Name',120);
    if(entity==='holidays')data.date=date(b.date);
    if(entity==='shifts'){
     const time=(v:any)=>{if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))fail('Shift time must be HH:MM');return v};
     data.start_time=time(b.startTime);data.end_time=time(b.endTime);
     data.grace_minutes=Number(b.graceMinutes);data.half_day_hours=Number(b.halfDayHours);
     if(!Number.isInteger(data.grace_minutes)||data.grace_minutes<0||data.grace_minutes>240)fail('Invalid grace minutes');
     if(!Number.isFinite(data.half_day_hours)||data.half_day_hours<=0||data.half_day_hours>24)fail('Invalid half-day hours');
     if(!Array.isArray(b.workingDays)||!b.workingDays.length||b.workingDays.some((v:any)=>!Number.isInteger(v)||v<1||v>7))fail('Working days must use 1–7');
     data.working_days=[...new Set(b.workingDays)];
    }
   }
   return response(await service.configChange(db,actor,entity,method==='POST'?'create':method==='PUT'?'update':'delete',id,data,ip),method==='POST'?201:200);
  }
 }
 fail('Endpoint not found',404);
}
