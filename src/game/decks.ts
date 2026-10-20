import type { CardTemplate } from './types'
import { STARTER_CARDS } from './cards'

export interface Deck {
  id: string
  name: string
  cards: CardTemplate[]
}

/** Maximum copies of a single card allowed in a deck. */
export const MAX_COPIES = 2
/** Maximum total cards allowed in a deck. */
export const MAX_CARDS = 15

const STORAGE_DECKS = 'cards-bits:decks'
const STORAGE_CURRENT = 'cards-bits:currentDeckId'

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `d-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

export function loadDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(STORAGE_DECKS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((d): d is Deck => d && typeof d.id === 'string')
      .map(d => ({
        id: d.id,
        name: typeof d.name === 'string' ? d.name : 'Untitled Deck',
        cards: Array.isArray(d.cards) ? d.cards : [],
      }))
  } catch (e) {
    console.error('Failed to load decks', e)
    return []
  }
}

export function saveDecks(decks: Deck[]): void {
  try {
    localStorage.setItem(STORAGE_DECKS, JSON.stringify(decks))
  } catch (e) {
    console.error('Failed to save decks', e)
  }
}

export function getStoredCurrentDeckId(): string | null {
  try {
    return localStorage.getItem(STORAGE_CURRENT)
  } catch (e) {
    return null
  }
}

export function setStoredCurrentDeckId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_CURRENT, id)
    else localStorage.removeItem(STORAGE_CURRENT)
  } catch (e) {
    console.error('Failed to set current deck id', e)
  }
}

export function createDefaultDeck(): Deck {
  return {
    id: makeId(),
    name: 'Starter Deck',
    cards: STARTER_CARDS.map(c => ({ ...c, effects: c.effects.map(e => ({ ...e })) })),
  }
}

/** Identity key for a card template (titles are unique in the catalog). */
export function cardKey(card: CardTemplate): string {
  return card.title
}
