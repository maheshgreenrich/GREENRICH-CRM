-- Phase 1 follow-up: controlled reversal, monthly locking, and trial-balance read model.
-- Reversal is a new journal; original remains unchanged.
create or replace function public.acc_reverse_journal(p_journal uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare j public.acc_journals%rowtype; v_lines jsonb; v_new uuid;
begin
 select * into j from public.acc_journals where id=p_journal;
 if not found then raise exception 'Journal not found'; end if;
 if not public.acc_can_access(j.company_id,'post') then raise exception 'Forbidden'; end if;
 if length(trim(coalesce(p_reason,'')))<8 then raise exception 'Reversal reason required (minimum 8 characters)'; end if;
 if exists(select 1 from public.acc_journals where reversal_of=p_journal) then raise exception 'Already reversed'; end if;
 select jsonb_agg(jsonb_build_object('account_id',account_id,'debit',credit::text,'credit',debit::text,
   'party_id',party_id,'cost_center',cost_center) order by id)
 into v_lines from public.acc_journal_lines where journal_id=p_journal;
 -- Post on the current date, not the possibly locked original date.
 v_new:=public.acc_post_journal(j.company_id,current_date,'REVERSAL',p_journal,
   'Reversal of '||j.number||': '||p_reason,v_lines,j.currency);
 -- Original journal is deliberately NOT mutated. Reversal relationship lives on reversal row.
 -- Immutable row trigger prohibits linking by UPDATE, so insert a separate immutable link.
 insert into public.acc_reversals(original_journal_id,reversal_journal_id,reason,actor_id)
 values(p_journal,v_new,p_reason,auth.uid());
 return v_new;
end $$;
create table if not exists public.acc_reversals(
 original_journal_id uuid primary key references public.acc_journals(id),
 reversal_journal_id uuid not null unique references public.acc_journals(id),
 reason text not null,
 actor_id uuid not null references public.gr_profiles(id),
 created_at timestamptz not null default now()
);
alter table public.acc_reversals enable row level security;
create policy "reversal read" on public.acc_reversals for select to authenticated
 using(exists(select 1 from public.acc_journals j where j.id=original_journal_id and public.acc_can_access(j.company_id,'view')));
revoke all on public.acc_reversals from anon,authenticated;
grant select on public.acc_reversals to authenticated;
revoke all on function public.acc_reverse_journal(uuid,text) from public;
grant execute on function public.acc_reverse_journal(uuid,text) to authenticated;

create or replace function public.acc_set_period_lock(p_company text,p_month date,p_lock boolean)
returns void language plpgsql security definer set search_path=public
as $$
begin
 if not public.acc_can_access(p_company,'lock') then raise exception 'Forbidden'; end if;
 if p_month<>date_trunc('month',p_month)::date then raise exception 'Use first day of month'; end if;
 perform pg_advisory_xact_lock(hashtextextended('acc:'||p_company,0));
 if p_lock then
 insert into public.acc_period_locks(company_id,period_start,locked_by)
 values(p_company,p_month,auth.uid()) on conflict(company_id,period_start) do nothing;
 else
 delete from public.acc_period_locks where company_id=p_company and period_start=p_month;
 end if;
 insert into public.acc_audit(company_id,actor_id,action,entity_type,new_value)
 values(p_company,auth.uid(),case when p_lock then 'LOCK' else 'UNLOCK' end,'period',
 jsonb_build_object('month',p_month));
end $$;
revoke all on function public.acc_set_period_lock(text,date,boolean) from public;
grant execute on function public.acc_set_period_lock(text,date,boolean) to authenticated;

-- Explicitly exclude originals that have been reversed? NO. Both the original
-- and its reversal remain in the ledger and net to zero for the appropriate dates.
create or replace view public.acc_trial_balance
with (security_invoker=true)
as select j.company_id,a.id as account_id,a.code,a.name,a.type,
 coalesce(sum(l.debit),0)::numeric(18,2) as total_debit,
 coalesce(sum(l.credit),0)::numeric(18,2) as total_credit,
 (coalesce(sum(l.debit),0)-coalesce(sum(l.credit),0))::numeric(18,2) as net
from public.acc_accounts a
join public.acc_journal_lines l on l.account_id=a.id
join public.acc_journals j on j.id=l.journal_id and j.company_id=a.company_id
group by j.company_id,a.id,a.code,a.name,a.type;
grant select on public.acc_trial_balance to authenticated;

-- HARDENING NOTE: the acc_post_journal function is a Phase 1 manual journal
-- boundary. Future invoice, bill and petty cash functions must call a shared
-- PRIVATE ledger core after validating source documents; do not let clients
-- choose journal lines for an invoice or bill posting.
