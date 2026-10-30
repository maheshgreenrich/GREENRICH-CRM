-- Emergency rollback of lead-specific legacy RLS controls only.
-- Keeps pipeline tables/history and all lead records intact.
drop policy if exists "authorized employees read assigned crm" on public.gr_crm_records;
create policy "authorized employees read assigned crm" on public.gr_crm_records for select to authenticated
 using(public.gr_crm_can(company_id,kind,'view'));
drop policy if exists "authorized employees add crm" on public.gr_crm_records;
create policy "authorized employees add crm" on public.gr_crm_records for insert to authenticated
 with check(public.gr_crm_can(company_id,kind,'insert'));
drop policy if exists "authorized employees update crm" on public.gr_crm_records;
create policy "authorized employees update crm" on public.gr_crm_records for update to authenticated
 using(public.gr_crm_can(company_id,kind,'update'))
 with check(public.gr_crm_can(company_id,kind,'update'));
drop policy if exists "authorized employees delete crm" on public.gr_crm_records;
create policy "authorized employees delete crm" on public.gr_crm_records for delete to authenticated
 using(public.gr_crm_can(company_id,kind,'delete'));
