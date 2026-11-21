-- Batch 3: admin API for cities, zones, rider-zone permission, live rider board. List function re-created with zone columns.

create or replace function private.recompute_shop_zones()
returns void language sql set search_path = '' as $$
  update public.stores set latitude = latitude where latitude is not null
$$;
revoke execute on function private.recompute_shop_zones() from public, anon, authenticated;

-- Customer app: where does LocalLane deliver? (public, names and circles only)
create or replace function public.get_service_areas()
returns table(city text, zone text, center_lat double precision, center_lng double precision, radius_km numeric)
language sql stable security definer set search_path = '' as $$
  select c.name, z.name, z.center_lat, z.center_lng, z.radius_km
  from public.delivery_zones z join public.delivery_cities c on c.id = z.city_id
  where c.is_active and z.status = 'active' order by c.name, z.name
$$;
revoke execute on function public.get_service_areas() from public;
grant execute on function public.get_service_areas() to anon, authenticated;

create or replace function public.delivery_zones_overview()
returns table(zone_id uuid, city_id uuid, city_name text, state text, city_active boolean, zone_name text, center_lat double precision, center_lng double precision,
  radius_km numeric, status text, base_fee numeric, per_km numeric, offer_seconds integer, gps_fresh_seconds integer, max_pickup_km numeric,
  shops bigint, riders_authorized bigint, riders_online bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager','staff') then raise exception 'Not allowed'; end if;
  return query
  select z.id, c.id, c.name, c.state, c.is_active, z.name, z.center_lat, z.center_lng, z.radius_km, z.status, z.base_fee, z.per_km, z.offer_seconds, z.gps_fresh_seconds, z.max_pickup_km,
         (select count(*) from public.stores s where s.zone_id = z.id),
         (select count(*) from public.delivery_rider_zones rz join public.delivery_members m on m.user_id = rz.rider_id and m.is_active where rz.zone_id = z.id),
         (select count(*) from public.delivery_rider_zones rz join public.delivery_rider_status s on s.user_id = rz.rider_id
            where rz.zone_id = z.id and s.is_online and s.updated_at > now() - make_interval(secs => z.gps_fresh_seconds))
  from public.delivery_zones z join public.delivery_cities c on c.id = z.city_id
  order by c.name, z.name;
end $$;

create or replace function public.delivery_create_zone(p_city text, p_state text, p_zone text, p_lat double precision, p_lng double precision, p_radius_km numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); cid uuid; zid uuid;
begin
  if coalesce(public.delivery_role(), '') <> 'super_admin' then raise exception 'Only the Super Admin can create zones'; end if;
  if char_length(trim(coalesce(p_city, ''))) < 2 or char_length(trim(coalesce(p_zone, ''))) < 2 then raise exception 'Enter the city and the zone name'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Choose the zone centre on the map'; end if;
  if p_radius_km is null or p_radius_km not between 0.5 and 100 then raise exception 'Radius must be between 0.5 and 100 km'; end if;
  select id into cid from public.delivery_cities where lower(name) = lower(trim(p_city));
  if cid is null then
    insert into public.delivery_cities (name, state) values (trim(p_city), nullif(trim(coalesce(p_state, '')), '')) returning id into cid;
  end if;
  begin
    insert into public.delivery_zones (city_id, name, center_lat, center_lng, radius_km) values (cid, trim(p_zone), p_lat, p_lng, p_radius_km) returning id into zid;
  exception when unique_violation then raise exception 'This zone name already exists in the city';
  end;
  perform private.recompute_shop_zones();
  perform private.audit(me, 'zone_created', zid::text, jsonb_build_object('city', trim(p_city), 'zone', trim(p_zone), 'radius_km', p_radius_km));
  return zid;
end $$;

create or replace function public.delivery_update_zone(p_zone uuid, p_name text, p_lat double precision, p_lng double precision, p_radius_km numeric, p_status text,
  p_base_fee numeric, p_per_km numeric, p_offer_seconds integer, p_fresh_seconds integer, p_max_pickup_km numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'super_admin' then raise exception 'Only the Super Admin can change zones'; end if;
  if p_status not in ('active','paused','inactive') then raise exception 'Choose a status'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_radius_km not between 0.5 and 100 then raise exception 'Invalid location or radius'; end if;
  if p_offer_seconds not between 20 and 300 or p_fresh_seconds not between 60 and 3600 or p_max_pickup_km not between 1 and 100 then raise exception 'Invalid timing or distance'; end if;
  if (p_base_fee is not null and p_base_fee not between 0 and 1000) or (p_per_km is not null and p_per_km not between 0 and 100) then raise exception 'Invalid fee'; end if;
  begin
    update public.delivery_zones set name = trim(p_name), center_lat = p_lat, center_lng = p_lng, radius_km = p_radius_km, status = p_status, base_fee = p_base_fee, per_km = p_per_km,
      offer_seconds = p_offer_seconds, gps_fresh_seconds = p_fresh_seconds, max_pickup_km = p_max_pickup_km, updated_at = now() where id = p_zone;
  exception when unique_violation then raise exception 'This zone name already exists in the city';
  end;
  if not found then raise exception 'Zone not found'; end if;
  perform private.recompute_shop_zones();
  perform private.audit(me, 'zone_updated', p_zone::text, jsonb_build_object('status', p_status, 'radius_km', p_radius_km));
end $$;

create or replace function public.delivery_set_city_active(p_city uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'super_admin' then raise exception 'Only the Super Admin can change cities'; end if;
  update public.delivery_cities set is_active = p_active where id = p_city;
  if not found then raise exception 'City not found'; end if;
  perform private.recompute_shop_zones();
  perform private.audit(me, case when p_active then 'city_activated' else 'city_paused' end, p_city::text, null);
end $$;

create or replace function public.delivery_rider_zone_pairs()
returns table(rider_id uuid, zone_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  return query select rz.rider_id, rz.zone_id from public.delivery_rider_zones rz;
end $$;

create or replace function public.delivery_set_rider_zones(p_rider uuid, p_zones uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.delivery_members where user_id = p_rider and role = 'rider') then raise exception 'Rider not found'; end if;
  p_zones := coalesce(p_zones, '{}'::uuid[]);
  if cardinality(p_zones) > 50 then raise exception 'Too many zones'; end if;
  delete from public.delivery_rider_zones where rider_id = p_rider and not (zone_id = any(p_zones));
  insert into public.delivery_rider_zones (rider_id, zone_id, created_by)
    select p_rider, z.id, me from public.delivery_zones z where z.id = any(p_zones) on conflict do nothing;
  perform private.audit(me, 'rider_zones_set', p_rider::text, jsonb_build_object('zones', p_zones));
end $$;

create or replace function public.delivery_riders_live()
returns table(user_id uuid, full_name text, phone text, state text, last_seen timestamptz, zones text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager','staff') then raise exception 'Not allowed'; end if;
  return query
  select m.user_id, m.full_name, m.phone,
         case when not coalesce(s.is_online, false) then 'offline'
              when exists (select 1 from public.delivery_jobs j where j.rider_id = m.user_id and j.status in ('assigned','picked_up')) then 'busy'
              when exists (select 1 from public.delivery_offers f where f.rider_id = m.user_id and f.status = 'offered' and f.expires_at > now()) then 'offered'
              when s.lat is null or s.updated_at < now() - interval '4 minutes' then 'gps_old'
              else 'available' end,
         s.updated_at,
         (select string_agg(z.name, ', ' order by z.name) from public.delivery_rider_zones rz join public.delivery_zones z on z.id = rz.zone_id where rz.rider_id = m.user_id)
  from public.delivery_members m left join public.delivery_rider_status s on s.user_id = m.user_id
  where m.role = 'rider' and m.is_active
  order by 4, m.full_name;
end $$;

-- manual assignment: the rider must be authorised for the order's zone
create or replace function public.delivery_assign_manual(p_job uuid, p_rider uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs; me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if j.status not in ('ready_for_dispatch','offering') then raise exception 'This job cannot be assigned now'; end if;
  if j.zone_id is null then raise exception 'This order has no delivery zone'; end if;
  if not exists (select 1 from public.delivery_members where user_id = p_rider and role = 'rider' and is_active) then raise exception 'Choose an active rider'; end if;
  if not exists (select 1 from public.delivery_rider_zones where rider_id = p_rider and zone_id = j.zone_id) then raise exception 'This rider is not authorised for the order''s zone'; end if;
  if exists (select 1 from public.delivery_jobs where rider_id = p_rider and status in ('assigned','picked_up')) then raise exception 'This rider already has an active delivery'; end if;
  update public.delivery_offers set status = 'cancelled', responded_at = now() where job_id = p_job and status = 'offered';
  update public.delivery_jobs set status = 'assigned', rider_id = p_rider, assigned_at = now(), updated_at = now() where id = p_job;
  perform private.log_event(p_job, me, 'assigned_manually', j.status, 'assigned', p_rider::text);
end $$;

drop function if exists public.delivery_jobs_list(text);
create function public.delivery_jobs_list(p_status text default null)
returns table(job_id uuid, order_id uuid, order_no bigint, job_status text, shop_name text, shop_address text, shop_phone text,
  customer_name text, customer_phone text, address text, note text, total numeric, delivery_fee numeric,
  payment_method text, payment_status text, items jsonb, rider_id uuid, rider_name text, failure_reason text,
  created_at timestamptz, updated_at timestamptz, picked_up_at timestamptz, delivered_at timestamptz, otp_locked boolean,
  offer_after timestamptz, no_rider_since timestamptz, at_shop_at timestamptz, prep_minutes integer, auto_verified boolean,
  zone_name text, geo_flag text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager','staff') then raise exception 'Not allowed'; end if;
  return query
  select j.id, j.order_id, o.order_no, j.status, st.name, st.address, st.phone,
         o.customer_name, o.customer_phone, o.address, o.note, o.total, o.delivery_fee, o.payment_method, o.payment_status,
         (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'size', i.size, 'qty', i.quantity, 'price', i.price) order by i.name), '[]'::jsonb)
            from public.order_items i where i.order_id = o.id),
         j.rider_id, m.full_name, j.failure_reason, j.created_at, j.updated_at, j.picked_up_at, j.delivered_at,
         coalesce((select s.attempts >= 5 from public.delivery_job_secrets s where s.job_id = j.id), false),
         j.offer_after, j.no_rider_since, j.at_shop_at, o.prep_minutes, j.auto_verified, z.name, j.geo_flag
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  left join public.delivery_zones z on z.id = j.zone_id
  left join public.delivery_members m on m.user_id = j.rider_id
  where p_status is null or j.status = p_status
  order by j.created_at desc
  limit 300;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.delivery_zones_overview()', 'public.delivery_create_zone(text,text,text,double precision,double precision,numeric)',
    'public.delivery_update_zone(uuid,text,double precision,double precision,numeric,text,numeric,numeric,integer,integer,numeric)', 'public.delivery_set_city_active(uuid,boolean)',
    'public.delivery_rider_zone_pairs()', 'public.delivery_set_rider_zones(uuid,uuid[])', 'public.delivery_riders_live()', 'public.delivery_assign_manual(uuid,uuid)', 'public.delivery_jobs_list(text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
