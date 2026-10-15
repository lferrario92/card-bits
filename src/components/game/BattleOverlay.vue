<script setup lang="ts">
import type { Side } from '@/game/types'

defineProps<{
  winner: Side
  opponentName?: string
}>()

const emit = defineEmits<{ reset: [] }>()
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
    <div class="w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl border"
      :class="winner === 'player'
        ? 'bg-gradient-to-b from-emerald-950 to-gray-900 border-emerald-500/40'
        : 'bg-gradient-to-b from-rose-950 to-gray-900 border-rose-500/40'">
      <div class="text-5xl mb-2">{{ winner === 'player' ? '🏆' : '💀' }}</div>
      <h2 class="text-2xl font-bold text-white mb-1">
        {{ winner === 'player' ? 'Victory!' : 'Defeat' }}
      </h2>
      <p class="text-sm text-white/70 mb-5">
        {{ winner === 'player' ? `${opponentName ?? 'The opponent'} has been defeated.` : 'Your forces have fallen in battle.' }}
      </p>
      <button
        @click="emit('reset')"
        class="w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark active:scale-[0.98] transition">
        Reset Battle
      </button>
    </div>
  </div>
</template>
