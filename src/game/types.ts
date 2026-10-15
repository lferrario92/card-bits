export type CardType = 'spell' | 'creature'

export type EffectTarget = 'opponent' | 'player' | 'self'

export type EffectAction = 'damage' | 'heal' | 'shield'

export type Side = 'player' | 'opponent'

/**
 * A single atomic effect. Cards hold an ordered list of these which are
 * executed sequentially when the card is played.
 *
 * - target: who the effect lands on.
 *     "opponent" -> the opposing side
 *     "player"   -> the player entity (absolute)
 *     "self"     -> the caster's own side (relative to who played the card)
 * - action: what happens.
 * - value:  amount applied.
 */
export interface CardEffect {
  target: EffectTarget
  action: EffectAction
  value: number
}

export interface CardData {
  id: number
  image: string
  title: string
  description: string
  type: CardType
  /** Mana required to play this card. */
  manaCost: number
  attack?: number
  /** Creature hit points. Ignored for spells. */
  health?: number
  rarity?: string
  /**
   * Keyword: Charge. A creature with charge may attack the turn it is played
   * instead of waiting a full turn (summoning sickness).
   */
  charge?: boolean
  /** Combined effects, executed in order. For creatures these are on-play effects. */
  effects: CardEffect[]
}

/** A card definition without a runtime id, used to build decks. */
export type CardTemplate = Omit<CardData, 'id'>

/** A participant in the battle (player or opponent). */
export interface Entity {
  name: string
  hp: number
  maxHp: number
  shield: number
  /** Mana available this turn. */
  mana: number
  /** Maximum mana, grows by 1 per turn up to a cap. */
  maxMana: number
}

/** A creature that has been played onto the board. */
export interface BoardCreature {
  instanceId: number
  side: Side
  card: CardData
  attack: number
  hp: number
  maxHp: number
  shield: number
  /** True while the creature may still attack this turn. */
  canAttack: boolean
  /** True until its controller's next turn (unless it has Charge). */
  summoningSick: boolean
}

/** Where a creature attack can be directed. */
export type AttackTarget =
  | { type: 'hero' }
  | { type: 'creature'; instanceId: number }

export type BattlePhase = 'player' | 'opponent' | 'over'
