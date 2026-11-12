import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchUserProfile } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'

/** Credits needed to open one booster. */
export const CREDIT_STEP = 5000

/**
 * How long a fetched balance is trusted before we go back to the network.
 *
 * The balance only moves when a booster is opened (which writes the new value
 * straight into this cache) or when the server-side 12h regeneration ticks it
 * over, so a short window costs nothing in accuracy and saves a `profiles`
 * read on every navigation and reload.
 */
const CACHE_TTL_MS = 10 * 60 * 1000
const STORAGE_KEY = 'cards-bits:credits'

/** Shared balance for the signed-in user. `null` until it has been read. */
const credits = ref<number | null>(null)
const loading = ref(false)

/** Epoch ms of the last value we accepted (memory or storage). */
let cachedAt = 0
/** Which account the in-memory balance belongs to — the cache is per-user. */
let cachedUid: string | null = null
/** De-duplicates concurrent callers so one navigation burst = one request. */
let inflight: Promise<number | null> | null = null

/**
 * Boosters the balance can pay for — the number shown on the bubble badge.
 */
const openableBoosters = computed(() =>
  credits.value === null ? 0 : Math.max(0, Math.floor(credits.value / CREDIT_STEP)),
)

function readCache(uid: string): { value: number; at: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { value?: unknown; at?: unknown; uid?: unknown }
    if (typeof parsed.value !== 'number' || typeof parsed.at !== 'number') return null
    // Scoped per account: a logout/login swap must never show the old balance.
    if (parsed.uid !== uid) return null
    return { value: parsed.value, at: parsed.at }
  } catch {
    return null
  }
}

function writeCache(uid: string, value: number, at: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ value, at, uid }))
  } catch {
    /* storage unavailable — the in-memory value still works */
  }
}

function isFresh(at: number): boolean {
  return Date.now() - at < CACHE_TTL_MS
}

/** Forget the current balance (sign-out or a user without a `profiles` row). */
function clearCredits(): void {
  credits.value = null
  cachedAt = 0
  cachedUid = null
}

/**
 * Record a balance we already know (the `new_balance` returned by
 * `open_booster`), so opening a pack never costs an extra read.
 */
function setCredits(value: number): void {
  const { user } = useAuth()
  const uid = user.value?.id ?? null
  const at = Date.now()
  credits.value = value
  cachedAt = at
  cachedUid = uid
  if (uid) writeCache(uid, value, at)
}

/**
 * Current balance, reading the user's `profiles` row only when the cache is
 * stale. Pass `force` to bypass the cache (startup, sign-in, failed reads).
 */
async function refreshCredits(force = false): Promise<number | null> {
  const { user } = useAuth()
  const uid = user.value?.id ?? null
  if (!uid) {
    clearCredits()
    return null
  }

  // The in-memory value belongs to another account (or to nobody yet) — a
  // fresh read is mandatory before anything is displayed.
  if (cachedUid !== uid) {
    credits.value = null
    cachedAt = 0
    cachedUid = null
    force = true
  }

  if (!force) {
    // Memory first — free on every navigation.
    if (credits.value !== null && isFresh(cachedAt)) return credits.value
    // Then localStorage, so a reload inside the TTL window is also free.
    const stored = readCache(uid)
    if (stored && isFresh(stored.at)) {
      credits.value = stored.value
      cachedAt = stored.at
      cachedUid = uid
      return stored.value
    }
  }

  if (inflight) return inflight

  inflight = (async () => {
    try {
      const profile = await fetchUserProfile(uid)
      const value = profile?.credits ?? 0
      // The account may have changed while the request was in flight.
      if (useAuth().user.value?.id !== uid) return credits.value
      credits.value = value
      cachedAt = Date.now()
      cachedUid = uid
      writeCache(uid, value, cachedAt)
      return value
    } catch (err) {
      console.warn('[credits] profile read failed', err)
      return credits.value
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/**
 * Fetches the signed-in user's profile once at app start (so the bubble
 * badge is correct immediately) and keeps the balance honest afterwards:
 * re-reads every {@link CACHE_TTL_MS}, on sign-in, and drops it on sign-out.
 *
 * Call once, during setup — in `App.vue`.
 */
export function useCreditsAutoRefresh(intervalMs = CACHE_TTL_MS) {
  const { isAuthenticated, user, initAuth } = useAuth()
  let timer: number | null = null

  async function tick() {
    // The router guard resolves the session asynchronously; without waiting,
    // the first tick would see "signed out" and skip until the next interval.
    await initAuth()
    // No `force` needed: the in-memory cache starts empty on every page load,
    // and a uid mismatch counts as forced — so this is exactly one request
    // per app start, never a second one if the sign-in watcher got there first.
    if (isAuthenticated.value) void refreshCredits()
  }

  // Sign-in / sign-out moves the balance: fetch for the new account, drop
  // the previous one so its cached value can never be displayed.
  watch(user, (next, prev) => {
    if (next?.id && next.id !== prev?.id) void refreshCredits(true)
    else if (!next) clearCredits()
  })

  onMounted(() => {
    void tick()
    timer = window.setInterval(() => void tick(), intervalMs)
  })

  onUnmounted(() => {
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  })
}

export function useCredits() {
  return { credits, loading, openableBoosters, refreshCredits, setCredits }
}
