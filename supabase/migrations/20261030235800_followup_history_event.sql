alter table public.gr_lead_stage_history
 drop constraint if exists gr_lead_stage_history_event_type_check;
alter table public.gr_lead_stage_history
 add constraint gr_lead_stage_history_event_type_check
 check (event_type in ('CREATED','ASSIGNED','STAGE_CHANGED','CUSTOMER_LINKED','FOLLOWUP'));