<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ENEMIES, setStoredEnemyId } from '@/game/enemies'

const router = useRouter()

const accentClasses: Record<string, { ring: string; chip: string; glow: string; text: string }> = {
  rose: {
    ring: 'border-rose-200 dark:border-rose-900/60 hover:border-rose-400',
    chip: 'bg-rose-500',
    glow: 'from-rose-500/25',
    text: 'text-rose-500',
  },
  amber: {
    ring: 'border-amber-200 dark:border-amber-900/60 hover:border-amber-400',
    chip: 'bg-amber-500',
    glow: 'from-amber-500/25',
    text: 'text-amber-500',
  },
  sky: {
    ring: 'border-sky-200 dark:border-sky-900/60 hover:border-sky-400',
    chip: 'bg-sky-500',
    glow: 'from-sky-500/25',
    text: 'text-sky-500',
  },
}

function choose(id: string) {
  setStoredEnemyId(id)
  router.push('/bounce-cards')
}
</script>

<template>
  <div class="min-h-screen">
    <header class="px-4 pt-5 pb-4">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white">Choose your opponent</h1>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        Pick a fighter to battle in the arena.
      </p>
    </header>

    <main class="px-4 pb-28 space-y-3">
      <button
        v-for="enemy in ENEMIES"
        :key="enemy.id"
        @click="choose(enemy.id)"
        class="group relative w-full text-left rounded-2xl overflow-hidden border-2 bg-white dark:bg-gray-800 shadow-sm active:scale-[0.99] transition"
        :class="accentClasses[enemy.accent].ring"
      >
        <div class="flex items-stretch gap-3 p-3">
          <!-- Cover: the enemy's signature card -->
          <div class="relative flex-shrink-0 w-20 h-24 rounded-xl overflow-hidden border border-black/10 dark:border-white/10">
            <img
              :src="enemy.deck[0]?.image"
              :alt="enemy.name"
              class="absolute inset-0 w-full h-full object-cover"
              draggable="false"
            />
            <div class="absolute inset-0 bg-gradient-to-t" :class="accentClasses[enemy.accent].glow" />
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0 flex flex-col justify-center">
            <div class="flex items-center gap-2">
              <h2 class="text-base font-bold text-gray-900 dark:text-white truncate">{{ enemy.name }}</h2>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{{ enemy.tagline }}</p>
            <div class="flex items-center gap-3 mt-2">
              <span class="flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
                <span :class="['inline-block w-2 h-2 rounded-full', accentClasses[enemy.accent].chip]" />
                {{ enemy.hp }} HP
              </span>
              <span class="text-[11px] text-gray-400 dark:text-gray-500">{{ enemy.deck.length }} cards</span>
            </div>
          </div>

          <div class="flex-shrink-0 self-center">
            <span
              class="flex items-center justify-center w-9 h-9 rounded-full text-white text-lg font-bold shadow"
              :class="accentClasses[enemy.accent].chip"
            >⚔</span>
          </div>
        </div>
      </button>
    </main>
  </div>
</template>
