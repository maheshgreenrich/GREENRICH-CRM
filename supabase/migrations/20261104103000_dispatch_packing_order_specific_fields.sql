-- Deployable mirror of applied per-order packing details schema and secure RPC.
create table if not exists public.gr_dispatch_packing_details(
 dispatch_id uuid primary key references public.gr_dispatch_orders(id) on delete cascade,
 company_id text not null references public.gr_companies(id),
 carton_count integer not null default 1 check(carton_count between 1 and 99999),
 gross_weight_kg numeric(12,3) check(gross_weight_kg is null or gross_weight_kg between 0 and 100000),
 package_dimensions text not null default '',packed_by text not null default '',
 packing_date date not null default current_date,handling_instructions text not null default '',
 updated_by uuid not null references public.gr_profiles(id),updated_at timestamptz not null default now()
);
alter table public.gr_dispatch_packing_details enable row level security;
revoke all on public.gr_dispatch_packing_details from public,anon;
grant select on public.gr_dispatch_packing_details to authenticated;
drop policy if exists gr_dispatch_packing_read on public.gr_dispatch_packing_details;
create policy gr_dispatch_packing_read on public.gr_dispatch_packing_details
 for select to authenticated using(public.gr_dispatch_allowed(company_id,'view'));
create or replace function public.gr_dispatch_save_packing(
 p_dispatch uuid,p_cartons integer,p_weight numeric,
 p_dimensions text,p_packed_by text,p_packing_date date,p_instructions text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.gr_dispatch_orders%rowtype;actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'Sign in required';end if;
 select * into d from public.gr_dispatch_orders where id=p_dispatch for update;
 if not found then raise exception 'Dispatch order not found';end if;
 if not public.gr_dispatch_allowed(d.company_id,'dispatch') then raise exception 'Dispatch edit permission required';end if;
 if p_cartons is null or p_cartons not between 1 and 99999 then raise exception 'Number of cartons must be 1 to 99999';end if;
 if p_weight is not null and(p_weight<0 or p_weight>100000) then raise exception 'Gross weight is invalid';end if;
 if p_packing_date is null then raise exception 'Packing date required';end if;
 if length(coalesce(p_dimensions,''))>200 or length(coalesce(p_packed_by,''))>160
 or length(coalesce(p_instructions,''))>2000 then raise exception 'Packing field is too long';end if;
 insert into public.gr_dispatch_packing_details(
  dispatch_id,company_id,carton_count,gross_weight_kg,package_dimensions,packed_by,
  packing_date,handling_instructions,updated_by
 ) values(d.id,d.company_id,p_cartons,p_weight,coalesce(p_dimensions,''),coalesce(p_packed_by,''),
 p_packing_date,coalesce(p_instructions,''),actor)
 on conflict(dispatch_id) do update set
 carton_count=excluded.carton_count,gross_weight_kg=excluded.gross_weight_kg,
 package_dimensions=excluded.package_dimensions,packed_by=excluded.packed_by,
 packing_date=excluded.packing_date,handling_instructions=excluded.handling_instructions,
 updated_by=actor,updated_at=now();
 return jsonb_build_object('dispatch_id',d.id,'saved',true);
end $$;
revoke all on function public.gr_dispatch_save_packing(uuid,integer,numeric,text,text,date,text) from public,anon;
grant execute on function public.gr_dispatch_save_packing(uuid,integer,numeric,text,text,date,text) to authenticated;
