-- Batch 4 (Milestones 7+8): rider "today" numbers and the operations dashboard. ADDITIVE.
alter table public.delivery_settings add column if not exists timezone text not null default 'Asia/Kolkata';

create or replace function public.rider_today()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); tz text; d0 timestamptz;
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  select timezone into tz from public.delivery_settings;
  d0 := date_trunc('day', now() at time zone tz) at time zone tz;
  return jsonb_build_object(
    'deliveries', (select count(*) from public.delivery_jobs where rider_id = me and status = 'delivered' and delivered_at >= d0),
    'earned', coalesce((select sum(amount) from public.delivery_ledger where rider_id = me and kind = 'earning' and created_at >= d0), 0),
    'cod_held', coalesce((select sum(amount) from public.delivery_ledger where rider_id = me and account = 'cod'), 0));
end $$;

create or replace function public.delivery_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare tz text; d0 timestamptz;
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager','staff') then raise exception 'Not allowed'; end if;
  select timezone into tz from public.delivery_settings;
  d0 := date_trunc('day', now() at time zone tz) at time zone tz;
  return jsonb_build_object(
    'today', (select jsonb_build_object(
        'orders', count(*) filter (where j.created_at >= d0),
        'delivered', count(*) filter (where j.status = 'delivered' and j.delivered_at >= d0),
        'failed', count(*) filter (where j.status = 'failed' and j.updated_at >= d0),
        'cancelled', count(*) filter (where j.status = 'cancelled' and j.updated_at >= d0),
        'active', count(*) filter (where j.status in ('assigned','picked_up')),
        'waiting', count(*) filter (where j.status in ('ready_for_dispatch','offering')),
        'attention', count(*) filter (where j.status = 'pending_verification'))
      from public.delivery_jobs j),
    'riders', coalesce((select jsonb_object_agg(x.state, x.c) from (select r.state, count(*) c from public.delivery_riders_live() r group by r.state) x), '{}'::jsonb),
    'zones', coalesce((select jsonb_agg(jsonb_build_object('zone_id', z.id, 'zone', z.name, 'city', c.name, 'status', z.status,
        'jobs_today', (select count(*) from public.delivery_jobs j where j.zone_id = z.id and j.created_at >= d0),
        'active', (select count(*) from public.delivery_jobs j where j.zone_id = z.id and j.status in ('assigned','picked_up')),
        'waiting', (select count(*) from public.delivery_jobs j where j.zone_id = z.id and j.status in ('ready_for_dispatch','offering','pending_verification')),
        'delivered', (select count(*) from public.delivery_jobs j where j.zone_id = z.id and j.status = 'delivered' and j.delivered_at >= d0),
        'failed', (select count(*) from public.delivery_jobs j where j.zone_id = z.id and j.status = 'failed' and j.updated_at >= d0),
        'riders_online', (select count(*) from public.delivery_rider_zones rz join public.delivery_rider_status s on s.user_id = rz.rider_id
                          where rz.zone_id = z.id and s.is_online and s.updated_at > now() - make_interval(secs => z.gps_fresh_seconds))
      ) order by c.name, z.name) from public.delivery_zones z join public.delivery_cities c on c.id = z.city_id), '[]'::jsonb),
    'issues', coalesce((select jsonb_agg(i order by i.since) from (
        select jsonb_build_object('job_id', j.id, 'order_no', o.order_no, 'kind', 'needs_check', 'since', j.created_at, 'shop', st.name) i, j.created_at since
          from public.delivery_jobs j join public.orders o on o.id = j.order_id join public.stores st on st.id = o.store_id where j.status = 'pending_verification'
        union all
        select jsonb_build_object('job_id', j.id, 'order_no', o.order_no, 'kind', 'no_rider', 'since', j.no_rider_since, 'shop', st.name), j.no_rider_since
          from public.delivery_jobs j join public.orders o on o.id = j.order_id join public.stores st on st.id = o.store_id
          where j.status in ('ready_for_dispatch','offering') and j.no_rider_since is not null
        union all
        select jsonb_build_object('job_id', j.id, 'order_no', o.order_no, 'kind', 'failed', 'since', j.updated_at, 'shop', st.name), j.updated_at
          from public.delivery_jobs j join public.orders o on o.id = j.order_id join public.stores st on st.id = o.store_id
          where j.status = 'failed' and j.updated_at > now() - interval '24 hours'
        union all
        select jsonb_build_object('job_id', j.id, 'order_no', o.order_no, 'kind', 'otp_locked', 'since', j.updated_at, 'shop', st.name), j.updated_at
          from public.delivery_jobs j join public.orders o on o.id = j.order_id join public.stores st on st.id = o.store_id
          where j.status = 'picked_up' and exists (select 1 from public.delivery_job_secrets s where s.job_id = j.id and s.attempts >= 5)
        union all
        select jsonb_build_object('job_id', j.id, 'order_no', o.order_no, 'kind', 'late_pickup', 'since', j.assigned_at, 'shop', st.name), j.assigned_at
          from public.delivery_jobs j join public.orders o on o.id = j.order_id join public.stores st on st.id = o.store_id
          where j.status = 'assigned' and j.assigned_at < now() - interval '30 minutes'
        union all
        select jsonb_build_object('job_id', j.id, 'order_no', o.order_no, 'kind', 'late_delivery', 'since', j.picked_up_at, 'shop', st.name), j.picked_up_at
          from public.delivery_jobs j join public.orders o on o.id = j.order_id join public.stores st on st.id = o.store_id
          where j.status = 'picked_up' and j.picked_up_at < now() - interval '45 minutes'
        limit 30) q), '[]'::jsonb)
  );
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.rider_today()', 'public.delivery_dashboard()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
