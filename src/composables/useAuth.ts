import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface MatchStats {
  wins: number
  losses: number
  draws: number
  matches: number
}

const user = ref<User | null>(null)
const session = ref<Session | null>(null)
const profile = ref<Profile | null>(null)
const initialized = ref(false)
const busy = ref(false)
const authError = ref('')

const isAuthenticated = computed(() => user.value !== null)
const email = computed(() => user.value?.email ?? '')
const displayName = computed(() => profile.value?.display_name || email.value.split('@')[0] || 'Player')
const initials = computed(() => displayName.value.slice(0, 2).toUpperCase())
const memberSince = computed(() => profile.value?.created_at ?? user.value?.created_at ?? '')

async function loadProfile(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('tcg_profiles')
    .select('id, display_name, avatar_url, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    profile.value = null
    return
  }
  profile.value = data as Profile
}

/**
 * One-time bootstrap: caches the current session and mirrors later auth
 * changes into local refs. Repeated calls return the same promise so router
 * guards never race the first session lookup.
 */
export function initAuth(): Promise<void> {
  if (!initPromise) initPromise = bootstrap()
  return initPromise
}

let initPromise: Promise<void> | null = null

async function bootstrap(): Promise<void> {
  initialized.value = true

  try {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    user.value = data.session?.user ?? null
    if (user.value) await loadProfile(user.value.id)
  } catch {
    authError.value = 'Could not reach the auth service.'
  }

  supabase.auth.onAuthStateChange((_event, next) => {
    session.value = next
    user.value = next?.user ?? null
    // Deferred: supabase-js serialises its own auth callbacks, so any further
    // request made synchronously from inside the callback can deadlock.
    window.setTimeout(() => {
      if (user.value) void loadProfile(user.value.id)
      else profile.value = null
    }, 0)
  })
}

export async function signIn(emailInput: string, password: string): Promise<boolean> {
  busy.value = true
  authError.value = ''
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailInput, password })
    if (error) {
      authError.value = error.message
      return false
    }
    // Set eagerly so router guards see the session without waiting for the
    // auth-state event to propagate.
    session.value = data.session
    user.value = data.session?.user ?? null
    if (user.value) await loadProfile(user.value.id)
    return true
  } finally {
    busy.value = false
  }
}

/**
 * Creates an account. Returns `{ needsConfirmation: true }` when the project
 * requires email verification before a session is issued.
 */
export async function signUp(
  emailInput: string,
  password: string,
  displayNameInput: string
): Promise<{ ok: boolean; needsConfirmation: boolean }> {
  busy.value = true
  authError.value = ''
  try {
    const { data, error } = await supabase.auth.signUp({
      email: emailInput,
      password,
      options: { data: { display_name: displayNameInput } },
    })
    if (error) {
      authError.value = error.message
      return { ok: false, needsConfirmation: false }
    }
    if (data.user && !data.session) return { ok: true, needsConfirmation: true }
    session.value = data.session
    user.value = data.session?.user ?? null
    if (data.user) await loadProfile(data.user.id)
    return { ok: true, needsConfirmation: false }
  } finally {
    busy.value = false
  }
}

export async function signOut(): Promise<void> {
  busy.value = true
  try {
    await supabase.auth.signOut()
    profile.value = null
  } finally {
    busy.value = false
  }
}

export async function updateDisplayName(name: string): Promise<boolean> {
  const id = user.value?.id
  if (!id) return false
  const trimmed = name.trim()
  if (!trimmed) return false

  const { error } = await supabase.from('tcg_profiles').upsert({
    id,
    display_name: trimmed,
  })
  if (error) {
    authError.value = error.message
    return false
  }
  await loadProfile(id)
  return true
}

/** Wins / losses / draws across finished PvP matches. */
export async function fetchStats(): Promise<MatchStats> {
  const id = user.value?.id
  const empty: MatchStats = { wins: 0, losses: 0, draws: 0, matches: 0 }
  if (!id) return empty

  const { data, error } = await supabase
    .from('tcg_matches')
    .select('status, winner, host_id, guest_id')
    .eq('status', 'finished')
    .or(`host_id.eq.${id},guest_id.eq.${id}`)

  if (error || !data) return empty

  const stats: MatchStats = { wins: 0, losses: 0, draws: 0, matches: 0 }
  for (const row of data as Array<{ status: string; winner: string | null; host_id: string; guest_id: string }>) {
    stats.matches += 1
    if (!row.winner) {
      stats.draws += 1
    } else if (row.winner === row.host_id || row.winner === row.guest_id) {
      if (row.winner === id) stats.wins += 1
      else stats.losses += 1
    } else {
      // Legacy / seat-based winner markers.
      const mine = row.host_id === id ? 'host' : 'guest'
      if (row.winner === mine) stats.wins += 1
      else stats.losses += 1
    }
  }
  return stats
}

export function useAuth() {
  return {
    user,
    session,
    profile,
    initialized,
    busy,
    authError,
    isAuthenticated,
    email,
    displayName,
    initials,
    memberSince,
    initAuth,
    signIn,
    signUp,
    signOut,
    updateDisplayName,
    fetchStats,
  }
}
