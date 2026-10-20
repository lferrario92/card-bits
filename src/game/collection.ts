import { ref } from 'vue'
import { CARD_CATALOG } from './cards'
import type { CardTemplate } from './types'

/**
 * Local data layer for the player's owned card collection.
 *
 * Everything here reads/writes localStorage today. When a remote database is
 * introduced, only this module needs to change: swap the storage helpers for
 * API calls and keep the same exported API (or make them async and await at
 * the call sites). Cards are keyed by `title`, which is unique in the catalog.
 */

const STORAGE_KEY = 'cards-bits:collection'
const SEED_COPIES = 2

export type CollectionMap = Record<string, number>

function load(): CollectionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as CollectionMap
  } catch {
    /* ignore corrupt / unavailable storage */
  }
  return {}
}

function persist(map: CollectionMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

// Give new players a playset of the starter cards so decks are buildable
// out of the box; packs then grow the collection from there.
function seedIfEmpty(map: CollectionMap): CollectionMap {
  if (Object.keys(map).length > 0) return map
  const seeded: CollectionMap = {}
  for (const card of CARD_CATALOG) seeded[card.title] = SEED_COPIES
  persist(seeded)
  return seeded
}

const owned = ref<CollectionMap>(seedIfEmpty(load()))

/** Raw title -> owned-count map. */
export function getOwned(): CollectionMap {
  return owned.value
}

/** How many copies of a card (by title) the player owns. */
export function getOwnedCount(title: string): number {
  return owned.value[title] ?? 0
}

/** Unique card templates the player owns, in catalog order. */
export function getOwnedCards(): CardTemplate[] {
  return CARD_CATALOG.filter((card) => (owned.value[card.title] ?? 0) > 0)
}

/** Add one copy of each given card title. */
export function addCards(titles: string[]): void {
  const next = { ...owned.value }
  for (const title of titles) next[title] = (next[title] ?? 0) + 1
  owned.value = next
  persist(next)
}

/** Add one copy of each given card. */
export function addTemplates(cards: CardTemplate[]): void {
  addCards(cards.map((card) => card.title))
}

export function resetCollection(): void {
  owned.value = {}
  persist(owned.value)
}

export function useCollection() {
  return { owned, getOwned, getOwnedCount, getOwnedCards, addCards, addTemplates, resetCollection }
}
