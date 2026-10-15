import { computed, reactive, ref } from 'vue'
import type { AttackTarget, BattlePhase, BoardCreature, CardData, CardEffect, CardTemplate, Entity, Side } from './types'

/** Hard cap on maximum mana per turn. */
const MANA_CAP = 10

export interface BattleApi {
  state: BattleState
  playCard: (card: CardData, side: Side) => boolean
  attack: (attackerId: number, target: AttackTarget) => boolean
  drawCard: (side: Side) => void
  log: (msg: string) => void
  delay: (ms: number) => Promise<void>
}

export interface BattleState {
  player: Entity
  opponent: Entity
  playerBoard: BoardCreature[]
  opponentBoard: BoardCreature[]
  hand: CardData[]
  drawPile: CardData[]
  discardPile: CardData[]
  opponentHand: CardData[]
  opponentDrawPile: CardData[]
  opponentDiscardPile: CardData[]
  turn: number
  phase: BattlePhase
  winner: Side | null
  log: string[]
}

export interface BattleConfig {
  playerDeck: CardTemplate[]
  opponentDeck: CardTemplate[]
  playerName?: string
  opponentName?: string
  playerMaxHp?: number
  opponentMaxHp?: number
  startingHand?: number
  /** Delay (ms) before the opponent acts after End Turn. */
  opponentDelay?: number
  /**
   * Optional custom opponent behaviour. Receives the battle API so future
   * opponents (or difficulty levels) can be plugged in without touching the engine.
   */
  onOpponentTurn?: (api: BattleApi) => Promise<void> | void
}

let cardIdCounter = 1
let creatureInstanceCounter = 1

