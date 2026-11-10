-- Batch 2 / Milestone 2+3: delivery jobs, offers, rider status. ADDITIVE ONLY.
alter table public.orders add column if not exists fulfilment text not null default 'shop';
alter table public.orders drop constraint if exists orders_fulfilment_check;
alter table public.orders add constraint orders_fulfilment_check check (fulfilment in ('shop', 'locallane'));

create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  status text not null default 'pending_verification'
    check (status in ('pending_verification','ready_for_dispatch','offering','assigned','picked_up','delivered','failed','cancelled')),
  rider_id uuid references public.delivery_members(user_id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  assigned_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_jobs_rider_when_active check (status not in ('assigned','picked_up') or rider_id is not null)
);
create unique index if not exists delivery_jobs_one_active_per_rider on public.delivery_jobs (rider_id) where rider_id is not null and status in ('assigned','picked_up');
create index if not exists delivery_jobs_status_idx on public.delivery_jobs (status);

create table if not exists public.delivery_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  actor uuid,
  action text not null,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists delivery_job_events_job_idx on public.delivery_job_events (job_id, id);

create table if not exists public.delivery_offers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  rider_id uuid not null references public.delivery_members(user_id) on delete cascade,
  status text not null default 'offered' check (status in ('offered','accepted','rejected','expired','cancelled')),
  offered_by uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index if not exists delivery_offers_one_open_per_job on public.delivery_offers (job_id) where status = 'offered';
create unique index if not exists delivery_offers_one_open_per_rider on public.delivery_offers (rider_id) where status = 'offered';
create index if not exists delivery_offers_rider_idx on public.delivery_offers (rider_id, status);

create table if not exists public.delivery_rider_status (
  user_id uuid primary key references public.delivery_members(user_id) on delete cascade,
  is_online boolean not null default false,
  lat double precision,
  lng double precision,
  updated_at timestamptz not null default now()
);

alter table public.delivery_jobs enable row level security;
alter table public.delivery_job_events enable row level security;
alter table public.delivery_offers enable row level security;
alter table public.delivery_rider_status enable row level security;

-- Read-only from the browser. Every write goes through SECURITY DEFINER functions.
create policy delivery_jobs_select on public.delivery_jobs for select to authenticated
  using (coalesce(public.delivery_role(), '') in ('super_admin','manager','staff') or rider_id = (select auth.uid()));
create policy delivery_job_events_select on public.delivery_job_events for select to authenticated
  using (coalesce(public.delivery_role(), '') in ('super_admin','manager','staff'));
create policy delivery_offers_select on public.delivery_offers for select to authenticated
  using (coalesce(public.delivery_role(), '') in ('super_admin','manager','staff') or rider_id = (select auth.uid()));
create policy delivery_rider_status_select on public.delivery_rider_status for select to authenticated
  using (coalesce(public.delivery_role(), '') in ('super_admin','manager','staff') or user_id = (select auth.uid()));

revoke all on public.delivery_jobs, public.delivery_job_events, public.delivery_offers, public.delivery_rider_status from anon, authenticated;
grant select on public.delivery_jobs, public.delivery_job_events, public.delivery_offers, public.delivery_rider_status to authenticated;

alter publication supabase_realtime add table public.delivery_jobs, public.delivery_offers;

