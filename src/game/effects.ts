import type { CardEffect, EffectAction, EffectTarget } from './types'

const TARGET_LABEL: Record<EffectTarget, string> = {
  opponent: 'the opponent',
  player: 'you',
  self: 'yourself',
  all: 'all',
}

const ACTION_ICON: Record<EffectAction, string> = {
  damage: '⚔',
  heal: '✚',
  shield: '🛡',
  summon: '🐾',
  add_copy: '📋',
  draw: '🃏',
  buff_board: '💪',
}

export function describeEffect(effect: CardEffect): string {
  const target = TARGET_LABEL[effect.target]
  let base = ''
  switch (effect.action) {
    case 'damage':
      base = `Deal ${effect.value} damage to ${target}`
      break
    case 'heal':
      base = `Restore ${effect.value} HP to ${target}`
      break
    case 'shield':
      base = `Gain ${effect.value} shield for ${target}`
      break
    case 'summon':
      base = `Summon ${effect.card?.title ?? 'a creature'}`
      break
    case 'add_copy':
      base = `Add ${effect.value} cop${effect.value === 1 ? 'y' : 'ies'} of ${effect.card?.title ?? 'a card'} to hand`
      break
    case 'draw':
      base = `Draw ${effect.value} card${effect.value === 1 ? '' : 's'}`
      break
    case 'buff_board':
      base = `Buff board +${effect.value} ${effect.statTarget ?? 'both'}`
      break
    default:
      base = ''
  }
  if (effect.scaleBy === 'cardsPlayedThisTurn') {
    base += ` (× cards played this turn)`
  } else if (effect.scaleBy === 'boardCount') {
    const st = effect.scaleTarget ?? 'self'
    base += ` (× ${st === 'all' ? 'all creatures' : st === 'opponent' ? "opponent's creatures" : 'your creatures'})`
  }
  return base
}

export function effectIcon(action: EffectAction): string {
  return ACTION_ICON[action] ?? '•'
}

export function describeCardEffects(effects: CardEffect[]): string[] {
  return effects.map(describeEffect)
}
