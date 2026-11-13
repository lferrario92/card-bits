<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ENEMIES, setStoredEnemyId } from '@/game/enemies'

const router = useRouter()

// Menu structure mirrors DeckBuilderView: a top-level menu with one big
// option per mode, each opening its own screen with a back button.
const viewMode = ref<'menu' | 'online' | 'single'>('menu')

/** Signature art of the first enemy backs the Single Player option. */
const singleArt = ENEMIES[0]?.deck[0]?.image ?? ''

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

function backToMenu() {
  viewMode.value = 'menu'
}

function choose(id: string) {
  setStoredEnemyId(id)
  router.push('/bounce-cards')
}

function vsPlayer() {
  router.push('/online')
}
</script>

<template>
  <!-- ============ MENU MODE ============ -->
  <div v-if="viewMode === 'menu'" class="min-h-screen flex flex-col">
    <header class="px-4 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <h1 class="text-lg font-bold text-center text-gray-900 dark:text-white">Fight</h1>
    </header>

    <main class="flex-1 px-4 pt-4 pb-24 flex flex-col items-center justify-center gap-4">
      <button
        @click="viewMode = 'single'"
        class="menuBtn w-full max-w-sm py-12 hover:opacity-90 hover:scale-105 rounded-2xl bg-transparent text-white text-lg font-bold shadow-lg active:scale-[0.98] transition"
        :style="{ backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${singleArt})` }"
      >
        Single Player
      </button>
      <button
        @click="viewMode = 'online'"
        class="menuBtn onlineMode w-full max-w-sm py-12 hover:opacity-90 hover:scale-105 rounded-2xl bg-transparent text-white text-lg font-bold shadow-lg active:scale-[0.98] transition"
      >
        Online Mode
      </button>
    </main>
  </div>

  <!-- ============ ONLINE MODE ============ -->
  <div v-else-if="viewMode === 'online'" class="min-h-screen flex flex-col">
    <header class="px-4 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <button @click="backToMenu" class="text-sm text-gray-600 dark:text-gray-300 mb-2">← Back</button>
      <h1 class="text-lg font-bold text-gray-900 dark:text-white">Online Mode</h1>
    </header>

    <main class="flex-1 px-4 pt-4 pb-24 space-y-3">
      <button
        @click="vsPlayer"
        class="w-full text-left rounded-2xl overflow-hidden border-2 border-indigo-200 dark:border-indigo-900/60 hover:border-indigo-400 bg-white dark:bg-gray-800 shadow-sm active:scale-[0.99] transition"
      >
        <div class="flex items-center gap-3 p-3">
          <span class="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500 text-white text-lg font-bold">🌐</span>
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-bold text-gray-900 dark:text-white">Battle a friend</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Play online with a share code.</p>
          </div>
          <span class="flex-shrink-0 text-indigo-500 text-lg font-bold">→</span>
        </div>
      </button>

      <p class="text-center text-xs text-gray-400 dark:text-gray-500 pt-2">
        Create a match, share the code and your opponent joins from their own device.
      </p>
    </main>
  </div>

  <!-- ============ SINGLE PLAYER MODE ============ -->
  <div v-else class="min-h-screen flex flex-col">
    <header class="px-4 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <button @click="backToMenu" class="text-sm text-gray-600 dark:text-gray-300 mb-2">← Back</button>
      <h1 class="text-lg font-bold text-gray-900 dark:text-white">Single Player</h1>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        Pick a fighter to battle in the arena.
      </p>
    </header>

    <main class="flex-1 px-4 pt-4 pb-28 space-y-3">
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

<style scoped>
/* Same treatment as the decks-menu buttons (photo background, cover,
   centered, heavy text shadow) plus a dark scrim — the single-player art
   is applied inline so it always tracks the enemy list's signature card. */
.menuBtn {
  background-size: cover;
  background-position: center;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

.onlineMode {
  background-image: linear-gradient(rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.45)),
    url('/assets/local_cards/gordona/contento.jpg');
}
</style>