function buildDeck(templates: CardTemplate[]): CardData[] {
  return templates.map(t => ({ ...t, id: cardIdCounter++, effects: t.effects.map(e => ({ ...e })) }))
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function useBattle(config: BattleConfig) {
  const startingHand = config.startingHand ?? 5
  const opponentDelay = config.opponentDelay ?? 1000

  const state = reactive<BattleState>({
    player: { name: config.playerName ?? 'You', hp: 0, maxHp: config.playerMaxHp ?? 30, shield: 0, mana: 1, maxMana: 1 },
    opponent: { name: config.opponentName ?? 'Dark Mage', hp: 0, maxHp: config.opponentMaxHp ?? 30, shield: 0, mana: 1, maxMana: 1 },
    playerBoard: [],
    opponentBoard: [],
    hand: [],
    drawPile: [],
    discardPile: [],
    opponentHand: [],
    opponentDrawPile: [],
    opponentDiscardPile: [],
    turn: 1,
    phase: 'player',
    winner: null,
    log: [],
  })

  const busy = ref(false)

  const isPlayerTurn = computed(() => state.phase === 'player' && !busy.value && !state.winner)
  const isOver = computed(() => state.winner !== null)
  const canDraw = computed(() => state.drawPile.length > 0 || state.discardPile.length > 0)

  function log(msg: string) {
    state.log = [...state.log.slice(-40), msg]
  }

  function entityForSide(side: Side): Entity {
    return side === 'player' ? state.player : state.opponent
  }

  function boardForSide(side: Side): BoardCreature[] {
    return side === 'player' ? state.playerBoard : state.opponentBoard
  }

  // --- Entity mutations ---
  function damage(target: Entity, amount: number) {
    const absorbed = Math.min(target.shield, amount)
    target.shield -= absorbed
    const remaining = amount - absorbed
    target.hp = Math.max(0, target.hp - remaining)
  }

  function heal(target: Entity, amount: number) {
    // Max HP cap applies only to direct HP healing.
    target.hp = Math.min(target.maxHp, target.hp + amount)
  }

  function shield(target: Entity, amount: number) {
    target.shield += amount
  }

  /** Creature combat damage goes straight to HP (armor/shield does not apply). */
  function damageCreature(creature: BoardCreature, amount: number) {
    creature.hp = Math.max(0, creature.hp - amount)
  }

  function cleanupDead() {
    state.playerBoard = state.playerBoard.filter(c => c.hp > 0)
    state.opponentBoard = state.opponentBoard.filter(c => c.hp > 0)
  }

  function findCreature(instanceId: number): BoardCreature | null {
    return (
      state.playerBoard.find(c => c.instanceId === instanceId) ??
      state.opponentBoard.find(c => c.instanceId === instanceId) ??
      null
    )
  }

  function entityFor(target: CardEffect['target'], caster: Side): Entity {
    const selfEntity = entityForSide(caster)
    const opposingEntity = entityForSide(caster === 'player' ? 'opponent' : 'player')
    switch (target) {
      case 'self':
        return selfEntity
      case 'opponent':
        // Relative to the caster: the opposing side.
        return opposingEntity
      case 'player':
        // Absolute: the human player.
        return state.player
    }
  }

  function sideName(side: Side, fromPerspective: Side): string {
    return side === fromPerspective ? 'your' : "the opponent's"
  }

  // --- Effect resolution ---
  function resolveEffect(effect: CardEffect, caster: Side) {
    const target = entityFor(effect.target, caster)
    switch (effect.action) {
      case 'damage':
        damage(target, effect.value)
        log(`${target.name} takes ${effect.value} damage`)
        break
      case 'heal':
        heal(target, effect.value)
        log(`${target.name} restores ${effect.value} HP`)
        break
      case 'shield':
        shield(target, effect.value)
        log(`${target.name} gains ${effect.value} shield`)
        break
    }
    checkOutcome()
  }

  function resolveEffects(effects: CardEffect[], caster: Side) {
    for (const effect of effects) {
      if (state.winner) break
      resolveEffect(effect, caster)
    }
  }

  function checkOutcome() {
    if (state.winner) return
    if (state.opponent.hp <= 0) {
      state.winner = 'player'
      state.phase = 'over'
      log(`${state.opponent.name} is defeated — victory!`)
    } else if (state.player.hp <= 0) {
      state.winner = 'opponent'
      state.phase = 'over'
      log(`You have been defeated...`)
    }
  }

  // --- Mana / turn start ---
  /** Refresh mana (+1 max up to the cap) and ready the side's creatures. */
  function startTurn(side: Side) {
    const ent = entityForSide(side)
    ent.maxMana = Math.min(MANA_CAP, ent.maxMana + 1)
    ent.mana = ent.maxMana
    for (const c of boardForSide(side)) {
      c.canAttack = true
      c.summoningSick = false
    }
  }

  function canPlayCard(card: CardData, side: Side): boolean {
    return !state.winner && entityForSide(side).mana >= card.manaCost
  }

  // --- Card play ---
  function playCard(card: CardData, side: Side): boolean {
    if (state.winner) return false

    const fromHand = side === 'player' ? state.hand : state.opponentHand
    const idx = fromHand.findIndex(c => c.id === card.id)
    if (idx === -1) return false

    const ent = entityForSide(side)
    if (ent.mana < card.manaCost) return false
    ent.mana -= card.manaCost

    const nextHand = [...fromHand]
    nextHand.splice(idx, 1)
    if (side === 'player') state.hand = nextHand
    else state.opponentHand = nextHand

    log(`${side === 'player' ? 'You' : state.opponent.name} play${side === 'player' ? '' : 's'} ${card.title}`)

    if (card.type === 'spell') {
      resolveEffects(card.effects, side)
      if (side === 'player') state.discardPile = [...state.discardPile, card]
      else state.opponentDiscardPile = [...state.opponentDiscardPile, card]
    } else {
      const maxHp = card.health && card.health > 0 ? card.health : 1
      const creature: BoardCreature = {
        instanceId: creatureInstanceCounter++,
        side,
        card,
        attack: card.attack ?? 0,
        hp: maxHp,
        maxHp,
        shield: 0,
        // Charge lets a creature act immediately; otherwise it is summoning sick.
        canAttack: !!card.charge,
        summoningSick: !card.charge,
      }
      if (side === 'player') state.playerBoard = [...state.playerBoard, creature]
      else state.opponentBoard = [...state.opponentBoard, creature]
      // Entrance / on-play effects reuse the same effect list.
      resolveEffects(card.effects, side)
    }
    return true
  }

  // --- Combat ---
  /**
   * Resolve a creature's attack. Returns true if the attack was performed.
   * The attacker must belong to the side whose turn it is and be ready.
   */
  function attack(attackerId: number, target: AttackTarget): boolean {
    if (state.winner) return false
    const attacker = findCreature(attackerId)
    if (!attacker) return false

    const expectedPhase: BattlePhase = attacker.side === 'player' ? 'player' : 'opponent'
    if (state.phase !== expectedPhase) return false
    if (!attacker.canAttack) return false

    const enemySide: Side = attacker.side === 'player' ? 'opponent' : 'player'
    const owner = attacker.side === 'player' ? 'Your' : `${state.opponent.name}'s`

    if (target.type === 'hero') {
      const hero = entityForSide(enemySide)
      attacker.canAttack = false
      damage(hero, attacker.attack)
      log(`${owner} ${attacker.card.title} strikes ${hero.name} for ${attacker.attack}`)
      checkOutcome()
      return true
    }

    const victim = boardForSide(enemySide).find(c => c.instanceId === target.instanceId)
    if (!victim) return false

    attacker.canAttack = false
    damageCreature(victim, attacker.attack)
    damageCreature(attacker, victim.attack)
    log(`${owner} ${attacker.card.title} trades blows with ${victim.card.title}`)
    cleanupDead()
    checkOutcome()
    return true
  }

  // --- Drawing ---
  function drawCard(side: Side) {
    const drawPile = side === 'player' ? state.drawPile : state.opponentDrawPile
    const discardPile = side === 'player' ? state.discardPile : state.opponentDiscardPile

    if (drawPile.length === 0) {
      if (discardPile.length === 0) {
        if (side === 'player') log('Your deck is empty!')
        return
      }
      const reshuffled = shuffle(discardPile)
      if (side === 'player') {
        state.drawPile = reshuffled
        state.discardPile = []
      } else {
        state.opponentDrawPile = reshuffled
        state.opponentDiscardPile = []
      }
    }

    const pile = side === 'player' ? state.drawPile : state.opponentDrawPile
    const card = pile[0]
    if (!card) return
    if (side === 'player') {
      state.drawPile = pile.slice(1)
      state.hand = [...state.hand, card]
    } else {
      state.opponentDrawPile = pile.slice(1)
      state.opponentHand = [...state.opponentHand, card]
    }
  }

  // --- Opponent AI ---
  async function defaultOpponentTurn() {
    // Spend available mana on the most expensive affordable cards.
    let guard = 0
    while (!state.winner && guard++ < 8) {
      const affordable = state.opponentHand.filter(c => c.manaCost <= state.opponent.mana)
      if (affordable.length === 0) break
      const creatures = affordable.filter(c => c.type === 'creature')
      const wantsCreature = state.opponentBoard.length < 4 && creatures.length > 0
      const pool = wantsCreature ? creatures : affordable
      const chosen = pool.reduce((best, c) => (c.manaCost > best.manaCost ? c : best), pool[0])
      playCard(chosen, 'opponent')
      if (!state.winner) await delay(450)
    }
    if (state.winner) return

    // Attack with every ready creature.
    const attackers = state.opponentBoard.filter(c => c.canAttack)
    for (const attacker of attackers) {
      if (state.winner) break
      const playerCreatures = state.playerBoard
      if (playerCreatures.length > 0 && Math.random() < 0.6) {
        const victim = playerCreatures[Math.floor(Math.random() * playerCreatures.length)]
        attack(attacker.instanceId, { type: 'creature', instanceId: victim.instanceId })
      } else {
        attack(attacker.instanceId, { type: 'hero' })
      }
      if (!state.winner) await delay(450)
    }
  }

  const api: BattleApi = { state, playCard, attack, drawCard, log, delay }

  // --- Turn loop ---
  async function endTurn() {
    if (state.phase !== 'player' || state.winner || busy.value) return
    busy.value = true
    state.phase = 'opponent'
    log(`${state.opponent.name}'s turn`)
    startTurn('opponent')

    await delay(opponentDelay)
    if (state.winner) {
      busy.value = false
      return
    }

    if (config.onOpponentTurn) {
      await config.onOpponentTurn(api)
    } else {
      await defaultOpponentTurn()
    }

    checkOutcome()
    if (state.winner) {
      busy.value = false
      return
    }

    await delay(opponentDelay * 0.6)
    state.turn += 1
    startTurn('player')
    drawCard('player')
    log(`Turn ${state.turn} — your move`)
    state.phase = 'player'
    busy.value = false
  }

  // --- Setup / reset ---
  function init() {
    cardIdCounter = 1
    creatureInstanceCounter = 1

    const playerDeck = shuffle(buildDeck(config.playerDeck))
    const opponentDeck = shuffle(buildDeck(config.opponentDeck))

    state.player = { name: config.playerName ?? 'You', hp: config.playerMaxHp ?? 30, maxHp: config.playerMaxHp ?? 30, shield: 0, mana: 1, maxMana: 1 }
    // Opponent starts at 0 so its first turn (via startTurn) ramps to 1/1,
    // matching the player's opening turn.
    state.opponent = { name: config.opponentName ?? 'Dark Mage', hp: config.opponentMaxHp ?? 30, maxHp: config.opponentMaxHp ?? 30, shield: 0, mana: 0, maxMana: 0 }
    state.playerBoard = []
    state.opponentBoard = []
    state.hand = playerDeck.slice(0, startingHand)
    state.drawPile = playerDeck.slice(startingHand)
    state.discardPile = []
    state.opponentHand = opponentDeck.slice(0, startingHand)
    state.opponentDrawPile = opponentDeck.slice(startingHand)
    state.opponentDiscardPile = []
    state.turn = 1
    state.phase = 'player'
    state.winner = null
    state.log = []
    busy.value = false
    log('Battle start — your move')
  }

  init()

  return {
    state,
    busy,
    isPlayerTurn,
    isOver,
    canDraw,
    playCard,
    attack,
    canPlayCard,
    drawCard,
    endTurn,
    reset: init,
    log,
    // convenience re-exports of common accessors
    playerTurnLabel: computed(() => (state.phase === 'player' ? 'Your Turn' : state.phase === 'opponent' ? `${state.opponent.name}'s Turn` : 'Battle Over')),
    // helper so the view can label sides
    sideName: (side: Side) => sideName(side, 'player'),
  }
}
