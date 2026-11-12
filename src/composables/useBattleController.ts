import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useBattle, type BattleState } from '@/game/useBattle'
import { mirrorState, redactForGuest } from '@/game/mirror'
import type { AttackTarget, BattlePhase, CardData, CardTemplate, Side } from '@/game/types'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { useCredits } from '@/composables/useCredits'
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
  /**
   * State of the +1,000-credit victory award for this match. Only online
   * battles award credits; VS AI controllers keep this at `'none'`.
   */
  reward: Ref<RewardState>
  canDraw: ComputedRef<boolean>
  playerTurnLabel: ComputedRef<string>
  /** Local-only hold on input while the opposing (remote) side acts. */
  locked: Ref<boolean>
  playCard: (card: CardData) => Promise<boolean>
  attack: (attackerId: number, target: AttackTarget) => boolean
  drawCard: () => void
  drawCardForMana: () => Promise<boolean>
  drawWithMana: () => Promise<boolean>
  manaDraw: () => Promise<boolean>
  pay3ManaToDraw: () => Promise<boolean>
  convertCard: (card: CardData) => Promise<boolean>
  convertToMana: (card: CardData) => Promise<boolean>
  burnCard: (card: CardData) => Promise<boolean>
  endTurn: () => Promise<void>
  reset: () => void
}

export interface LocalDeck {
  templates: CardTemplate[]
  name: string
}

// --- Victory reward --------------------------------------------------------

/** Credits granted to the winner of an online match (never for VS AI). */
export const VICTORY_CREDITS = 1000

/**
 * Life-cycle of the victory award for the current match:
 * `none` → `pending` → `claimed` | `failed`, back to `none` on reset.
 */
export type RewardState = 'none' | 'pending' | 'claimed' | 'failed'

/**
 * Runs the `award_victory_credits` RPC for the signed-in player and mirrors
 * the result into the local profile store (`profile.credits += 1000`), so the
 * bubble badge and profile show the new balance without a refetch.
 * Returns false when the award could not be confirmed.
 */
async function awardVictoryCredits(): Promise<boolean> {
  const { user } = useAuth()
  const uid = user.value?.id
  if (!uid) {
    console.warn('[reward] no signed-in user to award')
    return false
  }

  const { credits, refreshCredits, setCredits } = useCredits()
  // Base balance for `profile.credits += 1000` (at most one extra read).
  if (credits.value === null) await refreshCredits(true)

  try {
    const { error } = await supabase.rpc('award_victory_credits', {
      winner_user_id: uid,
      amount: VICTORY_CREDITS,
    })
    if (error) {
      console.warn('[reward] award_victory_credits failed', error.message)
      return false
    }
  } catch (err) {
    console.warn('[reward] award_victory_credits threw', err)
    return false
  }

  // The server already stored the new balance; bump the local copy too.
  if (credits.value !== null) setCredits(credits.value + VICTORY_CREDITS)
  return true
}

/**
 * Awards the victory reward exactly once per victory sequence — online
 * battles only (the VS AI controller never installs this watcher, so
 * offline play can't reach the RPC at all).
 *
 * `readWinner` must be seat-neutral (`'player'` == the local human, i.e. the
 * active player — the online guest's mirrored state already maps its own seat
 * to `'player'`), so `winnerId === activePlayerId` translates to
 * `winner === 'player'`. The RPC fires only on the `null → 'player'`
 * transition (guarded by the pending/claimed state); a reset returns the
 * state to `none` so a rematch can award again.
 */
function watchVictoryReward(readWinner: () => Side | null): Ref<RewardState> {
  const reward = ref<RewardState>('none')
  watch(readWinner, (winner) => {
    if (winner === null) {
      // Fresh match (reset): the next victory may award again.
      reward.value = 'none'
      return
    }
    if (winner !== 'player') return // defeat — nothing to award
    if (reward.value === 'pending' || reward.value === 'claimed') return // once only
    reward.value = 'pending'
    void awardVictoryCredits()
      .then((ok) => {
        // A reset during the request re-armed the state; don't let the late
        // result poison the next victory sequence.
        if (reward.value === 'pending') reward.value = ok ? 'claimed' : 'failed'
      })
      .catch(() => {
        if (reward.value === 'pending') reward.value = 'failed'
      })
  })
  return reward
}

// --- Wire protocol ---------------------------------------------------------

