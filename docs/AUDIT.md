# Milestone 0: Audit (short)

Source: LocalLane-Shop-Page-Content.zip (baseline; `LocalLane-deploy-fix.zip` was never uploaded).
Backend: Supabase `ldjkagucegwpwigrjbhn` ("SHOPESHARE AI"). Matches the ref in LocalLane `src/lib/supabase.ts`.

## Re-verified this session (via Supabase connector)
- `delivery_members` table exists (0 rows). Functions exist: `delivery_role`, `delivery_me`, `delivery_list_members`, `delivery_add_member`, `delivery_set_member_active`, `is_admin`.
- `delivery_me()` returns `{role, name}`; role = `super_admin` (profiles.role = 'admin') or active `delivery_members.role`.
- `delivery_list_members` / `delivery_add_member` allow only super_admin and manager. Only super_admin can add a manager. The person must already have an auth account.

## Taken from DELIVERY_HANDOVER.md (not re-checked)
- orders.status: new, confirmed, packed (= ready for pickup), out_for_delivery, delivered, cancelled.
- payment_method is only 'cod' today (CHECK). No online payment yet, so "online-paid" cannot be real yet.
- No lat/lng on orders (address is text). stores.latitude/longitude are optional.
- Shop owners can set any order status today; needs a server-side guard for orders handled by LocalLane Delivery.
- Realtime already includes `orders`. pg_cron, pg_net, push infra exist.

## Not built yet (nothing invented)
Rider registration, rider profile, documents, delivery jobs, offers, OTP, ledger.

## Needs the owner's approval (touches customer site / shop panel)
1. Shop chooses "own delivery" or "LocalLane delivery" when marking packed.
2. Save customer map pin (lat/lng) at checkout.
3. Show delivery OTP on the customer's order tracking page.

## Architecture
Customer site (Netlify) and this Delivery site (Cloudflare Workers) share one Supabase. Roles are decided on the server (`delivery_me`); the route guards only shape navigation. Sensitive actions must go through SECURITY DEFINER functions / Edge Functions (Milestone 2+).
