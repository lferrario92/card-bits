<script setup lang="ts">
import type { DbUserCard } from '@/lib/supabase'

interface Props {
  card: DbUserCard
}

defineProps<Props>()
</script>

<template>
  <div class="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 justify-between flex flex-col">
    <img
      :src="card.cards.image || 'https://via.placeholder.com/150'"
      :alt="card.cards.name"
      class="w-full h-40 min-h-40 object-cover"
    />
    <div class="absolute bg-blue-500 top-1 left-1 w-6 h-6 flex items-center justify-center border border-white/20 text-white text-xs font-bold rounded-full">
      {{ card.cards.tcg_combat_data?.manaCost }}
    </div>
    
    <div class="absolute top-0 right-0 w-8 h-8 flex items-center justify-center text-white text-xs font-bold bg-black/60">
      x{{ card.count }}
    </div>
    <div class="bg-black/80 backdrop-blur-sm px-3 py-2 h-full">
      <span class="absolute -top-6 left-2 text-white text-xs font-bold text-shadow drop-shadow-lg">{{ card.cards.tcg_combat_data?.type }}</span>
      <p class="text-xs font-bold text-white truncate mb-1">{{ card.cards.name }}</p>
      <!-- Combat data drawer -->
      <div v-if="card.cards.tcg_combat_data" class="text-[9px] text-gray-200 space-y-1">
        <div v-if="card.cards.tcg_combat_data.type === 'creature'" class="absolute bottom-1 right-1 text-white text-xs font-bold">
          <span v-if="card.cards.tcg_combat_data.charge" class="text-yellow-400">⚡</span>
          🗡 {{ card.cards.tcg_combat_data.attack }} / ❤ {{ card.cards.tcg_combat_data.health }}
        </div>
        <div v-if="card.cards.tcg_combat_data.effects && card.cards.tcg_combat_data.effects.length > 0" class="mt-1 pt-1 border-t border-gray-600">
          <span class="text-gray-400">Effects:</span>
          <div v-for="(effect, idx) in card.cards.tcg_combat_data.effects" :key="idx" class="text-gray-300">
            {{ effect.action }} {{ effect.value }} to {{ effect.target === 'all' ? 'all' : effect.target }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
