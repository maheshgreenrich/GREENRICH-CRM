-- SocialBerries provider bulk batch summary/history. Read through admin-only Edge gateway.
create table if not exists public.gr_wa_bulk_batches (
 company_id text not null references public.gr_companies(id),
 connection_id uuid not null references public.gr_wa_connections(id),
 provider_batch_id uuid not null,
 name text not null default '',
 phone_number_id text not null default '',
 status text not null default 'unknown',
 total_clients_count integer not null default 0 check(total_clients_count>=0),
 total_batches_count integer not null default 0 check(total_batches_count>=0),
 completed_clients_count integer not null default 0 check(completed_clients_count>=0),
 mmlite boolean not null default false,
 provider_created_at timestamptz,
 provider_updated_at timestamptz,
 message_statistics jsonb,
 synced_at timestamptz not null default now(),
 primary key(company_id,connection_id,provider_batch_id)
);
create index if not exists gr_wa_bulk_batches_recent on public.gr_wa_bulk_batches(company_id,connection_id,synced_at desc);
alter table public.gr_wa_bulk_batches enable row level security;
revoke all on public.gr_wa_bulk_batches from public,anon,authenticated;
-- The authenticated caller is verified as company Admin by greenrich-socialberries.
-- Only the service-role Edge function writes or retrieves these snapshots.
