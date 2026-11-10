# Deploy and launch checklist

## 1. Cloudflare Workers (delivery site)
- GitHub repo root must contain package.json, wrangler.jsonc, src/, public/.
- Cloudflare: Build command `npm run build`, Deploy command `npx wrangler deploy`, Root directory `/`.
- Every push to `main` redeploys.
- If the map or login is blank, open the browser console: a Content-Security-Policy error means a host is missing in `public/_headers`
  (connect-src must list your Supabase URL). Using a different Supabase project => edit that file.

## 2. Supabase (project ldjkagucegwpwigrjbhn)
- Migrations in supabase/migrations are ALREADY applied. Do not run them again.
- Auth > URL Configuration > Redirect URLs: add https://locallane-delivery.validaad.workers.dev/**  (Site URL stays the Netlify one).
- Fees: Finance > Fees (Super Admin). Defaults are base Rs 30 + Rs 5/km; change them to your real rates before launch.

## 3. Customer site (Netlify)
- Deploy LocalLane-with-delivery-patch.zip the way you normally deploy. Without it no order becomes a LocalLane delivery job.

## 4. First-day setup
1. Sign in as Super Admin. Team: add managers/staff (they must have signed in once).
2. Riders sign in on the site, fill the form, upload ID proof and photo.
3. Riders > To review: open the documents, Approve.
4. Rider: Go online (allow location).
5. Shop: choose "LocalLane Delivery" and mark the order Packed.
6. Delivery site: Orders > Verify, Dispatch > Find nearest rider.

## 5. Install on phone (PWA)
Open the site in Chrome on Android > menu > Install app. On iPhone: Share > Add to Home Screen.

## 6. Known limits
- Only COD exists in the customer checkout today. "Paid online" orders are supported by the delivery code (rider collects nothing) but there is no online-payment flow yet.
- No live GPS tracking line for the customer; the customer sees the status, rider name/phone and the delivery code.
- No push notifications to riders: the offers screen refreshes by itself while the app is open.
- Failed deliveries are followed up by a manager (Dispatch > Failed).
