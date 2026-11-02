-- Production ledger release. Applied with Supabase migration production_workflow.
-- No sample stock or existing reference/BOM quantities are converted to physical stock.
create schema if not exists gr_production_private;
revoke all on schema gr_production_private from public,anon;
grant usage on schema gr_production_private to authenticated;
create sequence if not exists gr_production_private.document_sequence;
create table public.gr_production_balances(company_id text not null references public.gr_companies(id),material_id text not null,quantity numeric(18,6) not null default 0 check(quantity>=0),updated_at timestamptz not null default now(),primary key(company_id,material_id));
create table public.gr_production_documents(company_id text not null references public.gr_companies(id),id uuid not null default gen_random_uuid(),kind text not null check(kind in('po','job','qc','receipt','return','rework','assembly')),number text not null unique,status text not null,payload jsonb not null default '{}',created_by uuid not null references public.gr_profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(company_id,id));
create table public.gr_production_events(id bigint generated always as identity primary key,company_id text not null references public.gr_companies(id),document_id uuid not null,material_id text,product_id text,movement text not null,quantity numeric(18,6) not null,reference text not null,actor uuid not null references public.gr_profiles(id),created_at timestamptz not null default now());
create index on public.gr_production_events(company_id,material_id,created_at desc);
create index on public.gr_production_documents(company_id,kind,created_at desc);
create table public.gr_production_settings(company_id text primary key references public.gr_companies(id),director_limit numeric(18,2) not null default 0 check(director_limit>=0),checklist jsonb not null default '["Damage check","Stickering","Labelling"]',updated_at timestamptz not null default now());
insert into public.gr_production_settings(company_id) select id from public.gr_companies on conflict do nothing;
create table gr_production_private.requests(company_id text not null,request_id uuid not null,action text not null,input jsonb not null,result jsonb not null,actor uuid not null,primary key(company_id,request_id));
alter table gr_production_private.requests enable row level security;
create or replace function gr_production_private.allowed(c text,resource text,act text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id where p.id=auth.uid() and p.active and c=any(p.company_ids) and
 (r.name='Admin' or (r.name not in('Sales','Telecaller','Marketing') and
 ((r.name='Accounts' and resource='po' and act in('view','export')) or (r.name<>'Accounts' and public.gr_ops_allowed(c,case when resource='po' then 'purchase_order' else 'material' end,act))))));
$$;
revoke all on function gr_production_private.allowed(text,text,text) from public,anon;
grant execute on function gr_production_private.allowed(text,text,text) to authenticated;
alter table public.gr_production_balances enable row level security;
alter table public.gr_production_documents enable row level security;
alter table public.gr_production_events enable row level security;
alter table public.gr_production_settings enable row level security;
create policy production_balances_read on public.gr_production_balances for select to authenticated using(gr_production_private.allowed(company_id,'stock','view'));
create policy production_documents_read on public.gr_production_documents for select to authenticated using(gr_production_private.allowed(company_id,case when kind in('po','receipt') then 'po' else 'stock' end,'view'));
create policy production_events_read on public.gr_production_events for select to authenticated using(gr_production_private.allowed(company_id,'stock','view'));
create policy production_settings_read on public.gr_production_settings for select to authenticated using(gr_production_private.allowed(company_id,'stock','view') or gr_production_private.allowed(company_id,'po','view'));
revoke all on public.gr_production_balances,public.gr_production_documents,public.gr_production_events,public.gr_production_settings from anon,authenticated;
grant select on public.gr_production_balances,public.gr_production_documents,public.gr_production_events,public.gr_production_settings to authenticated;
create function gr_production_private.number(prefix text,c text) returns text language sql volatile set search_path='' as $$ select prefix||'-'||upper(left(c,2))||'-'||to_char(now(),'YYYY')||'-'||lpad(nextval('gr_production_private.document_sequence')::text,7,'0'); $$;
create function gr_production_private.material(c text,m text) returns jsonb language plpgsql stable set search_path='' as $$ declare p jsonb;begin select payload into p from public.gr_ops_records where company_id=c and kind='material' and record_id=m;if p is null then raise exception 'Material is not in this company: %',m;end if;return p;end $$;
create function gr_production_private.post(c text,d uuid,m text,delta numeric,what text,ref text) returns void language plpgsql set search_path='' as $$
 begin
 if delta is null or delta<>round(delta,6) or delta::text in('NaN','Infinity','-Infinity') then raise exception 'Invalid quantity';end if;
 perform gr_production_private.material(c,m);
 insert into public.gr_production_balances(company_id,material_id,quantity) values(c,m,0) on conflict do nothing;
 update public.gr_production_balances set quantity=quantity+delta,updated_at=now() where company_id=c and material_id=m and quantity+delta>=0;
 if not found then raise exception 'Insufficient available material stock: %',m;end if;
 insert into public.gr_production_events(company_id,document_id,material_id,movement,quantity,reference,actor) values(c,d,m,what,delta,ref,auth.uid());
 end $$;
