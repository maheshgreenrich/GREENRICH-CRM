-- CRM supports Gmail API, SMTP webmail, and optional Resend HTTP API per company.
-- Credentials are encrypted by the Edge Function using GR_GMAIL_TOKEN_KEY_B64.
create table if not exists public.gr_mail_transport_configs (
 company_id text primary key references public.gr_companies(id),
 transport text not null default 'gmail' check(transport in ('gmail','smtp','resend')),
 smtp_host text,
 smtp_port integer,
 smtp_user text,
 encrypted_smtp_password text,
 resend_domain text,
 encrypted_resend_api_key text,
 sender_email text,
 sender_name text,
 status text not null default 'not_configured' check(status in ('not_configured','configured','verified','error')),
 verified_at timestamptz,
 updated_at timestamptz not null default now(),
 updated_by uuid references public.gr_profiles(id)
);
alter table public.gr_mail_transport_configs enable row level security;
revoke all on public.gr_mail_transport_configs from public,anon,authenticated;
-- Only the server-side Edge Function may access transport details.
alter table public.gr_contact_email_history add column if not exists transport text;
alter table public.gr_contact_email_history add column if not exists provider_message_id text;
alter table public.gr_quotation_email_history add column if not exists transport text;
alter table public.gr_quotation_email_history add column if not exists provider_message_id text;
