<script setup lang="ts">
import type { DbUserCard } from '@/lib/supabase'

interface Props {
  card: DbUserCard
}

defineProps<Props>()
</script>

<template>
  <div class="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
    <img
      :src="card.cards.image || 'https://via.placeholder.com/150'"
      :alt="card.cards.name"
      class="w-full h-40 object-cover"
    />
    <div class="bg-black/80 backdrop-blur-sm px-3 py-2">
      <p class="text-xs font-bold text-white truncate mb-1">{{ card.cards.name }}</p>
      <p class="text-[10px] text-gray-300 mb-2">×{{ card.count }}</p>

      <!-- Combat data drawer -->
      <div v-if="card.cards.tcg_combat_data" class="text-[9px] text-gray-200 space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-blue-400">{{ card.cards.tcg_combat_data.type }}</span>
          <span class="text-purple-400">{{ card.cards.tcg_combat_data.manaCost }} mana</span>
        </div>
        <div v-if="card.cards.tcg_combat_data.type === 'creature'" class="flex items-center gap-2">
          <span class="text-red-400">⚔ {{ card.cards.tcg_combat_data.attack }}</span>
          <span class="text-green-400">❤ {{ card.cards.tcg_combat_data.health }}</span>
          <span v-if="card.cards.tcg_combat_data.charge" class="text-yellow-400">⚡</span>
        </div>
        <div v-if="card.cards.tcg_combat_data.effects && card.cards.tcg_combat_data.effects.length > 0" class="mt-1 pt-1 border-t border-gray-600">
          <div v-for="(effect, idx) in card.cards.tcg_combat_data.effects" :key="idx" class="text-gray-300">
            {{ effect.action }} {{ effect.value }} to {{ effect.target === 'all' ? 'all' : effect.target }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
