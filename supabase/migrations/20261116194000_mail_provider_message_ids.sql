alter table public.gr_contact_email_history add column if not exists provider_message_id text;
alter table public.gr_quotation_email_history add column if not exists provider_message_id text;
