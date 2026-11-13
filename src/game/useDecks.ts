import { computed, ref } from 'vue'
import type { CardTemplate } from './types'
import {
  type Deck,
  MAX_CARDS,
  MIN_CARDS,
  MAX_COPIES,
  cardKey,
  getStoredCurrentDeckId,
  loadDecks,
  makeId,
  saveDecks,
  setStoredCurrentDeckId,
} from './decks'

// Module-level singleton so every view shares the same reactive store.
const decks = ref<Deck[]>([])
const currentDeckId = ref<string | null>(null)
let initialized = false

function persist() {
  saveDecks(decks.value)
  setStoredCurrentDeckId(currentDeckId.value)
}

function ensureInit() {
  if (initialized) return
  initialized = true
  // No deck is created for the player: they build their first one from the
  // cards they own (see the router guard that sends deckless players to /decks).
  const loaded = loadDecks()
  decks.value = loaded
  const stored = getStoredCurrentDeckId()
  currentDeckId.value = stored && loaded.some(d => d.id === stored) ? stored : (loaded[0]?.id ?? null)
  persist()
}

function cloneTemplate(c: CardTemplate): CardTemplate {
  return { ...c, effects: c.effects.map(e => ({ ...e })) }
}

export function useDecks() {
  ensureInit()

  const currentDeck = computed<Deck | null>(
    () => decks.value.find(d => d.id === currentDeckId.value) ?? null,
  )

  function getDeck(id: string): Deck | null {
    return decks.value.find(d => d.id === id) ?? null
  }

  function currentDeckTemplates(): CardTemplate[] {
    const d = currentDeck.value
    if (!d || d.cards.length === 0) return []
    return d.cards.map(cloneTemplate)
  }

  function createDeckAndSelect(name?: string): Deck {
    const deck: Deck = { id: makeId(), name: name?.trim() || 'New Deck', cards: [] }
    decks.value = [...decks.value, deck]
    currentDeckId.value = deck.id
    persist()
    return deck
  }

  function deleteDeck(id: string): void {
    decks.value = decks.value.filter(d => d.id !== id)
    // Deleting the last deck leaves the player with none on purpose — they
    // make a new one from their own cards rather than getting a free preset.
    if (!decks.value.some(d => d.id === currentDeckId.value)) {
      currentDeckId.value = decks.value[0]?.id ?? null
    }
    persist()
  }

  function renameDeck(id: string, name: string): void {
    const deck = getDeck(id)
    if (!deck) return
    deck.name = name.trim() || 'Untitled Deck'
    decks.value = [...decks.value]
    persist()
  }

  function selectCurrent(id: string): void {
    if (!decks.value.some(d => d.id === id)) return
    currentDeckId.value = id
    persist()
  }

  function addCard(id: string, card: CardTemplate): boolean {
    const deck = getDeck(id)
    if (!deck) return false
    if (deck.cards.length >= MAX_CARDS) return false
    if (deck.cards.filter(c => cardKey(c) === cardKey(card)).length >= MAX_COPIES) return false
    deck.cards = [...deck.cards, cloneTemplate(card)]
    persist()
    return true
  }

  function removeCard(id: string, card: CardTemplate): boolean {
    const deck = getDeck(id)
    if (!deck) return false
    const idx = deck.cards.findIndex(c => cardKey(c) === cardKey(card))
    if (idx === -1) return false
    const next = [...deck.cards]
    next.splice(idx, 1)
    deck.cards = next
    persist()
    return true
  }

  function isValidDeck(deck: Deck): boolean {
    return deck.cards.length >= MIN_CARDS && deck.cards.length <= MAX_CARDS
  }

  /**
   * Overwrites deck card snapshots with fresher backend data (balance
   * changes made server-side), so stored decks always fight with current
   * card values. Cards are matched by `cardId` when present, falling back to
   * the title for decks saved before ids existed (those get `cardId`
   * backfilled on the way). Cards missing from `freshCards` — no longer
   * owned or not TCG-available — are left untouched rather than stripped,
   * so a sync can never silently empty a deck.
   *
   * Returns true when anything changed and was persisted.
   */
  function refreshCards(freshCards: CardTemplate[]): boolean {
    if (decks.value.length === 0 || freshCards.length === 0) return false

    const byId = new Map<string, CardTemplate>()
    const byTitle = new Map<string, CardTemplate>()
    for (const fresh of freshCards) {
      if (fresh.cardId) byId.set(fresh.cardId, fresh)
      byTitle.set(fresh.title, fresh)
    }

    let changed = false
    for (const deck of decks.value) {
      let deckChanged = false
      const next = deck.cards.map((old) => {
        const fresh =
          (old.cardId ? byId.get(old.cardId) : undefined) ?? byTitle.get(old.title)
        if (!fresh) return old
        // Clone: decks must not share template objects with the fetch result
        // (or with each other). JSON compare also detects the missing-cardId
        // legacy case, so a backfill counts as a change worth persisting.
        const merged: CardTemplate = { ...fresh, effects: fresh.effects.map(e => ({ ...e })) }
        if (JSON.stringify(merged) === JSON.stringify(old)) return old
        deckChanged = true
        return merged
      })
      if (deckChanged) {
        deck.cards = next
        changed = true
      }
    }

    if (changed) persist()
    return changed
  }

  function canUseDeck(deck: Deck, userCards: CardTemplate[]): boolean {
    const userCardKeys = new Set(userCards.map(cardKey))
    return deck.cards.every(card => userCardKeys.has(cardKey(card)))
  }

  return {
    decks,
    currentDeckId,
    currentDeck,
    getDeck,
    currentDeckTemplates,
    createDeckAndSelect,
    deleteDeck,
    renameDeck,
    selectCurrent,
    addCard,
    removeCard,
    refreshCards,
    MAX_CARDS,
    MIN_CARDS,
    MAX_COPIES,
    canUseDeck,
    isValidDeck,
  }
}
