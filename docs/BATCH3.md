# Batch 3 (Milestones 4 and 5)

Database (applied to ldjkagucegwpwigrjbhn; copies in supabase/migrations/20261110_*):
- Rider applications (delivery_rider_profiles), documents (delivery_rider_docs + private storage bucket `rider-docs`, 5 MB, JPG/PNG/WebP/PDF),
  approval/rejection by manager (ID proof + photo required), audit log (delivery_audit_log).
- Pickup confirm -> order becomes out_for_delivery, rider name/phone copied to the order (customer tracking already shows them).
- 4-digit delivery code generated at pickup, stored in delivery_job_secrets (no browser access). Rider enters it; 5 wrong tries lock it; manager can unlock.
- Delivered only through the code. Failed delivery and give-back-before-pickup flows; manager can send a failed job again.
- Customer pin: orders.delivery_lat / delivery_lng, set from the tracking page (set_order_location), delivery code shown via delivery_otp_for_token.

Rider app: apply + documents, online/offline, offers, trip (map, navigate, pickup, code, issues), history, profile.
Ops: Riders page (review documents, approve/reject, activate), Failed tab, unlock code.

Not in this batch: COD cash record, earnings, settlements (Batch 4). A delivered COD order keeps payment "pending" until Batch 4.
Customer-site patch: locallane-customer-patch.zip now has 6 files (adds OrderPage.tsx, DeliveryHelp.tsx, api/delivery.ts).
