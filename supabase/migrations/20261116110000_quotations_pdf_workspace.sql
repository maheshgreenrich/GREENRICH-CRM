-- GREENRICH quotation drafts and customizable per-product layouts.
-- Does not change Sales Orders, invoices, inventory or existing document templates.
create table if not exists public.gr_quotation_templates (
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 product_id text,
 name text not null check (length(btrim(name)) between 1 and 120),
 config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
 created_by uuid not null default auth.uid() references public.gr_profiles(id),
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index if not exists gr_quote_templates_company_product on public.gr_quotation_templates(company_id,product_id);
alter table public.gr_quotation_templates enable row level security;
revoke all on public.gr_quotation_templates from public,anon;
grant select,insert,update,delete on public.gr_quotation_templates to authenticated;
create policy gr_quote_template_read on public.gr_quotation_templates
 for select to authenticated using (public.gr_crm_can(company_id,'sales','view'));
create policy gr_quote_template_create on public.gr_quotation_templates
 for insert to authenticated with check (public.gr_field_is_admin(company_id) and created_by=auth.uid());
create policy gr_quote_template_edit on public.gr_quotation_templates
 for update to authenticated using (public.gr_field_is_admin(company_id))
 with check (public.gr_field_is_admin(company_id));
create policy gr_quote_template_delete on public.gr_quotation_templates
 for delete to authenticated using (public.gr_field_is_admin(company_id));

create table if not exists public.gr_quotations (
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 quotation_no text not null check (length(btrim(quotation_no)) between 1 and 80),
 customer_id uuid references public.gr_crm_customers(id) on delete set null,
 template_id uuid references public.gr_quotation_templates(id) on delete set null,
 quotation_date date not null default current_date,
 valid_until date,
 status text not null default 'Draft' check (status in ('Draft','Sent','Accepted','Rejected','Expired')),
 payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
 created_by uuid not null default auth.uid() references public.gr_profiles(id),
 updated_by uuid not null default auth.uid() references public.gr_profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,quotation_no)
);
create index if not exists gr_quotations_company_date on public.gr_quotations(company_id,quotation_date desc);
alter table public.gr_quotations enable row level security;
revoke all on public.gr_quotations from public,anon;
grant select,insert,update,delete on public.gr_quotations to authenticated;
create policy gr_quotation_read on public.gr_quotations
 for select to authenticated using (public.gr_crm_can(company_id,'sales','view'));
create policy gr_quotation_create on public.gr_quotations
 for insert to authenticated with check
 (public.gr_crm_can(company_id,'sales','insert') and created_by=auth.uid() and updated_by=auth.uid());
create policy gr_quotation_edit on public.gr_quotations
 for update to authenticated using (public.gr_crm_can(company_id,'sales','update'))
 with check (public.gr_crm_can(company_id,'sales','update') and updated_by=auth.uid());
create policy gr_quotation_delete on public.gr_quotations
 for delete to authenticated using (public.gr_crm_can(company_id,'sales','delete'));
