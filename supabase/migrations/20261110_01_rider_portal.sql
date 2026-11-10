-- Batch 3 / Milestone 4: rider applications, documents, approval, audit log, history. ADDITIVE ONLY.
create table if not exists public.delivery_audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  subject text,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table public.delivery_audit_log enable row level security;
create policy delivery_audit_select on public.delivery_audit_log for select to authenticated
  using (coalesce(public.delivery_role(), '') in ('super_admin','manager'));
revoke all on public.delivery_audit_log from anon, authenticated;
grant select on public.delivery_audit_log to authenticated;

create or replace function private.audit(p_actor uuid, p_action text, p_subject text, p_detail jsonb default null)
returns void language sql set search_path = '' as $$
  insert into public.delivery_audit_log (actor, action, subject, detail) values (p_actor, p_action, p_subject, p_detail)
$$;
revoke execute on function private.audit(uuid, text, text, jsonb) from public, anon, authenticated;

create table if not exists public.delivery_rider_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  phone text not null check (phone ~ '^[0-9+ -]{10,15}$'),
  city text check (city is null or char_length(city) <= 60),
  vehicle_type text not null default 'bike' check (vehicle_type in ('bike','scooter','cycle','other')),
  vehicle_no text check (vehicle_no is null or char_length(vehicle_no) <= 20),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.delivery_rider_docs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null check (doc_type in ('id_proof','licence','vehicle_doc','photo')),
  path text not null,
  created_at timestamptz not null default now(),
  unique (user_id, doc_type)
);
alter table public.delivery_rider_profiles enable row level security;
alter table public.delivery_rider_docs enable row level security;
create policy delivery_rider_profiles_select on public.delivery_rider_profiles for select to authenticated
  using (user_id = (select auth.uid()) or coalesce(public.delivery_role(), '') in ('super_admin','manager'));
create policy delivery_rider_docs_select on public.delivery_rider_docs for select to authenticated
  using (user_id = (select auth.uid()) or coalesce(public.delivery_role(), '') in ('super_admin','manager'));
revoke all on public.delivery_rider_profiles, public.delivery_rider_docs from anon, authenticated;
grant select on public.delivery_rider_profiles, public.delivery_rider_docs to authenticated;

-- Private bucket for rider documents: a rider writes only into their own folder; only managers can read others.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rider-docs', 'rider-docs', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
create policy rider_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'rider-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy rider_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'rider-docs' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or coalesce(public.delivery_role(), '') in ('super_admin','manager')));

-- delivery_jobs: timestamps for history
alter table public.delivery_jobs add column if not exists picked_up_at timestamptz;
alter table public.delivery_jobs add column if not exists delivered_at timestamptz;

create or replace function public.rider_apply(p_name text, p_phone text, p_city text, p_vehicle_type text, p_vehicle_no text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); cur text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if coalesce(public.delivery_role(), '') <> '' then raise exception 'You are already on the delivery team'; end if;
  select status into cur from public.delivery_rider_profiles where user_id = me;
  if cur = 'approved' then raise exception 'You are already approved'; end if;
  insert into public.delivery_rider_profiles (user_id, full_name, phone, city, vehicle_type, vehicle_no)
  values (me, trim(p_name), trim(p_phone), nullif(trim(coalesce(p_city, '')), ''), coalesce(nullif(p_vehicle_type, ''), 'bike'), nullif(trim(coalesce(p_vehicle_no, '')), ''))
  on conflict (user_id) do update set full_name = excluded.full_name, phone = excluded.phone, city = excluded.city,
    vehicle_type = excluded.vehicle_type, vehicle_no = excluded.vehicle_no, status = 'pending', review_note = null, updated_at = now();
  perform private.audit(me, 'rider_applied', me::text, null);
end $$;

create or replace function public.rider_my_application()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); p public.delivery_rider_profiles;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into p from public.delivery_rider_profiles where user_id = me;
  if not found then return jsonb_build_object('profile', null, 'docs', '[]'::jsonb); end if;
  return jsonb_build_object(
    'profile', jsonb_build_object('full_name', p.full_name, 'phone', p.phone, 'city', p.city, 'vehicle_type', p.vehicle_type,
      'vehicle_no', p.vehicle_no, 'status', p.status, 'review_note', p.review_note),
    'docs', (select coalesce(jsonb_agg(jsonb_build_object('doc_type', d.doc_type, 'path', d.path)), '[]'::jsonb) from public.delivery_rider_docs d where d.user_id = me));
end $$;

