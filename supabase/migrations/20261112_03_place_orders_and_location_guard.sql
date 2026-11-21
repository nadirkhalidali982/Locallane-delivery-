-- Applied after 20261112_02. place_orders passes the checkout key; a shop needs a map location before choosing LocalLane Delivery.
drop function if exists public.place_orders(jsonb, text, text, text, text, text);
create function public.place_orders(p_groups jsonb, p_customer_name text, p_customer_phone text, p_customer_email text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_client_key uuid DEFAULT NULL::uuid)
 RETURNS TABLE(store_id uuid, order_id uuid, order_no bigint, tracking_token text, total numeric)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare g jsonb; r record;
begin
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) not between 1 and 10 then raise exception 'Your cart is empty or has too many shops'; end if;
  for g in select * from jsonb_array_elements(p_groups) loop
    select * into r from public.place_order((g->>'store_id')::uuid, g->'items', p_customer_name, p_customer_phone, p_customer_email, p_address, p_note, coalesce(g->>'delivery_type', 'delivery'), nullif(g->>'coupon', ''), p_client_key);
    store_id := (g->>'store_id')::uuid; order_id := r.order_id; order_no := r.order_no; tracking_token := r.tracking_token; total := r.total;
    return next;
  end loop;
end $function$;
revoke execute on function public.place_orders(jsonb, text, text, text, text, text, uuid) from public;
grant execute on function public.place_orders(jsonb, text, text, text, text, text, uuid) to anon, authenticated;

create or replace function public.guard_order_fulfilment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.fulfilment is distinct from old.fulfilment and (select auth.uid()) is not null then
    if old.status not in ('new','confirmed','packed') then raise exception 'Delivery type can only be changed before pickup'; end if;
    if exists (select 1 from public.delivery_jobs where order_id = old.id and status <> 'cancelled') then raise exception 'A delivery job already exists for this order'; end if;
    if new.fulfilment = 'locallane' and exists (select 1 from public.stores where id = new.store_id and (latitude is null or longitude is null)) then
      raise exception 'Set your shop location in Settings before choosing LocalLane Delivery';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_order_fulfilment() from public, anon, authenticated;
