<script setup lang="ts">
import { computed } from 'vue'
import type { Side } from '@/game/types'
import type { BattleState } from '@/game/useBattle'
import type { RewardState } from '@/composables/useBattleController'

const props = defineProps<{
  /** Seat-neutral result: `'player'` is the local (active) player. */
  winner: Side
  /** Final battle state backing the match summary. */
  state: BattleState
  /** Progress of the +1,000 credit victory award. */
  reward: RewardState
  /**
   * True for online battles, which award +1,000 credits on a win.
   * VS AI battles show the same result without any credit reward.
   */
  rewardEnabled: boolean
}>()

const emit = defineEmits<{ reset: []; menu: []; decks: [] }>()

const won = computed(() => props.winner === 'player')
const opponentName = computed(() => props.state.opponent.name || 'Oponente')

/** A fallen side shows its final HP in red. */
function hpClass(hp: number): string {
  return hp > 0 ? 'text-white' : 'text-rose-400'
}
</script>

<template>
  <!-- Scroll-safe: the outer layer scrolls, the inner wrapper centers the
       card (min-h-full), so short viewports never clip the top. -->
  <div class="fixed inset-0 z-[60] overflow-y-auto bg-black/70 backdrop-blur-sm">
    <div class="min-h-full flex items-center justify-center p-4">
      <div
        class="w-full max-w-sm rounded-3xl p-5 text-center shadow-2xl border"
        :class="won
          ? 'bg-gradient-to-b from-emerald-950 via-gray-900 to-gray-900 border-emerald-500/40'
          : 'bg-gradient-to-b from-rose-950 via-gray-900 to-gray-900 border-rose-500/40'"
      >
        <!-- Title -->
        <div class="text-5xl mb-1">{{ won ? '🏆' : '💀' }}</div>
        <h2 class="text-3xl font-black tracking-wide" :class="won ? 'text-emerald-300' : 'text-rose-300'">
          {{ won ? '¡VICTORIA!' : 'DERROTA' }}
        </h2>
        <p class="text-xs text-white/60 mt-1 mb-4">
          {{ won ? `Has derrotado a ${opponentName}` : `${opponentName} te ha derrotado` }}
          · Turno {{ state.turn }}
        </p>

        <!-- Final status of both players -->
        <div class="grid grid-cols-2 gap-2 mb-4 text-left">
          <!-- You -->
          <div
            class="rounded-xl border p-3"
            :class="won ? 'border-amber-400/50 bg-amber-400/10' : 'border-white/10 bg-white/5'"
          >
            <div class="flex items-center justify-between gap-1 mb-1.5">
              <span class="text-[10px] font-black uppercase tracking-wider" :class="won ? 'text-amber-300' : 'text-white/50'">
                Tú
              </span>
              <span v-if="won" class="text-xs">👑</span>
            </div>
            <div class="leading-none mb-2">
              <span class="text-2xl font-black" :class="hpClass(state.player.hp)">{{ state.player.hp }}</span>
              <span class="text-[11px] font-bold text-white/50">/{{ state.player.maxHp }} HP</span>
            </div>
            <div class="space-y-1 text-[11px]">
              <div class="flex justify-between text-white/60"><span>🛡 Escudos</span><b class="text-white/90">{{ state.player.shield }}</b></div>
              <div class="flex justify-between text-white/60"><span>⚔ Criaturas</span><b class="text-white/90">{{ state.playerBoard.length }}</b></div>
              <div class="flex justify-between text-white/60"><span>🃏 En mano</span><b class="text-white/90">{{ state.hand.length }}</b></div>
            </div>
          </div>

          <!-- Opponent -->
          <div
            class="rounded-xl border p-3"
            :class="!won ? 'border-amber-400/50 bg-amber-400/10' : 'border-white/10 bg-white/5'"
          >
            <div class="flex items-center justify-between gap-1 mb-1.5">
              <span class="text-[10px] font-black uppercase tracking-wider truncate" :class="!won ? 'text-amber-300' : 'text-white/50'">
                {{ opponentName }}
              </span>
              <span v-if="!won" class="text-xs">👑</span>
            </div>
            <div class="leading-none mb-2">
              <span class="text-2xl font-black" :class="hpClass(state.opponent.hp)">{{ state.opponent.hp }}</span>
              <span class="text-[11px] font-bold text-white/50">/{{ state.opponent.maxHp }} HP</span>
            </div>
            <div class="space-y-1 text-[11px]">
              <div class="flex justify-between text-white/60"><span>🛡 Escudos</span><b class="text-white/90">{{ state.opponent.shield }}</b></div>
              <div class="flex justify-between text-white/60"><span>⚔ Criaturas</span><b class="text-white/90">{{ state.opponentBoard.length }}</b></div>
              <div class="flex justify-between text-white/60"><span>🃏 En mano</span><b class="text-white/90">{{ state.opponentHand.length }}</b></div>
            </div>
          </div>
        </div>

        <!-- Reward highlight (online victory only — VS AI has no reward) -->
        <div
          v-if="won && rewardEnabled"
          class="mb-4 rounded-2xl border p-3"
          :class="reward === 'claimed'
            ? 'border-amber-400/50 bg-gradient-to-r from-amber-500/20 to-yellow-500/10'
            : reward === 'failed'
              ? 'border-rose-400/40 bg-rose-500/10'
              : 'border-amber-400/30 bg-amber-500/10'"
        >
          <div v-if="reward === 'claimed'" class="flex items-center justify-center gap-2">
            <span class="text-2xl">🪙</span>
            <span class="font-black text-amber-300">+1,000 Créditos obtenidos</span>
          </div>
          <div v-else-if="reward === 'failed'" class="text-sm font-bold text-rose-300">
            ⚠️ No se pudo acreditar el premio
          </div>
          <div v-else class="text-sm font-bold text-amber-200/90 animate-pulse">
            Acreditando premio…
          </div>
        </div>

        <!-- Defeat summary (credits are only mentioned when they're at stake) -->
        <div v-else-if="!won" class="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div v-if="rewardEnabled" class="text-sm font-bold text-white/80">0 créditos ganados</div>
          <p class="text-[11px] text-white/50 leading-relaxed" :class="rewardEnabled ? 'mt-1' : ''">
            Consejo: guarda maná para reaccionar a los taunts y ataca al héroe cuando el tablero quede despejado.
            ¡Vuelve al Deckbuilder y sal por la revancha!
          </p>
        </div>

        <!-- Actions -->
        <button
          @click="emit('reset')"
          class="w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark active:scale-[0.98] transition"
        >
          Jugar de nuevo
        </button>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <button
            @click="emit('menu')"
            class="py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-bold active:scale-[0.98] transition"
          >
            Volver al Menú
          </button>
          <button
            @click="emit('decks')"
            class="py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-bold active:scale-[0.98] transition"
          >
            Ir al Deckbuilder
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
