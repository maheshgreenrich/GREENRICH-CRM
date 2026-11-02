begin;
do $$
declare actor uuid;co text='grow-india';r jsonb;rw1 text;rw2 text;sfg text;seed text='sfg-test-'||gen_random_uuid();req uuid;job uuid;failed boolean;before_qty numeric;
begin
 select p.id into actor from gr_profiles p join gr_roles r on p.role_id=r.id where r.name='Admin' and p.active and co=any(p.company_ids) limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 r=gr_production_action(co,'material_save',jsonb_build_object('material',jsonb_build_object('code',seed||'-R1','name','Raw one','type','RW','uom','kg','has_job_work',true)),gen_random_uuid());rw1=r->>'material_id';
 r=gr_production_action(co,'material_save',jsonb_build_object('material',jsonb_build_object('code',seed||'-R2','name','Raw two','type','RM','uom','nos')),gen_random_uuid());rw2=r->>'material_id';
 failed=false;begin perform gr_production_action(co,'material_save',jsonb_build_object('material',jsonb_build_object('code',seed||'-INVALID','name','Empty recipe','type','SFG','uom','nos')),gen_random_uuid());exception when others then failed=true;end;if not failed then raise exception 'Empty SFG recipe allowed';end if;
 r=gr_production_action(co,'material_save',jsonb_build_object('material',jsonb_build_object('code',seed||'-S1','name','Assembly','type','SFG','uom','nos','rm_bom',jsonb_build_array(jsonb_build_object('material_id',rw1,'quantity',6),jsonb_build_object('material_id',rw2,'quantity',2)))),gen_random_uuid());sfg=r->>'material_id';
 perform gr_production_action(co,'opening',jsonb_build_object('material_id',rw1,'quantity',50,'note','Test count'),gen_random_uuid());
 r=gr_production_action(co,'sfg_readiness',jsonb_build_object('sfg_id',sfg,'quantity',1));if not exists(select 1 from jsonb_array_elements(r)x where x->>'material_id'=rw2 and (x->>'shortage')::numeric=2) then raise exception 'Missing second RM not identified';end if;
 failed=false;begin perform gr_production_action(co,'sfg_assemble',jsonb_build_object('sfg_id',sfg,'quantity',1),gen_random_uuid());exception when others then failed=true;end;if not failed then raise exception 'Assembly allowed with missing RM';end if;
 select quantity into before_qty from gr_production_balances where company_id=co and material_id=rw1;if before_qty<>50 then raise exception 'Failed assembly partially consumed first RM';end if;
 perform gr_production_action(co,'opening',jsonb_build_object('material_id',rw2,'quantity',10,'note','Test count'),gen_random_uuid());
 req=gen_random_uuid();r=jsonb_build_object('sfg_id',sfg,'quantity',2,'note','Assembled two');perform gr_production_action(co,'sfg_assemble',r,req);perform gr_production_action(co,'sfg_assemble',r,req);
 if (select quantity from gr_production_balances where company_id=co and material_id=rw1)<>38 or (select quantity from gr_production_balances where company_id=co and material_id=rw2)<>6 or (select quantity from gr_production_balances where company_id=co and material_id=sfg)<>2 then raise exception 'Assembly consumption or idempotency incorrect';end if;
 -- Issue 20 kg, use 6, waste 1, return 13; output one SFG also needs 2 of RM2.
 r=gr_production_action(co,'job_issue',jsonb_build_object('material_id',rw1,'vendor_id',(select record_id from gr_ops_records where company_id=co and kind='vendor' limit 1),'quantity',20,'work','Test work','due_on','2026-11-10'),gen_random_uuid());job=(r->>'id')::uuid;
 perform gr_production_action(co,'job_accept',jsonb_build_object('id',job,'sfg_id',sfg,'output',1,'used',6,'waste',1,'returned',13,'close',true),gen_random_uuid());
 if (select quantity from gr_production_balances where company_id=co and material_id=rw1)<>31 or (select quantity from gr_production_balances where company_id=co and material_id=rw2)<>4 or (select quantity from gr_production_balances where company_id=co and material_id=sfg)<>3 then raise exception 'Job-work SFG recipe consumed incorrect materials';end if;
 failed=false;begin perform gr_production_action(co,'material_save',jsonb_build_object('material',jsonb_build_object('code',seed||'-LOOP','name','Invalid self recipe','type','SFG','uom','nos','rm_bom',jsonb_build_array(jsonb_build_object('material_id',sfg,'quantity',1)))),gen_random_uuid());exception when others then failed=true;end;if not failed then raise exception 'Nested/self SFG in RM recipe allowed';end if;
 failed=false;begin perform gr_production_action(co,'sfg_assemble',jsonb_build_object('sfg_id',sfg,'quantity',0),gen_random_uuid());exception when others then failed=true;end;if not failed then raise exception 'Zero output allowed';end if;
end $$;
select 'PASS: multiple-RM SFG recipes, missing-stock rollback, per-unit multiplication, duplicate retry, job-work extra components without double deduction' as result;
rollback;