-- ---------- private helpers (not exposed to the API) ----------
create or replace function private.km(a1 double precision, o1 double precision, a2 double precision, o2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select case when a1 is null or o1 is null or a2 is null or o2 is null then null
    else 6371 * acos(least(1, greatest(-1, cos(radians(a1)) * cos(radians(a2)) * cos(radians(o2) - radians(o1)) + sin(radians(a1)) * sin(radians(a2))))) end
$$;

create or replace function private.log_event(p_job uuid, p_actor uuid, p_action text, p_from text, p_to text, p_note text)
returns void language sql set search_path = '' as $$
  insert into public.delivery_job_events (job_id, actor, action, from_status, to_status, note) values (p_job, p_actor, p_action, p_from, p_to, p_note)
$$;

create or replace function private.eligible_riders(p_job uuid)
returns table(user_id uuid, full_name text, phone text, km double precision, tried boolean)
language sql stable set search_path = '' as $$
  select m.user_id, m.full_name, m.phone,
         private.km(s.lat, s.lng, st.latitude, st.longitude),
         exists (select 1 from public.delivery_offers p where p.job_id = j.id and p.rider_id = m.user_id and p.status in ('rejected','expired'))
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  join public.delivery_members m on m.role = 'rider' and m.is_active
  join public.delivery_rider_status s on s.user_id = m.user_id and s.is_online and s.updated_at > now() - interval '30 minutes'
  where j.id = p_job
    and (private.km(s.lat, s.lng, st.latitude, st.longitude) is null or private.km(s.lat, s.lng, st.latitude, st.longitude) <= 15)
    and not exists (select 1 from public.delivery_jobs a where a.rider_id = m.user_id and a.status in ('assigned','picked_up'))
    and not exists (select 1 from public.delivery_offers f where f.rider_id = m.user_id and f.status = 'offered' and f.job_id <> j.id)
  order by 4 nulls last, s.updated_at desc
$$;

-- Offers the job to one rider (the given one, or the nearest not yet tried). Locks the job row first.
create or replace function private.dispatch_next(p_job uuid, p_actor uuid, p_rider uuid default null)
returns uuid language plpgsql set search_path = '' as $$
declare j public.delivery_jobs; r uuid; o uuid;
begin
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found or j.status not in ('ready_for_dispatch','offering') then return null; end if;
  if exists (select 1 from public.delivery_offers where job_id = p_job and status = 'offered' and expires_at > now()) then return null; end if;
  update public.delivery_offers set status = 'expired', responded_at = now() where job_id = p_job and status = 'offered';
  if p_rider is not null then
    select e.user_id into r from private.eligible_riders(p_job) e where e.user_id = p_rider;
  else
    select e.user_id into r from private.eligible_riders(p_job) e where not e.tried limit 1;
  end if;
  if r is null then
    if j.status = 'offering' then
      update public.delivery_jobs set status = 'ready_for_dispatch', updated_at = now() where id = p_job;
      perform private.log_event(p_job, p_actor, 'no_rider_available', 'offering', 'ready_for_dispatch', null);
    end if;
    return null;
  end if;
  insert into public.delivery_offers (job_id, rider_id, offered_by, expires_at) values (p_job, r, p_actor, now() + interval '90 seconds') returning id into o;
  update public.delivery_jobs set status = 'offering', updated_at = now() where id = p_job;
  perform private.log_event(p_job, p_actor, 'offered', j.status, 'offering', r::text);
  return o;
end $$;

create or replace function private.expire_offers()
returns integer language plpgsql set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select id, job_id, rider_id from public.delivery_offers where status = 'offered' and expires_at <= now() order by expires_at loop
    perform 1 from public.delivery_jobs where id = r.job_id for update;   -- job lock first (same order everywhere)
    update public.delivery_offers set status = 'expired', responded_at = now() where id = r.id and status = 'offered';
    if found then
      perform private.log_event(r.job_id, null, 'offer_expired', null, null, r.rider_id::text);
      perform private.dispatch_next(r.job_id, null);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ---------- order -> job trigger ----------
create or replace function private.orders_delivery_job()
returns trigger language plpgsql security definer set search_path = '' as $$
declare jid uuid;
begin
  if new.status = 'cancelled' then
    update public.delivery_jobs set status = 'cancelled', rider_id = null, updated_at = now()
      where order_id = new.id and status not in ('delivered','cancelled') returning id into jid;
    if jid is not null then
      update public.delivery_offers set status = 'cancelled', responded_at = now() where job_id = jid and status = 'offered';
      perform private.log_event(jid, (select auth.uid()), 'order_cancelled', null, 'cancelled', null);
    end if;
    return new;
  end if;
  if new.fulfilment = 'locallane' and new.delivery_type = 'delivery' and new.status = 'packed' then
    insert into public.delivery_jobs (order_id) values (new.id) on conflict (order_id) do nothing returning id into jid;
    if jid is not null then
      perform private.log_event(jid, (select auth.uid()), 'job_created', null, 'pending_verification', 'Order marked ready for pickup');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_delivery_job_trg on public.orders;
create trigger orders_delivery_job_trg after update of status, fulfilment on public.orders
  for each row when (new.status is distinct from old.status or new.fulfilment is distinct from old.fulfilment)
  execute function private.orders_delivery_job();

-- ---------- guards: shop owners cannot fake out_for_delivery / delivered on LocalLane-delivered orders ----------
create or replace function public.guard_order_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'A cancelled order cannot be reopened';
  end if;
  if new.fulfilment = 'locallane' and new.delivery_type = 'delivery'
     and new.status in ('out_for_delivery','delivered') and new.status is distinct from old.status
     and current_user in ('authenticated','anon') then
    raise exception 'This order is delivered by LocalLane Delivery. The rider updates this status.';
  end if;
  return new;
end $$;

create or replace function public.guard_order_fulfilment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.fulfilment is distinct from old.fulfilment and (select auth.uid()) is not null then
    if old.status not in ('new','confirmed','packed') then
      raise exception 'Delivery type can only be changed before pickup';
    end if;
    if exists (select 1 from public.delivery_jobs where order_id = old.id and status <> 'cancelled') then
      raise exception 'A delivery job already exists for this order';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_order_fulfilment_trg on public.orders;
create trigger guard_order_fulfilment_trg before update of fulfilment on public.orders for each row execute function public.guard_order_fulfilment();

revoke execute on function public.guard_order_fulfilment() from public, anon, authenticated;
