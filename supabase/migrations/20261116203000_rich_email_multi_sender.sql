-- Multiple company Gmail sender identities and rich email send audit.
-- Existing one-per-company Gmail credentials remain untouched as the "primary" identity.
create table if not exists public.gr_gmail_sender_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.gr_companies(id),
  sender_email text not null,
  encrypted_refresh_token text not null,
  status text not null default 'connected' check (status in ('connected','needs_reconnect','disconnected')),
  connected_by uuid references public.gr_profiles(id),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,sender_email)
);
create index if not exists gr_gmail_sender_accounts_company on public.gr_gmail_sender_accounts(company_id);
alter table public.gr_gmail_sender_accounts enable row level security;
revoke all on public.gr_gmail_sender_accounts from public,anon,authenticated;

alter table public.gr_gmail_oauth_states add column if not exists sender_account_id uuid;

alter table public.gr_contact_email_history add column if not exists to_recipients text[] not null default '{}'::text[];
alter table public.gr_contact_email_history add column if not exists cc text[] not null default '{}'::text[];
alter table public.gr_contact_email_history add column if not exists bcc text[] not null default '{}'::text[];
alter table public.gr_contact_email_history add column if not exists html_body text;
alter table public.gr_contact_email_history add column if not exists attachment_manifest jsonb not null default '[]'::jsonb;
alter table public.gr_contact_email_history add column if not exists sender_account_id uuid;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gr-mail-attachments','gr-mail-attachments',false,8388608,
 array['application/pdf','image/png','image/jpeg','image/webp','text/plain',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public=false,file_size_limit=8388608,
 allowed_mime_types=excluded.allowed_mime_types;
-- No client-side Storage policy. Function-only upload and signed download.
