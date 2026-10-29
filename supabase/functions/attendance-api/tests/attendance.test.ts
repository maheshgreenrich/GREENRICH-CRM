// Run: deno test supabase/functions/attendance-api/tests/attendance.test.ts
import {handle} from '../controllers/attendance.controller.ts';
import {requireManager} from '../services/attendance.service.ts';
const person={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Test Employee',role:'Sales'};
const office={...person,role:'Office Admin'};
const assert=(value:boolean,msg:string)=>{if(!value)throw Error(msg)};
async function rejects(fn:()=>Promise<unknown>,status:number){
 try{await fn();throw Error('Expected rejection, but request succeeded')}
 catch(e){assert((e as {status?:number}).status===status,'Expected HTTP '+status+', got '+String(e))}
}
Deno.test('Ordinary employees cannot read all users',async()=>{
 const req=new Request('https://example.supabase.co/functions/v1/attendance-api/admin/staff');
 await rejects(()=>handle(req,{} as any,person),403);
});
Deno.test('Ordinary employees cannot alter other attendance',async()=>{
 const req=new Request('https://example.supabase.co/functions/v1/attendance-api/admin/attendance',{method:'POST',
 headers:{'content-type':'application/json'},
 body:JSON.stringify({userId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date:'2026-10-28',status:'PRESENT',reason:'Manager approval'})});
 await rejects(()=>handle(req,{} as any,person),403);
});
Deno.test('Office Admin role is recognized by permission policy',()=>{
 requireManager(office);
 let rejected=false;try{requireManager(person)}catch{rejected=true}assert(rejected,'Sales role must be denied');
});
Deno.test('Pagination is capped at 100',async()=>{
 const req=new Request('https://example.supabase.co/functions/v1/attendance-api/attendance/me?page=1&pageSize=101');
 await rejects(()=>handle(req,{} as any,person),400);
});
Deno.test('Invalid date is rejected before querying database',async()=>{
 const req=new Request('https://example.supabase.co/functions/v1/attendance-api/attendance/me?from=2026-02-30&to=2026-03-01');
 await rejects(()=>handle(req,{} as any,person),400);
});
Deno.test('Correction requests cannot be made for the current date',async()=>{
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Kolkata'});
 const req=new Request('https://example.supabase.co/functions/v1/attendance-api/attendance/corrections',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({date:today,requestedCheckIn:'2026-10-29T09:30:00+05:30',reason:'Attendance correction'})});
 await rejects(()=>handle(req,{} as any,person),400);
});
Deno.test('Client timestamps are ignored by self clock-in',async()=>{
 let called:any=null;
 const db={rpc:async(name:string,args:any)=>{called={name,args};return {data:{id:'record'},error:null}}};
 const req=new Request('https://example.supabase.co/functions/v1/attendance-api/attendance/check-in',{
 method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:'2001-01-01',checkIn:'2001-01-01T00:00:00Z'})});
 const response=await handle(req,db as any,person);
 assert(response.status===201,'Check-in should be created');
 assert(called.name==='grm_clock','Must use trusted server-time RPC');
 assert(called.args.p_actor===person.id,'Must use authenticated user identity');
 assert(!('date' in called.args),'Client-provided date must not reach clock RPC');
});
