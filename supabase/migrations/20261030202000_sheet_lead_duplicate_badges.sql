-- Display imported duplicate flags on each staff-visible CRM lead card.
alter table public.gr_lead_pipeline
 add column if not exists import_duplicate_type text not null default 'none'
 check(import_duplicate_type in('none','lead','contact','both'));
alter table public.gr_lead_pipeline
 add column if not exists import_duplicate_review text not null default 'clean'
 check(import_duplicate_review in('clean','pending','keep_separate','reviewed','not_duplicate'));
create or replace function public.gr_sheet_lead_badge()
returns trigger language plpgsql security definer set search_path=''
as $flag$
begin
 if new.lead_id is not null then
  update public.gr_lead_pipeline set
    import_duplicate_type=new.duplicate_type,
    import_duplicate_review=new.review_status
  where company_id=new.company_id and lead_id=new.lead_id;
 end if;
 return new;
end $flag$;
drop trigger if exists gr_sheet_lead_badge_trigger on public.gr_sheet_import_rows;
create trigger gr_sheet_lead_badge_trigger
after insert or update of duplicate_type,review_status on public.gr_sheet_import_rows
for each row execute function public.gr_sheet_lead_badge();
revoke all on function public.gr_sheet_lead_badge() from public,anon,authenticated;
