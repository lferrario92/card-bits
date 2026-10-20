import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Supabase env vars are missing. Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

/**
 * The single Supabase browser client for the app.
 *
 * SECURITY: only `VITE_*` variables are inlined into the bundle. Never read
 * `DATABASE_PASSWORD` (or any other non-prefixed key) from this module — the
 * anon key is the only credential that is allowed to reach the client, and it
 * is protected by Row Level Security.
 */
export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
