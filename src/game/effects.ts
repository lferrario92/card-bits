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
}

export function describeEffect(effect: CardEffect): string {
  const target = TARGET_LABEL[effect.target]
  switch (effect.action) {
    case 'damage':
      return `Deal ${effect.value} damage to ${target}`
    case 'heal':
      return `Restore ${effect.value} HP to ${target}`
    case 'shield':
      return `Gain ${effect.value} shield for ${target}`
    default:
      return ''
  }
}

export function effectIcon(action: EffectAction): string {
  return ACTION_ICON[action] ?? '•'
}

export function describeCardEffects(effects: CardEffect[]): string[] {
  return effects.map(describeEffect)
}
