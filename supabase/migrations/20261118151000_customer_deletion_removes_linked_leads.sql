-- Deleting a customer from the directory also removes only leads explicitly
-- linked through gr_lead_pipeline.customer_id, not leads sharing a phone/name.
-- Preserve sales orders, quotations, and field visits.
create or replace function public.gr_customer_remove_linked_leads()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 delete from public.gr_lead_stage_history h
 using public.gr_lead_pipeline l
 where l.customer_id=old.id and h.company_id=l.company_id and h.lead_id=l.lead_id;
 delete from public.gr_crm_records r
 using public.gr_lead_pipeline l
 where l.customer_id=old.id and r.company_id=l.company_id
   and r.kind='leads' and r.record_id=l.lead_id;
 delete from public.gr_lead_pipeline where customer_id=old.id;
 return old;
end $$;
drop trigger if exists gr_customer_delete_linked_leads on public.gr_crm_customers;
create trigger gr_customer_delete_linked_leads
before delete on public.gr_crm_customers
for each row execute function public.gr_customer_remove_linked_leads();
create or replace function public.gr_customer_remove_soft_deleted_leads()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if old.deleted_at is null and new.deleted_at is not null then
  delete from public.gr_lead_stage_history h
  using public.gr_lead_pipeline l
  where l.customer_id=new.id and h.company_id=l.company_id and h.lead_id=l.lead_id;
  delete from public.gr_crm_records r
  using public.gr_lead_pipeline l
  where l.customer_id=new.id and r.company_id=l.company_id
    and r.kind='leads' and r.record_id=l.lead_id;
  delete from public.gr_lead_pipeline where customer_id=new.id;
 end if;
 return new;
end $$;
drop trigger if exists gr_customer_soft_delete_linked_leads on public.gr_crm_customers;
create trigger gr_customer_soft_delete_linked_leads
before update of deleted_at on public.gr_crm_customers
for each row execute function public.gr_customer_remove_soft_deleted_leads();