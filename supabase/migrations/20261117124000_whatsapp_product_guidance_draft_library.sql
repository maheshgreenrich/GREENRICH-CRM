-- WhatsApp Marketing product-specific guidance drafts and website WhatsApp OTP routing.
-- No WhatsApp sending, webhook capture or customer notifications are activated here.
create table if not exists public.gr_wa_guidance_steps (
 id uuid primary key default gen_random_uuid(),
 company_id text not null check(company_id in ('grow-india','enviro-solutions')),
 product_label text not null check(length(btrim(product_label)) between 2 and 120),
 day_offset integer not null check(day_offset between 0 and 365),
 title text not null check(length(btrim(title)) between 2 and 160),
 instructions text not null check(length(btrim(instructions)) between 5 and 4000),
 video_url text not null default '' check(length(video_url)<=1500),
 template_id uuid references public.gr_wa_templates(id) on delete set null,
 status text not null default 'draft' check(status in ('draft','paused')),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,product_label,day_offset,title)
);
create index if not exists gr_wa_guidance_company_product
 on public.gr_wa_guidance_steps(company_id,product_label,day_offset);
alter table public.gr_wa_guidance_steps enable row level security;
revoke all on public.gr_wa_guidance_steps from public,anon;
grant select,insert,update,delete on public.gr_wa_guidance_steps to authenticated;
drop policy if exists gr_wa_guidance_read on public.gr_wa_guidance_steps;
create policy gr_wa_guidance_read on public.gr_wa_guidance_steps for select to authenticated
 using(public.gr_wa_allowed(company_id,'view'));
drop policy if exists gr_wa_guidance_insert on public.gr_wa_guidance_steps;
create policy gr_wa_guidance_insert on public.gr_wa_guidance_steps for insert to authenticated
 with check(public.gr_wa_admin(company_id) and status='draft'
 and (template_id is null or exists(select 1 from public.gr_wa_templates t where t.id=template_id and t.company_id=gr_wa_guidance_steps.company_id)));
drop policy if exists gr_wa_guidance_update on public.gr_wa_guidance_steps;
create policy gr_wa_guidance_update on public.gr_wa_guidance_steps for update to authenticated
 using(public.gr_wa_admin(company_id))
 with check(public.gr_wa_admin(company_id) and status in ('draft','paused')
 and (template_id is null or exists(select 1 from public.gr_wa_templates t where t.id=template_id and t.company_id=gr_wa_guidance_steps.company_id)));
drop policy if exists gr_wa_guidance_delete on public.gr_wa_guidance_steps;
create policy gr_wa_guidance_delete on public.gr_wa_guidance_steps for delete to authenticated
 using(public.gr_wa_admin(company_id));
alter table public.gr_wa_inbound_rules drop constraint if exists gr_wa_inbound_rules_event_type_check;
alter table public.gr_wa_inbound_rules add constraint gr_wa_inbound_rules_event_type_check
 check(event_type in ('whatsapp_enquiry','website_enquiry','website_whatsapp_otp'));
