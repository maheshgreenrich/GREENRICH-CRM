-- Legacy CRM clients still issue a direct DELETE against gr_crm_customers.
-- Preserve pipeline, field visits, and quotation email history on that path.
-- Only the optional customer_id association is cleared.
alter table public.gr_lead_pipeline drop constraint if exists gr_lead_pipeline_customer_id_fkey;
alter table public.gr_lead_pipeline add constraint gr_lead_pipeline_customer_id_fkey foreign key (customer_id) references public.gr_crm_customers(id) on delete set null;
alter table public.gr_field_visits drop constraint if exists gr_field_visits_customer_id_fkey;
alter table public.gr_field_visits add constraint gr_field_visits_customer_id_fkey foreign key (customer_id) references public.gr_crm_customers(id) on delete set null;
alter table public.gr_quotation_email_history drop constraint if exists gr_quotation_email_history_customer_id_fkey;
alter table public.gr_quotation_email_history add constraint gr_quotation_email_history_customer_id_fkey foreign key (customer_id) references public.gr_crm_customers(id) on delete set null;