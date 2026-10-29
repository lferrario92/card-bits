<script setup lang="ts">
import type { CardTemplate } from '@/game/types'

interface Props {
  card: CardTemplate
  count?: number
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false
})
</script>

<template>
  <div
    class="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800"
    :class="compact ? 'w-32' : ''"
  >
    <img
      :src="card.image"
      :alt="card.title"
      class="w-full object-cover"
      :class="compact ? 'h-32' : 'h-40'"
    />
    <div class="bg-black/80 backdrop-blur-sm px-3 py-2" :class="compact ? 'px-2 py-1.5' : ''">
      <p class="text-xs font-bold text-white truncate mb-1" :class="compact ? 'text-[10px]' : ''">{{ card.title }}</p>
      <p v-if="count" class="text-[10px] text-gray-300 mb-2" :class="compact ? 'text-[9px] mb-1' : ''">×{{ count }}</p>

      <!-- Combat data drawer -->
      <div class="text-gray-200 space-y-1" :class="compact ? 'text-[8px]' : 'text-[9px]'">
        <div class="flex items-center gap-2">
          <span class="text-blue-400">{{ card.type }}</span>
          <span class="text-purple-400">{{ card.manaCost }} mana</span>
        </div>
        <div v-if="card.type === 'creature'" class="flex items-center gap-2">
          <span class="text-red-400">⚔ {{ card.attack }}</span>
          <span class="text-green-400">❤ {{ card.health }}</span>
          <span v-if="card.charge" class="text-yellow-400">⚡</span>
        </div>
        <div v-if="card.effects && card.effects.length > 0" class="mt-1 pt-1 border-t border-gray-600">
          <div v-for="(effect, idx) in card.effects" :key="idx" class="text-gray-300">
            {{ effect.action }} {{ effect.value }} to {{ effect.target === 'all' ? 'all' : effect.target }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
