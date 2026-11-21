-- Batch 2 (Milestones 3+4): API functions for the simple workflow. List functions are re-created with extra columns.

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
    if o.status not in ('confirmed','packed') or o.delivery_type <> 'delivery' then raise exception 'The order is not ready for delivery'; end if;
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

create or replace function public.rider_arrived_shop(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); j public.delivery_jobs;
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found or j.rider_id is distinct from me then raise exception 'Job not found'; end if;
  if j.status <> 'assigned' then raise exception 'This delivery is not waiting for pickup'; end if;
  if j.at_shop_at is null then
    update public.delivery_jobs set at_shop_at = now(), updated_at = now() where id = p_job;
    perform private.log_event(p_job, me, 'at_shop', 'assigned', 'assigned', null);
  end if;
end $$;

drop function if exists public.rider_my_jobs();
create function public.rider_my_jobs()
returns table(job_id uuid, order_no bigint, job_status text, shop_name text, shop_address text, shop_phone text,
  customer_name text, customer_phone text, address text, note text, total numeric, payment_method text, payment_status text,
  collect_amount numeric, items jsonb, shop_lat double precision, shop_lng double precision, cust_lat double precision, cust_lng double precision,
  picked_up_at timestamptz, at_shop_at timestamptz, order_status text)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  return query
  select j.id, o.order_no, j.status, st.name, st.address, st.phone, o.customer_name, o.customer_phone, o.address, o.note,
         o.total, o.payment_method, o.payment_status, case when o.payment_status = 'paid' then 0::numeric else o.total end,
         (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'size', i.size, 'qty', i.quantity) order by i.name), '[]'::jsonb)
            from public.order_items i where i.order_id = o.id),
         st.latitude, st.longitude, o.delivery_lat, o.delivery_lng, j.picked_up_at, j.at_shop_at, o.status
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  where j.rider_id = me and j.status in ('assigned','picked_up');
end $$;

