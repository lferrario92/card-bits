import { computed, ref } from 'vue'
import type { CardTemplate } from './types'
import {
  type Deck,
  MAX_CARDS,
  MAX_COPIES,
  cardKey,
  createDefaultDeck,
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
  let loaded = loadDecks()
  if (loaded.length === 0) loaded = [createDefaultDeck()]
  decks.value = loaded
  const stored = getStoredCurrentDeckId()
  currentDeckId.value = stored && loaded.some(d => d.id === stored) ? stored : loaded[0].id
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
    if (decks.value.length === 0) decks.value = [createDefaultDeck()]
    if (!decks.value.some(d => d.id === currentDeckId.value)) currentDeckId.value = decks.value[0].id
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
    MAX_CARDS,
    MAX_COPIES,
  }
}
