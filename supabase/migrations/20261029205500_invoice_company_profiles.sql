-- Shared invoice seller details for GreenRich ONE.
-- Source for Grow India defaults: user-provided Sales_1770.pdf; verify before issuing.
-- Attendance is intentionally untouched.
create table if not exists public.gr_invoice_profiles (
 company_id text primary key check (company_id in ('grow-india','enviro-solutions')),
 legal_name text not null default '', address text not null default '',
 city_state_pincode text not null default '', phone text not null default '',
 email text not null default '', gstin text not null default '',
 pan text not null default '', state_name text not null default '',
 state_code text not null default '', bank_name text not null default '',
 bank_account text not null default '', bank_ifsc text not null default '',
 bank_branch text not null default '', default_freight_hsn text not null default '996511',
 default_declaration text not null default '', signatory text not null default 'Authorised Signatory',
 updated_at timestamptz not null default now()
);
alter table public.gr_invoice_profiles enable row level security;
create policy "Employee reads authorized company invoice settings" on public.gr_invoice_profiles
 for select to authenticated
 using ((select public.gr_is_admin()) or
  ((select public.gr_crm_active_employee()) and exists(
   select 1 from public.gr_profiles p
   where p.id=(select auth.uid()) and p.active
     and gr_invoice_profiles.company_id=any(p.company_ids))));
create policy "Admin inserts invoice settings" on public.gr_invoice_profiles
 for insert to authenticated with check ((select public.gr_is_admin()));
create policy "Admin updates invoice settings" on public.gr_invoice_profiles
 for update to authenticated using ((select public.gr_is_admin())) with check ((select public.gr_is_admin()));
grant select,insert,update on public.gr_invoice_profiles to authenticated;
insert into public.gr_invoice_profiles
 (company_id,legal_name,address,city_state_pincode,phone,email,gstin,pan,state_name,state_code,
  bank_name,bank_account,bank_ifsc,bank_branch,default_freight_hsn,default_declaration)
 values ('grow-india','GREENRICH GROW INDIA PRIVATE LIMITED','No. 3&4, Vellalar Street',
 'Ayanambakkam, Chennai - 600095','95000 90619','solutions@mygreenbin.in',
 '33AAGCG9221N1ZD','AAGCG9221N','Tamil Nadu','33','Bank of Baroda',
 '43770500000106','BARB0MADTHI','Maduravayal','996511',
 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.'),
 ('enviro-solutions','GREENRICH ENVIRO SOLUTIONS PVT LTD','','','','','','','','','','','','','996511','')
 on conflict(company_id) do nothing;
