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
  convertCardToMana: (card: CardData, side: Side) => boolean
  convertToMana: (card: CardData, side: Side) => boolean
  burnCard: (card: CardData, side: Side) => boolean
  drawCardForMana: (side: Side) => boolean
  drawWithMana: (side: Side) => boolean
  manaDraw: (side: Side) => boolean
  pay3ManaToDraw: (side: Side) => boolean
  emitBattleEvent: (event: BattleEvent) => void
  effectiveManaCost: (card: CardData) => number
}

export interface BattleEvent {
  type: string
  playerId: string
  card: CardData
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
  /** Storm / turn play counter. Reset at turn start. */
  cardsPlayedThisTurn: number
  /** True once a card has been converted to mana this turn. */
  hasConvertedCardThisTurn: boolean
  /** True once the 3-mana draw ability has been used this turn. */
  hasDrawnCardWithManaThisTurn: boolean
  /** Temporary mana cost discount applied to the next played card. */
  nextCardManaDiscount: number
  /** Last broadcast battle event (for animation syncing). */
  lastBattleEvent: (BattleEvent & { seq: number }) | null
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
  /**
   * Awaited right before a card leaves the hand and its effect resolves.
   * Use it to reveal the card (e.g. animate it) before the creature appears
   * or the spell effect applies.
   */
  onCardPlayStart?: (card: CardData, side: Side) => Promise<void> | void
  /**
   * Fired after any mutation that changes the visible battle state.
   * Use it to broadcast snapshots or trigger UI side effects.
   */
  onStateChange?: () => void
  /**
   * Fired when a battle event (e.g. CARD_BURNED) is emitted, so views and
   * multiplayer peers can trigger animations.
   */
  onBattleEvent?: (event: BattleEvent) => void
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

/**
 * Grammar helpers so log lines are correct whether the subject is the local
 * "You" (PvE) or a real player name (PvP). In an online match the log is part
 * of the shared battle state, so it may never assume which seat is reading.
 */
function verbIs(name: string): string {
  return name === 'You' ? 'are' : 'is'
}

function verbHave(name: string): string {
  return name === 'You' ? 'have' : 'has'
}

function verbPlay(name: string): string {
  return name === 'You' ? 'play' : 'plays'
}

function possessive(name: string): string {
  return name === 'You' ? 'your' : `${name}'s`
}

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
    cardsPlayedThisTurn: 0,
    hasConvertedCardThisTurn: false,
    hasDrawnCardWithManaThisTurn: false,
    nextCardManaDiscount: 0,
    lastBattleEvent: null,
  })

  const busy = ref(false)
  let battleEventSeq = 0

  const isPlayerTurn = computed(() => state.phase === 'player' && !busy.value && !state.winner)
  const isOver = computed(() => state.winner !== null)
  const canDraw = computed(() => state.drawPile.length > 0 || state.discardPile.length > 0)

  function log(msg: string) {
    state.log = [...state.log.slice(-40), msg]
    config.onStateChange?.()
  }

  function entityForSide(side: Side): Entity {
    return side === 'player' ? state.player : state.opponent
  }

  function boardForSide(side: Side): BoardCreature[] {
    return side === 'player' ? state.playerBoard : state.opponentBoard
  }

  /** Display name of the seat that owns `side`. */
  function subject(side: Side): string {
    return side === 'player' ? state.player.name : state.opponent.name
  }

  function markChanged() {
    config.onStateChange?.()
  }

  // --- Entity mutations ---
  function damage(target: Entity, amount: number) {
    const absorbed = Math.min(target.shield, amount)
    target.shield -= absorbed
    const remaining = amount - absorbed
    target.hp = Math.max(0, target.hp - remaining)
    markChanged()
  }

  function heal(target: Entity, amount: number) {
    // Max HP cap applies only to direct HP healing.
    target.hp = Math.min(target.maxHp, target.hp + amount)
    markChanged()
  }

  function shield(target: Entity, amount: number) {
    target.shield += amount
    markChanged()
  }

  /** Creature combat damage goes straight to HP (armor/shield does not apply). */
  function damageCreature(creature: BoardCreature, amount: number) {
    creature.hp = Math.max(0, creature.hp - amount)
    markChanged()
  }

  function cleanupDead() {
    const deadPlayer = state.playerBoard.filter(c => c.hp <= 0)
    const deadOpponent = state.opponentBoard.filter(c => c.hp <= 0)
    for (const c of deadPlayer) state.discardPile = [...state.discardPile, c.card]
    for (const c of deadOpponent) state.opponentDiscardPile = [...state.opponentDiscardPile, c.card]
    const p = state.playerBoard.length, o = state.opponentBoard.length
    state.playerBoard = state.playerBoard.filter(c => c.hp > 0)
    state.opponentBoard = state.opponentBoard.filter(c => c.hp > 0)
    if (deadPlayer.length || deadOpponent.length || p !== state.playerBoard.length || o !== state.opponentBoard.length) markChanged()
  }

  function findCreature(instanceId: number): BoardCreature | null {
    return (
      state.playerBoard.find(c => c.instanceId === instanceId) ??
      state.opponentBoard.find(c => c.instanceId === instanceId) ??
      null
    )
  }

  function entityFor(target: CardEffect['target'], caster: Side): Entity | Entity[] {
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
      case 'all':
        // Apply to both entities
        return [state.player, state.opponent]
    }
  }

  function sideName(side: Side, fromPerspective: Side): string {
    return side === fromPerspective ? 'your' : "the opponent's"
  }

  // --- Effect resolution ---
  function resolveEffect(effect: CardEffect, caster: Side, sourceCard?: CardData) {
    const target = entityFor(effect.target, caster)

    // Apply Storm scaling if requested.
    let value = effect.value
    if (effect.scaleBy === 'cardsPlayedThisTurn') {
      value = value * state.cardsPlayedThisTurn
    } else if (effect.scaleBy === 'boardCount') {
      const st = effect.scaleTarget ?? 'self'
      let count = 0
      if (st === 'self' || st === 'all') count += boardForSide(caster).length
      if (st === 'opponent' || st === 'all') {
        const other: Side = caster === 'player' ? 'opponent' : 'player'
        count += boardForSide(other).length
      }
      value = value * count
    }

    // Handle array of targets (for 'all')
    const targets = Array.isArray(target) ? target : [target]

    for (const t of targets) {
      switch (effect.action) {
        case 'damage': {
          const opponentSide: Side = caster === 'player' ? 'opponent' : 'player'
          if (effect.target === 'opponent' && hasTaunt(opponentSide)) {
            const tauntCreature = boardForSide(opponentSide).find(c => !!c.taunt && c.hp > 0)
            if (tauntCreature) {
              damageCreature(tauntCreature, value)
              log(`${tauntCreature.card.title} — ${value} damage`)
              cleanupDead()
              break
            }
          }
          damage(t, value)
          log(`${t.name} — ${value} damage`)
          break
        }
        case 'heal':
          heal(t, value)
          log(`${t.name} — +${value} HP`)
          break
        case 'shield':
          shield(t, value)
          log(`${t.name} — +${value} shield`)
          break
        case 'summon': {
          const template = effect.card ?? (sourceCard as unknown as CardTemplate)
          if (!template) break
          const card: CardData = { ...template, id: cardIdCounter++, effects: (template.effects ?? []).map(e => ({ ...e })) }
          const maxHp = card.health && card.health > 0 ? card.health : 1
          const creature: BoardCreature = {
            instanceId: creatureInstanceCounter++,
            side: caster,
            card,
            attack: card.attack ?? 0,
            hp: maxHp,
            maxHp,
            shield: 0,
            canAttack: !!card.charge,
            summoningSick: !card.charge,
            taunt: !!card.taunt,
          }
          if (caster === 'player') state.playerBoard = [...state.playerBoard, creature]
          else state.opponentBoard = [...state.opponentBoard, creature]
          log(`${subject(caster)} summons ${card.title}`)
          break
        }
        case 'add_copy': {
          const template = effect.card ?? (sourceCard as unknown as CardTemplate)
          if (!template) break
          const count = Math.max(1, value || 1)
          const copies: CardData[] = []
          for (let i = 0; i < count; i++) {
            copies.push({ ...template, id: cardIdCounter++, effects: (template.effects ?? []).map(e => ({ ...e })) })
          }
          // Determine whose hand/deck receives the copies based on target.
          let owner: Side = caster
          if (effect.target === 'opponent') owner = caster === 'player' ? 'opponent' : 'player'
          else if (effect.target === 'player') owner = 'player'
          else if (effect.target === 'self') owner = caster
          if (owner === 'player') {
            state.hand = [...state.hand, ...copies]
          } else {
            state.opponentHand = [...state.opponentHand, ...copies]
          }
          log(`${subject(owner)} adds ${count} cop${count === 1 ? 'y' : 'ies'} of ${template.title}`)
          break
        }
        case 'buff_board': {
          const st = effect.statTarget ?? 'both'
          const board = boardForSide(caster)
          for (const c of board) {
            if (st === 'attack' || st === 'both') c.attack += value
            if (st === 'health' || st === 'both') {
              c.hp += value
              c.maxHp += value
            }
          }
          log(`${subject(caster)} buffs the board (+${value} ${st})`)
          break
        }
        case 'draw': {
          const n = Math.max(0, value)
          for (let i = 0; i < n; i++) drawCard(caster)
          log(`${subject(caster)} draws ${n} card${n === 1 ? '' : 's'}`)
          break
        }
      }
    }
    checkOutcome()
  }

  function resolveEffects(effects: CardEffect[], caster: Side, sourceCard?: CardData) {
    for (const effect of effects) {
      if (state.winner) break
      resolveEffect(effect, caster, sourceCard)
    }
    markChanged()
  }

  function checkOutcome() {
    if (state.winner) return
    if (state.opponent.hp <= 0) {
      state.winner = 'player'
      state.phase = 'over'
      log(`${verbIs(state.opponent.name)} defeated — victory!`)
    } else if (state.player.hp <= 0) {
      state.winner = 'opponent'
      state.phase = 'over'
      log(`${verbHave(state.player.name)} been defeated...`)
    }
    if (state.winner) markChanged()
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
    // Reset per-turn flags/modifiers.
    state.cardsPlayedThisTurn = 0
    state.hasConvertedCardThisTurn = false
    state.hasDrawnCardWithManaThisTurn = false
    state.nextCardManaDiscount = 0
    markChanged()
  }

  function effectiveManaCost(card: CardData): number {
    return Math.max(0, card.manaCost - (state.nextCardManaDiscount ?? 0))
  }

  function canPlayCard(card: CardData, side: Side): boolean {
    return !state.winner && entityForSide(side).mana >= effectiveManaCost(card)
  }

  // --- Card play ---
  function playCard(card: CardData, side: Side): boolean {
    if (state.winner) return false

    const fromHand = side === 'player' ? state.hand : state.opponentHand
    const idx = fromHand.findIndex(c => c.id === card.id)
    if (idx === -1) return false

    const ent = entityForSide(side)
    const cost = effectiveManaCost(card)
    if (ent.mana < cost) return false
    ent.mana -= cost
    // Consume the temporary discount once a card is played.
    state.nextCardManaDiscount = 0

    const nextHand = [...fromHand]
    nextHand.splice(idx, 1)
    if (side === 'player') state.hand = nextHand
    else state.opponentHand = nextHand

    // Storm / turn play counter.
    state.cardsPlayedThisTurn = (state.cardsPlayedThisTurn ?? 0) + 1

    const who = subject(side)
    log(`${who} ${verbPlay(who)} ${card.title}`)

    if (card.type === 'spell') {
      resolveEffects(card.effects, side, card)
      cleanupDead()
      if (side === 'player') state.discardPile = [...state.discardPile, card]
      else state.opponentDiscardPile = [...state.opponentDiscardPile, card]
      markChanged()
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
        taunt: !!card.taunt,
      }
      if (side === 'player') state.playerBoard = [...state.playerBoard, creature]
      else state.opponentBoard = [...state.opponentBoard, creature]
      // Entrance / on-play effects reuse the same effect list.
      resolveEffects(card.effects, side, card)
      cleanupDead()
    }
    markChanged()
    return true
  }

  function emitBattleEvent(event: BattleEvent) {
    battleEventSeq++
    state.lastBattleEvent = { ...event, seq: battleEventSeq }
    config.onBattleEvent?.(event)
    markChanged()
  }

  function convertCardToMana(card: CardData, side: Side): boolean {
    if (state.winner) return false
    if (state.hasConvertedCardThisTurn) return false
    const fromHand = side === 'player' ? state.hand : state.opponentHand
    const idx = fromHand.findIndex(c => c.id === card.id)
    if (idx === -1) return false

    const ent = entityForSide(side)
    const nextHand = [...fromHand]
    nextHand.splice(idx, 1)
    if (side === 'player') state.hand = nextHand
    else state.opponentHand = nextHand

    const discard = side === 'player' ? state.discardPile : state.opponentDiscardPile
    if (side === 'player') state.discardPile = [...discard, card]
    else state.opponentDiscardPile = [...discard, card]

    ent.mana = Math.min(MANA_CAP, ent.mana + 1)
    state.hasConvertedCardThisTurn = true

    emitBattleEvent({ type: 'CARD_BURNED', playerId: side, card })
    log(`${subject(side)} converts ${card.title} into mana`)
    return true
  }

  const burnCard = convertCardToMana
  const convertToMana = convertCardToMana

  function drawCardForMana(side: Side): boolean {
    if (state.winner) return false
    if (state.hasDrawnCardWithManaThisTurn) return false
    const ent = entityForSide(side)
    if (ent.mana < 3) return false
    ent.mana -= 3
    state.hasDrawnCardWithManaThisTurn = true
    drawCard(side)
    markChanged()
    return true
  }
  const drawWithMana = drawCardForMana
  const manaDraw = drawCardForMana
  const pay3ManaToDraw = drawCardForMana

  /**
   * Play a card after optionally awaiting a reveal animation. The card is
   * still validated inside playCard, so a hook that fails or changes nothing
   * is harmless.
   */
  async function playCardAnimated(card: CardData, side: Side): Promise<boolean> {
    if (config.onCardPlayStart) {
      try {
        await config.onCardPlayStart(card, side)
      } catch {
        // never let a UI animation break the battle
      }
    }
    return playCard(card, side)
  }

  // --- Combat ---
  /**
   * Resolve a creature's attack. Returns true if the attack was performed.
   * The attacker must belong to the side whose turn it is and be ready.
   */
  function hasTaunt(side: Side): boolean {
    return boardForSide(side).some(c => !!c.taunt && c.hp > 0)
  }

  function attack(attackerId: number, target: AttackTarget): boolean {
    if (state.winner) return false
    const attacker = findCreature(attackerId)
    if (!attacker) return false

    const expectedPhase: BattlePhase = attacker.side === 'player' ? 'player' : 'opponent'
    if (state.phase !== expectedPhase) return false
    if (!attacker.canAttack) return false

    const enemySide: Side = attacker.side === 'player' ? 'opponent' : 'player'
    const owner = possessive(subject(attacker.side))

    if (target.type === 'hero') {
      if (hasTaunt(enemySide)) return false
      const hero = entityForSide(enemySide)
      attacker.canAttack = false
      damage(hero, attacker.attack)
      log(`${owner} ${attacker.card.title} strikes ${hero.name} for ${attacker.attack}`)
      checkOutcome()
      return true
    }

    const victim = boardForSide(enemySide).find(c => c.instanceId === target.instanceId)
    if (!victim) return false
    if (hasTaunt(enemySide) && !victim.taunt) return false

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
        if (side === 'player') log(`${possessive(subject(side))} deck is empty!`)
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
      markChanged()
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
    markChanged()
  }

  // --- Opponent AI ---
  async function defaultOpponentTurn() {
    if (state.winner) return
    drawCard('opponent')
    // Optionally draw a card for 3 mana if hand is low and mana is excess.
    if (!state.hasDrawnCardWithManaThisTurn && state.opponent.mana >= 3 && state.opponentHand.length < 3) {
      drawCardForMana('opponent')
    }
    // Simulate burning a spare card into mana (emits CARD_BURNED).
    if (!state.hasConvertedCardThisTurn && state.opponentHand.length > 2) {
      const chosen = state.opponentHand.reduce((best, c) => (c.manaCost < best.manaCost ? c : best), state.opponentHand[0])
      await delay(250)
      convertCardToMana(chosen, 'opponent')
      if (state.winner) return
      await delay(250)
    }
    // Spend available mana on the most expensive affordable cards.
    let guard = 0
    while (!state.winner && guard++ < 8) {
      const affordable = state.opponentHand.filter(c => c.manaCost <= state.opponent.mana)
      if (affordable.length === 0) break
      const creatures = affordable.filter(c => c.type === 'creature')
      const wantsCreature = state.opponentBoard.length < 4 && creatures.length > 0
      const pool = wantsCreature ? creatures : affordable
      const chosen = pool.reduce((best, c) => (c.manaCost > best.manaCost ? c : best), pool[0])
      await playCardAnimated(chosen, 'opponent')
      if (!state.winner) await delay(280)
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

  const api: BattleApi = { state, playCard, attack, drawCard, log, delay, convertCardToMana, convertToMana, burnCard, drawCardForMana, drawWithMana, manaDraw, pay3ManaToDraw, emitBattleEvent, effectiveManaCost }

  // --- Turn loop ---
  async function endTurn() {
    if (state.phase !== 'player' || state.winner || busy.value) return
    busy.value = true
    state.phase = 'opponent'
    log(`${possessive(state.opponent.name)} turn`)
    startTurn('opponent')
    drawCard('opponent')
    markChanged()

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
    log(`Turn ${state.turn} — ${possessive(state.player.name)} move`)
    state.phase = 'player'
    busy.value = false
    markChanged()
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
    state.cardsPlayedThisTurn = 0
    state.hasConvertedCardThisTurn = false
    state.hasDrawnCardWithManaThisTurn = false
    state.nextCardManaDiscount = 0
    state.lastBattleEvent = null
    busy.value = false
    log(`Battle start — ${possessive(state.player.name)} move`)
    markChanged()
  }

  init()

  return {
    state,
    busy,
    isPlayerTurn,
    isOver,
    canDraw,
    playCard,
    playCardAnimated,
    attack,
    canPlayCard,
    effectiveManaCost,
    convertCardToMana,
    convertToMana,
    burnCard,
    drawCardForMana,
    drawWithMana,
    manaDraw,
    pay3ManaToDraw,
    emitBattleEvent,
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
