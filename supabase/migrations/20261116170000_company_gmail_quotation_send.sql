-- Company-scoped Gmail quotation sending with private credential storage.
-- No existing quotation, customer, stock or sales tables are modified.
create table if not exists public.gr_gmail_connections (
 company_id text primary key references public.gr_companies(id),
 sender_email text not null default '',
 status text not null default 'disconnected' check(status in ('connected','disconnected','needs_reconnect')),
 connected_by uuid references public.gr_profiles(id),
 connected_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.gr_gmail_connections enable row level security;
revoke all on public.gr_gmail_connections from public,anon,authenticated;
grant select on public.gr_gmail_connections to authenticated;
create policy gr_gmail_company_read on public.gr_gmail_connections for select to authenticated
 using(public.gr_crm_can(company_id,'sales','view'));

-- SECURITY: never grant client roles access to OAuth refresh tokens or pending states.
create table if not exists public.gr_gmail_private_tokens (
 company_id text primary key references public.gr_companies(id),
 encrypted_refresh_token text not null,
 updated_at timestamptz not null default now()
);
alter table public.gr_gmail_private_tokens enable row level security;
revoke all on public.gr_gmail_private_tokens from public,anon,authenticated;

create table if not exists public.gr_gmail_oauth_states (
 nonce text primary key,
 company_id text not null references public.gr_companies(id),
 initiated_by uuid not null references public.gr_profiles(id),
 code_verifier text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.gr_gmail_oauth_states enable row level security;
revoke all on public.gr_gmail_oauth_states from public,anon,authenticated;

create table if not exists public.gr_quotation_email_templates (
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 name text not null check(length(btrim(name)) between 1 and 120),
 subject text not null default '',
 body text not null default '',
 is_default boolean not null default false,
 created_by uuid references public.gr_profiles(id),
 updated_at timestamptz not null default now()
);
alter table public.gr_quotation_email_templates enable row level security;
revoke all on public.gr_quotation_email_templates from public,anon,authenticated;
grant select,insert,update,delete on public.gr_quotation_email_templates to authenticated;
create policy gr_qemail_template_read on public.gr_quotation_email_templates for select to authenticated
 using(public.gr_crm_can(company_id,'sales','view'));
create policy gr_qemail_template_insert on public.gr_quotation_email_templates for insert to authenticated
 with check(public.gr_field_is_admin(company_id) and created_by=auth.uid());
create policy gr_qemail_template_update on public.gr_quotation_email_templates for update to authenticated
 using(public.gr_field_is_admin(company_id)) with check(public.gr_field_is_admin(company_id));
create policy gr_qemail_template_delete on public.gr_quotation_email_templates for delete to authenticated
 using(public.gr_field_is_admin(company_id));

create table if not exists public.gr_quotation_email_history (
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 quotation_id uuid not null references public.gr_quotations(id),
 customer_id uuid references public.gr_crm_customers(id),
 request_key uuid not null,
 sender_email text not null,
 recipients text[] not null,
 cc text[] not null default '{}',
 subject text not null,
 body text not null,
 product_ids text[] not null default '{}',
 pdf_path text,
 pdf_sha256 text,
 pdf_bytes integer,
 gmail_message_id text,
 gmail_thread_id text,
 status text not null default 'sending' check(status in ('sending','sent','failed','needs_review')),
 failure_reason text,
 sent_by uuid not null references public.gr_profiles(id),
 attempted_at timestamptz not null default now(),
 sent_at timestamptz,
 unique(company_id,request_key)
);
create index if not exists gr_qemail_customer_history on public.gr_quotation_email_history(company_id,customer_id,attempted_at desc);
create index if not exists gr_qemail_quote_history on public.gr_quotation_email_history(quotation_id,attempted_at desc);
create index if not exists gr_qemail_product_history on public.gr_quotation_email_history using gin(product_ids);
alter table public.gr_quotation_email_history enable row level security;
revoke all on public.gr_quotation_email_history from public,anon,authenticated;
grant select on public.gr_quotation_email_history to authenticated;
create policy gr_qemail_history_read on public.gr_quotation_email_history for select to authenticated
 using(public.gr_crm_can(company_id,'sales','view'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('gr-quotation-pdfs','gr-quotation-pdfs',false,10485760,array['application/pdf'])
 on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf'];
-- Client-side Storage access intentionally denied. Edge function uses server credentials.
