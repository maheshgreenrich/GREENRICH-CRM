-- System-generated, clearly labeled example. No live commercial stock changes.
do $seed$
declare v_prod uuid; v_order uuid; v_vendor text; v_steps text[];
  v_step text; v_details jsonb; v_note text;
begin
 select id,steps into v_prod,v_steps from public.gr_pilot_products
 where company_id='grow-india' and sku='PILOT-HOME-40';
 if v_prod is null then raise exception 'Pilot product not installed';end if;
 if exists(select 1 from public.gr_pilot_orders where product_id=v_prod and customer_name='[TEST] Completed System Walkthrough')
 then return;end if;
 select record_id into v_vendor from public.gr_ops_records
 where company_id='grow-india' and kind='vendor' and record_id='vendor-sivaji-enterprises';
 if v_vendor is null then raise exception 'Reference vendor missing';end if;
 insert into public.gr_pilot_orders(company_id,product_id,customer_name,qty,cursor,status)
 values('grow-india',v_prod,'[TEST] Completed System Walkthrough',1,array_length(v_steps,1),'COMPLETED')
 returning id into v_order;
 insert into public.gr_pilot_pos(company_id,order_id,vendor_id,number)
 values('grow-india',v_order,v_vendor,'PILOT-PO-'||left(v_order::text,8));
 insert into public.gr_pilot_material_events(company_id,order_id,location,movement,qty_change)
 values
 ('grow-india',v_order,'WAREHOUSE','RM_RECEIPT',50.000),
 ('grow-india',v_order,'WAREHOUSE','ISSUE',-50.000),
 ('grow-india',v_order,'VENDOR','ISSUE',50.000),
 ('grow-india',v_order,'VENDOR','CONSUMED',-8.000),
 ('grow-india',v_order,'VENDOR','SCRAP',-2.000);
 insert into public.gr_pilot_stock_events(company_id,product_id,order_id,movement,qty_change)
 values('grow-india',v_prod,v_order,'QC_ACCEPTED',1),
       ('grow-india',v_prod,v_order,'PILOT_DISPATCH',-1);
 insert into public.gr_pilot_service(company_id,order_id,ticket,details,status)
 values('grow-india',v_order,'PILOT-SVC-'||left(v_order::text,8),
 '[SYSTEM EXAMPLE] Installation/service ticket created after test dispatch','OPEN');
 foreach v_step in array v_steps loop
   v_details:='{}'::jsonb;
   if v_step='VENDOR_PO' then v_details:=jsonb_build_object('vendor_id',v_vendor);end if;
   if v_step='RM_RECEIPT' then v_details:='{"received_kg":50}'::jsonb;end if;
   if v_step='ISSUE' then v_details:='{"issued":50}'::jsonb;end if;
   if v_step='JOBWORK' then v_details:='{"issued":50,"net_used":8,"scrap":2,"vendor_balance":40,"returned":0}'::jsonb;end if;
   if v_step='RECEIVE' then v_details:='{"accepted_qty":1}'::jsonb;end if;
   if v_step='INSPECTION' or v_step='QC' then v_details:='{"result":"PASS"}'::jsonb;end if;
   v_note:='[SYSTEM-GENERATED EXAMPLE] '||replace(v_step,'_',' ')||' — demonstration, not real work';
   insert into public.gr_pilot_events(company_id,order_id,step,note,details,actor)
   values('grow-india',v_order,v_step,v_note,v_details,null);
 end loop;
end $seed$;