drop function if exists public.rider_my_offers();
create function public.rider_my_offers()
returns table(offer_id uuid, job_id uuid, order_no bigint, shop_name text, shop_address text, items_count integer,
  payment_method text, collect_amount numeric, est_earning numeric, pickup_km double precision, trip_km double precision, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  perform private.expire_offers();
  return query
  select f.id, f.job_id, o.order_no, st.name, st.address,
         (select coalesce(sum(i.quantity), 0)::integer from public.order_items i where i.order_id = o.id),
         o.payment_method, case when o.payment_status = 'paid' then 0::numeric else o.total end,
         private.rider_fee(f.job_id),
         private.km(s.lat, s.lng, st.latitude, st.longitude),
         private.km(st.latitude, st.longitude, o.delivery_lat, o.delivery_lng),
         f.expires_at
  from public.delivery_offers f
  join public.delivery_jobs j on j.id = f.job_id
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  left join public.delivery_rider_status s on s.user_id = f.rider_id
  where f.rider_id = me and f.status = 'offered' and f.expires_at > now();
end $$;

drop function if exists public.delivery_jobs_list(text);
create function public.delivery_jobs_list(p_status text default null)
returns table(job_id uuid, order_id uuid, order_no bigint, job_status text, shop_name text, shop_address text, shop_phone text,
  customer_name text, customer_phone text, address text, note text, total numeric, delivery_fee numeric,
  payment_method text, payment_status text, items jsonb, rider_id uuid, rider_name text, failure_reason text,
  created_at timestamptz, updated_at timestamptz, picked_up_at timestamptz, delivered_at timestamptz, otp_locked boolean,
  offer_after timestamptz, no_rider_since timestamptz, at_shop_at timestamptz, prep_minutes integer, auto_verified boolean)
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
         j.offer_after, j.no_rider_since, j.at_shop_at, o.prep_minutes, j.auto_verified
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  left join public.delivery_members m on m.user_id = j.rider_id
  where p_status is null or j.status = p_status
  order by j.created_at desc
  limit 300;
end $$;

-- Shop owner (or admin) sees the delivery stage and rider details for their own orders only.
create or replace function public.shop_delivery_statuses(p_orders uuid[])
returns table(order_id uuid, stage text, rider_name text, rider_phone text, at_shop_at timestamptz, offer_after timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Not allowed'; end if;
  if p_orders is null or cardinality(p_orders) > 100 then raise exception 'Too many orders'; end if;
  return query
  select o.id, private.delivery_stage(j.status, j.at_shop_at, j.no_rider_since),
         case when j.status in ('assigned','picked_up') then m.full_name end,
         case when j.status in ('assigned','picked_up') then m.phone end,
         j.at_shop_at, j.offer_after
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  left join public.delivery_members m on m.user_id = j.rider_id
  where o.id = any(p_orders) and (st.owner_id = me or public.is_admin());
end $$;

-- Customer (tracking token) sees the stage and the rider's first name only.
create or replace function public.delivery_stage_for_token(p_token text)
returns table(stage text, rider_first_name text)
language sql stable security definer set search_path = '' as $$
  select private.delivery_stage(j.status, j.at_shop_at, j.no_rider_since),
         case when j.status in ('assigned','picked_up') then split_part(coalesce(m.full_name, ''), ' ', 1) end
  from public.orders o
  join public.delivery_jobs j on j.order_id = o.id
  left join public.delivery_members m on m.user_id = j.rider_id
  where o.tracking_token = p_token and char_length(coalesce(p_token, '')) >= 16
$$;

-- place_order: same behaviour, plus duplicate protection (p_client_key) and a per-phone throttle.
drop function if exists public.place_order(uuid, jsonb, text, text, text, text, text, text, text);
create function public.place_order(p_store_id uuid, p_items jsonb, p_customer_name text, p_customer_phone text, p_customer_email text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_delivery_type text DEFAULT 'delivery'::text, p_coupon text DEFAULT NULL::text, p_client_key uuid DEFAULT NULL::uuid)
 RETURNS TABLE(order_id uuid, order_no bigint, tracking_token text, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.stores%rowtype; prod public.products%rowtype; item jsonb; qty integer; v_size text; v_idx integer; v_cur integer; v_name text;
  v_order public.orders%rowtype; v_subtotal numeric := 0; v_fee numeric := 0; v_discount numeric := 0; v_offer uuid; v_code text;
  v_lines jsonb := '[]'::jsonb; v_digits text; v_deal boolean; v_unit numeric; v_deal_total numeric := 0; v_base numeric; v_recent integer;
begin
  select * into s from public.stores where id = p_store_id and is_active and status = 'published';
  if not found then raise exception 'This store is not available'; end if;
  if p_customer_name is null or char_length(trim(p_customer_name)) < 2 or char_length(p_customer_name) > 80 then raise exception 'Please enter a valid name'; end if;
  if p_customer_phone is null or p_customer_phone !~ '^[0-9+ -]{8,15}$' then raise exception 'Please enter a valid phone number'; end if;
  if p_delivery_type not in ('delivery','pickup') then raise exception 'Invalid delivery type'; end if;
  if p_delivery_type = 'pickup' and not s.pickup_enabled then raise exception 'Pickup is not available for this store'; end if;
  if p_delivery_type = 'delivery' then
    if not s.cod_enabled then raise exception 'Delivery with cash on delivery is not available'; end if;
    if p_address is null or char_length(trim(p_address)) < 8 then raise exception 'Please enter your full address'; end if;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then raise exception 'Your cart is empty or too large'; end if;

  -- the same checkout attempt (same key) never creates a second order
  if p_client_key is not null then
    select * into v_order from public.orders where store_id = p_store_id and client_key = p_client_key;
    if found then return query select v_order.id, v_order.order_no, v_order.tracking_token, v_order.total; return; end if;
  end if;

  -- per-phone throttle against fake-order floods
  v_digits := right(regexp_replace(p_customer_phone, '[^0-9]', '', 'g'), 10);
  select count(*) into v_recent from public.orders
    where created_at > now() - interval '15 minutes' and right(regexp_replace(customer_phone, '[^0-9]', '', 'g'), 10) = v_digits;
  if v_recent >= 8 then raise exception 'Too many orders from this phone number. Please wait a few minutes and try again.'; end if;

  for item in select * from jsonb_array_elements(p_items) loop
    qty := (item->>'quantity')::integer;
    if qty is null or qty < 1 or qty > 100 then raise exception 'Invalid quantity'; end if;
    select * into prod from public.products where id = (item->>'product_id')::uuid and store_id = p_store_id and is_active for update;
    if not found then raise exception 'A product in your cart is no longer available'; end if;

    v_deal := public.deal_active(prod.deal_price, prod.deal_starts_at, prod.deal_ends_at, prod.deal_limit, prod.deal_sold);
    v_unit := case when v_deal then prod.deal_price else prod.price end;
    if v_deal and prod.deal_limit is not null and qty > prod.deal_limit - prod.deal_sold then
      raise exception 'Only % left at the Flash Deal price for %', prod.deal_limit - prod.deal_sold, prod.name;
    end if;

    v_size := null; v_name := prod.name; v_idx := null;
    if jsonb_array_length(prod.sizes) > 0 then
      v_size := nullif(trim(coalesce(item->>'size','')), '');
      if v_size is null then raise exception 'Please choose a size for %', prod.name; end if;
      select (o.ord - 1)::integer, (o.e->>'qty')::integer into v_idx, v_cur
        from jsonb_array_elements(prod.sizes) with ordinality as o(e, ord) where lower(o.e->>'size') = lower(v_size);
      if v_idx is null then raise exception 'Size % is not available for %', v_size, prod.name; end if;
      if v_cur < qty then raise exception 'Not enough stock for % (size %)', prod.name, v_size; end if;
      update public.products set sizes = jsonb_set(sizes, array[v_idx::text, 'qty'], to_jsonb(v_cur - qty)) where id = prod.id;
      v_name := prod.name || ' (' || (prod.sizes->v_idx->>'size') || ')';
      v_size := prod.sizes->v_idx->>'size';
    else
      if prod.stock < qty then raise exception 'Not enough stock for %', prod.name; end if;
      update public.products set stock = stock - qty where id = prod.id;
    end if;
    if v_deal then
      update public.products set deal_sold = deal_sold + qty where id = prod.id;
      v_deal_total := v_deal_total + v_unit * qty;
    end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('product_id', prod.id, 'name', v_name, 'size', v_size, 'price', v_unit, 'quantity', qty));
    v_subtotal := v_subtotal + v_unit * qty;
  end loop;

  if nullif(trim(coalesce(p_coupon, '')), '') is not null then
    v_base := v_subtotal - v_deal_total;
    if v_base <= 0 then raise exception 'Coupons cannot be used on Flash Deal items'; end if;
    select c.offer_id, c.discount into v_offer, v_discount from public.calc_coupon(p_store_id, p_coupon, v_base, true) c;
    v_code := upper(trim(p_coupon));
    update public.offers set used_count = used_count + 1 where id = v_offer;
  end if;

  if p_delivery_type = 'pickup' then v_fee := 0;
  elsif s.free_delivery_above is not null and v_subtotal >= s.free_delivery_above then v_fee := 0;
  else v_fee := s.delivery_fee; end if;

  insert into public.orders (store_id, customer_id, customer_name, customer_phone, customer_email, address, note, delivery_type, subtotal, delivery_fee, discount, coupon_code, total, client_key)
  values (p_store_id, (select auth.uid()), trim(p_customer_name), trim(p_customer_phone), nullif(trim(coalesce(p_customer_email,'')), ''),
          nullif(trim(coalesce(p_address,'')), ''), nullif(trim(coalesce(p_note,'')), ''), p_delivery_type, v_subtotal, v_fee, v_discount, v_code, v_subtotal - v_discount + v_fee, p_client_key)
  returning * into v_order;

  insert into public.order_items (order_id, product_id, name, size, price, quantity)
  select v_order.id, (l->>'product_id')::uuid, l->>'name', l->>'size', (l->>'price')::numeric, (l->>'quantity')::integer from jsonb_array_elements(v_lines) l;

  update public.cart_snapshots set status = 'recovered', updated_at = now()
    where store_id = p_store_id and status = 'open'
      and ((select auth.uid()) is not null and user_id = (select auth.uid())
           or (char_length(v_digits) >= 8 and right(regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'), 10) = v_digits));

  return query select v_order.id, v_order.order_no, v_order.tracking_token, v_order.total;
end $function$;

do $$
declare f text;
begin
  foreach f in array array['public.delivery_verify_job(uuid,boolean,text)', 'public.rider_arrived_shop(uuid)', 'public.rider_my_jobs()', 'public.rider_my_offers()',
    'public.delivery_jobs_list(text)', 'public.shop_delivery_statuses(uuid[])']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke execute on function public.delivery_stage_for_token(text) from public;
  grant execute on function public.delivery_stage_for_token(text) to anon, authenticated;
  revoke execute on function public.place_order(uuid, jsonb, text, text, text, text, text, text, text, uuid) from public;
  grant execute on function public.place_order(uuid, jsonb, text, text, text, text, text, text, text, uuid) to anon, authenticated;
end $$;
