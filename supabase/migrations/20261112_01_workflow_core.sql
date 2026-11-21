-- Batch 2 (Milestones 3+4): timed offers after shop Accept, auto-verify, auto-dispatch, idempotent orders. ADDITIVE.
alter table public.orders add column if not exists client_key uuid;
alter table public.orders add column if not exists prep_minutes integer;
alter table public.orders add column if not exists accepted_at timestamptz;
alter table public.orders drop constraint if exists orders_prep_minutes_check;
alter table public.orders add constraint orders_prep_minutes_check check (prep_minutes is null or prep_minutes between 1 and 180);
create unique index if not exists orders_store_client_key_uniq on public.orders (store_id, client_key) where client_key is not null;
grant update (prep_minutes) on public.orders to authenticated;

alter table public.delivery_jobs add column if not exists offer_after timestamptz;
alter table public.delivery_jobs add column if not exists no_rider_since timestamptz;
alter table public.delivery_jobs add column if not exists at_shop_at timestamptz;
alter table public.delivery_jobs add column if not exists auto_verified boolean not null default false;

-- stamp the moment the shop accepted the order
create or replace function public.orders_stamp_accept()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' and new.accepted_at is null then new.accepted_at := now(); end if;
  return new;
end $$;
revoke execute on function public.orders_stamp_accept() from public, anon, authenticated;
drop trigger if exists orders_stamp_accept_trg on public.orders;
create trigger orders_stamp_accept_trg before update of status on public.orders for each row execute function public.orders_stamp_accept();

-- when a rider changes, "reached shop" resets
create or replace function private.jobs_reset_arrival()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.rider_id is distinct from old.rider_id then new.at_shop_at := null; end if;
  return new;
end $$;
revoke execute on function private.jobs_reset_arrival() from public, anon, authenticated;
drop trigger if exists delivery_jobs_reset_arrival_trg on public.delivery_jobs;
create trigger delivery_jobs_reset_arrival_trg before update on public.delivery_jobs for each row execute function private.jobs_reset_arrival();

create or replace function private.delivery_stage(p_status text, p_at_shop timestamptz, p_no_rider timestamptz)
returns text language sql immutable set search_path = '' as $$
  select case p_status
    when 'pending_verification' then 'checking'
    when 'ready_for_dispatch' then 'finding_rider'
    when 'offering' then 'finding_rider'
    when 'assigned' then case when p_at_shop is null then 'rider_coming' else 'rider_at_shop' end
    when 'picked_up' then 'on_the_way'
    else p_status end
$$;
revoke execute on function private.delivery_stage(text, timestamptz, timestamptz) from public, anon, authenticated;

-- dispatch: automatic dispatch waits for offer_after (prep time); staff can still force it
create or replace function private.dispatch_next(p_job uuid, p_actor uuid, p_rider uuid default null)
returns uuid language plpgsql set search_path = '' as $$
declare j public.delivery_jobs; r uuid; o uuid;
begin
  select * into j from public.delivery_jobs where id = p_job for update;
  if not found or j.status not in ('ready_for_dispatch','offering') then return null; end if;
  if p_actor is null and j.offer_after is not null and j.offer_after > now() then return null; end if;
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
  insert into public.delivery_offers (job_id, rider_id, offered_by, expires_at) values (p_job, r, p_actor, now() + interval '90 seconds') returning id into o;
  update public.delivery_jobs set status = 'offering', no_rider_since = null, updated_at = now() where id = p_job;
  perform private.log_event(p_job, p_actor, 'offered', j.status, 'offering', r::text);
  return o;
end $$;
revoke execute on function private.dispatch_next(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.auto_dispatch()
returns integer language plpgsql set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select id from public.delivery_jobs jb where jb.status = 'ready_for_dispatch' and (jb.offer_after is null or jb.offer_after <= now())
           and not exists (select 1 from public.delivery_offers f where f.job_id = jb.id and f.status = 'offered' and f.expires_at > now())
           order by jb.created_at limit 50 loop
    if private.dispatch_next(r.id, null) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function private.auto_dispatch() from public, anon, authenticated;

-- order -> job: created at shop ACCEPT (confirmed) or later, checked automatically, offered after the prep time
create or replace function private.orders_delivery_job()
returns trigger language plpgsql security definer set search_path = '' as $$
declare jid uuid; after_ts timestamptz;
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
    after_ts := coalesce(new.accepted_at, now()) + make_interval(mins => greatest(0, coalesce(new.prep_minutes, 10) - 5));
    insert into public.delivery_jobs (order_id, offer_after) values (new.id, after_ts) on conflict (order_id) do nothing returning id into jid;
    if jid is not null then
      perform private.log_event(jid, (select auth.uid()), 'job_created', null, 'pending_verification', 'Order accepted by the shop');
      if length(trim(coalesce(new.address, ''))) >= 8 and length(trim(coalesce(new.customer_phone, ''))) >= 7 then
        update public.delivery_jobs set status = 'ready_for_dispatch', auto_verified = true, verified_at = now(), updated_at = now() where id = jid;
        perform private.log_event(jid, null, 'verified', 'pending_verification', 'ready_for_dispatch', 'Checked automatically');
        if after_ts <= now() then perform private.dispatch_next(jid, null); end if;
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.orders_delivery_job() from public, anon, authenticated;

select cron.schedule('delivery-auto-dispatch', '* * * * *', 'select private.auto_dispatch()');
