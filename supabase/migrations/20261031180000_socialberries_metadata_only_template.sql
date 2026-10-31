-- Allow a *metadata-only* reference to an existing SocialBerries template.
-- A screenshot shows its ID, name, category, language and APPROVED status,
-- but NOT its approved text or components. Never invent the template body.
-- The reference remains not_verified and cannot authorize WhatsApp delivery.
alter table public.gr_wa_templates drop constraint if exists gr_wa_templates_body_check;
alter table public.gr_wa_templates add constraint gr_wa_templates_body_check
 check(
  length(body) between 1 and 4000 or
  (body='' and provider_source='manual_reference' and provider_approval='not_verified'
   and nullif(btrim(provider_template_id),'') is not null
   and connection_id is not null)
 );

create or replace function public.gr_wa_import_template_metadata(
 p_connection uuid,p_template_id text,p_name text,p_category text,p_language text
) returns uuid language plpgsql security definer set search_path='' as $function$
declare
 v_company text;v_template uuid;
 v_id text:=btrim(coalesce(p_template_id,''));
 v_name text:=btrim(coalesce(p_name,''));
 v_category text:=lower(btrim(coalesce(p_category,'')));
 v_language text:=btrim(coalesce(p_language,''));
begin
 if (select auth.uid()) is null then raise exception 'Sign in as company administrator';end if;
 select company_id into v_company from public.gr_wa_connections
 where id=p_connection and lower(provider)='socialberries';
 if v_company is null or not public.gr_wa_admin(v_company) then
  raise exception 'SocialBerries connection or company administrator permission required';
 end if;
 if length(v_id) not between 3 and 100 or v_id !~ '^[a-zA-Z0-9_-]+$'
  or length(v_name) not between 1 and 120
  or v_category not in ('marketing','utility','authentication')
  or length(v_language) not between 2 and 32 then
  raise exception 'Provide a valid template ID, name, category and language';
 end if;

 insert into public.gr_wa_templates(
  company_id,connection_id,name,category,language,body,
  provider_template_id,provider_approval,provider_source,provider_preview)
 values(v_company,p_connection,v_name,v_category,v_language,'',
        v_id,'not_verified','manual_reference',
        jsonb_build_object('id',v_id,'name',v_name,'category',upper(v_category),
         'language',v_language,'source','manual_entry_metadata_only'))
 on conflict (company_id,connection_id,provider_template_id)
  where connection_id is not null and provider_template_id is not null
 do update set
  name=excluded.name,category=excluded.category,language=excluded.language,
  updated_at=now()
 returning id into v_template;
 return v_template;
end $function$;
revoke all on function public.gr_wa_import_template_metadata(uuid,text,text,text,text) from public,anon;
grant execute on function public.gr_wa_import_template_metadata(uuid,text,text,text,text) to authenticated;

-- Link the template shown by the user to Grow India Tool 1 without sending
-- anything or claiming that a provider-side template list was queried.
insert into public.gr_wa_templates(
 company_id,connection_id,name,category,language,body,
 provider_template_id,provider_approval,provider_source,provider_preview)
select c.company_id,c.id,'diwali_offer','marketing','en_US','',
       '4155466774752002','not_verified','manual_reference',
       '{"id":"4155466774752002","name":"diwali_offer","category":"MARKETING","language":"en_US","status":"APPROVED","source":"user_screenshot_metadata_only"}'::jsonb
from public.gr_wa_connections c
where c.company_id='grow-india' and c.slot=1 and lower(c.provider)='socialberries'
on conflict (company_id,connection_id,provider_template_id)
 where connection_id is not null and provider_template_id is not null
do nothing;
