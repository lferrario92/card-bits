import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useBattle, type BattleState } from '@/game/useBattle'
import { mirrorState, redactForGuest } from '@/game/mirror'
import type { AttackTarget, CardData, CardTemplate } from '@/game/types'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * A seat-neutral battle interface consumed by the battle view.
 *
 * The view always sees a state where `player` means "me" and `opponent" means
 * "the other side", regardless of whether the opponent is an AI, the remote
 * host (this client is the guest), or the remote guest (this client is the
 * host).
 */
export interface BattleController {
  state: BattleState
  busy: Ref<boolean>
  isPlayerTurn: ComputedRef<boolean>
  isOver: ComputedRef<boolean>
  canDraw: ComputedRef<boolean>
  playerTurnLabel: ComputedRef<string>
  /** Local-only hold on input while the opposing (remote) side acts. */
  locked: Ref<boolean>
  playCard: (card: CardData) => Promise<boolean>
  attack: (attackerId: number, target: AttackTarget) => boolean
  drawCard: () => void
  endTurn: () => Promise<void>
  reset: () => void
}

export interface LocalDeck {
  templates: CardTemplate[]
  name: string
}

// --- Wire protocol ---------------------------------------------------------

type Intent =
  | { kind: 'play_card'; cardId: number }
  | { kind: 'attack'; attackerId: number; target: AttackTarget }
  | { kind: 'draw' }
  | { kind: 'end_turn' }

interface HandshakeMsg {
  kind: 'handshake'
  name: string
  deck: CardTemplate[]
}

interface SnapshotMsg {
  kind: 'snapshot'
  state: BattleState
  /** True once the match is decided and further input should be ignored. */
  over: boolean
}

/** Broadcast channel name derived from the shared match code. */
function channelName(code: string): string {
  return `tcg-match-${code}`
}

// --- AI controller ---------------------------------------------------------

/**
 * Wrap the existing local engine (VS AI) in the seat-neutral controller shape.
 * Behaviour is unchanged: the human is the engine's `'player'` seat.
 */
export function createAiController(
  playerDeck: LocalDeck,
  opponentDeck: CardTemplate[],
  opts: { opponentName: string; opponentMaxHp: number; onOpponentPlay?: (card: CardData) => void | Promise<void> },
): BattleController {
  const battle = useBattle({
    playerDeck: playerDeck.templates,
    opponentDeck,
    playerName: 'You',
    opponentName: opts.opponentName,
    playerMaxHp: 30,
    opponentMaxHp: opts.opponentMaxHp,
    startingHand: 5,
    opponentDelay: 1000,
    onCardPlayStart: (card, side) => (side === 'opponent' ? opts.onOpponentPlay?.(card) : undefined),
  })

  return {
    state: battle.state,
    busy: battle.busy,
    isPlayerTurn: battle.isPlayerTurn,
    isOver: battle.isOver,
    canDraw: battle.canDraw,
    playerTurnLabel: battle.playerTurnLabel,
    locked: ref(false) as Ref<boolean>,
    playCard: async (card) => battle.playCard(card, 'player'),
    attack: (attackerId, target) => battle.attack(attackerId, target),
    drawCard: () => battle.drawCard('player'),
    endTurn: () => battle.endTurn(),
    reset: () => battle.reset(),
  }
}

// --- Online controller -----------------------------------------------------

export interface OnlineOptions {
  code: string
  /** 'host' runs the engine; 'guest' sends intents and mirrors snapshots. */
  role: 'host' | 'guest'
  selfName: string
  opponentName: string
  /** Local player's deck templates (host engine side, or guest's hand on join). */
  selfDeck: LocalDeck
  /** Opponent's deck — required for the host to run the engine. */
  opponentDeck?: CardTemplate[]
  opponentMaxHp?: number
  onOpponentPlay?: (card: CardData) => void | Promise<void>
  onGuestJoined?: () => void
}

/**
 * Online PvP controller. Host-client authority:
 *  - the host owns the {@link useBattle} engine for BOTH seats,
 *  - the guest sends intents and renders mirrored snapshots,
 *  - both keep `player` == "me" in the view.
 */
export function useOnlineController(opts: OnlineOptions): {
  controller: BattleController
  ready: Ref<boolean>
  error: Ref<string>
  opponentConnected: Ref<boolean>
  destroy: () => void
} {
  const code = opts.code.toUpperCase()
  const name = channelName(code)
  const channel: RealtimeChannel = supabase.channel(name, {
    config: { broadcast: { self: false } },
  })
  console.log('[tcg:init]', opts.role, 'code=', code, 'channel=', name)

  const ready = ref(false)
  const error = ref('')
  const opponentConnected = ref(false)
  const locked = ref(false)

  // Guest-side mirrored state (host-side uses the engine's reactive state).
  const guestState = ref<BattleState | null>(null)

  let battle: ReturnType<typeof useBattle> | null = null

  /** Triggered once when the host engine is created so stateRef re-evaluates. */
  const battleReady = ref(0)

  /** Set while it is the guest's turn; receives guest intents on the host. */
  let turnHandler: ((intent: Intent) => void) | null = null

  // Host waits for guest deck before starting the engine.
  let pendingGuestDeck: CardTemplate[] | null = null
  let startHostWhenReady: (() => void) | null = null
  const hostBusy = ref(false)
  const gotFirstSnapshot = ref(false)
  let handshakeInterval: ReturnType<typeof setInterval> | null = null

  function clearHandshakeInterval() {
    if (handshakeInterval) {
      clearInterval(handshakeInterval)
      handshakeInterval = null
    }
  }

  // -----------------------------------------------------------------------
  // Host: run the engine and relay snapshots after every mutation.
  // -----------------------------------------------------------------------
  function broadcastSnapshot() {
    if (!battle) return
    console.log('[tcg:host] broadcast snapshot phase=', battle.state.phase, 'hostHand=', battle.state.hand.length, 'guestHand=', battle.state.opponentHand.length, 'hostDraw=', battle.state.drawPile.length, 'guestDraw=', battle.state.opponentDrawPile.length)
    hostBusy.value = battle.busy.value
    const redacted = redactForGuest(battle.state)
    console.log('[tcg:host] redacted guestHand=', redacted.opponentHand.length, 'guestDraw=', redacted.opponentDrawPile.length)
    const payload: SnapshotMsg = { kind: 'snapshot', state: redacted, over: !!battle.state.winner }
    void channel.send({ type: 'broadcast', event: 'snapshot', payload })
  }

  /**
   * Host-side opponent behaviour. Runs on the guest's turn: the engine has
   * already ramped mana and readied the guest's creatures, so we just wait for
   * the guest's intents and apply them under the engine's authority.
   *
   * Intents arrive on a single persistent channel handler; this function
   * installs a per-turn callback and resolves once the guest ends the turn.
   */
  function hostOpponentTurn(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!battle) {
        resolve()
        return
      }
      const state = battle.state

      turnHandler = (intent: Intent) => {
        if (state.winner) {
          turnHandler = null
          resolve()
          return
        }
        switch (intent.kind) {
          case 'play_card': {
            const card = state.opponentHand.find((c) => c.id === intent.cardId)
            if (!card) return
            void battle!.playCardAnimated(card, 'opponent').then(() => broadcastSnapshot())
            return
          }
          case 'attack': {
            if (battle!.attack(intent.attackerId, intent.target)) broadcastSnapshot()
            if (state.winner) {
              turnHandler = null
              resolve()
            }
            return
          }
          case 'draw': {
            battle!.drawCard('opponent')
            broadcastSnapshot()
            return
          }
          case 'end_turn':
            turnHandler = null
            resolve()
            return
        }
      }
    })
  }

  function initHost() {
    console.log('[tcg:host] initHost called, pendingGuestDeck=', pendingGuestDeck?.length ?? 0)
    // If the guest has already sent their deck (race: join/subscribe order),
    // start immediately; otherwise wait for the handshake.
    if (pendingGuestDeck) {
      battle = useBattle({
        playerDeck: opts.selfDeck.templates,
        opponentDeck: pendingGuestDeck,
        playerName: opts.selfName,
        opponentName: opts.opponentName,
        playerMaxHp: 30,
        opponentMaxHp: opts.opponentMaxHp ?? 30,
        startingHand: 5,
        opponentDelay: 250,
        onOpponentTurn: () => hostOpponentTurn(),
        onCardPlayStart: (card, side) => (side === 'opponent' ? opts.onOpponentPlay?.(card) : undefined),
        onStateChange: broadcastSnapshot,
      })
      battleReady.value++
      console.log('[tcg:host] battle started, hand/opponentHand', battle.state.hand.length, battle.state.opponentHand.length)
      broadcastSnapshot()
      return
    }
    startHostWhenReady = () => {
      console.log('[tcg:host] startHostWhenReady called, pendingGuestDeck=', pendingGuestDeck?.length ?? 0)
      battle = useBattle({
        playerDeck: opts.selfDeck.templates,
        opponentDeck: pendingGuestDeck ?? [],
        playerName: opts.selfName,
        opponentName: opts.opponentName,
        playerMaxHp: 30,
        opponentMaxHp: opts.opponentMaxHp ?? 30,
        startingHand: 5,
        opponentDelay: 250,
        onOpponentTurn: () => hostOpponentTurn(),
        onCardPlayStart: (card, side) => (side === 'opponent' ? opts.onOpponentPlay?.(card) : undefined),
        onStateChange: broadcastSnapshot,
      })
      battleReady.value++
      console.log('[tcg:host] battle started, hand/opponentHand', battle.state.hand.length, battle.state.opponentHand.length)
      broadcastSnapshot()
    }
  }

  // -----------------------------------------------------------------------
  // Guest: send intents, mirror snapshots into the view.
  // -----------------------------------------------------------------------
  function sendIntent(intent: Intent) {
    void channel.send({ type: 'broadcast', event: 'intent', payload: intent })
  }

  function onSnapshot(msg: { payload: SnapshotMsg }) {
    const s = msg.payload.state
    console.log('[tcg:guest] recv phase=', s.phase, 'hand=', s.hand.length, 'oppHand=', s.opponentHand.length, 'draw=', s.drawPile.length, 'oppDraw=', s.opponentDrawPile.length)
    opponentConnected.value = true
    gotFirstSnapshot.value = true
    clearHandshakeInterval()
    const m = mirrorState(s)
    console.log('[tcg:guest] mirror phase=', m.phase, 'hand=', m.hand.length, 'oppHand=', m.opponentHand.length, 'draw=', m.drawPile.length, 'oppDraw=', m.opponentDrawPile.length)
    guestState.value = m
    if (msg.payload.over) locked.value = false
  }

  const emptyState = (): BattleState => ({
    player: { name: opts.selfName ?? 'You', hp: 30, maxHp: 30, shield: 0, mana: 0, maxMana: 0 },
    opponent: { name: opts.opponentName, hp: 30, maxHp: 30, shield: 0, mana: 0, maxMana: 0 },
    playerBoard: [],
    opponentBoard: [],
    hand: [],
    drawPile: [],
    discardPile: [],
    opponentHand: [],
    opponentDrawPile: [],
    opponentDiscardPile: [],
    turn: 1,
    phase: opts.role === 'host' ? 'player' : 'opponent',
    winner: null,
    log: [],
  })

  // --- Assemble channel handlers once, role-aware ---
  channel
    .on('broadcast', { event: 'snapshot' }, (msg) => {
      if (opts.role === 'guest') onSnapshot(msg as unknown as { payload: SnapshotMsg })
    })
    .on('broadcast', { event: 'intent' }, (msg) => {
      if (opts.role === 'host') turnHandler?.((msg as unknown as { payload: Intent }).payload)
    })
    .on('broadcast', { event: 'handshake' }, (msg) => {
      if (opts.role === 'host') {
        const p = msg as unknown as { payload: HandshakeMsg }
        console.log('[tcg:host] handshake', p.payload.name, p.payload.deck?.length)
        pendingGuestDeck = p.payload.deck
        opponentConnected.value = true
        opts.onGuestJoined?.()
        if (startHostWhenReady) {
          startHostWhenReady()
          startHostWhenReady = null
        } else if (!battle) {
          // Initialize now with guest deck (race-safe).
          battle = useBattle({
            playerDeck: opts.selfDeck.templates,
            opponentDeck: pendingGuestDeck,
            playerName: opts.selfName,
            opponentName: opts.opponentName,
            playerMaxHp: 30,
            opponentMaxHp: opts.opponentMaxHp ?? 30,
            startingHand: 5,
            opponentDelay: 250,
            onOpponentTurn: () => hostOpponentTurn(),
            onCardPlayStart: (card, side) => (side === 'opponent' ? opts.onOpponentPlay?.(card) : undefined),
            onStateChange: broadcastSnapshot,
          })
          battleReady.value++
          console.log('[tcg:host] battle started, hand/opponentHand', battle.state.hand.length, battle.state.opponentHand.length)
          broadcastSnapshot()
        } else {
          broadcastSnapshot()
        }
      }
    })
    .on('broadcast', { event: 'join' }, () => {
      console.log('[tcg]', opts.role, 'got join')
      if (opts.role === 'host') {
        opponentConnected.value = true
        opts.onGuestJoined?.()
      }
      if (opts.role === 'guest') {
        void channel.send({ type: 'broadcast', event: 'handshake', payload: { kind: 'handshake', name: opts.selfName, deck: opts.selfDeck.templates } })
      }
    })

  if (opts.role === 'host') {
    initHost()
    setTimeout(() => {
      if (!battle) {
        console.log('[tcg:host] fallback start')
        pendingGuestDeck = pendingGuestDeck ?? []
        battle = useBattle({
          playerDeck: opts.selfDeck.templates,
          opponentDeck: pendingGuestDeck,
          playerName: opts.selfName,
          opponentName: opts.opponentName,
          playerMaxHp: 30,
          opponentMaxHp: opts.opponentMaxHp ?? 30,
          startingHand: 5,
          opponentDelay: 250,
          onOpponentTurn: () => hostOpponentTurn(),
          onCardPlayStart: (card, side) => (side === 'opponent' ? opts.onOpponentPlay?.(card) : undefined),
          onStateChange: broadcastSnapshot,
        })
        battleReady.value++
        broadcastSnapshot()
      }
    }, 1500)
  }

  channel.subscribe((status) => {
    console.log('[tcg]', opts.role, 'subscribe', status)
    if (status === 'SUBSCRIBED') {
      ready.value = true
      if (opts.role === 'guest') {
        const send = () => {
          console.log('[tcg:guest] send join+handshake')
          void channel.send({ type: 'broadcast', event: 'join', payload: { name: opts.selfName } })
          void channel.send({ type: 'broadcast', event: 'handshake', payload: { kind: 'handshake', name: opts.selfName, deck: opts.selfDeck.templates } })
        }
        send()
        clearHandshakeInterval()
        handshakeInterval = setInterval(() => {
          if (gotFirstSnapshot.value) {
            clearHandshakeInterval()
            return
          }
          send()
        }, 1000)
      } else if (opts.role === 'host') {
        // If the guest joined before we subscribed, start now.
        if (!battle && pendingGuestDeck) {
          battle = useBattle({
            playerDeck: opts.selfDeck.templates,
            opponentDeck: pendingGuestDeck,
            playerName: opts.selfName,
            opponentName: opts.opponentName,
            playerMaxHp: 30,
            opponentMaxHp: opts.opponentMaxHp ?? 30,
            startingHand: 5,
            opponentDelay: 250,
            onOpponentTurn: () => hostOpponentTurn(),
            onCardPlayStart: (card, side) => (side === 'opponent' ? opts.onOpponentPlay?.(card) : undefined),
            onStateChange: broadcastSnapshot,
          })
          battleReady.value++
          console.log('[tcg:host] battle started on sub, hand/opponentHand', battle.state.hand.length, battle.state.opponentHand.length)
          broadcastSnapshot()
        }
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      error.value = 'Connection lost. Check your network and try again.'
    }
  })

  const stateRef = computed<BattleState>(() => {
    battleReady.value // host: re-evaluate when engine is created; guest: constant 0, no-op
    return opts.role === 'host' ? (battle ? battle.state : emptyState()) : (guestState.value ?? emptyState())
  })

  const controller: BattleController = {
    get state() {
      return stateRef.value ?? emptyState()
    },
    busy: (opts.role === 'host' ? hostBusy : ref(false)) as Ref<boolean>,
    isPlayerTurn: computed(() => {
      const s = stateRef.value
      return s.phase === 'player' && !s.winner && !locked.value
    }),
    isOver: computed(() => {
      const s = stateRef.value
      return !!s.winner
    }),
    canDraw: computed(() => {
      const s = stateRef.value
      return s.drawPile.length > 0 || s.discardPile.length > 0
    }),
    playerTurnLabel: computed(() => {
      const s = stateRef.value
      if (s.winner) return 'Battle Over'
      if (s.phase === 'player') return 'Your Turn'
      return `${s.opponent.name}'s Turn`
    }),
    locked,
    playCard: async (card) => {
      if (opts.role === 'host') {
        if (!battle) return false
        const ok = await battle.playCardAnimated(card, 'player')
        if (ok) broadcastSnapshot()
        return ok
      }
      sendIntent({ kind: 'play_card', cardId: card.id })
      return true
    },
    attack: (attackerId, target) => {
      if (opts.role === 'host') {
        if (!battle) return false
        const ok = battle.attack(attackerId, target)
        if (ok) broadcastSnapshot()
        return ok
      }
      sendIntent({ kind: 'attack', attackerId, target })
      return true
    },
    drawCard: () => {
      if (opts.role === 'host') {
        if (!battle) return
        battle.drawCard('player')
        broadcastSnapshot()
      } else {
        sendIntent({ kind: 'draw' })
      }
    },
    endTurn: async () => {
      if (opts.role === 'host') {
        if (!battle) return
        await battle.endTurn()
        broadcastSnapshot()
      } else {
        sendIntent({ kind: 'end_turn' })
      }
    },
    reset: () => {
      if (opts.role === 'host' && battle) battle.reset()
    },
  }

  function destroy() {
    clearHandshakeInterval()
    void supabase.removeChannel(channel)
  }

  return { controller, ready, error, opponentConnected, destroy }
}

/** Discriminates the two controllers for the view. */
export type ControllerMode = { mode: 'ai' } | { mode: 'online'; code: string; role: 'host' | 'guest' }
