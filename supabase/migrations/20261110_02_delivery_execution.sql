-- Batch 3 / Milestone 5: pickup, OTP delivery, failures, customer location. ADDITIVE (two list functions are re-created with extra columns).
alter table public.orders add column if not exists delivery_lat double precision;
alter table public.orders add column if not exists delivery_lng double precision;
alter table public.orders drop constraint if exists orders_delivery_pin_check;
alter table public.orders add constraint orders_delivery_pin_check
  check ((delivery_lat is null or delivery_lat between -90 and 90) and (delivery_lng is null or delivery_lng between -180 and 180));

create table if not exists public.delivery_job_secrets (
  job_id uuid primary key references public.delivery_jobs(id) on delete cascade,
  otp text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.delivery_job_secrets enable row level security;   -- no policies: only SECURITY DEFINER functions can touch it
revoke all on public.delivery_job_secrets from anon, authenticated;

do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'public.delivery_offers'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%expired%';
  if c is not null then execute format('alter table public.delivery_offers drop constraint %I', c); end if;
end $$;
alter table public.delivery_offers add constraint delivery_offers_status_check
  check (status in ('offered','accepted','rejected','expired','cancelled','released'));

create or replace function private.eligible_riders(p_job uuid)
returns table(user_id uuid, full_name text, phone text, km double precision, tried boolean)
language sql stable set search_path = '' as $$
  select m.user_id, m.full_name, m.phone,
         private.km(s.lat, s.lng, st.latitude, st.longitude),
         exists (select 1 from public.delivery_offers p where p.job_id = j.id and p.rider_id = m.user_id and p.status in ('rejected','expired','released'))
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
revoke execute on function private.eligible_riders(uuid) from public, anon, authenticated;

-- ---------- lists with locations / timestamps (return type changes, so drop and re-create) ----------
drop function if exists public.rider_my_jobs();
create function public.rider_my_jobs()
returns table(job_id uuid, order_no bigint, job_status text, shop_name text, shop_address text, shop_phone text,
  customer_name text, customer_phone text, address text, note text, total numeric, payment_method text, payment_status text,
  collect_amount numeric, items jsonb, shop_lat double precision, shop_lng double precision, cust_lat double precision, cust_lng double precision,
  picked_up_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  return query
  select j.id, o.order_no, j.status, st.name, st.address, st.phone, o.customer_name, o.customer_phone, o.address, o.note,
         o.total, o.payment_method, o.payment_status, case when o.payment_status = 'paid' then 0::numeric else o.total end,
         (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'size', i.size, 'qty', i.quantity) order by i.name), '[]'::jsonb)
            from public.order_items i where i.order_id = o.id),
         st.latitude, st.longitude, o.delivery_lat, o.delivery_lng, j.picked_up_at
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  where j.rider_id = me and j.status in ('assigned','picked_up');
end $$;

drop function if exists public.delivery_jobs_list(text);
create function public.delivery_jobs_list(p_status text default null)
returns table(job_id uuid, order_id uuid, order_no bigint, job_status text, shop_name text, shop_address text, shop_phone text,
  customer_name text, customer_phone text, address text, note text, total numeric, delivery_fee numeric,
  payment_method text, payment_status text, items jsonb, rider_id uuid, rider_name text, failure_reason text,
  created_at timestamptz, updated_at timestamptz, picked_up_at timestamptz, delivered_at timestamptz, otp_locked boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager','staff') then raise exception 'Not allowed'; end if;
  return query
  select j.id, j.order_id, o.order_no, j.status, st.name, st.address, st.phone,
         o.customer_name, o.customer_phone, o.address, o.note, o.total, o.delivery_fee, o.payment_method, o.payment_status,
         (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'size', i.size, 'qty', i.quantity, 'price', i.price) order by i.name), '[]'::jsonb)
            from public.order_items i where i.order_id = o.id),
         j.rider_id, m.full_name, j.failure_reason, j.created_at, j.updated_at, j.picked_up_at, j.delivered_at,
         coalesce((select s.attempts >= 5 from public.delivery_job_secrets s where s.job_id = j.id), false)
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  left join public.delivery_members m on m.user_id = j.rider_id
  where p_status is null or j.status = p_status
  order by j.created_at desc
  limit 300;
end $$;

-- ---------- rider actions ----------
create or replace function public.rider_confirm_pickup(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); j public.delivery_jobs; o public.orders; m public.delivery_members; b bytea; code text;
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found or j.rider_id is distinct from me then raise exception 'Job not found'; end if;
  if j.status <> 'assigned' then raise exception 'This delivery is not waiting for pickup'; end if;
  select * into o from public.orders where id = j.order_id for update;
  if o.status <> 'packed' then raise exception 'The shop has not marked this order packed yet'; end if;
  select * into m from public.delivery_members where user_id = me;
  b := extensions.gen_random_bytes(2);
  code := ((get_byte(b, 0) * 256 + get_byte(b, 1)) % 9000 + 1000)::text;
  insert into public.delivery_job_secrets (job_id, otp, attempts) values (p_job, code, 0)
  on conflict (job_id) do update set otp = excluded.otp, attempts = 0, created_at = now();
  update public.delivery_jobs set status = 'picked_up', picked_up_at = now(), updated_at = now() where id = p_job;
  update public.orders set status = 'out_for_delivery', delivery_person_name = m.full_name, delivery_person_phone = m.phone where id = o.id;
  perform private.log_event(p_job, me, 'picked_up', 'assigned', 'picked_up', null);