create function gr_production_private.requirements(c text,pid text,n numeric) returns jsonb language plpgsql stable set search_path='' as $$
 declare p jsonb;line jsonb;m jsonb;result jsonb='[]';q numeric;
 begin
 if n is null or n<=0 or n<>trunc(n) or n>100000 then raise exception 'Enter a positive whole-number build quantity (maximum 100000)';end if;
 select payload into p from public.gr_crm_records where company_id=c and kind='products' and record_id=pid;
 if p is null or p->>'inventory_mode' is distinct from 'bom' or coalesce(jsonb_array_length(p->'bom_components'),0)=0 then raise exception 'Configure this product with SFG BOM components in Stock & Products first';end if;
 for line in select value from jsonb_array_elements(p->'bom_components') loop
 m=gr_production_private.material(c,line->>'material_id');
 if m->>'type'<>'SFG' then raise exception 'Product BOM must contain SFG items only for final assembly: %',m->>'code';end if;
 q=(line->>'quantity')::numeric*n;if q is null or q<=0 or q::text in('NaN','Infinity','-Infinity') then raise exception 'Invalid SFG requirement';end if;
 result=result||jsonb_build_array(jsonb_build_object('material_id',line->>'material_id','code',m->>'code','name',m->>'name','uom',m->>'uom','quantity',q));
 end loop;
 select jsonb_agg(jsonb_build_object('material_id',x.mid,'code',x.code,'name',x.name,'uom',x.uom,'quantity',x.q,'available',coalesce(b.quantity,0),'shortage',greatest(x.q-coalesce(b.quantity,0),0))) into result
 from(select value->>'material_id' mid,max(value->>'code') code,max(value->>'name') name,max(value->>'uom') uom,sum((value->>'quantity')::numeric) q from jsonb_array_elements(result) group by 1)x left join public.gr_production_balances b on b.company_id=c and b.material_id=x.mid;
 return result;
 end $$;
create function gr_production_private.sfg_requirements(c text,sid text,n numeric) returns jsonb language plpgsql stable set search_path='' as $$
 declare s jsonb;line jsonb;m jsonb;q numeric;result jsonb='[]';
 begin
 if n is null or n<=0 or n<>trunc(n) or n>100000 then raise exception 'Enter a positive whole-number SFG quantity (maximum 100000)';end if;
 s=gr_production_private.material(c,sid);
 if s->>'type'<>'SFG' or jsonb_typeof(s->'rm_bom') is distinct from 'array' or jsonb_array_length(s->'rm_bom')=0 then raise exception 'Save the raw-material BOM for this SFG first';end if;
 for line in select value from jsonb_array_elements(s->'rm_bom') loop
 m=gr_production_private.material(c,line->>'material_id');
 if m->>'type' not in('RM','RW') then raise exception 'SFG BOM can contain raw materials only';end if;
 q=(line->>'quantity')::numeric*n;
 if q is null or q<=0 or q<>round(q,6) or q::text in('NaN','Infinity','-Infinity') then raise exception 'Invalid raw-material requirement';end if;
 result=result||jsonb_build_array(jsonb_build_object('material_id',line->>'material_id','code',m->>'code','name',m->>'name','uom',m->>'uom','quantity',q));
 end loop;
 select jsonb_agg(jsonb_build_object('material_id',x.mid,'code',x.code,'name',x.name,'uom',x.uom,'quantity',x.q,'available',coalesce(b.quantity,0),'shortage',greatest(x.q-coalesce(b.quantity,0),0))) into result
 from(select value->>'material_id' mid,max(value->>'code') code,max(value->>'name') name,max(value->>'uom') uom,sum((value->>'quantity')::numeric) q from jsonb_array_elements(result) group by 1)x left join public.gr_production_balances b on b.company_id=c and b.material_id=x.mid;
 return result;
 end $$;
