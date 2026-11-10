# LocalLane Delivery

Separate delivery operations site (admin, staff, riders). Same Supabase project as the LocalLane customer site.

## Status
Batches 1 to 4: foundation, orders, dispatch, rider portal, pickup + OTP delivery, finance. See docs/DEPLOY.md and docs/TESTS.md.
Orders, dispatch, rider portal, finance: later batches.

## Run locally
    npm install
    npm run dev

## Deploy on Cloudflare Workers
1. Push this folder to a GitHub repo.
2. Cloudflare dashboard: Workers & Pages, Create, Import a repository.
3. Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
4. Config is in `wrangler.jsonc` (static assets from `dist`, single-page-app fallback).

Also works on Netlify (`netlify.toml` included).

## Supabase settings to do once
Authentication, URL Configuration: add the new site URL to "Site URL" / "Redirect URLs" so confirmation emails come back here.

## Security
Only the publishable key is used in the browser. Never add the service_role key.
