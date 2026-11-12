import { ref } from 'vue'

/**
 * Shared visibility switch for the floating booster bubble.
 *
 * App-level views (home, profile, decks) want the bubble on screen; the deck
 * editor is a dense, full-screen surface where it would cover cards, so that
 * view flips this flag while it is open. Module-level because the flag is
 * written by a child view and read by App.vue.
 */
const suppressed = ref(false)

export function useBoosterBubble() {
  function setBubbleSuppressed(value: boolean) {
    suppressed.value = value
  }

  return { suppressed, setBubbleSuppressed }
}
