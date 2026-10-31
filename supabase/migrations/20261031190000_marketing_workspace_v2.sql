-- GreenRich ONE Marketing v2: private campaign image drafts and service timing.
-- This migration does NOT activate WhatsApp sending, webhook creation or recurring dispatch.
alter table public.gr_wa_campaigns
 add column if not exists attachment_path text,
 add column if not exists attachment_mime text,
 add column if not exists provider_batch_id text;
alter table public.gr_wa_campaigns
 drop constraint if exists gr_wa_campaign_attachment_check;
alter table public.gr_wa_campaigns
 add constraint gr_wa_campaign_attachment_check check (
  (attachment_path is null and attachment_mime is null)
  or (length(attachment_path) between 10 and 320
  and attachment_path like company_id||'/%'
  and attachment_mime in ('image/jpeg','image/png','image/webp'))
 );
create unique index if not exists gr_wa_company_provider_campaign
 on public.gr_wa_campaigns(company_id,connection_id,provider_batch_id)
 where provider_batch_id is not null;

alter table public.gr_wa_recurring_rules
 add column if not exists interval_value integer,
 add column if not exists interval_unit text not null default 'days',
 add column if not exists service_reason text not null default 'service';
update public.gr_wa_recurring_rules set interval_value=interval_days
 where interval_value is null;
alter table public.gr_wa_recurring_rules
 alter column interval_value set not null;
alter table public.gr_wa_recurring_rules
 add constraint gr_wa_repeat_unit_check check(interval_unit in ('days','weeks','months'));
alter table public.gr_wa_recurring_rules
 add constraint gr_wa_repeat_value_check check(interval_value between 1 and 3650);
alter table public.gr_wa_recurring_rules
 add constraint gr_wa_repeat_reason_check check(service_reason in ('delivery','reminder','offer','cross_sell','service'));

-- Supabase Storage: a private draft bucket. No anonymous read and no
-- unrestricted upload. Files are never sent by this migration.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values('gr-wa-campaign-images','gr-wa-campaign-images',false,5242880,
 array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,
 allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists gr_wa_campaign_images_admin_insert on storage.objects;
create policy gr_wa_campaign_images_admin_insert on storage.objects
 for insert to authenticated with check(
 bucket_id='gr-wa-campaign-images'
 and public.gr_wa_admin((storage.foldername(name))[1])
 and array_length(storage.foldername(name),1)=2
);
drop policy if exists gr_wa_campaign_images_admin_select on storage.objects;
create policy gr_wa_campaign_images_admin_select on storage.objects
 for select to authenticated using (
 bucket_id='gr-wa-campaign-images'
 and public.gr_wa_admin((storage.foldername(name))[1])
);
drop policy if exists gr_wa_campaign_images_admin_delete on storage.objects;
create policy gr_wa_campaign_images_admin_delete on storage.objects
 for delete to authenticated using (
 bucket_id='gr-wa-campaign-images'
 and public.gr_wa_admin((storage.foldername(name))[1])
);