create function gr_production_private.command(c text,action text,input jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 #variable_conflict use_column
 <<body>>
 declare role_name text;required_resource text;required_action text;doc public.gr_production_documents%rowtype;receipt public.gr_production_documents%rowtype;cached gr_production_private.requests%rowtype;
 id uuid;num text;result jsonb;payload jsonb;lines jsonb;line jsonb;m jsonb;v jsonb;product jsonb;reqs jsonb;idx int;i int;amount numeric;total numeric=0;received numeric;used numeric;waste numeric;returned numeric;output numeric;remaining numeric;passed numeric;rejected numeric;limit_amount numeric;checks jsonb;check_item jsonb;new_status text;
 begin
 select r.name into role_name from public.gr_profiles p join public.gr_roles r on r.id=p.role_id where p.id=auth.uid() and p.active and c=any(p.company_ids);
 if role_name is null then raise exception 'Company access denied';end if;
 required_resource=case when action like 'po_%' then 'po' else 'stock' end;
 required_action=case when action in('readiness','sfg_readiness') then 'view' when action='po_approve' then 'approve' when action in('po_create','job_issue','quality_move','sfg_assemble','material_save') then 'create' else 'edit' end;
 if not gr_production_private.allowed(c,required_resource,required_action) then raise exception 'Role is not permitted to perform this action';end if;
 if action='sfg_readiness' then return gr_production_private.sfg_requirements(c,input->>'sfg_id',(input->>'quantity')::numeric);end if;
 if action='readiness' then return gr_production_private.requirements(c,input->>'product_id',(input->>'quantity')::numeric);end if;
 if request_id is null then raise exception 'Request ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended('gr_production:'||c,0));
 select * into cached from gr_production_private.requests r where r.company_id=c and r.request_id=command.request_id;
 if found then if cached.action<>action or cached.input<>input or cached.actor<>auth.uid() then raise exception 'Request ID was already used for different data';end if;return cached.result;end if;
 if action in('settings','opening') and role_name<>'Admin' then raise exception 'Only Admin can change settings or opening balances';end if;
 if action in('po_approve','po_send','po_receive','job_accept','quality_accept','rework_retry','rework_scrap') then
 select * into doc from public.gr_production_documents where company_id=c and public.gr_production_documents.id=(input->>'id')::uuid for update;
 if not found then raise exception 'Document not found in this company';end if;
 end if;
 if action='settings' then
 limit_amount=(input->>'director_limit')::numeric;checks=input->'checklist';
 if limit_amount is null or limit_amount<0 or limit_amount::text in('NaN','Infinity') or jsonb_typeof(checks)<>'array' or jsonb_array_length(checks)<1 or jsonb_array_length(checks)>30 then raise exception 'Valid approval limit and 1–30 checklist items required';end if;
 for check_item in select value from jsonb_array_elements(checks) loop if jsonb_typeof(check_item)<>'string' or length(trim(check_item#>>'{}'))=0 then raise exception 'Checklist labels must be nonempty text';end if;end loop;
 update public.gr_production_settings set director_limit=limit_amount,checklist=checks,updated_at=now() where company_id=c;
 result=jsonb_build_object('message','Production settings saved');
 elsif action='material_save' then
 id=gen_random_uuid();m=input->'material';
 if m->>'type' not in('RW','RM','SFG') or nullif(trim(m->>'code'),'') is null or nullif(trim(m->>'name'),'') is null or nullif(trim(m->>'uom'),'') is null then raise exception 'Material code, name, unit and RW/SFG type required';end if;
 if coalesce((m->>'reorder_level')::numeric,0)<0 or m->>'reorder_level' in('NaN','Infinity','-Infinity') then raise exception 'Reorder level cannot be negative';end if;
 if input->>'material_id' is not null then
 v=gr_production_private.material(c,input->>'material_id');
 if v->>'type' not in('RM','RW','SFG') or v->>'type'<>m->>'type' then raise exception 'Existing material type cannot change';end if;
 if v->>'uom'<>m->>'uom' and exists(select 1 from public.gr_production_events where company_id=c and material_id=input->>'material_id') then raise exception 'Unit cannot change after stock posting';end if;
 if not gr_production_private.allowed(c,'stock','edit') then raise exception 'Edit permission required';end if;
 m=v||m||jsonb_build_object('id',input->>'material_id');
 else m=m||jsonb_build_object('id',id::text);end if;
 if m->>'type'='SFG' then
 lines=m->'rm_bom';
 if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines) not between 1 and 100 then raise exception 'Add 1–100 raw-material BOM lines for this semi-finished good';end if;
 payload='[]';
 for line in select value from jsonb_array_elements(lines) loop
 v=gr_production_private.material(c,line->>'material_id');amount=(line->>'quantity')::numeric;
 if v->>'type' not in('RW','RM') or amount is null or amount<=0 or amount<>round(amount,6) or amount::text in('NaN','Infinity','-Infinity') then raise exception 'Select a raw material and positive quantity (up to six decimal places)';end if;
 if exists(select 1 from jsonb_array_elements(payload)x where x->>'material_id'=line->>'material_id') then raise exception 'Combine duplicate raw materials into one BOM line';end if;
 payload=payload||jsonb_build_array(jsonb_build_object('material_id',line->>'material_id','quantity',amount));
 end loop;
 m=jsonb_set(m,'{rm_bom}',payload);
 end if;
 if exists(select 1 from public.gr_ops_records where company_id=c and kind='material' and lower(payload->>'code')=lower(m->>'code') and record_id<>m->>'id') then raise exception 'Material code already exists';end if;
 insert into public.gr_ops_records(company_id,kind,record_id,payload) values(c,'material',m->>'id',m) on conflict(company_id,kind,record_id) do update set payload=excluded.payload,updated_at=now();
 result=jsonb_build_object('message','Material saved','material_id',m->>'id');
 elsif action='opening' then
 m=gr_production_private.material(c,input->>'material_id');if m->>'type' not in('RM','RW') then raise exception 'Opening balance is for raw materials only';end if;
 if exists(select 1 from public.gr_production_events where company_id=c and material_id=input->>'material_id') then raise exception 'Opening balance already established. Use receipts and stock movements';end if;
 amount=(input->>'quantity')::numeric;if amount is null or amount<0 or nullif(trim(input->>'note'),'') is null then raise exception 'Opening quantity and audit note required';end if;
 id=gen_random_uuid();num=gr_production_private.number('OPEN',c);perform gr_production_private.post(c,id,input->>'material_id',amount,'OPENING',num||' · '||(input->>'note'));result=jsonb_build_object('number',num);
 elsif action='po_create' then
 select payload into v from public.gr_ops_records where company_id=c and kind='vendor' and record_id=input->>'vendor_id';if v is null then raise exception 'Select a vendor in this company';end if;
 lines=input->'lines';if jsonb_typeof(lines)<>'array' or jsonb_array_length(lines) not between 1 and 100 then raise exception 'Add 1–100 purchase lines';end if;
 payload='[]';
 for line in select value from jsonb_array_elements(lines) loop
 m=gr_production_private.material(c,line->>'material_id');if m->>'type' not in('RM','RW','SFG') then raise exception 'Purchase destination must be RW or SFG';end if;
 if m->>'type'='SFG' and coalesce((m->>'has_job_work')::boolean,false) then raise exception 'SFG requiring job work must be produced through Job Work';end if;
 amount=(line->>'quantity')::numeric;received=(line->>'rate')::numeric;output=coalesce((line->>'gst')::numeric,0);
 if amount is null or amount<=0 or received is null or received<0 or output<0 or output>100 or amount::text in('NaN','Infinity') or received::text in('NaN','Infinity') or output::text='NaN' then raise exception 'Valid quantity, rate and GST required';end if;
 total=total+round(amount*received*(1+output/100),2);
 payload=payload||jsonb_build_array(jsonb_build_object('material_id',line->>'material_id','code',m->>'code','name',m->>'name','uom',m->>'uom','destination',case when m->>'type'='SFG' then 'SFG' else 'RW' end,'quantity',amount,'rate',received,'gst',output,'received',0));
 end loop;
 id=gen_random_uuid();num=gr_production_private.number('PO',c);
 insert into public.gr_production_documents(company_id,id,kind,number,status,payload,created_by) values(c,id,'po',num,'Draft',jsonb_build_object('vendor_id',input->>'vendor_id','vendor',v,'lines',payload,'total',total,'terms',input->>'terms','delivery_date',input->>'delivery_date','company_details',input->'company_details'),auth.uid());result=jsonb_build_object('id',id,'number',num);
 elsif action='po_approve' then
 if doc.kind<>'po' or doc.status<>'Draft' then raise exception 'Only a Draft PO can be approved';end if;
 select director_limit into limit_amount from public.gr_production_settings where company_id=c;
 if (doc.payload->>'total')::numeric>=coalesce(limit_amount,0) and role_name not in('Admin','Director') then raise exception 'Director approval required for this PO total';end if;
 update public.gr_production_documents set status='Approved',payload=payload||jsonb_build_object('approved_by',auth.uid(),'approved_at',now()),updated_at=now() where company_id=c and public.gr_production_documents.id=doc.id;result=jsonb_build_object('number',doc.number,'status','Approved');
 elsif action='po_send' then
 if doc.kind<>'po' or doc.status<>'Approved' then raise exception 'Approve this PO before marking it Sent';end if;
 update public.gr_production_documents set status='Sent',updated_at=now() where company_id=c and public.gr_production_documents.id=doc.id;result=jsonb_build_object('status','Sent');
 elsif action='po_receive' then
 if doc.kind<>'po' or doc.status not in('Approved','Sent','Partly Received') then raise exception 'PO is not open for receipts';end if;
 lines=doc.payload->'lines';payload='[]';total=0;
 for line in select value from jsonb_array_elements(input->'lines') loop
 idx=(line->>'index')::int;amount=(line->>'quantity')::numeric;
 if idx is null or idx<0 or idx>=jsonb_array_length(lines) or amount is null or amount<=0 then raise exception 'Invalid receipt line';end if;
 m=lines->idx;received=(m->>'received')::numeric+amount;
 if received>(m->>'quantity')::numeric then raise exception 'Receipt exceeds outstanding PO quantity';end if;
 lines=jsonb_set(lines,array[idx::text,'received'],to_jsonb(received));payload=payload||jsonb_build_array(jsonb_build_object('material_id',m->>'material_id','quantity',amount));total=total+amount;
 end loop;
 if total<=0 then raise exception 'Enter received quantities';end if;
 id=gen_random_uuid();num=gr_production_private.number('GRN',c);
 for line in select value from jsonb_array_elements(payload) loop perform gr_production_private.post(c,id,line->>'material_id',(line->>'quantity')::numeric,'PO_RECEIPT',num);end loop;
 insert into public.gr_production_documents(company_id,id,kind,number,status,payload,created_by) values(c,id,'receipt',num,'Posted',jsonb_build_object('po_id',doc.id,'po_number',doc.number,'lines',payload,'note',input->>'note'),auth.uid());
 new_status=case when exists(select 1 from jsonb_array_elements(lines)x where (x->>'received')::numeric<(x->>'quantity')::numeric) then 'Partly Received' else 'Received' end;
 update public.gr_production_documents set status=new_status,payload=jsonb_set(doc.payload,'{lines}',lines),updated_at=now() where company_id=c and public.gr_production_documents.id=doc.id;result=jsonb_build_object('number',num,'status',new_status);
 elsif action='job_issue' then
 m=gr_production_private.material(c,input->>'material_id');if m->>'type' not in('RW','RM') or not coalesce((m->>'has_job_work')::boolean,false) then raise exception 'Enable Has job work on this raw material first';end if;
 select payload into v from public.gr_ops_records where company_id=c and kind='vendor' and record_id=input->>'vendor_id';if v is null then raise exception 'Select a vendor in this company';end if;
 amount=(input->>'quantity')::numeric;if amount is null or amount<=0 or nullif(trim(input->>'work'),'') is null or nullif(input->>'due_on','') is null then raise exception 'Work description, positive issue quantity and return date required';end if;
 perform (input->>'due_on')::date;
 id=gen_random_uuid();num=gr_production_private.number('STN',c);perform gr_production_private.post(c,id,input->>'material_id',-amount,'JOB_ISSUE',num);
 payload=jsonb_build_object('material_id',input->>'material_id','material',m,'vendor_id',input->>'vendor_id','vendor',v,'work',input->>'work','due_on',input->>'due_on','issued',amount,'used',0,'waste',0,'returned',0,'output',0,'remaining',amount);
 insert into public.gr_production_documents(company_id,id,kind,number,status,payload,created_by) values(c,id,'job',num,'At vendor',payload,auth.uid());result=jsonb_build_object('number',num,'id',id);
 elsif action='job_accept' then
 if doc.kind<>'job' or doc.status='Completed' then raise exception 'Job is not open';end if;
 used=(input->>'used')::numeric;waste=(input->>'waste')::numeric;returned=(input->>'returned')::numeric;output=(input->>'output')::numeric;
 if used is null or waste is null or returned is null or output is null or least(used,waste,returned,output)<0 or (used+waste+returned+output)::text in('NaN','Infinity') or used+waste+returned<=0 then raise exception 'Enter nonnegative usage, wastage, return and output quantities';end if;
 remaining=(doc.payload->>'remaining')::numeric-used-waste-returned;
 if remaining<0 then raise exception 'Used + Wastage + Returned exceeds stock outstanding at vendor';end if;
 if coalesce((input->>'close')::boolean,false) and remaining<>0 then raise exception 'Issued must equal Used + Wastage + Returned to close this job';end if;
 if output>0 then m=gr_production_private.material(c,input->>'sfg_id');if m->>'type'<>'SFG' or used<=0 then raise exception 'Select an SFG output and actual raw material used';end if;end if;
 id=gen_random_uuid();num=gr_production_private.number('JWR',c);
 if returned>0 then perform gr_production_private.post(c,id,doc.payload->>'material_id',returned,'JOB_RETURN',num);end if;
 if output>0 then
 reqs=gr_production_private.sfg_requirements(c,input->>'sfg_id',output);
 if not exists(select 1 from jsonb_array_elements(reqs)x where x->>'material_id'=doc.payload->>'material_id') then raise exception 'Issued raw material is not part of the selected SFG BOM';end if;
 for line in select value from jsonb_array_elements(reqs) loop
 if line->>'material_id'=doc.payload->>'material_id' then
 if used<(line->>'quantity')::numeric then raise exception 'Actual usage is less than the BOM requirement for this SFG output';end if;
 else perform gr_production_private.post(c,id,line->>'material_id',-(line->>'quantity')::numeric,'JOB_OTHER_RM_USE',num);end if;
 end loop;
 perform gr_production_private.post(c,id,input->>'sfg_id',output,'JOB_SFG',num);
 end if;
 insert into public.gr_production_events(company_id,document_id,material_id,movement,quantity,reference,actor) values(c,id,doc.payload->>'material_id','JOB_USED',used,num,auth.uid()),(c,id,doc.payload->>'material_id','WASTAGE',waste,num,auth.uid());
 insert into public.gr_production_documents(company_id,id,kind,number,status,payload,created_by) values(c,id,'return',num,'Posted',jsonb_build_object('job_id',doc.id,'stn',doc.number,'material_id',doc.payload->>'material_id','allotted',used+waste,'used',used,'waste',waste,'returned',returned,'output',output,'sfg_id',input->>'sfg_id','note',input->>'note'),auth.uid());
 payload=doc.payload||jsonb_build_object('used',(doc.payload->>'used')::numeric+used,'waste',(doc.payload->>'waste')::numeric+waste,'returned',(doc.payload->>'returned')::numeric+returned,'output',(doc.payload->>'output')::numeric+output,'remaining',remaining);
 new_status=case when remaining=0 then 'Completed' else 'Partly completed' end;
 update public.gr_production_documents set payload=body.payload,status=new_status,updated_at=now() where company_id=c and public.gr_production_documents.id=doc.id;result=jsonb_build_object('number',num,'remaining',remaining,'status',new_status);
 elsif action='sfg_assemble' then
 select payload into m from public.gr_ops_records where company_id=c and kind='material' and record_id=input->>'sfg_id' for update;
 amount=(input->>'quantity')::numeric;reqs=gr_production_private.sfg_requirements(c,input->>'sfg_id',amount);
 if exists(select 1 from jsonb_array_elements(reqs)x where (x->>'shortage')::numeric>0) then raise exception 'Raw-material shortage. All BOM components are required to assemble this SFG';end if;
 id=gen_random_uuid();num=gr_production_private.number('SFG',c);
 for line in select value from jsonb_array_elements(reqs) loop perform gr_production_private.post(c,id,line->>'material_id',-(line->>'quantity')::numeric,'SFG_RM_USE',num);end loop;
 perform gr_production_private.post(c,id,input->>'sfg_id',amount,'SFG_ASSEMBLY',num);
 insert into public.gr_production_documents(company_id,id,kind,number,status,payload,created_by) values(c,id,'assembly',num,'Posted',jsonb_build_object('sfg_id',input->>'sfg_id','sfg_name',m->>'name','quantity',amount,'requirements',reqs,'note',input->>'note'),auth.uid());
 result=jsonb_build_object('number',num,'sfg_added',amount);
 elsif action='quality_move' then
 amount=(input->>'quantity')::numeric;
 select payload into product from public.gr_crm_records where company_id=c and kind='products' and record_id=input->>'product_id' for update;
 reqs=gr_production_private.requirements(c,input->>'product_id',amount);
 if exists(select 1 from jsonb_array_elements(reqs)x where (x->>'shortage')::numeric>0) then raise exception 'SFG shortage. Refresh readiness before moving to Quality';end if;
 if exists(select 1 from public.gr_pilot_products where company_id=c and crm_product_id=input->>'product_id') then raise exception 'Pilot products cannot use live production';end if;
 select checklist into checks from public.gr_production_settings where company_id=c;
 id=gen_random_uuid();num=gr_production_private.number('QC',c);
 for line in select value from jsonb_array_elements(reqs) loop perform gr_production_private.post(c,id,line->>'material_id',-(line->>'quantity')::numeric,'QUALITY_ISSUE',num);end loop;
 insert into public.gr_production_documents(company_id,id,kind,number,status,payload,created_by) values(c,id,'qc',num,'Pending',jsonb_build_object('product_id',input->>'product_id','product_name',product->>'name','quantity',amount,'requirements',reqs,'checklist',checks),auth.uid());result=jsonb_build_object('number',num,'id',id);
 elsif action='quality_accept' then
 if doc.kind<>'qc' or doc.status<>'Pending' then raise exception 'This quality batch is already posted or unavailable';end if;
 passed=(input->>'accepted')::numeric;rejected=(input->>'rejected')::numeric;
 if passed is null or rejected is null or least(passed,rejected)<0 or passed<>trunc(passed) or rejected<>trunc(rejected) or passed+rejected<>(doc.payload->>'quantity')::numeric then raise exception 'Accepted + Rejected must equal batch quantity';end if;
 for check_item in select value from jsonb_array_elements(doc.payload->'checklist') loop if not coalesce((input->'checks') @> jsonb_build_array(check_item),false) then raise exception 'Complete every quality checklist item';end if;end loop;
 if rejected>0 and input->>'disposition' not in('Rework','Scrap') then raise exception 'Choose Rework or Scrap for rejected items';end if;
 select payload into product from public.gr_crm_records where company_id=c and kind='products' and record_id=doc.payload->>'product_id' for update;
 if product is null then raise exception 'Finished product no longer exists';end if;
 if passed>0 then
 update public.gr_crm_records set payload=jsonb_set(product,'{stock}',to_jsonb(coalesce((product->>'stock')::numeric,0)+passed)),updated_at=now() where company_id=c and kind='products' and record_id=doc.payload->>'product_id';
 insert into public.gr_production_events(company_id,document_id,product_id,movement,quantity,reference,actor) values(c,doc.id,doc.payload->>'product_id','FINISHED_QC',passed,doc.number,auth.uid());end if;
 if rejected>0 then id=gen_random_uuid();num=gr_production_private.number('REWORK',c);insert into public.gr_production_documents(company_id,id,kind,number,status,payload,created_by) values(c,id,'rework',num,case when input->>'disposition'='Scrap' then 'Scrapped' else 'Pending' end,jsonb_build_object('qc_id',doc.id,'product_id',doc.payload->>'product_id','product_name',doc.payload->>'product_name','quantity',rejected,'remarks',input->>'remarks'),auth.uid());end if;
 update public.gr_production_documents set status='Accepted',payload=doc.payload||jsonb_build_object('accepted',passed,'rejected',rejected,'disposition',input->>'disposition','checks',input->'checks','remarks',input->>'remarks','accepted_by',auth.uid(),'accepted_at',now()),updated_at=now() where company_id=c and public.gr_production_documents.id=doc.id;result=jsonb_build_object('number',doc.number,'inventory_added',passed,'rejected',rejected);
 elsif action in('rework_retry','rework_scrap') then
 if doc.kind<>'rework' or doc.status<>'Pending' then raise exception 'Rework is not pending';end if;
 if action='rework_retry' then
 select checklist into checks from public.gr_production_settings where company_id=c;id=gen_random_uuid();num=gr_production_private.number('QC',c);
 insert into public.gr_production_documents(company_id,id,kind,number,status,payload,created_by) values(c,id,'qc',num,'Pending',doc.payload||jsonb_build_object('checklist',checks,'requirements','[]'::jsonb,'rework_id',doc.id),auth.uid());end if;
 update public.gr_production_documents set status=case when action='rework_retry' then 'Sent to Quality' else 'Scrapped' end,updated_at=now() where company_id=c and public.gr_production_documents.id=doc.id;result=jsonb_build_object('message','Rework updated','number',num);
 else raise exception 'Unknown production action';end if;
 insert into gr_production_private.requests values(c,request_id,action,input,result,auth.uid());return result;
 end $$;
revoke all on all functions in schema gr_production_private from public,anon,authenticated;
grant execute on function gr_production_private.allowed(text,text,text),gr_production_private.command(text,text,jsonb,uuid) to authenticated;
create function public.gr_production_action(p_company text,p_action text,p_input jsonb,p_request uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select gr_production_private.command(p_company,p_action,p_input,p_request); $$;
revoke all on function public.gr_production_action(text,text,jsonb,uuid) from public,anon;
grant execute on function public.gr_production_action(text,text,jsonb,uuid) to authenticated;
do $$declare t text;begin foreach t in array array['gr_production_balances','gr_production_documents','gr_production_events','gr_production_settings'] loop if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;end loop;end $$;
