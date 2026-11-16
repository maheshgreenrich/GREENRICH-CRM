-- CRM Settings-managed company OAuth client secrets and direct customer/lead email audit.
create table if not exists public.gr_gmail_oauth_configs (
 company_id text primary key references public.gr_companies(id),
 client_id text not null,
 encrypted_client_secret text not null,
 updated_by uuid not null references public.gr_profiles(id),
 updated_at timestamptz not null default now()
);
alter table public.gr_gmail_oauth_configs enable row level security;
revoke all on public.gr_gmail_oauth_configs from public,anon,authenticated;
create table if not exists public.gr_contact_email_history (
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 request_key uuid not null,
 recipient text not null,
 subject text not null,
 body text not null,
 contact_type text not null check(contact_type in ('customer','lead')),
 contact_id text not null,
 sender_email text not null,
 sent_by uuid not null references public.gr_profiles(id),
 gmail_message_id text,
 status text not null default 'sending' check(status in ('sending','sent','failed','needs_review')),
 failure_reason text,
 attempted_at timestamptz not null default now(),
 sent_at timestamptz,
 unique(company_id,request_key)
);
create index if not exists gr_contact_email_history_lookup on public.gr_contact_email_history(company_id,contact_type,contact_id,attempted_at desc);
alter table public.gr_contact_email_history enable row level security;
revoke all on public.gr_contact_email_history from public,anon,authenticated;
grant select on public.gr_contact_email_history to authenticated;
create policy gr_contact_email_history_read on public.gr_contact_email_history for select to authenticated
 using(public.gr_crm_can(company_id,'sales','view'));
