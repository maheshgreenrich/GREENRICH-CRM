-- Harden the legacy CRM storage so lead assignments cannot be bypassed by direct
-- Data API writes. Other record kinds keep their existing permission behavior.
-- The pipeline security-definer RPCs are the only lead writers.
drop policy if exists "authorized employees read assigned crm" on public.gr_crm_records;
create policy "authorized employees read assigned crm" on public.gr_crm_records
for select to authenticated using (
 public.gr_crm_can(company_id,kind,'view') and
 (kind <> 'leads' or exists(
   select 1 from public.gr_lead_pipeline p
   where p.company_id=gr_crm_records.company_id and p.lead_id=gr_crm_records.record_id
   and public.gr_lead_can(p.company_id,p.assigned_to,'view')
 ))
);
drop policy if exists "authorized employees add crm" on public.gr_crm_records;
create policy "authorized employees add crm" on public.gr_crm_records
for insert to authenticated with check (kind<>'leads' and public.gr_crm_can(company_id,kind,'insert'));
drop policy if exists "authorized employees update crm" on public.gr_crm_records;
create policy "authorized employees update crm" on public.gr_crm_records
for update to authenticated
using(kind<>'leads' and public.gr_crm_can(company_id,kind,'update'))
with check(kind<>'leads' and public.gr_crm_can(company_id,kind,'update'));
drop policy if exists "authorized employees delete crm" on public.gr_crm_records;
create policy "authorized employees delete crm" on public.gr_crm_records
for delete to authenticated using (kind<>'leads' and public.gr_crm_can(company_id,kind,'delete'));
-- Prevent pre-existing service-style scripts from editing leads through normal RLS.
-- PostgreSQL SECURITY DEFINER RPCs from 001 run as the schema owner and are permitted.
