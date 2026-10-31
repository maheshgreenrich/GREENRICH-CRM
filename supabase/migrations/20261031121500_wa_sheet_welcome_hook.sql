-- Permit salespeople with Leads view access to read available provider template names.
create policy gr_wa_templates_lead_selector on public.gr_wa_templates for select to authenticated
using (exists(
 select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
 where p.id=(select auth.uid()) and p.active and gr_wa_templates.company_id=any(p.company_ids)
   and (r.name='Admin' or exists(select 1 from public.gr_role_permissions rights
     where rights.role_id=p.role_id and rights.module='leads' and rights.action='view' and rights.allowed))
));
-- Google Sheet importer writes an import row after creating its lead. Copy only selected
-- template preferences, never enqueue or dispatch a WhatsApp message.
create or replace function public.gr_wa_sheet_welcome_capture()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_template uuid;
begin
 if new.lead_id is null or nullif(new.company_id,'') is null then return new;end if;
 select welcome_template_id into v_template from public.gr_sheet_connections
 where id=new.connection_id and company_id=new.company_id;
 if v_template is null then return new;end if;
 if not exists(select 1 from public.gr_wa_templates
  where id=v_template and company_id=new.company_id) then return new;end if;
 insert into public.gr_wa_lead_welcome(company_id,lead_id,template_id,status)
 values(new.company_id,new.lead_id,v_template,'awaiting_provider')
 on conflict (company_id,lead_id) do nothing;
 return new;
end $$;
revoke all on function public.gr_wa_sheet_welcome_capture() from public,anon,authenticated;
drop trigger if exists gr_wa_sheet_welcome_import on public.gr_sheet_import_rows;
create trigger gr_wa_sheet_welcome_import after insert or update of lead_id on public.gr_sheet_import_rows
for each row execute function public.gr_wa_sheet_welcome_capture();
