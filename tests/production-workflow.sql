-- Run in a transaction and always roll back; no test products/stock persist.
begin;
do $$
declare actor uuid;old_role uuid;company text='grow-india';r jsonb;raw text;sfg text;pid text='production-test-'||gen_random_uuid();po uuid;job uuid;qc uuid;req uuid;stock numeric;batch_count int;err boolean;
begin
 select p.id,p.role_id into actor,old_role from public.gr_profiles p join public.gr_roles r on r.id=p.role_id where r.name='Admin' and p.active and company=any(p.company_ids) limit 1;
 if actor is null then raise exception 'Test requires existing company Admin';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 r=public.gr_production_action(company,'material_save',jsonb_build_object('material',jsonb_build_object('code',pid||'-RW','name','Test sheet','type','RW','uom','kg','has_job_work',true)),gen_random_uuid());raw=r->>'material_id';
 r=public.gr_production_action(company,'material_save',jsonb_build_object('material',jsonb_build_object('code',pid||'-SFG','name','Test part','type','SFG','uom','nos','has_job_work',false)),gen_random_uuid());sfg=r->>'material_id';
 insert into public.gr_crm_records(company_id,kind,record_id,payload) values(company,'products',pid,jsonb_build_object('id',pid,'name','Test assembly','sku',pid,'stock',4,'inventory_mode','bom','bom_components',jsonb_build_array(jsonb_build_object('material_id',sfg,'quantity',2))));
 r=public.gr_production_action(company,'po_create',jsonb_build_object('vendor_id',(select record_id from public.gr_ops_records where company_id=company and kind='vendor' limit 1),'lines',jsonb_build_array(jsonb_build_object('material_id',raw,'quantity',50,'rate',10,'gst',18),jsonb_build_object('material_id',sfg,'quantity',1,'rate',5,'gst',0))),gen_random_uuid());po=(r->>'id')::uuid;
 perform public.gr_production_action(company,'po_approve',jsonb_build_object('id',po),gen_random_uuid());
 perform public.gr_production_action(company,'po_send',jsonb_build_object('id',po),gen_random_uuid());
 req=gen_random_uuid();r=jsonb_build_object('id',po,'lines',jsonb_build_array(jsonb_build_object('index',0,'quantity',20)));
 perform public.gr_production_action(company,'po_receive',r,req);perform public.gr_production_action(company,'po_receive',r,req);
 select quantity into stock from public.gr_production_balances where company_id=company and material_id=raw;if stock<>20 then raise exception 'Duplicate receipt credited twice: %',stock;end if;
 err=false;begin perform public.gr_production_action(company,'po_receive',jsonb_build_object('id',po,'lines',jsonb_build_array(jsonb_build_object('index',0,'quantity',31))),gen_random_uuid());exception when others then err=true;end;if not err then raise exception 'Over receipt allowed';end if;
 perform public.gr_production_action(company,'po_receive',jsonb_build_object('id',po,'lines',jsonb_build_array(jsonb_build_object('index',0,'quantity',30),jsonb_build_object('index',1,'quantity',1))),gen_random_uuid());
 r=public.gr_production_action(company,'job_issue',jsonb_build_object('material_id',raw,'vendor_id',(select record_id from public.gr_ops_records where company_id=company and kind='vendor' limit 1),'quantity',50,'work','Test cutting','due_on','2026-11-10'),gen_random_uuid());job=(r->>'id')::uuid;
 err=false;begin perform public.gr_production_action(company,'job_accept',jsonb_build_object('id',job,'used',7,'waste',3,'returned',39,'output',3,'sfg_id',sfg,'close',true),gen_random_uuid());exception when others then err=true;end;if not err then raise exception 'Unbalanced job was closed';end if;
 -- Partial return first, then work completion: issued 50 = used 7 + waste 3 + return 40.
 perform public.gr_production_action(company,'job_accept',jsonb_build_object('id',job,'used',0,'waste',0,'returned',20,'output',0,'close',false),gen_random_uuid());
 perform public.gr_production_action(company,'job_accept',jsonb_build_object('id',job,'used',7,'waste',3,'returned',20,'output',3,'sfg_id',sfg,'close',true),gen_random_uuid());
 select quantity into stock from public.gr_production_balances where company_id=company and material_id=raw;if stock<>40 then raise exception 'Raw return expected 40, got %',stock;end if;
 select quantity into stock from public.gr_production_balances where company_id=company and material_id=sfg;if stock<>4 then raise exception 'SFG expected 4, got %',stock;end if;
 r=public.gr_production_action(company,'readiness',jsonb_build_object('product_id',pid,'quantity',3));if (r->0->>'shortage')::numeric<>2 then raise exception 'Readiness shortage incorrect';end if;
 err=false;begin perform public.gr_production_action(company,'quality_move',jsonb_build_object('product_id',pid,'quantity',3),gen_random_uuid());exception when others then err=true;end;if not err then raise exception 'Insufficient SFG allowed';end if;
 r=public.gr_production_action(company,'quality_move',jsonb_build_object('product_id',pid,'quantity',2),gen_random_uuid());qc=(r->>'id')::uuid;
 err=false;begin perform public.gr_production_action(company,'quality_accept',jsonb_build_object('id',qc,'accepted',1,'rejected',1,'disposition','Rework','checks','[]'::jsonb),gen_random_uuid());exception when others then err=true;end;if not err then raise exception 'Missing checklist accepted';end if;
 req=gen_random_uuid();r=jsonb_build_object('id',qc,'accepted',1,'rejected',1,'disposition','Rework','checks',jsonb_build_array('Damage check','Stickering','Labelling'));
 perform public.gr_production_action(company,'quality_accept',r,req);perform public.gr_production_action(company,'quality_accept',r,req);
 select (payload->>'stock')::numeric into stock from public.gr_crm_records where company_id=company and kind='products' and record_id=pid;if stock<>5 then raise exception 'QC expected existing 4 + accepted 1, got %',stock;end if;
 select count(*) into batch_count from public.gr_production_documents where company_id=company and kind='rework' and payload->>'product_id'=pid;if batch_count<>1 then raise exception 'Rework missing/duplicated';end if;
 update public.gr_profiles set role_id=(select id from public.gr_roles where name='Accounts') where id=actor;
 err=false;begin perform public.gr_production_action(company,'po_create','{}',gen_random_uuid());exception when others then err=true;end;if not err then raise exception 'Accounts could write PO';end if;
 update public.gr_profiles set role_id=(select id from public.gr_roles where name='Sales') where id=actor;
 err=false;begin perform public.gr_production_action(company,'readiness',jsonb_build_object('product_id',pid,'quantity',1));exception when others then err=true;end;if not err then raise exception 'Sales could read production';end if;
 update public.gr_profiles set role_id=old_role where id=actor;
 err=false;begin perform public.gr_production_action('not-assigned','readiness','{}');exception when others then err=true;end;if not err then raise exception 'Cross-company access allowed';end if;
 raise notice 'PASS: partial receipts, idempotency, 50=7+3+40, SFG, shortages, QC existing+accepted, rework, role/company isolation';
end $$;
-- Exercise actual RLS with the database authenticated role, not just the RPC checks.
update public.gr_profiles set role_id=(select id from public.gr_roles where name='Accounts') where id=auth.uid();
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.gr_production_documents where kind='po') then raise exception 'Accounts cannot read PO';end if;
 if exists(select 1 from public.gr_production_documents where kind in('job','qc')) or exists(select 1 from public.gr_production_balances) then raise exception 'Accounts saw restricted stock data';end if;
 if has_table_privilege('authenticated','public.gr_production_balances','INSERT') or has_function_privilege('anon','public.gr_production_action(text,text,jsonb,uuid)','EXECUTE') then raise exception 'Unsafe public write grants';end if;
end $$;
reset role;
update public.gr_profiles set role_id=(select id from public.gr_roles where name='Sales') where id=auth.uid();
set local role authenticated;
do $$begin
 if exists(select 1 from public.gr_production_documents) or exists(select 1 from public.gr_production_events) or exists(select 1 from public.gr_production_balances) then raise exception 'Sales saw production/cost data';end if;
end $$;
reset role;
select 'PASS: production acceptance suite and direct authenticated RLS checks; all fixture changes rolled back' as result;
rollback;
