# LocalLane Delivery

Separate delivery operations site (admin, staff, riders). Same Supabase project as the LocalLane customer site.

## Status
Batch 1 (Milestones 0 and 1). Login, server-side roles, protected routes, ops and rider shells, Team management.
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
