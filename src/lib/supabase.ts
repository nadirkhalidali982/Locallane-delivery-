import { createClient } from '@supabase/supabase-js'

/*
 * Only the PUBLISHABLE key belongs in frontend code (public by design; protected by Auth + RLS).
 * NEVER put the secret / service_role key here. Same project as the LocalLane customer site.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://ldjkagucegwpwigrjbhn.supabase.co'
const key =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  'sb_publishable_FmTxSZSJD3VuhB6Td-WjGw_HduQZ66X'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