create or replace function public.rider_add_doc(p_type text, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p_type not in ('id_proof','licence','vehicle_doc','photo') then raise exception 'Unknown document type'; end if;
  if p_path is null or left(p_path, 37) <> me::text || '/' or char_length(p_path) > 200 then raise exception 'Invalid file path'; end if;
  if not exists (select 1 from public.delivery_rider_profiles where user_id = me) then raise exception 'Fill in your details first'; end if;
  insert into public.delivery_rider_docs (user_id, doc_type, path) values (me, p_type, p_path)
  on conflict (user_id, doc_type) do update set path = excluded.path, created_at = now();
end $$;

create or replace function public.rider_update_profile(p_phone text, p_city text, p_vehicle_type text, p_vehicle_no text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  update public.delivery_rider_profiles set phone = trim(p_phone), city = nullif(trim(coalesce(p_city, '')), ''),
    vehicle_type = coalesce(nullif(p_vehicle_type, ''), vehicle_type), vehicle_no = nullif(trim(coalesce(p_vehicle_no, '')), ''), updated_at = now()
  where user_id = me;
  update public.delivery_members set phone = trim(p_phone), updated_at = now() where user_id = me;
end $$;

create or replace function public.delivery_riders_list()
returns table(user_id uuid, full_name text, phone text, email text, city text, vehicle_type text, vehicle_no text,
  app_status text, review_note text, is_member boolean, is_active boolean, is_online boolean, last_seen timestamptz, docs jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  return query
  select coalesce(p.user_id, m.user_id), coalesce(p.full_name, m.full_name), coalesce(p.phone, m.phone), pr.email, p.city, p.vehicle_type, p.vehicle_no,
         p.status, p.review_note, m.user_id is not null, coalesce(m.is_active, false), coalesce(s.is_online, false), s.updated_at,
         (select coalesce(jsonb_agg(jsonb_build_object('doc_type', d.doc_type, 'path', d.path)), '[]'::jsonb) from public.delivery_rider_docs d where d.user_id = coalesce(p.user_id, m.user_id)),
         coalesce(p.created_at, m.created_at)
  from public.delivery_rider_profiles p
  full join public.delivery_members m on m.user_id = p.user_id
  left join public.profiles pr on pr.id = coalesce(p.user_id, m.user_id)
  left join public.delivery_rider_status s on s.user_id = coalesce(p.user_id, m.user_id)
  where m.user_id is null or m.role = 'rider'
  order by (p.status = 'pending') desc nulls last, coalesce(p.created_at, m.created_at) desc;
end $$;

create or replace function public.delivery_review_rider(p_user uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); p public.delivery_rider_profiles; mrole text;
begin
  if coalesce(public.delivery_role(), '') not in ('super_admin','manager') then raise exception 'Not allowed'; end if;
  select * into p from public.delivery_rider_profiles where user_id = p_user for update;
  if not found then raise exception 'Application not found'; end if;
  if p_approve then
    select role into mrole from public.delivery_members where user_id = p_user;
    if mrole is not null and mrole <> 'rider' then raise exception 'This person is already on the team as %', mrole; end if;
    if (select count(*) from public.delivery_rider_docs where user_id = p_user and doc_type in ('id_proof','photo')) < 2 then
      raise exception 'ID proof and photo are required before approval';
    end if;
    insert into public.delivery_members (user_id, role, full_name, phone, is_active, created_by)
    values (p_user, 'rider', p.full_name, p.phone, true, me)
    on conflict (user_id) do update set is_active = true, full_name = excluded.full_name, phone = excluded.phone, updated_at = now();
    update public.delivery_rider_profiles set status = 'approved', review_note = nullif(trim(coalesce(p_note, '')), ''), reviewed_by = me, reviewed_at = now(), updated_at = now() where user_id = p_user;
    perform private.audit(me, 'rider_approved', p_user::text, null);
  else
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Write the reason'; end if;
    update public.delivery_rider_profiles set status = 'rejected', review_note = left(trim(p_note), 300), reviewed_by = me, reviewed_at = now(), updated_at = now() where user_id = p_user;
    update public.delivery_members set is_active = false, updated_at = now() where user_id = p_user and role = 'rider';
    perform private.audit(me, 'rider_rejected', p_user::text, jsonb_build_object('note', left(trim(p_note), 300)));
  end if;
end $$;

create or replace function public.rider_my_history()
returns table(job_id uuid, order_no bigint, job_status text, shop_name text, address text, total numeric, collect_amount numeric,
  delivery_fee numeric, finished_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'rider' then raise exception 'Not allowed'; end if;
  return query
  select j.id, o.order_no, j.status, st.name, o.address, o.total, case when o.payment_status = 'paid' then 0::numeric else o.total end,
         o.delivery_fee, coalesce(j.delivered_at, j.updated_at)
  from public.delivery_jobs j
  join public.orders o on o.id = j.order_id
  join public.stores st on st.id = o.store_id
  where j.rider_id = me and j.status in ('delivered','failed')
  order by coalesce(j.delivered_at, j.updated_at) desc
  limit 100;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.rider_apply(text,text,text,text,text)', 'public.rider_my_application()', 'public.rider_add_doc(text,text)',
    'public.rider_update_profile(text,text,text,text)', 'public.delivery_riders_list()', 'public.delivery_review_rider(uuid,boolean,text)', 'public.rider_my_history()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
