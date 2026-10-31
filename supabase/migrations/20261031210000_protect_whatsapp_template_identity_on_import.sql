-- Applied to Supabase on 2026-10-31.
-- Preserve template identity on repeated imports; never overwrite confirmed approved content with unverified input.
CREATE OR REPLACE FUNCTION public.gr_wa_import_template_metadata(p_connection uuid, p_template_id text, p_name text, p_category text, p_language text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_company text; v_template uuid;
 v_id text:=btrim(coalesce(p_template_id,''));
 v_name text:=btrim(coalesce(p_name,''));
 v_category text:=lower(btrim(coalesce(p_category,'')));
 v_language text:=btrim(coalesce(p_language,''));
 v_existing_name text;
begin
 if (select auth.uid()) is null then
  raise exception 'Sign in as company administrator';
 end if;
 select company_id into v_company from public.gr_wa_connections
 where id=p_connection and lower(provider)='socialberries';
 if v_company is null or not public.gr_wa_admin(v_company) then
  raise exception 'SocialBerries connection or company administrator permission required';
 end if;
 if length(v_id) not between 3 and 100 or v_id !~ '^[a-zA-Z0-9_-]+$'
  or length(v_name) not between 1 and 120
  or v_category not in ('marketing','utility','authentication')
  or length(v_language) not between 2 and 32 then
  raise exception 'Provide valid template ID, name, category and language';
 end if;
 select id,name into v_template,v_existing_name from public.gr_wa_templates
 where company_id=v_company and connection_id=p_connection
 and provider_template_id=v_id for update;
 if found then
  if v_existing_name<>v_name then
   raise exception 'Template ID % already belongs to %. Do not change the approved name to %',
    v_id,v_existing_name,v_name;
  end if;
  return v_template; -- Metadata-only linking must never erase imported or verified content.
 end if;
 insert into public.gr_wa_templates(
  company_id,connection_id,name,category,language,body,
  provider_template_id,provider_approval,provider_source,provider_preview
 ) values(v_company,p_connection,v_name,v_category,v_language,'',
  v_id,'not_verified','manual_reference',
  jsonb_build_object('id',v_id,'name',v_name,'category',upper(v_category),
   'language',v_language,'source','manual_entry_metadata_only'))
 returning id into v_template;
 return v_template;
end $function$


CREATE OR REPLACE FUNCTION public.gr_wa_import_template_preview(p_connection uuid, p_preview jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_company text; v_template uuid; v_name text; v_language text;
 v_category text; v_reference text; v_body text; v_components jsonb;
 v_existing_name text; v_existing_source text; v_existing_approval text;
begin
 select company_id into v_company from public.gr_wa_connections
 where id=p_connection and lower(provider)='socialberries';
 if v_company is null or not public.gr_wa_admin(v_company) then
  raise exception 'Admin permission or SocialBerries connection required';
 end if;
 if jsonb_typeof(p_preview)<>'object' then
  raise exception 'Paste one complete SocialBerries template JSON object';
 end if;
 v_name:=btrim(coalesce(p_preview->>'name',''));
 v_language:=btrim(coalesce(p_preview->>'language',''));
 v_category:=lower(btrim(coalesce(p_preview->>'category','')));
 v_reference:=btrim(coalesce(p_preview->>'id',''));
 v_components:=p_preview->'components';
 if length(v_name)<1 or length(v_name)>120
  or length(v_language)<2 or length(v_language)>32
  or length(v_reference)<3 or length(v_reference)>100
  or v_category not in ('marketing','utility','authentication')
  or jsonb_typeof(v_components)<>'array' then
  raise exception 'Template must include id, name, language, category and components';
 end if;
 select b->>'text' into v_body from jsonb_array_elements(v_components) b
 where upper(coalesce(b->>'type',''))='BODY' limit 1;
 if coalesce(length(btrim(v_body)),0)<1 or length(v_body)>4000 then
  raise exception 'Full template JSON must contain a BODY component with message text';
 end if;
 select name,provider_source,provider_approval into
 v_existing_name,v_existing_source,v_existing_approval
 from public.gr_wa_templates
 where company_id=v_company and connection_id=p_connection
 and provider_template_id=v_reference for update;
 if found then
  if v_existing_name<>v_name then
   raise exception 'Template ID % is already linked to %. Imported name % does not match',
    v_reference,v_existing_name,v_name;
  end if;
  if v_existing_source in ('verified_provider','admin_confirmed')
   or v_existing_approval='approved' then
   raise exception 'Template % is already confirmed. Unverified imports cannot overwrite it',
    v_name;
  end if;
 end if;
 insert into public.gr_wa_templates(
  company_id,connection_id,name,category,language,body,provider_template_id,
  provider_approval,provider_preview,provider_source
 ) values (
  v_company,p_connection,v_name,v_category,v_language,v_body,v_reference,
  'not_verified',p_preview,'manual_reference'
 )
 on conflict (company_id,connection_id,provider_template_id)
 where connection_id is not null and provider_template_id is not null
 do update set name=excluded.name,category=excluded.category,
  language=excluded.language,body=excluded.body,
  provider_preview=excluded.provider_preview,provider_source='manual_reference',
  provider_approval='not_verified',updated_at=now()
 returning id into v_template;
 return v_template;
end $function$
;