type Intent =
  | { kind: 'play_card'; cardId: number }
  | { kind: 'attack'; attackerId: number; target: AttackTarget }
  | { kind: 'draw' }
  | { kind: 'draw_for_mana' }
  | { kind: 'convert_card'; cardId: number }
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

  // VS AI battles never award credits — only online PvP does (see
  // useOnlineController). Stays 'none', so the result screen shows no reward.
  const reward = ref<RewardState>('none')

  return {
    state: battle.state,
    busy: battle.busy,
    isPlayerTurn: battle.isPlayerTurn,
    isOver: battle.isOver,
    reward,
    canDraw: battle.canDraw,
    playerTurnLabel: battle.playerTurnLabel,
    locked: ref(false) as Ref<boolean>,
    playCard: async (card) => battle.playCard(card, 'player'),
    attack: (attackerId, target) => battle.attack(attackerId, target),
    drawCard: () => battle.drawCard('player'),
    drawCardForMana: async () => battle.drawCardForMana('player'),
    drawWithMana: async () => battle.drawWithMana('player'),
    manaDraw: async () => battle.manaDraw('player'),
    pay3ManaToDraw: async () => battle.pay3ManaToDraw('player'),
    convertCard: async (card) => battle.convertCardToMana(card, 'player'),
    convertToMana: async (card) => battle.convertToMana(card, 'player'),
    burnCard: async (card) => battle.burnCard(card, 'player'),
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
  // Host: durable match record in `tcg_matches`.
  //
  // The lobby row starts as 'waiting', the join RPC flips it to 'playing',
  // and this block keeps `state` / `turn` fresh during the battle before
  // writing the final `status` / `winner` / `winner_name` once decided.
  // The DB guard trigger only allows the HOST to update the row, so the guest
  // never writes here.
  // -----------------------------------------------------------------------
  const PERSIST_INTERVAL = 1200

  let matchRowId: string | null = null
  let matchSeats: {
    hostId: string
    guestId: string | null
    hostName: string
    guestName: string | null
  } | null = null
  let rowFinalised = false
  let lastPersistAt = 0
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let persisting = false
  let pendingFinal = false

  /** Load (once) the row this battle belongs to, keyed by the shared code. */
  async function ensureMatchRow(force = false): Promise<boolean> {
    if (matchRowId && !force) return true
    const { data, error: selErr } = await supabase
      .from('tcg_matches')
      .select('id, host_id, guest_id, host_name, guest_name')
      .eq('code', code)
      .maybeSingle()
    if (selErr || !data) {
      console.warn('[tcg:host] could not load match row', selErr?.message ?? 'not found')
      return false
    }
    matchRowId = data.id as string
    matchSeats = {
      hostId: data.host_id as string,
      guestId: (data.guest_id as string | null) ?? null,
      hostName: (data.host_name as string) || 'Host',
      guestName: (data.guest_name as string | null) ?? null,
    }
    return true
  }

  /** Plain JSON copy of the engine state (drops Vue reactivity). */
  function serialisedState(): unknown {
    return JSON.parse(JSON.stringify(battle!.state))
  }

  /**
   * Engine seats are host-relative: 'player' is always the host. Once the
   * engine flips to 'over' nobody holds the turn, so the column stays null.
   */
  function seatFor(phase: BattlePhase): 'host' | 'guest' | null {
    if (phase === 'player') return 'host'
    if (phase === 'opponent') return 'guest'
    return null
  }

  async function flushPersist(): Promise<void> {
    if (persisting) return
    const isFinal = pendingFinal
    pendingFinal = false
    if (!battle || opts.role !== 'host') return

    persisting = true
    lastPersistAt = Date.now()
    try {
      // The final write re-reads the row so the guest seat is never stale.
      if (!(await ensureMatchRow(isFinal)) || !matchRowId || !matchSeats) return

      const winnerSide = battle.state.winner
      const payload: Record<string, unknown> = {
        state: serialisedState(),
        turn: seatFor(battle.state.phase),
      }

      if (winnerSide) {
        payload.status = 'finished'
        payload.winner = winnerSide === 'player' ? matchSeats.hostId : matchSeats.guestId
        payload.winner_name =
          winnerSide === 'player' ? matchSeats.hostName : (matchSeats.guestName ?? opts.opponentName)
      }

      const { error: updErr } = await supabase.from('tcg_matches').update(payload).eq('id', matchRowId)
      if (updErr) {
        // Leave rowFinalised false so the next snapshot retries the write.
        console.warn('[tcg:host] match persist failed', updErr.message)
      } else {
        if (winnerSide) rowFinalised = true
        if (isFinal) console.log('[tcg:host] match finalised', payload.winner_name)
      }
    } catch (err) {
      console.warn('[tcg:host] match persist threw', err)
    } finally {
      persisting = false
      // A final write requested while we were mid-flight still has to land.
      if (pendingFinal) schedulePersist(true)
    }
  }

  /**
   * Coalesce state changes into throttled row writes. `final` bypasses the
   * throttle so the result is recorded immediately.
   */
  function schedulePersist(final: boolean) {
    if (opts.role !== 'host' || !battle) return
    if (final) pendingFinal = true
    if (rowFinalised && !final) return
    if (persistTimer || persisting) return

    const wait = pendingFinal ? 0 : Math.max(0, PERSIST_INTERVAL - (Date.now() - lastPersistAt))
    persistTimer = setTimeout(() => {
      persistTimer = null
      void flushPersist()
    }, wait)
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
    // Keep the durable match row in sync (state/turn live, result at the end).
    schedulePersist(!!battle.state.winner)
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
          case 'draw_for_mana': {
            void battle!.drawCardForMana('opponent')
            broadcastSnapshot()
            return
          }
          case 'convert_card': {
            const card = state.opponentHand.find((c) => c.id === intent.cardId)
            if (!card) return
            void battle!.convertCardToMana(card, 'opponent')
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
    cardsPlayedThisTurn: 0,
    hasConvertedCardThisTurn: false,
    hasDrawnCardWithManaThisTurn: false,
    nextCardManaDiscount: 0,
    lastBattleEvent: null,
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

  // Seat-neutral winner ('player' == me on both seats, guest state arrives
  // mirrored) → award the 1,000 credits exactly once on the winner's client.
  const reward = watchVictoryReward(() => stateRef.value.winner)

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
    reward,
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
    drawCardForMana: async () => {
      if (opts.role === 'host') {
        if (!battle) return false
        const ok = battle.drawCardForMana('player')
        if (ok) broadcastSnapshot()
        return ok
      }
      sendIntent({ kind: 'draw_for_mana' })
      return true
    },
    drawWithMana: async () => {
      if (opts.role === 'host') {
        if (!battle) return false
        const ok = battle.drawWithMana('player')
        if (ok) broadcastSnapshot()
        return ok
      }
      sendIntent({ kind: 'draw_for_mana' })
      return true
    },
    manaDraw: async () => {
      if (opts.role === 'host') {
        if (!battle) return false
        const ok = battle.manaDraw('player')
        if (ok) broadcastSnapshot()
        return ok
      }
      sendIntent({ kind: 'draw_for_mana' })
      return true
    },
    pay3ManaToDraw: async () => {
      if (opts.role === 'host') {
        if (!battle) return false
        const ok = battle.pay3ManaToDraw('player')
        if (ok) broadcastSnapshot()
        return ok
      }
      sendIntent({ kind: 'draw_for_mana' })
      return true
    },
    convertCard: async (card) => {
      if (opts.role === 'host') {
        if (!battle) return false
        const ok = battle.convertCardToMana(card, 'player')
        if (ok) broadcastSnapshot()
        return ok
      }
      sendIntent({ kind: 'convert_card', cardId: card.id })
      return true
    },
    convertToMana: async (card) => {
      if (opts.role === 'host') {
        if (!battle) return false
        const ok = battle.convertToMana(card, 'player')
        if (ok) broadcastSnapshot()
        return ok
      }
      sendIntent({ kind: 'convert_card', cardId: card.id })
      return true
    },
    burnCard: async (card) => {
      if (opts.role === 'host') {
        if (!battle) return false
        const ok = battle.burnCard(card, 'player')
        if (ok) broadcastSnapshot()
        return ok
      }
      sendIntent({ kind: 'convert_card', cardId: card.id })
      return true
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
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    // Land a pending result before the channel goes away (e.g. navigating
    // back to the lobby right after the winning blow).
    if (opts.role === 'host' && battle?.state.winner && !rowFinalised) void flushPersist()
    void supabase.removeChannel(channel)
  }

  return { controller, ready, error, opponentConnected, destroy }
}

/** Discriminates the two controllers for the view. */
export type ControllerMode = { mode: 'ai' } | { mode: 'online'; code: string; role: 'host' | 'guest' }
