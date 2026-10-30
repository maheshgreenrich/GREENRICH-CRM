-- GreenRich ONE shared logo for the workspace sidebar.
-- Public image reads; Admin-only uploads, metadata updates, and removals.
-- Does not modify Attendance, existing company CRM, stock, or employee permissions.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('greenrich-branding','greenrich-branding',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create table if not exists public.gr_workspace_branding(
 key text primary key check(key='sidebar-logo'),
 object_path text,
 updated_at timestamptz not null default now(),
 updated_by uuid default auth.uid()
);
alter table public.gr_workspace_branding enable row level security;
drop policy if exists "active employees can view workspace branding" on public.gr_workspace_branding;
drop policy if exists "admin creates workspace branding" on public.gr_workspace_branding;
drop policy if exists "admin updates workspace branding" on public.gr_workspace_branding;
create policy "active employees can view workspace branding" on public.gr_workspace_branding
 for select to authenticated using(exists(select 1 from public.gr_profiles p where p.id=(select auth.uid()) and p.active));
create policy "admin creates workspace branding" on public.gr_workspace_branding
 for insert to authenticated with check((select public.gr_is_admin()));
create policy "admin updates workspace branding" on public.gr_workspace_branding
 for update to authenticated using((select public.gr_is_admin())) with check((select public.gr_is_admin()));
revoke all on public.gr_workspace_branding from anon,authenticated;
grant select,insert,update on public.gr_workspace_branding to authenticated;
drop policy if exists "admin can upload brand image" on storage.objects;
drop policy if exists "admin can remove brand image" on storage.objects;
create policy "admin can upload brand image" on storage.objects
 for insert to authenticated with check(
 bucket_id='greenrich-branding'
 and name ~ '^workspace/logo-[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp)$'
 and (select public.gr_is_admin())
);
create policy "admin can remove brand image" on storage.objects
 for delete to authenticated using(
 bucket_id='greenrich-branding' and (select public.gr_is_admin())
);
do $$ begin
 if not exists(select 1 from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public' and tablename='gr_workspace_branding') then
  alter publication supabase_realtime add table public.gr_workspace_branding;
 end if;
end $$;
