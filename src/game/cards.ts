import type { CardTemplate } from './types'

/**
 * Starter card pool. Each entry is a template (no runtime id).
 * Decks are built from these lists so future deck-selection screens only
 * need to supply different template arrays to `useBattle`.
 */
export const STARTER_CARDS: CardTemplate[] = [
  {
    image: 'https://picsum.photos/id/1015/400/400',
    title: 'Fire Dragon',
    description: 'A majestic dragon that breathes scorching flames.',
    type: 'creature',
    manaCost: 6,
    attack: 6,
    health: 5,
    rarity: 'Legendary',
    effects: [{ target: 'opponent', action: 'damage', value: 5 }],
  },
  {
    image: 'https://picsum.photos/id/1025/400/400',
    title: 'Ice Shield',
    description: 'A magical barrier of frozen air.',
    type: 'spell',
    manaCost: 2,
    rarity: 'Rare',
    effects: [{ target: 'self', action: 'shield', value: 8 }],
  },
  {
    image: 'https://picsum.photos/id/1039/400/400',
    title: 'Lightning Bolt',
    description: 'Strikes a single target with raw electricity.',
    type: 'spell',
    manaCost: 2,
    rarity: 'Uncommon',
    effects: [{ target: 'opponent', action: 'damage', value: 8 }],
  },
  {
    image: 'https://picsum.photos/id/1043/400/400',
    title: 'Healing Spirit',
    description: 'A benevolent spirit that restores vitality.',
    type: 'creature',
    manaCost: 3,
    attack: 0,
    health: 4,
    rarity: 'Rare',
    effects: [{ target: 'self', action: 'heal', value: 6 }],
  },
  {
    image: 'https://picsum.photos/id/1050/400/400',
    title: 'Shadow Assassin',
    description: 'Strikes from darkness with deadly precision.',
    type: 'creature',
    manaCost: 4,
    attack: 5,
    health: 2,
    charge: true,
    rarity: 'Epic',
    effects: [
      { target: 'opponent', action: 'damage', value: 4 },
      { target: 'self', action: 'shield', value: 2 },
    ],
  },
  {
    image: 'https://picsum.photos/id/1062/400/400',
    title: 'Earth Golem',
    description: 'A massive construct of stone and magic.',
    type: 'creature',
    manaCost: 6,
    attack: 3,
    health: 9,
    rarity: 'Legendary',
    effects: [
      { target: 'self', action: 'shield', value: 5 },
      { target: 'opponent', action: 'damage', value: 2 },
    ],
  },
  {
    image: 'https://picsum.photos/id/1069/400/400',
    title: 'Frost Wolf',
    description: 'A swift predator of the frozen north. Charges in immediately.',
    type: 'creature',
    manaCost: 2,
    attack: 2,
    health: 2,
    charge: true,
    rarity: 'Common',
    effects: [{ target: 'opponent', action: 'damage', value: 3 }],
  },
  {
    image: 'https://picsum.photos/id/1074/400/400',
    title: 'Arcane Missiles',
    description: 'Unyielding bolts of raw arcane energy.',
    type: 'spell',
    manaCost: 3,
    rarity: 'Uncommon',
    effects: [
      { target: 'opponent', action: 'damage', value: 3 },
      { target: 'opponent', action: 'damage', value: 3 },
    ],
  },
  {
    image: 'https://picsum.photos/id/1080/400/400',
    title: 'Holy Light',
    description: 'Divine radiance that mends wounds and wards the faithful.',
    type: 'spell',
    manaCost: 3,
    rarity: 'Rare',
    effects: [
      { target: 'self', action: 'heal', value: 4 },
      { target: 'self', action: 'shield', value: 4 },
    ],
  },
  {
    image: 'https://picsum.photos/id/1084/400/400',
    title: 'Poison Dagger',
    description: 'A venom-coated blade that weakens foes.',
    type: 'creature',
    manaCost: 1,
    attack: 2,
    health: 1,
    rarity: 'Common',
    effects: [
      { target: 'opponent', action: 'damage', value: 2 },
      { target: 'opponent', action: 'damage', value: 1 },
    ],
  },
  {
    image: 'https://picsum.photos/id/1018/400/400',
    title: 'Stone Bulwark',
    description: 'Raises a wall of stone to blunt incoming blows.',
    type: 'spell',
    manaCost: 2,
    rarity: 'Common',
    effects: [{ target: 'self', action: 'shield', value: 5 }],
  },
  {
    image: 'https://picsum.photos/id/1020/400/400',
    title: 'Blood Rite',
    description: 'A dark ritual that trades your own vitality for power.',
    type: 'spell',
    manaCost: 1,
    rarity: 'Uncommon',
    effects: [
      { target: 'opponent', action: 'damage', value: 6 },
      { target: 'self', action: 'damage', value: 2 },
    ],
  },
]

/** Cards the mock opponent uses. Slightly more aggressive. */
export const OPPONENT_CARDS: CardTemplate[] = [
  STARTER_CARDS[2], // Lightning Bolt
  STARTER_CARDS[7], // Arcane Missiles
  STARTER_CARDS[11], // Blood Rite
  STARTER_CARDS[6], // Frost Wolf
  STARTER_CARDS[4], // Shadow Assassin
  STARTER_CARDS[9], // Poison Dagger
  STARTER_CARDS[5], // Earth Golem
  STARTER_CARDS[0], // Fire Dragon
  STARTER_CARDS[2], // Lightning Bolt
  STARTER_CARDS[6], // Frost Wolf
]
