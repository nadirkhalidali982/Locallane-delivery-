-- Batch 4 / Milestone 6: delivery fee, rider earnings, COD cash, settlements, disputes. ADDITIVE ONLY.
-- Two separate accounts in one append-only ledger: 'earnings' (company owes rider) and 'cod' (cash the rider holds). They are never mixed.

create table if not exists public.delivery_settings (
  id boolean primary key default true check (id),
  rider_base_fee numeric not null default 30 check (rider_base_fee >= 0),
  rider_per_km numeric not null default 5 check (rider_per_km >= 0),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.delivery_settings (id) values (true) on conflict do nothing;
alter table public.delivery_settings enable row level security;
create policy delivery_settings_select on public.delivery_settings for select to authenticated
  using (coalesce(public.delivery_role(), '') in ('super_admin','manager'));
revoke all on public.delivery_settings from anon, authenticated;
grant select on public.delivery_settings to authenticated;

create table if not exists public.delivery_ledger (
  id bigint generated always as identity primary key,
  rider_id uuid not null references public.delivery_members(user_id) on delete restrict,
  job_id uuid references public.delivery_jobs(id) on delete restrict,
  account text not null check (account in ('earnings','cod')),
  kind text not null check (kind in ('earning','adjustment','payout','cod_collected','cod_deposit')),
  amount numeric(12,2) not null check (amount <> 0),
  reference text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint delivery_ledger_kind_account check ((kind in ('earning','payout') and account = 'earnings') or (kind in ('cod_collected','cod_deposit') and account = 'cod') or kind = 'adjustment'),
  constraint delivery_ledger_sign check ((kind in ('earning','cod_collected') and amount > 0) or (kind in ('payout','cod_deposit') and amount < 0) or kind = 'adjustment')
);
create unique index if not exists delivery_ledger_once_per_job on public.delivery_ledger (job_id, kind) where kind in ('earning','cod_collected');
create index if not exists delivery_ledger_rider_idx on public.delivery_ledger (rider_id, account, id desc);
alter table public.delivery_ledger enable row level security;
create policy delivery_ledger_select on public.delivery_ledger for select to authenticated
  using (rider_id = (select auth.uid()) or coalesce(public.delivery_role(), '') in ('super_admin','manager'));
revoke all on public.delivery_ledger from anon, authenticated;
grant select on public.delivery_ledger to authenticated;

create table if not exists public.delivery_disputes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.delivery_jobs(id) on delete restrict,
  rider_id uuid not null references public.delivery_members(user_id) on delete restrict,
  note text not null check (char_length(note) between 3 and 500),
  status text not null default 'open' check (status in ('open','resolved')),
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists delivery_disputes_one_open on public.delivery_disputes (job_id) where status = 'open';
alter table public.delivery_disputes enable row level security;
create policy delivery_disputes_select on public.delivery_disputes for select to authenticated
  using (rider_id = (select auth.uid()) or coalesce(public.delivery_role(), '') in ('super_admin','manager'));
revoke all on public.delivery_disputes from anon, authenticated;
grant select on public.delivery_disputes to authenticated;

-- Shop owners cannot mark LocalLane-delivered orders paid/unpaid once packed: the rider records cash at delivery.
create or replace function public.guard_order_payment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.payment_status is distinct from old.payment_status and new.fulfilment = 'locallane' and new.delivery_type = 'delivery'
     and old.status in ('packed','out_for_delivery') and current_user in ('authenticated','anon') then
    raise exception 'Payment for LocalLane-delivered orders is recorded by the rider at delivery';
  end if;
  return new;
end $$;
drop trigger if exists guard_order_payment_trg on public.orders;
create trigger guard_order_payment_trg before update of payment_status on public.orders for each row execute function public.guard_order_payment();

-- Rider fee = base + per_km * distance between shop pin and customer pin (base only when a pin is missing).
create or replace function private.rider_fee(p_job uuid)
returns numeric language sql stable set search_path = '' as $$
  select round((s.rider_base_fee + coalesce(s.rider_per_km * private.km(st.latitude, st.longitude, o.delivery_lat, o.delivery_lng), 0))::numeric, 2)
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  cross join public.delivery_settings s
  where j.id = p_job
$$;
revoke execute on function private.rider_fee(uuid) from public, anon, authenticated;

-- Delivery completion now also records cash and earning. p_cash must equal exactly what is due (0 when already paid online).
drop function if exists public.rider_complete_delivery(uuid, text);
create function public.rider_complete_delivery(p_job uuid, p_otp text, p_cash numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); j public.delivery_jobs; s public.delivery_job_secrets; o public.orders; due numeric; fee numeric;
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found or j.rider_id is distinct from me then raise exception 'Job not found'; end if;
  if j.status <> 'picked_up' then raise exception 'This delivery is not on the way'; end if;
  select * into s from public.delivery_job_secrets where job_id = p_job for update;
  if not found then raise exception 'No delivery code for this order. Ask the manager.'; end if;
  if s.attempts >= 5 then return jsonb_build_object('result', 'locked', 'attempts_left', 0); end if;
  if trim(coalesce(p_otp, '')) <> s.otp then
    update public.delivery_job_secrets set attempts = attempts + 1 where job_id = p_job;
    if s.attempts + 1 >= 5 then perform private.log_event(p_job, me, 'otp_locked', null, null, 'Too many wrong codes'); end if;
    return jsonb_build_object('result', case when s.attempts + 1 >= 5 then 'locked' else 'wrong_code' end, 'attempts_left', greatest(0, 4 - s.attempts));
  end if;
  select * into o from public.orders where id = j.order_id for update;
  due := case when o.payment_status = 'paid' then 0 else o.total end;
  if coalesce(p_cash, 0) <> due then return jsonb_build_object('result', 'cash_mismatch', 'due', due); end if;
  update public.delivery_jobs set status = 'delivered', delivered_at = now(), updated_at = now() where id = p_job;
  update public.orders set status = 'delivered' where id = j.order_id;
  if due > 0 then
    update public.orders set payment_status = 'paid' where id = j.order_id;
    insert into public.delivery_ledger (rider_id, job_id, account, kind, amount, created_by) values (me, p_job, 'cod', 'cod_collected', due, me);
  end if;
  fee := private.rider_fee(p_job);
  if fee > 0 then
    insert into public.delivery_ledger (rider_id, job_id, account, kind, amount, created_by) values (me, p_job, 'earnings', 'earning', fee, me);
  end if;
  delete from public.delivery_job_secrets where job_id = p_job;
  perform private.log_event(p_job, me, 'delivered', 'picked_up', 'delivered', case when due > 0 then 'COD collected: ' || due::text else 'Already paid online' end);
  return jsonb_build_object('result', 'delivered', 'earned', fee);
end $$;

create or replace function public.delivery_settings_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.delivery_settings;
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  select * into s from public.delivery_settings;
  return jsonb_build_object('rider_base_fee', s.rider_base_fee, 'rider_per_km', s.rider_per_km);
end $$;

create or replace function public.delivery_settings_set(p_base numeric, p_per_km numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'super_admin' then raise exception 'Only the Super Admin can change fees'; end if;
  if p_base is null or p_per_km is null or p_base < 0 or p_per_km < 0 or p_base > 1000 or p_per_km > 100 then raise exception 'Invalid fee'; end if;
  update public.delivery_settings set rider_base_fee = p_base, rider_per_km = p_per_km, updated_by = me, updated_at = now();
  perform private.audit(me, 'fee_settings_changed', null, jsonb_build_object('base', p_base, 'per_km', p_per_km));
end $$;

create or replace function public.delivery_finance_summary()
returns table(rider_id uuid, rider_name text, is_active boolean, earnings_balance numeric, cod_held numeric, delivered_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  return query
  select m.user_id, m.full_name, m.is_active,
         coalesce((select sum(l.amount) from public.delivery_ledger l where l.rider_id = m.user_id and l.account = 'earnings'), 0),
         coalesce((select sum(l.amount) from public.delivery_ledger l where l.rider_id = m.user_id and l.account = 'cod'), 0),
         (select count(*) from public.delivery_jobs j where j.rider_id = m.user_id and j.status = 'delivered')
  from public.delivery_members m where m.role = 'rider'
  order by 5 desc, 4 desc;
end $$;

create or replace function public.delivery_ledger_list(p_rider uuid default null, p_account text default null)
returns table(id bigint, rider_id uuid, rider_name text, order_no bigint, account text, kind text, amount numeric, reference text, note text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  return query
  select l.id, l.rider_id, m.full_name, o.order_no, l.account, l.kind, l.amount, l.reference, l.note, l.created_at
  from public.delivery_ledger l
  join public.delivery_members m on m.user_id = l.rider_id
  left join public.delivery_jobs j on j.id = l.job_id
  left join public.orders o on o.id = j.order_id
  where (p_rider is null or l.rider_id = p_rider) and (p_account is null or l.account = p_account)
  order by l.id desc limit 300;
end $$;

create or replace function public.delivery_record_settlement(p_rider uuid, p_account text, p_amount numeric, p_reference text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); bal numeric;
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  if p_account not in ('earnings','cod') then raise exception 'Choose earnings payout or COD deposit'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'Enter a valid amount'; end if;
  if length(trim(coalesce(p_reference, ''))) < 2 then raise exception 'Add a reference (UPI id, receipt no.)'; end if;
  if not exists (select 1 from public.delivery_members where user_id = p_rider and role = 'rider') then raise exception 'Rider not found'; end if;
  perform pg_advisory_xact_lock(hashtext(p_rider::text));
  select coalesce(sum(amount), 0) into bal from public.delivery_ledger where rider_id = p_rider and account = p_account;
  if p_amount > bal then raise exception 'Amount is more than the balance (%)', bal; end if;
  insert into public.delivery_ledger (rider_id, account, kind, amount, reference, note, created_by)
  values (p_rider, p_account, case when p_account = 'earnings' then 'payout' else 'cod_deposit' end, -p_amount, left(trim(p_reference), 100), nullif(left(trim(coalesce(p_note, '')), 300), ''), me);
  perform private.audit(me, case when p_account = 'earnings' then 'payout_recorded' else 'cod_deposit_recorded' end, p_rider::text, jsonb_build_object('amount', p_amount, 'reference', left(trim(p_reference), 100)));
end $$;

create or replace function public.delivery_add_adjustment(p_rider uuid, p_account text, p_amount numeric, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  if p_account not in ('earnings','cod') then raise exception 'Choose an account'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then raise exception 'Enter a valid amount'; end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Write the reason'; end if;
  if not exists (select 1 from public.delivery_members where user_id = p_rider and role = 'rider') then raise exception 'Rider not found'; end if;
  insert into public.delivery_ledger (rider_id, account, kind, amount, note, created_by) values (p_rider, p_account, 'adjustment', p_amount, left(trim(p_note), 300), me);
  perform private.audit(me, 'adjustment_added', p_rider::text, jsonb_build_object('account', p_account, 'amount', p_amount));
end $$;

create or replace function public.rider_my_earnings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'earnings_balance', coalesce((select sum(amount) from public.delivery_ledger where rider_id = me and account = 'earnings'), 0),
    'cod_held', coalesce((select sum(amount) from public.delivery_ledger where rider_id = me and account = 'cod'), 0),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'account', x.account, 'kind', x.kind, 'amount', x.amount, 'reference', x.reference,
              'note', x.note, 'order_no', x.order_no, 'created_at', x.created_at) order by x.id desc), '[]'::jsonb)
             from (select l.*, o.order_no from public.delivery_ledger l left join public.delivery_jobs j on j.id = l.job_id left join public.orders o on o.id = j.order_id
                   where l.rider_id = me order by l.id desc limit 100) x));
