# Batch 2 (Milestones 2 and 3)

Database (already applied to project ldjkagucegwpwigrjbhn; copies in supabase/migrations):
- orders.fulfilment ('shop' default | 'locallane'). Existing orders and the customer site are unaffected.
- delivery_jobs, delivery_job_events (history/audit), delivery_offers, delivery_rider_status. RLS on, read-only from the browser.
- All writes go through SECURITY DEFINER functions with role checks (delivery_*, rider_*).
- Trigger: shop packs an order with fulfilment = 'locallane' => delivery job created (pending verification).
- Guards: shop cannot set out_for_delivery/delivered on LocalLane-delivered orders; fulfilment cannot change after a job exists.
- pg_cron job `delivery-expire-offers` runs every minute (offers last 90 s, then next rider).
- One open offer per job and per rider; one active job per rider (unique indexes) + row locks.

Rider approval = is_active in Team (full document flow is Milestone 4).

Customer-site change (needs your approval to deploy): customer-site-patch/ (shop chooses own vs LocalLane delivery).
Note: until the customer site is updated, no order can become a LocalLane delivery job.
