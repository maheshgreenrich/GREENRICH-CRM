-- Execute after 001 and 002 with Supabase SQL editor.
-- Read-only integration checks; no accounting data is modified.
do $$
declare n integer; c text; debit numeric; credit numeric;
begin
 select count(*) into n from public.gr_companies;
 if n<2 then raise exception 'Expected the two existing GreenRich companies'; end if;
 for c in select id from public.gr_companies loop
  select count(*) into n from public.acc_accounts where company_id=c and code in ('1000','1010','1020','1100','2000','4000');
  if n<>6 then raise exception 'Chart of Accounts missing seed codes for %',c; end if;
  select count(*) into n from public.acc_payment_terms where company_id=c and days in (0,15,30,45);
  if n<>4 then raise exception 'Payment terms missing for %',c; end if;
 end loop;
 -- Balance each posted journal independently.
 if exists (
  select j.id from public.acc_journals j join public.acc_journal_lines l on l.journal_id=j.id
  group by j.id having sum(l.debit)<>sum(l.credit) or sum(l.debit)=0
 ) then raise exception 'Unbalanced journal found'; end if;
 select coalesce(sum(total_debit),0),coalesce(sum(total_credit),0) into debit,credit
 from public.acc_trial_balance;
 if debit<>credit then raise exception 'Trial balance mismatch: % vs %',debit,credit; end if;
 raise notice 'Phase 1 seed and trial balance smoke tests passed';
end $$;
-- TODO before production: transaction tests under authenticated Supabase users for
-- role isolation, failed rollback/gapless numbers, reversal race, and period lock concurrency.