end $$;

-- Returns {result: delivered | wrong_code | locked, attempts_left}
create or replace function public.rider_complete_delivery(p_job uuid, p_otp text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); j public.delivery_jobs; s public.delivery_job_secrets;
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
  update public.delivery_jobs set status = 'delivered', delivered_at = now(), updated_at = now() where id = p_job;
  update public.orders set status = 'delivered' where id = j.order_id;
  delete from public.delivery_job_secrets where job_id = p_job;
  perform private.log_event(p_job, me, 'delivered', 'picked_up', 'delivered', null);
  return jsonb_build_object('result', 'delivered');
end $$;

-- Before pickup: the rider gives the job back to the queue.
create or replace function public.rider_report_issue(p_job uuid, p_kind text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); j public.delivery_jobs;
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  if p_kind not in ('shop_not_ready','cannot_reach_shop','other') then raise exception 'Choose a reason'; end if;
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found or j.rider_id is distinct from me then raise exception 'Job not found'; end if;
  if j.status <> 'assigned' then raise exception 'You can only give back a delivery before pickup'; end if;
  update public.delivery_offers set status = 'released', responded_at = now() where job_id = p_job and rider_id = me and status = 'accepted';
  if not found then
    insert into public.delivery_offers (job_id, rider_id, status, expires_at, responded_at) values (p_job, me, 'released', now(), now());
  end if;
  update public.delivery_jobs set status = 'ready_for_dispatch', rider_id = null, assigned_at = null, updated_at = now() where id = p_job;
  perform private.log_event(p_job, me, 'rider_released', 'assigned', 'ready_for_dispatch', p_kind || coalesce(': ' || nullif(left(trim(p_note), 200), ''), ''));
end $$;

-- After pickup: the delivery could not be completed.
create or replace function public.rider_fail_delivery(p_job uuid, p_reason text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); j public.delivery_jobs; txt text;
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  if p_reason not in ('customer_unreachable','wrong_address','refused','other') then raise exception 'Choose a reason'; end if;
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found or j.rider_id is distinct from me then raise exception 'Job not found'; end if;
  if j.status <> 'picked_up' then raise exception 'This delivery is not on the way'; end if;
  txt := p_reason || coalesce(': ' || nullif(left(trim(p_note), 200), ''), '');
  update public.delivery_jobs set status = 'failed', failure_reason = txt, updated_at = now() where id = p_job;
  delete from public.delivery_job_secrets where job_id = p_job;
  perform private.log_event(p_job, me, 'delivery_failed', 'picked_up', 'failed', txt);
end $$;

-- ---------- manager actions ----------
create or replace function public.delivery_requeue_failed(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); j public.delivery_jobs;
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found then raise exception 'Job not found'; end if;
  if j.status <> 'failed' or j.picked_up_at is null then raise exception 'Only a failed delivery that was picked up can be sent again'; end if;
  if j.rider_id is not null then
    insert into public.delivery_offers (job_id, rider_id, status, expires_at, responded_at) values (p_job, j.rider_id, 'released', now(), now());
  end if;
  update public.delivery_jobs set status = 'ready_for_dispatch', rider_id = null, assigned_at = null, picked_up_at = null, failure_reason = null, updated_at = now() where id = p_job;
  update public.orders set status = 'packed', delivery_person_name = null, delivery_person_phone = null where id = j.order_id;
  perform private.log_event(p_job, me, 'requeued', 'failed', 'ready_for_dispatch', 'Parcel is back, sent for dispatch again');
  perform private.audit(me, 'delivery_requeued', p_job::text, null);
end $$;

create or replace function public.delivery_reset_otp(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  update public.delivery_job_secrets set attempts = 0 where job_id = p_job;
  if not found then raise exception 'No active delivery code'; end if;
  perform private.log_event(p_job, me, 'otp_reset', null, null, null);
  perform private.audit(me, 'otp_attempts_reset', p_job::text, null);
end $$;

-- ---------- customer side (the long tracking token is the key, as on the tracking page) ----------
create or replace function public.set_order_location(p_token text, p_lat double precision, p_lng double precision)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or char_length(p_token) < 16 then return false; end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then raise exception 'Invalid location'; end if;
  update public.orders set delivery_lat = p_lat, delivery_lng = p_lng
  where tracking_token = p_token and delivery_type = 'delivery' and status in ('new','confirmed','packed','out_for_delivery');
  return found;
end $$;

create or replace function public.delivery_otp_for_token(p_token text)
returns text language sql stable security definer set search_path = '' as $$
  select s.otp from public.orders o
  join public.delivery_jobs j on j.order_id = o.id and j.status = 'picked_up'
  join public.delivery_job_secrets s on s.job_id = j.id
  where o.tracking_token = p_token and char_length(coalesce(p_token, '')) >= 16
$$;

do $$
declare f text;
begin
  foreach f in array array['public.rider_my_jobs()', 'public.delivery_jobs_list(text)', 'public.rider_confirm_pickup(uuid)', 'public.rider_complete_delivery(uuid,text)',
    'public.rider_report_issue(uuid,text,text)', 'public.rider_fail_delivery(uuid,text,text)', 'public.delivery_requeue_failed(uuid)', 'public.delivery_reset_otp(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.set_order_location(text,double precision,double precision)', 'public.delivery_otp_for_token(text)']
  loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
