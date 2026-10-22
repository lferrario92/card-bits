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

// ---------------------------------------------------------------------------
// Booster types
// ---------------------------------------------------------------------------

export interface DbBooster {
  id: string
  name: string
  description: string | null
  price: number
  card_count: number
  cover_image: string | null
  release_date: string | null
}

export interface DbOpenedCard {
  id: string
  name: string
  rarity: string
  image: string | null
  description: string | null
}

export interface OpenBoosterResult {
  success: boolean
  message: string
  cards: DbOpenedCard[]
  card_ids: string[]
  booster_id: string
  booster_name: string
  booster_price: number
  new_balance: number
}

export interface DbUserCard {
  id: string
  user_id: string
  card_id: string
  count: number
  cards: {
    id: string
    name: string
    image: string | null
    rarity: string
    description: string | null
    tcg_available: boolean
  }
}

// ---------------------------------------------------------------------------
// Booster client functions
// ---------------------------------------------------------------------------

export async function fetchAvailableBoosters(): Promise<DbBooster[]> {
  const CACHE_KEY = 'boosters_cache'
  const CACHE_DURATION = 60 * 60 * 1000 // 60 minutes in milliseconds

  // Check cache
  const cached = localStorage.getItem(CACHE_KEY)
  if (cached) {
    const { data, timestamp } = JSON.parse(cached)
    const now = Date.now()
    if (now - timestamp < CACHE_DURATION) {
      return data
    }
  }

  // Fetch fresh data
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('boosters')
    .select('id, name, description, price, card_count, cover_image, release_date')
    .lte('release_date', today)
    .order('price', { ascending: true })

  if (error) throw error
  const boosters = (data ?? []) as DbBooster[]

  // Cache the result
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    data: boosters,
    timestamp: Date.now()
  }))

  return boosters
}

export async function openBooster(
  userId: string,
  boosterId?: string
): Promise<OpenBoosterResult> {
  const { data, error } = await supabase
    .rpc('open_booster', {
      p_user_id: userId,
      p_booster_id: boosterId ?? null
    })
    .single<OpenBoosterResult>()

  if (error) throw error
  if (!data) throw new Error('No data returned from booster opening')
  if (!data.success) throw new Error(data.message || 'Failed to open booster')
  return data
}

export async function fetchUserCards(userId: string): Promise<DbUserCard[]> {
  const { data, error } = await supabase
    .from('user_cards')
    .select('*, cards(tcg_available, image, name, rarity)')
    .eq('user_id', userId)

  if (error) throw error

  // Filter to only include cards where tcg_available is true
  const filteredData = (data ?? []).filter(
    (item: any) => item.cards && item.cards.tcg_available === true
  )

  return filteredData as DbUserCard[]
}


