<script setup lang="ts">
import { computed } from 'vue'
import type { Entity } from '@/game/types'

const props = withDefaults(defineProps<{
  entity: Entity
  accent?: 'player' | 'opponent'
  compact?: boolean
}>(), {
  accent: 'player',
  compact: false,
})

const hpPercent = computed(() => {
  if (props.entity.maxHp <= 0) return 0
  return Math.max(0, Math.min(100, (props.entity.hp / props.entity.maxHp) * 100))
})

const barColor = computed(() =>
  props.accent === 'player'
    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
    : 'bg-gradient-to-r from-rose-600 to-red-400'
)
</script>

<template>
  <div class="w-full">
    <div class="flex items-center justify-between gap-2 mb-1">
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="text-xs font-semibold truncate text-gray-900 dark:text-white">{{ entity.name }}</span>
        <span v-if="entity.shield > 0"
          class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 whitespace-nowrap">
          🛡 {{ entity.shield }}
        </span>
      </div>
      <span class="text-[11px] font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap">
        ❤ {{ entity.hp }}<span class="text-gray-400 dark:text-gray-500">/{{ entity.maxHp }}</span>
      </span>
    </div>
    <div class="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
      <div :class="['h-full rounded-full transition-all duration-500 ease-out', barColor]" :style="{ width: `${hpPercent}%` }" />
    </div>
  </div>
</template>
