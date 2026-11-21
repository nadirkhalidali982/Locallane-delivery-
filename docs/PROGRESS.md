# LocalLane transformation: progress report

## Decisions (approved by the owner: "choose what is best")
1. Rider offer is timed after the shop Accepts (offer at accept time + prep time - 5 min). Reason: the rider arrives when the parcel is ready.
2. Circle zones (centre + radius), no PostGIS yet (Batch 3).
3. A shop needs its map location before it can choose LocalLane Delivery (enforced in the database).
4. Fake-order protection: per-phone limit (8 orders / 15 min) now. Phone OTP not used (paid SMS).
5. "Reached shop" is an optional tap, stored as a timestamp on the job (no extra status).
6. The 2 test jobs and the test rider stay until the final test, then are removed with the owner's confirmation.

## Correction to the Batch 1 audit
Finding B1 said shops have no way to set a location. The shop settings already have a map/GPS location picker (`LocationPicker` in PanelSettings). The real problem: 0 of 13 shops have used it. Fix = make it required for LocalLane Delivery (done) and ask owners to set it.

## Batch 2 (Milestones 3 and 4): done
Database: orders.client_key / prep_minutes / accepted_at; delivery_jobs.offer_after / no_rider_since / at_shop_at / auto_verified; auto-verify and timed auto-dispatch (cron every minute); place_order and place_orders accept a checkout key and throttle by phone; shop_delivery_statuses and delivery_stage_for_token; rider offers show the rider's estimated earning and both distances.
Customer app: checkout key (single and multi-shop), prep-time chips on Confirm, shop sees stage and rider, tracking shows stage.
Delivery app: offers with earning, "I am at the shop", wait-for-pack message, timing and no-rider warnings, Overview tile.
Tests (database, rolled back): see docs/TESTS.md plus: same key = one order and stock taken once; throttle; accept with 5 min prep = auto-checked and offered at once; 20 min prep waits; auto-dispatch when due; no rider = flagged; reached-shop; shop and customer stage views (other users see nothing); short address = staff check; pickup blocked until packed.
Not tested: browser rendering of the new UI, real phones.

## Batch 3 (Milestones 5 and 6): done
Database: delivery_cities, delivery_zones (circle: centre + radius, status active/paused/inactive, per-zone fee override, offer seconds, GPS freshness, max shop distance), delivery_rider_zones (explicit permission per rider), stores.zone_id (set by the database from the shop's map location, cannot be forged from the API), delivery_jobs.zone_id and geo_flag.
Dispatch now requires: rider authorised for the job's zone, online, fresh valid GPS (zone setting, default 4 min), within the zone's pickup distance, no active job and no other open offer. Paused zone = no automatic offers (staff can still dispatch). Manual assignment also requires zone permission. Offer length comes from the zone. Riders silent for 10 minutes go offline automatically (not while on a delivery).
A shop can choose LocalLane Delivery only if it is inside an active zone. A customer pin outside the zone, or a shop outside every zone, sends the job to staff with a clear message instead of dispatching.
Delivery app: Zones page (add a city or village with a map, radius, fees, timing, pause/resume), rider zone ticks on the Riders page, "Riders now" board on Dispatch, zone and location warnings on every order, first-run hint on Overview.
Customer app: optional "Pin my exact location" at checkout (single and multi-shop) saved with the order.
Tests (database, rolled back): see TESTS.md plus zone creation rights, duplicate city/zone names, public service areas, shop zone from location and tamper attempt, LocalLane blocked outside a zone, eligibility (no permission, other zone, stale GPS, 55 km away, no GPS), paused zone, offer length from zone, zone fee override, cross-zone manual assignment blocked, pin inside/outside/none and pin shared later, auto-offline, live board visibility.
Not tested: browser rendering of the Zones page and the map, checkout pin on phones.

## Batch 4 (Milestones 7 and 8): done
Rider app: 3 tabs only (Home, Earnings, Me). Home = big ONLINE/OFFLINE button, deliveries and earnings today, then either the new order (vibrate + beep, big Accept/Reject, estimated earning and distances) or the delivery in progress as one step at a time (Go to shop, I am at the shop, I have the parcel, Deliver with code and cash tick). Screen stays awake while online. Old Offers and Trip tabs redirect to Home. Transactions are hidden behind one tap.
Operations dashboard (rider_today and delivery_dashboard in the database): orders today, waiting, on the way, delivered, failed, needs a check, rider states, zone-wise table, and a "Needs attention" list (needs check, no rider, failed, code locked, pickup over 30 min, delivery over 45 min). Day boundaries use delivery_settings.timezone (default Asia/Kolkata).
Not done on purpose: push notifications for riders (Batch 5, with customer notifications). A web app cannot play sound or vibrate when the phone screen is off, so until push exists riders must keep the screen open.
Tests (database): dashboard and rider_today return the right keys and counts; riders, outsiders cannot read the dashboard; staff, managers and admins can; admins cannot call rider_today. Not tested: browser rendering on phones.
