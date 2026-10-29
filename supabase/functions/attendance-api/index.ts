// GreenRich ONE Attendance REST Edge API. Service key is server-side only.
import {createClient} from 'npm:@supabase/supabase-js@2';
import {handle} from './controllers/attendance.controller.ts';
const allowedOrigins=new Set(['https://maheshgreenrich.github.io','http://localhost:5500','http://127.0.0.1:5500']);
const withCors=(request:Request,res:Response)=>{
 const origin=request.headers.get('Origin'),h=new Headers(res.headers);
 if(origin&&allowedOrigins.has(origin)){h.set('Access-Control-Allow-Origin',origin);h.set('Vary','Origin')}
 h.set('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info');
 h.set('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
 h.set('Access-Control-Expose-Headers','content-disposition');
 h.set('Cache-Control','no-store');
 return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});
};
const problem=(status:number,message:string)=>Response.json({error:{message,status}},{status});
const secretKey=()=>{
 const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(legacy)return legacy;
 try{const parsed=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');return parsed.default||''}catch{return ''}
};
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return withCors(request,new Response(null,{status:204}));
 try{
  const origin=request.headers.get('Origin');
  if(origin&&!allowedOrigins.has(origin))return withCors(request,problem(403,'Origin not allowed'));
  const url=Deno.env.get('SUPABASE_URL'),key=secretKey();
  if(!url||!key)throw Object.assign(new Error('Attendance service environment incomplete'),{status:503});
  const bearer=request.headers.get('Authorization')||'';
  if(!/^Bearer\s+\S+$/.test(bearer))return withCors(request,problem(401,'Sign in required'));
  const jwt=bearer.replace(/^Bearer\s+/,'');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const identity=await db.auth.getUser(jwt);
  if(identity.error||!identity.data.user)return withCors(request,problem(401,'Invalid or expired login session'));
  const user=identity.data.user;
  const p=await db.from('gr_profiles').select('id,full_name,role_id,active').eq('id',user.id).single();
  if(p.error||!p.data?.active)return withCors(request,problem(403,'Employee account is inactive or missing'));
  const role=await db.from('gr_roles').select('name').eq('id',p.data.role_id).single();
  if(role.error||!role.data)return withCors(request,problem(403,'Employee role is unavailable'));
  const actor={id:user.id,name:p.data.full_name,role:role.data.name};
  const result=await handle(request,db,actor);
  return withCors(request,result);
 }catch(e){
  const error=e as {message?:string,status?:number};
  const code=typeof error.status==='number'&&error.status>=400&&error.status<600?error.status:500;
  console.error('Attendance API failure',code,error.message);
  return withCors(request,problem(code,code===500?'The attendance service encountered an error':error.message||'Request failed'));
 }
});
