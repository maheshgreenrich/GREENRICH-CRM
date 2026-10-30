-- Phase 1: GreenRich ONE accounting foundation; apply to Supabase SQL editor after CRM migrations.
-- Existing gr_profiles and gr_companies are reused; no duplicate users or companies.
create extension if not exists pgcrypto;
create table if not exists public.acc_settings (
 company_id text primary key references public.gr_companies(id),
 base_currency char(3) not null default 'INR',
 financial_year_start smallint not null default 4 check(financial_year_start between 1 and 12),
 rounding_mode text not null default 'HALF_UP' check(rounding_mode='HALF_UP'),
 updated_at timestamptz not null default now()
);
insert into public.acc_settings(company_id)
select id from public.gr_companies on conflict do nothing;

create table if not exists public.acc_accounts(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 code text not null,
 name text not null,
 type text not null check(type in ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')),
 parent_id uuid references public.acc_accounts(id),
 is_system boolean not null default false,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(company_id,code),
 unique(id,company_id)
);
create table if not exists public.acc_tax_rates (
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 name text not null,
 rate numeric(7,4) not null check(rate between 0 and 100),
 type text not null check(type in ('INPUT','OUTPUT')),
 account_id uuid not null,
 is_inclusive boolean not null default false,
 is_active boolean not null default true,
 foreign key(account_id,company_id) references public.acc_accounts(id,company_id)
);
create table if not exists public.acc_payment_terms(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 name text not null,
 days integer not null check(days>=0),
 unique(company_id,days)
);
create table if not exists public.acc_sequences(
 company_id text not null references public.gr_companies(id),
 doc_type text not null,
 year integer not null,
 prefix text not null,
 last_number bigint not null default 0 check(last_number>=0),
 primary key(company_id,doc_type,year)
);
create table if not exists public.acc_period_locks(
 company_id text not null references public.gr_companies(id),
 period_start date not null,
 locked_by uuid not null references public.gr_profiles(id),
 locked_at timestamptz not null default now(),
 primary key(company_id,period_start),
 check(extract(day from period_start)=1)
);
create table if not exists public.acc_journals(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 number text not null,
 date date not null,
 currency char(3) not null default 'INR',
 memo text not null default '',
 source_type text not null,
 source_id uuid not null,
 status text not null default 'POSTED' check(status in ('POSTED','REVERSED')),
 reversal_of uuid references public.acc_journals(id),
 created_by uuid not null references public.gr_profiles(id),
 created_at timestamptz not null default now(),
 unique(company_id,number),
 unique(company_id,source_type,source_id)
);
create unique index if not exists acc_one_reversal on public.acc_journals(reversal_of) where reversal_of is not null;
create table if not exists public.acc_journal_lines(
 id bigint generated always as identity primary key,
 journal_id uuid not null references public.acc_journals(id),
 account_id uuid not null references public.acc_accounts(id),
 debit numeric(18,2) not null default 0 check(debit>=0),
 credit numeric(18,2) not null default 0 check(credit>=0),
 party_id uuid,
 cost_center text,
 check((debit>0 and credit=0) or (credit>0 and debit=0))
);
create table if not exists public.acc_audit(
 id bigint generated always as identity primary key,
 company_id text not null references public.gr_companies(id),
 actor_id uuid not null references public.gr_profiles(id),
 action text not null,
 entity_type text not null,
 entity_id uuid,
 old_value jsonb,
 new_value jsonb,
 ip inet,
 created_at timestamptz not null default now()
);
create table if not exists public.acc_cash_bank_accounts(
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.gr_companies(id),
 name text not null,
 kind text not null check(kind in ('BANK','CASH','PETTY_CASH')),
 ledger_account_id uuid not null,
 is_active boolean not null default true,
 foreign key(ledger_account_id,company_id) references public.acc_accounts(id,company_id)
);
-- No direct writes from the browser. SECURITY DEFINER functions are the only posting interface.
alter table public.acc_settings enable row level security;
alter table public.acc_accounts enable row level security;
alter table public.acc_tax_rates enable row level security;
alter table public.acc_payment_terms enable row level security;
alter table public.acc_sequences enable row level security;
alter table public.acc_period_locks enable row level security;
alter table public.acc_journals enable row level security;
alter table public.acc_journal_lines enable row level security;
alter table public.acc_audit enable row level security;
alter table public.acc_cash_bank_accounts enable row level security;

create or replace function public.acc_can_access(p_company text,p_action text)
returns boolean language sql stable security definer set search_path=public
as $$
select exists(
 select 1 from public.gr_profiles p join public.gr_roles r on r.id=p.role_id
 where p.id=auth.uid() and p.active
 and p_company=any(p.company_ids)
 and (r.name='Admin' or
      (p_action='view' and r.name in ('Accounts','Director')) or
      (p_action='post' and r.name='Accounts') or
      (p_action='lock' and r.name='Director'))
)
$$;
revoke all on function public.acc_can_access(text,text) from public;
grant execute on function public.acc_can_access(text,text) to authenticated;
create policy "acc settings scoped read" on public.acc_settings for select to authenticated using(public.acc_can_access(company_id,'view'));
create policy "acc accounts scoped read" on public.acc_accounts for select to authenticated using(public.acc_can_access(company_id,'view'));
create policy "acc tax scoped read" on public.acc_tax_rates for select to authenticated using(public.acc_can_access(company_id,'view'));
create policy "acc terms scoped read" on public.acc_payment_terms for select to authenticated using(public.acc_can_access(company_id,'view'));
create policy "acc cash scoped read" on public.acc_cash_bank_accounts for select to authenticated using(public.acc_can_access(company_id,'view'));
create policy "acc journals scoped read" on public.acc_journals for select to authenticated using(public.acc_can_access(company_id,'view'));
create policy "acc lines scoped read" on public.acc_journal_lines for select to authenticated using(exists(select 1 from public.acc_journals j where j.id=journal_id and public.acc_can_access(j.company_id,'view')));
create policy "acc audit scoped read" on public.acc_audit for select to authenticated using(public.acc_can_access(company_id,'view'));

-- Dedicated immutable journal boundary: updates and deletes prohibited, even by privileged API callers.
create or replace function public.acc_forbid_mutation() returns trigger language plpgsql as $$
begin raise exception 'Posted ledger entries are immutable; use a reversal'; end $$;
drop trigger if exists acc_journals_immutable on public.acc_journals;
create trigger acc_journals_immutable before update or delete on public.acc_journals
for each row execute function public.acc_forbid_mutation();
drop trigger if exists acc_lines_immutable on public.acc_journal_lines;
create trigger acc_lines_immutable before update or delete on public.acc_journal_lines
for each row execute function public.acc_forbid_mutation();

create or replace function public.acc_post_journal(
 p_company text,p_date date,p_source_type text,p_source_id uuid,
 p_memo text,p_lines jsonb,p_currency text default 'INR'
) returns uuid language plpgsql security definer set search_path=public
as $$
declare v_journal uuid; v_number text; v_year integer; v_seq bigint;
 v_debit numeric(18,2); v_credit numeric(18,2); v_count integer;
 v_line jsonb; v_account public.acc_accounts%rowtype; v_amount numeric(18,2);
begin
 if not public.acc_can_access(p_company,'post') then raise exception 'Forbidden'; end if;
 if p_date is null or p_source_id is null or p_source_type is null or length(trim(p_source_type))=0 then raise exception 'Missing source/date'; end if;
 if p_currency <> (select base_currency from public.acc_settings where company_id=p_company) then
   raise exception 'Multi-currency posting is deferred to Phase 2';
 end if;
 -- Serialize postings and locks per company to avoid concurrent backdated posting.
 perform pg_advisory_xact_lock(hashtextextended('acc:'||p_company,0));
 if exists(select 1 from public.acc_period_locks where company_id=p_company and period_start=date_trunc('month',p_date)::date)
 then raise exception 'Period is locked'; end if;
 if exists(select 1 from public.acc_journals where company_id=p_company and source_type=p_source_type and source_id=p_source_id)
 then raise exception 'Source already posted'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<2 then raise exception 'At least two journal lines required'; end if;
 v_debit:=0;v_credit:=0;v_count:=0;
 for v_line in select value from jsonb_array_elements(p_lines)
 loop
   if (v_line->>'debit') is null or (v_line->>'credit') is null then raise exception 'Debit and credit required'; end if;
   if (v_line->>'debit') !~ '^([0-9]+)(\.[0-9]{1,2})?$' or (v_line->>'credit') !~ '^([0-9]+)(\.[0-9]{1,2})?$'
   then raise exception 'Amounts must have at most 2 decimals'; end if;
   v_debit:=v_debit+(v_line->>'debit')::numeric(18,2);
   v_credit:=v_credit+(v_line->>'credit')::numeric(18,2);
   if not (((v_line->>'debit')::numeric>0 and (v_line->>'credit')::numeric=0)
         or ((v_line->>'credit')::numeric>0 and (v_line->>'debit')::numeric=0))
   then raise exception 'Each line must have exactly one positive side'; end if;
   select * into v_account from public.acc_accounts where id=(v_line->>'account_id')::uuid and company_id=p_company and is_active;
   if not found then raise exception 'Invalid or inactive account'; end if;
   v_count:=v_count+1;
 end loop;
 if v_count<2 or v_debit<>v_credit or v_debit<=0 then raise exception 'Journal is not balanced'; end if;
 v_year:=extract(year from p_date)::int;
 insert into public.acc_sequences(company_id,doc_type,year,prefix,last_number)
 values(p_company,'JRN',v_year,'JRN-'||v_year||'-',0) on conflict do nothing;
 update public.acc_sequences set last_number=last_number+1
 where company_id=p_company and doc_type='JRN' and year=v_year
 returning last_number into v_seq;
 v_number:='JRN-'||v_year||'-'||lpad(v_seq::text,4,'0');
 insert into public.acc_journals(company_id,number,date,currency,memo,source_type,source_id,created_by)
 values(p_company,v_number,p_date,p_currency,coalesce(p_memo,''),p_source_type,p_source_id,auth.uid())
 returning id into v_journal;
 insert into public.acc_journal_lines(journal_id,account_id,debit,credit,party_id,cost_center)
 select v_journal,(x->>'account_id')::uuid,(x->>'debit')::numeric(18,2),
  (x->>'credit')::numeric(18,2),nullif(x->>'party_id','')::uuid,x->>'cost_center'
 from jsonb_array_elements(p_lines) x;
 insert into public.acc_audit(company_id,actor_id,action,entity_type,entity_id,new_value)
 values(p_company,auth.uid(),'POST','journal',v_journal,jsonb_build_object('source_type',p_source_type,'source_id',p_source_id,'debit',v_debit,'credit',v_credit));
 return v_journal;
end $$;
revoke all on function public.acc_post_journal(text,date,text,uuid,text,jsonb,text) from public;
grant execute on function public.acc_post_journal(text,date,text,uuid,text,jsonb,text) to authenticated;

-- Prevent direct table writes by client roles (RLS contains no write policies).
revoke insert,update,delete on public.acc_journals,public.acc_journal_lines,public.acc_sequences,public.acc_period_locks,public.acc_audit from anon,authenticated;
-- Seed the identical default COA for each existing registered GreenRich company.
insert into public.acc_accounts(company_id,code,name,type,is_system)
select c.id,x.code,x.name,x.kind,true from public.gr_companies c cross join
(values
 ('1000','Cash','ASSET'),('1010','Bank','ASSET'),('1020','Petty Cash','ASSET'),
 ('1100','Accounts Receivable','ASSET'),('1200','Inventory','ASSET'),('1300','Input GST','ASSET'),
 ('2000','Accounts Payable','LIABILITY'),('2100','Output GST Payable','LIABILITY'),
 ('3000','Capital','EQUITY'),('3100','Retained Earnings','EQUITY'),
 ('4000','Sales','INCOME'),('4100','Other Income','INCOME'),
 ('5000','Purchases / COGS','EXPENSE'),('5100','Rent','EXPENSE'),
 ('5200','Salaries','EXPENSE'),('5300','Utilities','EXPENSE'),
 ('5400','Travel','EXPENSE'),('5500','Office Expenses','EXPENSE'),
 ('5600','Bank Charges','EXPENSE'),('5700','Cash Difference','EXPENSE')
) x(code,name,kind) on conflict(company_id,code) do nothing;
insert into public.acc_payment_terms(company_id,name,days)
select c.id,'Net '||d.days,d.days from public.gr_companies c cross join (values(0),(15),(30),(45)) d(days)
on conflict(company_id,days) do nothing;
insert into public.acc_tax_rates(company_id,name,rate,type,account_id)
select c.id,'GST '||r.rate||'% '||t.kind,r.rate,t.kind,a.id
from public.gr_companies c cross join (values(0),(5),(12),(18),(28)) r(rate)
cross join (values('INPUT','1300'),('OUTPUT','2100')) t(kind,code)
join public.acc_accounts a on a.company_id=c.id and a.code=t.code
where not exists (select 1 from public.acc_tax_rates x where x.company_id=c.id and x.name='GST '||r.rate||'% '||t.kind);
