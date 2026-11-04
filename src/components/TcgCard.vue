<script setup lang="ts">
import type { DbUserCard } from '@/lib/supabase'
import type { CardData } from '@/game/types'

interface Props {
  card: DbUserCard | CardData
  fill?: boolean
  compact?: boolean
  showCount?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  fill: false,
  compact: false,
  showCount: true,
})

// Normalize both collection (DbUserCard) and battle (CardData) cards into a
// single view model so the same component can render either.
import { computed } from 'vue'
const view = computed(() => (props.card as any)?.cards
  ? (props.card as DbUserCard)
  : (() => {
      const c = props.card as CardData
      return {
        id: String(c.id),
        user_id: '',
        card_id: String(c.id),
        count: 1,
        cards: {
          id: String(c.id),
          name: c.title,
          image: c.image,
          rarity: c.rarity ?? 'Common',
          description: c.description ?? '',
          tcg_available: true,
          tcg_combat_data: {
            type: c.type,
            manaCost: c.manaCost,
            attack: c.attack,
            health: c.health,
            charge: c.charge,
            effects: c.effects ?? [],
          },
        },
      } as DbUserCard
    })()
  )
</script>

<template>
  <div
    class="relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 justify-between flex flex-col"
    :class="fill ? 'w-full h-full' : ''"
  >
    <img
      :src="view.cards.image || 'https://via.placeholder.com/150'"
      :alt="view.cards.name"
      class="w-full object-cover"
      :class="compact ? 'h-[55%] min-h-0' : (fill ? 'h-full min-h-0' : 'h-40 min-h-40')"
    />
    <div class="absolute bg-blue-500 top-1 left-1 w-6 h-6 flex items-center justify-center border border-white/20 text-white text-xs font-bold rounded-full">
      {{ view.cards.tcg_combat_data?.manaCost }}
    </div>
    <span class="absolute right-1 top-1 text-white text-xs font-bold text-shadow drop-shadow-lg px-1 rounded"
      :class="{
        'text-[8px] top-1': compact,
        'bg-red-500': view.cards.tcg_combat_data?.type === 'creature',
        'bg-blue-500': view.cards.tcg_combat_data?.type === 'spell'
      }">{{ view.cards.tcg_combat_data?.type }}</span>

    <div class="bg-black/80 backdrop-blur-sm px-2 py-1" :class="compact ? 'h-[45%]' : 'h-full'">
      <div v-if="showCount" class="absolute -top-8 left-0 w-8 h-8 flex items-center justify-center text-white text-xs font-bold bg-black/60">
        x{{ view.count }}
      </div>
      <p class="font-bold text-white truncate mb-1" :class="compact ? 'text-[9px] mb-0' : 'text-xs'">{{ view.cards.name }}</p>
      <p v-if="view.cards.description" class="text-gray-300 leading-tight mb-1 line-clamp-2" :class="compact ? 'text-[8px] mb-0' : 'text-[9px]'">{{ view.cards.description }}</p>
      <!-- Combat data drawer -->
      <div v-if="view.cards.tcg_combat_data" class="text-gray-200 space-y-1" :class="compact ? 'text-[7px]' : 'text-[9px]'">
        <div v-if="view.cards.tcg_combat_data.type === 'creature'" class="absolute -top-5 right-1 text-white font-bold bg-gray-500 px-1 rounded" :class="compact ? 'text-[8px]' : 'text-xs'">
          <span v-if="view.cards.tcg_combat_data.charge" class="text-yellow-400">⚡</span>
          🗡 {{ view.cards.tcg_combat_data.attack }} / ❤ {{ view.cards.tcg_combat_data.health }}
        </div>
        <div v-if="view.cards.tcg_combat_data.effects && view.cards.tcg_combat_data.effects.length > 0" class="mt-1 pt-1 border-t border-gray-600">
          <span class="text-gray-400">Effects:</span>
          <div v-for="(effect, idx) in view.cards.tcg_combat_data.effects" :key="idx" class="text-gray-300">
            {{ effect.action }} {{ effect.value }} to {{ effect.target === 'all' ? 'all' : effect.target }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>