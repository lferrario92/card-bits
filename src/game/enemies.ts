import type { CardTemplate } from './types'
import predefinedDecks from '@/data/predefinedDecks.json'

/** A selectable opponent for the Bounce battle. */
export interface Enemy {
  id: string
  name: string
  tagline: string
  hp: number
  accent: 'rose' | 'amber' | 'sky'
  deck: CardTemplate[]
}

const ACCENTS: Array<'rose' | 'amber' | 'sky'> = ['rose', 'amber', 'sky']

function toTemplate(c: any): CardTemplate {
  return {
    title: c.name,
    image: c.image,
    description: c.description ?? '',
    type: c.type,
    manaCost: c.manaCost ?? 0,
    attack: c.attack,
    health: c.health,
    rarity: c.rarity ?? 'Common',
    charge: c.charge ?? false,
    effects: (c.effects ?? []).map((e: any) => ({ ...e })),
  }
}

export const ENEMIES: Enemy[] = (predefinedDecks as any[]).map((d, i) => ({
  id: d.id,
  name: d.name,
  tagline: d.description ?? '',
  hp: 30,
  accent: ACCENTS[i % ACCENTS.length],
  deck: (d.cards ?? []).map(toTemplate),
}))

export const DEFAULT_ENEMY_ID = ENEMIES[0]?.id ?? 'dark-mage'

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