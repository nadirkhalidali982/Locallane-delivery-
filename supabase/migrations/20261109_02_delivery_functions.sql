-- Batch 2 / Milestone 2+3: public API functions. All SECURITY DEFINER with role checks inside.

create or replace function public.delivery_jobs_list(p_status text default null)
returns table(job_id uuid, order_id uuid, order_no bigint, job_status text, shop_name text, shop_address text, shop_phone text,
  customer_name text, customer_phone text, address text, note text, total numeric, delivery_fee numeric,
  payment_method text, payment_status text, items jsonb, rider_id uuid, rider_name text, failure_reason text,
  created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager','staff') then raise exception 'Not allowed'; end if;
  return query
  select j.id, j.order_id, o.order_no, j.status, st.name, st.address, st.phone,
         o.customer_name, o.customer_phone, o.address, o.note, o.total, o.delivery_fee, o.payment_method, o.payment_status,
         (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'size', i.size, 'qty', i.quantity, 'price', i.price) order by i.name), '[]'::jsonb)
            from public.order_items i where i.order_id = o.id),
         j.rider_id, m.full_name, j.failure_reason, j.created_at, j.updated_at
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  left join public.delivery_members m on m.user_id = j.rider_id
  where p_status is null or j.status = p_status
  order by j.created_at desc
  limit 300;
end $$;

