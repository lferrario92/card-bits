<script setup lang="ts">
import type { BoardCreature } from '@/game/types'

withDefaults(defineProps<{
  creature: BoardCreature
  /** Highlighted as the currently chosen attacker. */
  selected?: boolean
  /** A valid target while another creature is attacking. */
  targetable?: boolean
  /** Responds to taps (clickable / cursor). */
  interactive?: boolean
  /** Ready to attack (shows a glow). */
  ready?: boolean
}>(), {
  selected: false,
  targetable: false,
  interactive: false,
  ready: false,
})

defineEmits<{ pick: [] }>()
</script>

<template>
  <button
    type="button"
    :disabled="!interactive"
    class="relative flex-shrink-0 w-16 group text-left focus:outline-none"
    :class="interactive ? 'cursor-pointer' : 'cursor-default'"
    @click="$emit('pick')"
  >
    <!-- targetable pulse ring -->
    <span v-if="targetable"
      class="absolute -inset-1 rounded-xl ring-2 ring-rose-500 animate-pulse pointer-events-none" />

    <div
      class="relative rounded-lg overflow-hidden border-2 transition-all duration-200"
      :class="[
        creature.side === 'player' ? 'border-emerald-500/70' : 'border-rose-500/70',
        selected ? 'border-primary ring-2 ring-primary scale-105 shadow-lg' : '',
        ready && !selected ? 'ring-2 ring-amber-400/80 shadow-[0_0_10px_rgba(251,191,36,0.7)]' : '',
        !creature.canAttack ? 'opacity-70 grayscale-[0.35]' : '',
        interactive ? 'group-hover:-translate-y-1' : '',
      ]"
    >
      <img :src="creature.card.image" :alt="creature.card.title" class="w-16 h-20 object-cover" draggable="false" />

      <!-- attack -->
      <span class="absolute bottom-0 left-0 min-w-5 h-5 px-1 flex items-center justify-center rounded-tr-md bg-amber-500 text-white text-[11px] font-bold shadow">
        {{ creature.attack }}
      </span>
      <!-- hp -->
      <span class="absolute bottom-0 right-0 min-w-5 h-5 px-1 flex items-center justify-center rounded-tl-md bg-rose-600 text-white text-[11px] font-bold shadow">
        {{ creature.hp }}
      </span>
      <!-- shield -->
      <span v-if="creature.shield > 0"
        class="absolute top-0 right-0 min-w-5 h-5 px-1 flex items-center justify-center rounded-bl-md bg-sky-500 text-white text-[10px] font-bold shadow">
        {{ creature.shield }}
      </span>
      <!-- charge keyword -->
      <span v-if="creature.card.charge"
        class="absolute top-0 left-0 min-w-4 h-4 px-1 flex items-center justify-center rounded-br-md bg-indigo-500 text-white text-[9px] font-bold shadow"
        title="Charge: can attack immediately">
        ⚡
      </span>
      <!-- summoning sickness -->
      <span v-if="!creature.canAttack"
        class="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-lg drop-shadow"
        title="Can't attack this turn">
        💤
      </span>
    </div>
    <p class="mt-0.5 text-[10px] text-center text-gray-500 dark:text-gray-400 truncate">{{ creature.card.title }}</p>
  </button>
</template>
