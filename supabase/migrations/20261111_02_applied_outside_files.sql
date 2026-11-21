-- These three changes were applied to the live database directly (not from a file). Recorded here so a fresh database matches production.
grant update (fulfilment) on public.orders to authenticated;

revoke execute on function public.delivery_role() from public, anon;
revoke execute on function public.delivery_me() from public, anon;
revoke execute on function public.delivery_list_members() from public, anon;
revoke execute on function public.delivery_add_member(text, text, text, text) from public, anon;
revoke execute on function public.delivery_set_member_active(uuid, boolean) from public, anon;

-- pg_safeupdate (API connections) rejects UPDATE without WHERE: fixed in delivery_settings_set
create or replace function public.delivery_settings_set(p_base numeric, p_per_km numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if coalesce(public.delivery_role(), '') <> 'super_admin' then raise exception 'Only the Super Admin can change fees'; end if;
  if p_base is null or p_per_km is null or p_base < 0 or p_per_km < 0 or p_base > 1000 or p_per_km > 100 then raise exception 'Invalid fee'; end if;
  update public.delivery_settings set rider_base_fee = p_base, rider_per_km = p_per_km, updated_by = me, updated_at = now() where id = true;
  perform private.audit(me, 'fee_settings_changed', null, jsonb_build_object('base', p_base, 'per_km', p_per_km));
end $$;
