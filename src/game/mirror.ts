import type { BattleState } from './useBattle'
import type { BoardCreature, CardData, Side } from './types'

function flipSide(side: Side): Side {
  return side === 'player' ? 'opponent' : 'player'
}

function copyCard(card: CardData): CardData {
  return { ...card, effects: card.effects.map((e) => ({ ...e })) }
}

function flipCreature(creature: BoardCreature): BoardCreature {
  return {
    ...creature,
    side: flipSide(creature.side),
    card: copyCard(creature.card),
  }
}

/**
 * Re-orient a battle snapshot so it reads from the OTHER seat's point of view.
 *
 * The host always runs the engine with itself as `'player'`. The guest renders
 * the same snapshot mirrored, so on every screen `state.player` means "me" and
 * the existing UI (HealthBar, CreatureTile, hand arc) works unchanged.
 */
export function mirrorState(state: BattleState): BattleState {
  return {
    player: { ...state.opponent },
    opponent: { ...state.player },
    playerBoard: state.opponentBoard.map(flipCreature),
    opponentBoard: state.playerBoard.map(flipCreature),
    hand: state.opponentHand.map(copyCard),
    opponentHand: state.hand.map(copyCard),
    drawPile: state.opponentDrawPile.map(copyCard),
    opponentDrawPile: state.drawPile.map(copyCard),
    discardPile: state.opponentDiscardPile.map(copyCard),
    opponentDiscardPile: state.discardPile.map(copyCard),
    turn: state.turn,
    phase: state.phase === 'player' ? 'opponent' : state.phase === 'opponent' ? 'player' : state.phase,
    winner: state.winner === 'player' ? 'opponent' : state.winner === 'opponent' ? 'player' : state.winner,
    log: [...state.log],
  }
}

/**
 * Strip the host's private information before a snapshot leaves the browser.
 *
 * The guest mirrors the state, so the host's `hand` / `drawPile` /
 * `discardPile` become the guest's `opponent*` fields. Those are never rendered
 * by the UI, and blanking them keeps the host's cards (and deck order) out of
 * the guest's network payload.
 */
export function redactForGuest(state: BattleState): BattleState {
  return {
    ...state,
    hand: [],
    drawPile: [],
    discardPile: [],
  }
}