end $$;

create or replace function public.rider_raise_dispute(p_job uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Write what is wrong'; end if;
  if not exists (select 1 from public.delivery_jobs where id = p_job and rider_id = me and status in ('delivered','failed')) then raise exception 'Job not found'; end if;
  begin
    insert into public.delivery_disputes (job_id, rider_id, note) values (p_job, me, left(trim(p_note), 500));
  exception when unique_violation then raise exception 'A dispute is already open for this delivery';
  end;
end $$;

create or replace function public.delivery_disputes_list(p_status text default null)
returns table(id uuid, job_id uuid, order_no bigint, rider_id uuid, rider_name text, note text, status text, resolution text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  return query
  select d.id, d.job_id, o.order_no, d.rider_id, m.full_name, d.note, d.status, d.resolution, d.created_at
  from public.delivery_disputes d
  join public.delivery_members m on m.user_id = d.rider_id
  join public.delivery_jobs j on j.id = d.job_id
  join public.orders o on o.id = j.order_id
  where p_status is null or d.status = p_status
  order by (d.status = 'open') desc, d.created_at desc limit 200;
end $$;

create or replace function public.delivery_resolve_dispute(p_id uuid, p_resolution text, p_adjustment numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); d public.delivery_disputes;
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  if length(trim(coalesce(p_resolution, ''))) < 3 then raise exception 'Write the decision'; end if;
  select * into d from public.delivery_disputes where id = p_id for update;
  if not found or d.status <> 'open' then raise exception 'Dispute not found or already resolved'; end if;
  if p_adjustment is not null and p_adjustment <> 0 then
    if abs(p_adjustment) > 100000 then raise exception 'Invalid amount'; end if;
    insert into public.delivery_ledger (rider_id, job_id, account, kind, amount, note, created_by)
    values (d.rider_id, d.job_id, 'earnings', 'adjustment', p_adjustment, 'Dispute: ' || left(trim(p_resolution), 250), me);
  end if;
  update public.delivery_disputes set status = 'resolved', resolution = left(trim(p_resolution), 300), resolved_by = me, resolved_at = now() where id = p_id;
  perform private.audit(me, 'dispute_resolved', p_id::text, jsonb_build_object('adjustment', p_adjustment));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.rider_complete_delivery(uuid,text,numeric)', 'public.delivery_settings_get()', 'public.delivery_settings_set(numeric,numeric)',
    'public.delivery_finance_summary()', 'public.delivery_ledger_list(uuid,text)', 'public.delivery_record_settlement(uuid,text,numeric,text,text)',
    'public.delivery_add_adjustment(uuid,text,numeric,text)', 'public.rider_my_earnings()', 'public.rider_raise_dispute(uuid,text)',
    'public.delivery_disputes_list(text)', 'public.delivery_resolve_dispute(uuid,text,numeric)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
