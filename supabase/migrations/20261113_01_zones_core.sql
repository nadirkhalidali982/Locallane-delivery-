-- Batch 3 (Milestones 5+6): cities, zones, rider-zone permission, fresh-GPS dispatch. ADDITIVE.
create table if not exists public.delivery_cities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  state text check (state is null or char_length(state) <= 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists delivery_cities_name_uniq on public.delivery_cities (lower(name));

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.delivery_cities(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 80),
  center_lat double precision not null check (center_lat between -90 and 90),
  center_lng double precision not null check (center_lng between -180 and 180),
  radius_km numeric not null check (radius_km between 0.5 and 100),
  status text not null default 'active' check (status in ('active','paused','inactive')),
  base_fee numeric check (base_fee is null or base_fee between 0 and 1000),
  per_km numeric check (per_km is null or per_km between 0 and 100),
  offer_seconds integer not null default 90 check (offer_seconds between 20 and 300),
  gps_fresh_seconds integer not null default 240 check (gps_fresh_seconds between 60 and 3600),
  max_pickup_km numeric not null default 15 check (max_pickup_km between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists delivery_zones_city_name_uniq on public.delivery_zones (city_id, lower(name));

create table if not exists public.delivery_rider_zones (
  rider_id uuid not null references public.delivery_members(user_id) on delete cascade,
  zone_id uuid not null references public.delivery_zones(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (rider_id, zone_id)
);
create index if not exists delivery_rider_zones_zone_idx on public.delivery_rider_zones (zone_id);

alter table public.delivery_cities enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.delivery_rider_zones enable row level security;
create policy delivery_cities_select on public.delivery_cities for select to authenticated
  using (coalesce(public.delivery_role(), '') in ('super_admin','manager','staff'));
create policy delivery_zones_select on public.delivery_zones for select to authenticated
  using (coalesce(public.delivery_role(), '') in ('super_admin','manager','staff'));
create policy delivery_rider_zones_select on public.delivery_rider_zones for select to authenticated
  using (rider_id = (select auth.uid()) or coalesce(public.delivery_role(), '') in ('super_admin','manager'));
revoke all on public.delivery_cities, public.delivery_zones, public.delivery_rider_zones from anon, authenticated;
grant select on public.delivery_cities, public.delivery_zones, public.delivery_rider_zones to authenticated;

alter table public.stores add column if not exists zone_id uuid references public.delivery_zones(id) on delete set null;
alter table public.delivery_jobs add column if not exists zone_id uuid references public.delivery_zones(id) on delete set null;
alter table public.delivery_jobs add column if not exists geo_flag text check (geo_flag is null or geo_flag in ('no_zone','customer_outside_zone','no_customer_pin'));
create index if not exists stores_zone_idx on public.stores (zone_id);
create index if not exists delivery_jobs_zone_idx on public.delivery_jobs (zone_id);

-- zone that contains a point (nearest centre wins); inactive zones and inactive cities do not count
create or replace function private.zone_for_point(p_lat double precision, p_lng double precision)
returns uuid language sql stable set search_path = '' as $$
  select z.id from public.delivery_zones z join public.delivery_cities c on c.id = z.city_id
  where p_lat is not null and p_lng is not null and c.is_active and z.status in ('active','paused')
    and private.km(p_lat, p_lng, z.center_lat, z.center_lng) <= z.radius_km
  order by private.km(p_lat, p_lng, z.center_lat, z.center_lng) limit 1
$$;
revoke execute on function private.zone_for_point(double precision, double precision) from public, anon, authenticated;

-- a shop's zone always follows its map location (cannot be set from the API)
create or replace function public.stores_set_zone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.zone_id := private.zone_for_point(new.latitude, new.longitude);
  return new;
end $$;
revoke execute on function public.stores_set_zone() from public, anon, authenticated;
drop trigger if exists stores_set_zone_trg on public.stores;
create trigger stores_set_zone_trg before insert or update on public.stores for each row execute function public.stores_set_zone();

-- distance-based flag for a job: shop outside any zone, customer pin outside the zone, or no pin at all
create or replace function private.geo_flag_for(p_zone uuid, p_lat double precision, p_lng double precision)
returns text language sql stable set search_path = '' as $$
  select case
    when p_zone is null then 'no_zone'
    when p_lat is null or p_lng is null then 'no_customer_pin'
    when private.km(p_lat, p_lng, z.center_lat, z.center_lng) > z.radius_km then 'customer_outside_zone'
    else null end
  from (select 1) d left join public.delivery_zones z on z.id = p_zone
$$;
revoke execute on function private.geo_flag_for(uuid, double precision, double precision) from public, anon, authenticated;

create or replace function private.rider_fee(p_job uuid)
returns numeric language sql stable set search_path = '' as $$
  select round((coalesce(z.base_fee, s.rider_base_fee)
                + coalesce(coalesce(z.per_km, s.rider_per_km) * private.km(st.latitude, st.longitude, o.delivery_lat, o.delivery_lng), 0))::numeric, 2)
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  cross join public.delivery_settings s
  left join public.delivery_zones z on z.id = j.zone_id
  where j.id = p_job
$$;
revoke execute on function private.rider_fee(uuid) from public, anon, authenticated;

-- eligible riders: authorised for the zone, online, fresh valid GPS, near the shop, free
create or replace function private.eligible_riders(p_job uuid)
returns table(user_id uuid, full_name text, phone text, km double precision, tried boolean)
language sql stable set search_path = '' as $$
  select m.user_id, m.full_name, m.phone,
         private.km(s.lat, s.lng, st.latitude, st.longitude),
         exists (select 1 from public.delivery_offers p where p.job_id = j.id and p.rider_id = m.user_id and p.status in ('rejected','expired','released'))
  from public.delivery_jobs j
  join public.delivery_zones z on z.id = j.zone_id and z.status <> 'inactive'
  join public.delivery_cities c on c.id = z.city_id and c.is_active
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  join public.delivery_members m on m.role = 'rider' and m.is_active
  join public.delivery_rider_zones rz on rz.rider_id = m.user_id and rz.zone_id = j.zone_id
  join public.delivery_rider_status s on s.user_id = m.user_id and s.is_online and s.lat is not null and s.lng is not null
       and s.updated_at > now() - make_interval(secs => z.gps_fresh_seconds)
  where j.id = p_job
    and private.km(s.lat, s.lng, st.latitude, st.longitude) <= z.max_pickup_km
    and not exists (select 1 from public.delivery_jobs a where a.rider_id = m.user_id and a.status in ('assigned','picked_up'))
    and not exists (select 1 from public.delivery_offers f where f.rider_id = m.user_id and f.status = 'offered' and f.job_id <> j.id)
  order by 4, s.updated_at desc
$$;
revoke execute on function private.eligible_riders(uuid) from public, anon, authenticated;

create or replace function private.dispatch_next(p_job uuid, p_actor uuid, p_rider uuid default null)
returns uuid language plpgsql set search_path = '' as $$
declare j public.delivery_jobs; z public.delivery_zones; r uuid; o uuid;
begin
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found or j.status not in ('ready_for_dispatch','offering') then return null; end if;
  if p_actor is null and j.offer_after is not null and j.offer_after > now() then return null; end if;
  select * into z from public.delivery_zones where id = j.zone_id;
  if p_actor is null and (not found or z.status <> 'active') then return null; end if;   -- paused zone: only staff can dispatch
  if exists (select 1 from public.delivery_offers where job_id = p_job and status = 'offered' and expires_at > now()) then return null; end if;
  update public.delivery_offers set status = 'expired', responded_at = now() where job_id = p_job and status = 'offered';
  if p_rider is not null then
    select e.user_id into r from private.eligible_riders(p_job) e where e.user_id = p_rider;
  else
    select e.user_id into r from private.eligible_riders(p_job) e where not e.tried limit 1;
  end if;
  if r is null then
    if j.status = 'offering' then
      update public.delivery_jobs set status = 'ready_for_dispatch', no_rider_since = coalesce(no_rider_since, now()), updated_at = now() where id = p_job;
      perform private.log_event(p_job, p_actor, 'no_rider_available', 'offering', 'ready_for_dispatch', null);
    else
      update public.delivery_jobs set no_rider_since = now() where id = p_job and no_rider_since is null;
    end if;
    return null;
  end if;
  insert into public.delivery_offers (job_id, rider_id, offered_by, expires_at) values (p_job, r, p_actor, now() + make_interval(secs => coalesce(z.offer_seconds, 90))) returning id into o;
  update public.delivery_jobs set status = 'offering', no_rider_since = null, updated_at = now() where id = p_job;
  perform private.log_event(p_job, p_actor, 'offered', j.status, 'offering', r::text);
  return o;
end $$;
revoke execute on function private.dispatch_next(uuid, uuid, uuid) from public, anon, authenticated;

-- order -> job: zone from the shop; shop outside a zone or customer pin outside the zone => staff check
create or replace function private.orders_delivery_job()
returns trigger language plpgsql security definer set search_path = '' as $$
declare jid uuid; after_ts timestamptz; zid uuid; flag text;
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
  if new.fulfilment = 'locallane' and new.delivery_type = 'delivery' and new.status in ('confirmed','packed') then
    select zone_id into zid from public.stores where id = new.store_id;
    flag := private.geo_flag_for(zid, new.delivery_lat, new.delivery_lng);
    after_ts := coalesce(new.accepted_at, now()) + make_interval(mins => greatest(0, coalesce(new.prep_minutes, 10) - 5));
    insert into public.delivery_jobs (order_id, offer_after, zone_id, geo_flag) values (new.id, after_ts, zid, flag) on conflict (order_id) do nothing returning id into jid;
    if jid is not null then
      perform private.log_event(jid, (select auth.uid()), 'job_created', null, 'pending_verification', 'Order accepted by the shop');
      if flag in ('no_zone','customer_outside_zone') then
        perform private.log_event(jid, null, 'needs_check', null, null, case flag when 'no_zone' then 'Shop is not inside a delivery zone' else 'Customer pin is outside the delivery zone' end);
      elsif length(trim(coalesce(new.address, ''))) >= 8 and length(trim(coalesce(new.customer_phone, ''))) >= 7 then
        update public.delivery_jobs set status = 'ready_for_dispatch', auto_verified = true, verified_at = now(), updated_at = now() where id = jid;
        perform private.log_event(jid, null, 'verified', 'pending_verification', 'ready_for_dispatch', 'Checked automatically');
        if after_ts <= now() then perform private.dispatch_next(jid, null); end if;
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.orders_delivery_job() from public, anon, authenticated;

-- a shop must be inside an active delivery zone to choose LocalLane Delivery
create or replace function public.guard_order_fulfilment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.fulfilment is distinct from old.fulfilment and (select auth.uid()) is not null then
    if old.status not in ('new','confirmed','packed') then raise exception 'Delivery type can only be changed before pickup'; end if;
    if exists (select 1 from public.delivery_jobs where order_id = old.id and status <> 'cancelled') then raise exception 'A delivery job already exists for this order'; end if;
    if new.fulfilment = 'locallane' then
      if exists (select 1 from public.stores where id = new.store_id and (latitude is null or longitude is null)) then
        raise exception 'Set your shop location in Settings before choosing LocalLane Delivery';
      end if;
      if exists (select 1 from public.stores s where s.id = new.store_id and not exists (select 1 from public.delivery_zones z join public.delivery_cities c on c.id = z.city_id where z.id = s.zone_id and z.status = 'active' and c.is_active)) then
        raise exception 'LocalLane Delivery is not available at your shop location yet';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_order_fulfilment() from public, anon, authenticated;

-- a pin shared after the order refreshes the job's flag
create or replace function public.set_order_location(p_token text, p_lat double precision, p_lng double precision)
returns boolean language plpgsql security definer set search_path = '' as $$
declare oid uuid;
begin
  if p_token is null or char_length(p_token) < 16 then return false; end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then raise exception 'Invalid location'; end if;
  update public.orders set delivery_lat = p_lat, delivery_lng = p_lng
  where tracking_token = p_token and delivery_type = 'delivery' and status in ('new','confirmed','packed','out_for_delivery') returning id into oid;
  if oid is null then return false; end if;
  update public.delivery_jobs j set geo_flag = private.geo_flag_for(j.zone_id, p_lat, p_lng) where j.order_id = oid and j.status in ('pending_verification','ready_for_dispatch','offering');
  return true;
end $$;
revoke execute on function public.set_order_location(text, double precision, double precision) from public;
grant execute on function public.set_order_location(text, double precision, double precision) to anon, authenticated;

-- riders who stop sending GPS go offline by themselves (unless they are on a delivery)
create or replace function private.auto_offline()
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.delivery_rider_status s set is_online = false
  where s.is_online and s.updated_at < now() - interval '10 minutes'
    and not exists (select 1 from public.delivery_jobs j where j.rider_id = s.user_id and j.status in ('assigned','picked_up'));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function private.auto_offline() from public, anon, authenticated;
select cron.schedule('delivery-auto-offline', '* * * * *', 'select private.auto_offline()');
