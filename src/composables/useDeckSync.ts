import { onMounted, watch } from 'vue'
import { useAuth } from './useAuth'
import { useDecks } from '@/game/useDecks'
import { fetchUserCards, dbCardToTemplate } from '@/lib/supabase'

/**
 * Re-syncs custom decks with the backend's card values once per app start.
 *
 * Decks live in localStorage as full snapshots of card data, so any balance
 * change made server-side would otherwise never reach them. This pulls the
 * signed-in player's `user_cards`, converts them to templates (which carry
 * the backend `cardId`) and hands them to `useDecks().refreshCards()`.
 *
 * Deliberately skips the request entirely when the player has no decks —
 * there would be nothing to refresh. Call once, during setup, in App.vue.
 */
export function useDeckSync() {
  const { user, isAuthenticated, initAuth } = useAuth()
  const { decks, refreshCards } = useDecks()

  let inFlight: Promise<void> | null = null

  function sync(): Promise<void> {
    // De-duplicate: the startup tick and the sign-in watcher can overlap.
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        await initAuth()
        const uid = user.value?.id
        if (!isAuthenticated.value || !uid) return
        // Nothing to update — don't spend a request on deckless players.
        if (decks.value.length === 0) return
        const rows = await fetchUserCards(uid)
        refreshCards(rows.map((row) => dbCardToTemplate(row.cards)))
      } catch (err) {
        // Non-fatal: decks keep their (possibly stale) data and the next
        // app start retries. Never block the UI on this.
        console.warn('[deck-sync] could not refresh deck card data', err)
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  onMounted(() => {
    void sync()
  })

  // A fresh sign-in (or account switch) means a different card pool —
  // re-run so the decks reflect the profile now in session.
  watch(user, (next, prev) => {
    if (next?.id && next.id !== prev?.id) void sync()
  })
}
