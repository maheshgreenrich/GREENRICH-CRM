-- Store a reference copied from SocialBerries' existing approved-template preview.
-- The uploaded preview is UNVERIFIED. It never grants permission to send WhatsApp.
alter table public.gr_wa_templates
 add column if not exists provider_preview jsonb;
alter table public.gr_wa_templates
 add column if not exists provider_source text not null default 'crm_draft'
   check(provider_source in ('crm_draft','manual_reference','verified_provider'));

create unique index if not exists gr_wa_template_provider_identity
on public.gr_wa_templates(company_id,connection_id,provider_template_id)
where connection_id is not null and provider_template_id is not null;

create or replace function public.gr_wa_import_template_preview(
 p_connection uuid,p_preview jsonb
) returns uuid
language plpgsql security definer
set search_path to '' as $function$
declare
  v_company text;v_template uuid;v_name text;v_language text;
  v_category text;v_reference text;v_body text;v_components jsonb;
begin
  select company_id into v_company from public.gr_wa_connections
  where id=p_connection and lower(provider)='socialberries';
  if v_company is null or not public.gr_wa_admin(v_company)
    then raise exception 'Admin permission or SocialBerries connection required';end if;
  if jsonb_typeof(p_preview)<>'object'
   then raise exception 'Paste one SocialBerries template JSON object';end if;
  v_name:=btrim(coalesce(p_preview->>'name',''));
  v_language:=btrim(coalesce(p_preview->>'language',''));
  v_category:=lower(btrim(coalesce(p_preview->>'category','')));
  v_reference:=btrim(coalesce(p_preview->>'id',''));
  v_components:=p_preview->'components';
  if length(v_name)<1 or length(v_name)>120
   or length(v_language)<2 or length(v_language)>32
   or length(v_reference)<3 or length(v_reference)>100
   or v_category not in ('marketing','utility','authentication')
   or jsonb_typeof(v_components)<>'array'
   then raise exception 'Template must include id, name, language, category and components';end if;
  select b->>'text' into v_body
    from jsonb_array_elements(v_components) b
   where upper(coalesce(b->>'type',''))='BODY'
   limit 1;
  if coalesce(length(btrim(v_body)),0)<1 or length(v_body)>4000
    then raise exception 'Template preview must include a BODY component with text';end if;
  insert into public.gr_wa_templates(
    company_id,connection_id,name,category,language,body,provider_template_id,
    provider_approval,provider_preview,provider_source
  ) values(
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
end $function$;
revoke all on function public.gr_wa_import_template_preview(uuid,jsonb) from public,anon;
grant execute on function public.gr_wa_import_template_preview(uuid,jsonb) to authenticated;
