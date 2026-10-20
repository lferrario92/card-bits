import type { CardTemplate } from './types'
import { STARTER_CARDS, OPPONENT_CARDS } from './cards'

/** A selectable opponent for the Bounce battle. */
export interface Enemy {
  id: string
  name: string
  tagline: string
  hp: number
  accent: 'rose' | 'amber' | 'sky'
  deck: CardTemplate[]
}

// Shorthand for building decks from the shared card pool.
const c = (i: number): CardTemplate => STARTER_CARDS[i]

export const ENEMIES: Enemy[] = [
  {
    id: 'dark-mage',
    name: 'Dark Mage',
    tagline: 'A balanced mix of spells and shadows.',
    hp: 30,
    accent: 'rose',
    deck: [...OPPONENT_CARDS],
  },
  {
    id: 'goblin-warlord',
    name: 'Goblin Warlord',
    tagline: 'Fast, cheap creatures that swarm the board.',
    hp: 24,
    accent: 'amber',
    deck: [
      c(6), // Frost Wolf
      c(6),
      c(6),
      c(4), // Shadow Assassin
      c(4),
      c(9), // Poison Dagger
      c(9),
      c(9),
      c(2), // Lightning Bolt
      c(2),
    ],
  },
  {
    id: 'frost-titan',
    name: 'Frost Titan',
    tagline: 'Slow, enormous minions and heavy defenses.',
    hp: 40,
    accent: 'sky',
    deck: [
      c(0), // Fire Dragon
      c(0),
      c(5), // Earth Golem
      c(5),
      c(5),
      c(1), // Ice Shield
      c(1),
      c(8), // Holy Light
      c(10), // Stone Bulwark
      c(10),
    ],
  },
]

export const DEFAULT_ENEMY_ID = ENEMIES[0].id

const STORAGE_KEY = 'cards-bits:enemyId'

export function getEnemy(id: string | null | undefined): Enemy {
  return ENEMIES.find((e) => e.id === id) ?? ENEMIES[0]
}

export function getStoredEnemyId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredEnemyId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

/** The opponent currently chosen in the enemy select view. */
export function getSelectedEnemy(): Enemy {
  return getEnemy(getStoredEnemyId())
}
