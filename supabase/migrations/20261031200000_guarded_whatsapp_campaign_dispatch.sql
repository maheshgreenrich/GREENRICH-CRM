-- Guarded WhatsApp dispatch and admin template attestation.
create unique index if not exists gr_wa_one_send_per_campaign_phone on public.gr_wa_messages(campaign_id,phone)
 where campaign_id is not null and direction='outbound';
alter table public.gr_wa_templates drop constraint if exists gr_wa_templates_provider_source_check;
alter table public.gr_wa_templates add constraint gr_wa_templates_provider_source_check
 check(provider_source in ('crm_draft','manual_reference','verified_provider','admin_confirmed'));
alter table public.gr_wa_campaigns drop constraint if exists gr_wa_campaigns_status_check;
alter table public.gr_wa_campaigns add constraint gr_wa_campaigns_status_check
 check(status in ('draft','paused','archived','sending','submitted'));
create table if not exists public.gr_wa_template_confirmations (
 id uuid primary key default gen_random_uuid(),company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 template_id uuid not null references public.gr_wa_templates(id),confirmed_by uuid not null references auth.users(id),
 confirmation_note text not null check(length(btrim(confirmation_note))>=10),
 provider_template_id text not null,created_at timestamptz not null default now()
);
alter table public.gr_wa_template_confirmations enable row level security;
revoke all on public.gr_wa_template_confirmations from anon;
grant select on public.gr_wa_template_confirmations to authenticated;
drop policy if exists gr_wa_template_confirmations_admin_select on public.gr_wa_template_confirmations;
create policy gr_wa_template_confirmations_admin_select on public.gr_wa_template_confirmations
 for select to authenticated using(public.gr_wa_admin(company_id));