create or replace function public.delivery_job_events_list(p_job uuid)
returns table(id bigint, action text, from_status text, to_status text, note text, actor_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager','staff') then raise exception 'Not allowed'; end if;
  return query
  select e.id, e.action, e.from_status, e.to_status, e.note, coalesce(m.full_name, p.name), e.created_at
  from public.delivery_job_events e
  left join public.delivery_members m on m.user_id = e.actor
  left join public.profiles p on p.id = e.actor
  where e.job_id = p_job
  order by e.id;
end $$;

create or replace function public.delivery_verify_job(p_job uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs; o public.orders; me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager','staff') then raise exception 'Not allowed'; end if;
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if j.status <> 'pending_verification' then raise exception 'This job is already verified'; end if;
  select * into o from public.orders where id = j.order_id;
  if p_ok then
    if o.status <> 'packed' or o.delivery_type <> 'delivery' then raise exception 'The order is not ready for pickup'; end if;
    if length(trim(coalesce(o.address, ''))) < 5 then raise exception 'Delivery address is missing or too short'; end if;
    if length(trim(coalesce(o.customer_phone, ''))) < 7 then raise exception 'Customer phone is missing'; end if;
    update public.delivery_jobs set status = 'ready_for_dispatch', verified_by = me, verified_at = now(), updated_at = now() where id = p_job;
    perform private.log_event(p_job, me, 'verified', 'pending_verification', 'ready_for_dispatch', nullif(trim(coalesce(p_note, '')), ''));
  else
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Write the reason'; end if;
    update public.delivery_jobs set status = 'failed', failure_reason = left(trim(p_note), 300), updated_at = now() where id = p_job;
    perform private.log_event(p_job, me, 'verification_failed', 'pending_verification', 'failed', left(trim(p_note), 300));
  end if;
end $$;

create or replace function public.delivery_nearby_riders(p_job uuid)
returns table(user_id uuid, full_name text, phone text, km double precision, tried boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager','staff') then raise exception 'Not allowed'; end if;
  return query select e.user_id, e.full_name, e.phone, e.km, e.tried from private.eligible_riders(p_job) e;
end $$;

-- p_rider null = nearest rider not yet tried. Returns {ok, message, offer_id}.
create or replace function public.delivery_offer_job(p_job uuid, p_rider uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); o uuid; st text;
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager','staff') then raise exception 'Not allowed'; end if;
  select status into st from public.delivery_jobs where id = p_job;
  if st is null then raise exception 'Job not found'; end if;
  if st not in ('ready_for_dispatch','offering') then
    return jsonb_build_object('ok', false, 'message', 'Verify the order first, or it is already assigned');
  end if;
  o := private.dispatch_next(p_job, me, p_rider);
  if o is not null then return jsonb_build_object('ok', true, 'offer_id', o); end if;
  if exists (select 1 from public.delivery_offers where job_id = p_job and status = 'offered' and expires_at > now()) then
    return jsonb_build_object('ok', false, 'message', 'Waiting for the current rider to respond');
  end if;
  return jsonb_build_object('ok', false, 'message', case when p_rider is null then 'No rider is online nearby right now' else 'This rider is not available' end);
end $$;

create or replace function public.delivery_assign_manual(p_job uuid, p_rider uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs; me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if j.status not in ('ready_for_dispatch','offering') then raise exception 'This job cannot be assigned now'; end if;
  if not exists (select 1 from public.delivery_members where user_id = p_rider and role = 'rider' and is_active) then raise exception 'Choose an active rider'; end if;
  if exists (select 1 from public.delivery_jobs where rider_id = p_rider and status in ('assigned','picked_up')) then raise exception 'This rider already has an active delivery'; end if;
  update public.delivery_offers set status = 'cancelled', responded_at = now() where job_id = p_job and status = 'offered';
  update public.delivery_jobs set status = 'assigned', rider_id = p_rider, assigned_at = now(), updated_at = now() where id = p_job;
  perform private.log_event(p_job, me, 'assigned_manually', j.status, 'assigned', p_rider::text);
end $$;

create or replace function public.delivery_unassign(p_job uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.delivery_jobs; me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write the reason'; end if;
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if j.status <> 'assigned' then raise exception 'Only an assigned job (before pickup) can be reassigned'; end if;
  update public.delivery_jobs set status = 'ready_for_dispatch', rider_id = null, assigned_at = null, updated_at = now() where id = p_job;
  perform private.log_event(p_job, me, 'unassigned', 'assigned', 'ready_for_dispatch', left(trim(p_reason), 300) || ' (rider ' || j.rider_id::text || ')');
end $$;

create or replace function public.delivery_expire_offers()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') = '' then raise exception 'Not allowed'; end if;
  return private.expire_offers();
end $$;

-- ---------- rider side ----------
create or replace function public.rider_set_status(p_online boolean, p_lat double precision default null, p_lng double precision default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); r record;
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  if (p_lat is not null and (p_lat < -90 or p_lat > 90)) or (p_lng is not null and (p_lng < -180 or p_lng > 180)) then raise exception 'Invalid location'; end if;
  if not p_online then
    for r in select id, job_id from public.delivery_offers where rider_id = me and status = 'offered' loop
      perform 1 from public.delivery_jobs where id = r.job_id for update;
      update public.delivery_offers set status = 'cancelled', responded_at = now() where id = r.id and status = 'offered';
      if found then
        perform private.log_event(r.job_id, me, 'offer_cancelled_offline', null, null, me::text);
        perform private.dispatch_next(r.job_id, null);
      end if;
    end loop;
  end if;
  insert into public.delivery_rider_status (user_id, is_online, lat, lng, updated_at) values (me, p_online, p_lat, p_lng, now())
  on conflict (user_id) do update set is_online = excluded.is_online, lat = coalesce(excluded.lat, public.delivery_rider_status.lat),
    lng = coalesce(excluded.lng, public.delivery_rider_status.lng), updated_at = now();
end $$;

-- Offers show the shop and the earnings/COD amounts only. NO customer name, phone or address before acceptance.
create or replace function public.rider_my_offers()
returns table(offer_id uuid, job_id uuid, order_no bigint, shop_name text, shop_address text, items_count integer,
  payment_method text, collect_amount numeric, delivery_fee numeric, expires_at timestamptz, km double precision)
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  perform private.expire_offers();
  return query
  select f.id, f.job_id, o.order_no, st.name, st.address,
         (select coalesce(sum(i.quantity), 0)::integer from public.order_items i where i.order_id = o.id),
         o.payment_method, case when o.payment_status = 'paid' then 0::numeric else o.total end, o.delivery_fee, f.expires_at,
         private.km(s.lat, s.lng, st.latitude, st.longitude)
  from public.delivery_offers f
  join public.delivery_jobs j on j.id = f.job_id
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  left join public.delivery_rider_status s on s.user_id = f.rider_id
  where f.rider_id = me and f.status = 'offered' and f.expires_at > now();
end $$;

-- Returns {result: accepted | rejected | expired | taken | busy}
create or replace function public.rider_respond_offer(p_offer uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); f public.delivery_offers; j public.delivery_jobs;
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  select * into f from public.delivery_offers where id = p_offer and rider_id = me;
  if not found then raise exception 'Offer not found'; end if;
  select * into j from public.delivery_jobs where id = f.job_id for update;          -- job lock first
  select * into f from public.delivery_offers where id = p_offer for update;
  if f.status <> 'offered' then
    return jsonb_build_object('result', case when f.status = 'cancelled' then 'taken' else f.status end);
  end if;
  if f.expires_at <= now() then
    update public.delivery_offers set status = 'expired', responded_at = now() where id = f.id;
    perform private.log_event(j.id, null, 'offer_expired', null, null, me::text);
    perform private.dispatch_next(j.id, null);
    return jsonb_build_object('result', 'expired');
  end if;
  if p_accept then
    if j.status <> 'offering' or j.rider_id is not null then
      update public.delivery_offers set status = 'cancelled', responded_at = now() where id = f.id;
      return jsonb_build_object('result', 'taken');
    end if;
    if exists (select 1 from public.delivery_jobs where rider_id = me and status in ('assigned','picked_up')) then
      return jsonb_build_object('result', 'busy');
    end if;
    update public.delivery_offers set status = 'accepted', responded_at = now() where id = f.id;
    update public.delivery_jobs set status = 'assigned', rider_id = me, assigned_at = now(), updated_at = now() where id = j.id;
    perform private.log_event(j.id, me, 'accepted', 'offering', 'assigned', me::text);
    return jsonb_build_object('result', 'accepted', 'job_id', j.id);
  end if;
  update public.delivery_offers set status = 'rejected', responded_at = now() where id = f.id;
  perform private.log_event(j.id, me, 'offer_rejected', null, null, me::text);
  perform private.dispatch_next(j.id, null);
  return jsonb_build_object('result', 'rejected');
end $$;

-- Customer name, phone and address are returned ONLY for jobs assigned to the calling rider.
create or replace function public.rider_my_jobs()
returns table(job_id uuid, order_no bigint, job_status text, shop_name text, shop_address text, shop_phone text,
  customer_name text, customer_phone text, address text, note text, total numeric, payment_method text, payment_status text,
  collect_amount numeric, items jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  return query
  select j.id, o.order_no, j.status, st.name, st.address, st.phone, o.customer_name, o.customer_phone, o.address, o.note,
         o.total, o.payment_method, o.payment_status, case when o.payment_status = 'paid' then 0::numeric else o.total end,
         (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'size', i.size, 'qty', i.quantity) order by i.name), '[]'::jsonb)
            from public.order_items i where i.order_id = o.id)
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  where j.rider_id = me and j.status in ('assigned','picked_up');
end $$;

-- ---------- lock down execute rights ----------
do $$
declare f text;
begin
  foreach f in array array[
    'public.delivery_jobs_list(text)', 'public.delivery_job_events_list(uuid)', 'public.delivery_verify_job(uuid,boolean,text)',
    'public.delivery_nearby_riders(uuid)', 'public.delivery_offer_job(uuid,uuid)', 'public.delivery_assign_manual(uuid,uuid)',
    'public.delivery_unassign(uuid,text)', 'public.delivery_expire_offers()', 'public.rider_set_status(boolean,double precision,double precision)',
    'public.rider_my_offers()', 'public.rider_respond_offer(uuid,boolean)', 'public.rider_my_jobs()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.km(double precision,double precision,double precision,double precision)', 'private.log_event(uuid,uuid,text,text,text,text)',
    'private.eligible_riders(uuid)', 'private.dispatch_next(uuid,uuid,uuid)', 'private.expire_offers()', 'private.orders_delivery_job()']
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Expire stale offers and move on to the next rider every minute.
select cron.schedule('delivery-expire-offers', '* * * * *', 'select private.expire_offers()');
