<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, defineComponent, h } from 'vue'
import { gsap } from 'gsap'
import Stack from '@/components/vue-bits/Stack.vue'

// Pack configurations
interface PackConfig {
  size: number
  label: string
  color: string
  icon: string
}

const PACK_CONFIGS: PackConfig[] = [
  { size: 3, label: 'Small Pack', color: 'bg-green-500 hover:bg-green-600', icon: '📦' },
  { size: 5, label: 'Standard Pack', color: 'bg-blue-500 hover:bg-blue-600', icon: '🎁' },
  { size: 6, label: 'Large Pack', color: 'bg-purple-500 hover:bg-purple-600', icon: '💎' },
]

const availableImages = [
  'https://picsum.photos/id/1015/400/400',
  'https://picsum.photos/id/1025/400/400',
  'https://picsum.photos/id/1039/400/400',
  'https://picsum.photos/id/1043/400/400',
  'https://picsum.photos/id/1050/400/400',
  'https://picsum.photos/id/1062/400/400',
  'https://picsum.photos/id/1069/400/400',
  'https://picsum.photos/id/1074/400/400',
  'https://picsum.photos/id/1080/400/400',
  'https://picsum.photos/id/1084/400/400',
  'https://picsum.photos/id/1090/400/400',
  'https://picsum.photos/id/1095/400/400',
]

interface CardData {
  id: number
  img: string
}

const cardsData = ref<CardData[]>([])
const currentPackSize = ref(5)
const isAnimating = ref(false)
const revealedCount = ref(0)

// State: 'market' | 'stack' | 'grid' | 'opening'
const state = ref<'market' | 'stack' | 'grid' | 'opening'>('market')
const seenCards = ref<Set<number>>(new Set())

function createPack(packSize: number): CardData[] {
  const shuffled = [...availableImages].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, packSize).map((img, i) => ({ id: i + 1, img }))
}

async function openPack(packSize: number) {
  if (isAnimating.value) return
  isAnimating.value = true
  state.value = 'stack'
  currentPackSize.value = packSize
  revealedCount.value = 0
  seenCards.value.clear()
  cardsData.value = createPack(packSize)
  await nextTick()
  isAnimating.value = false
}

function handleCardClick(cardId: number) {
  if (state.value === 'stack' && !isAnimating.value) {
    revealedCount.value++
    seenCards.value.add(cardId)
    
    if (revealedCount.value >= cardsData.value.length) {
      showGrid()
    }
  }
}

async function showGrid() {
  isAnimating.value = true
  state.value = 'grid'
  
  // Give Stack component time to animate cards to back
  await new Promise(resolve => setTimeout(resolve, 800))
  
  // Animate to grid layout
  await animateToGrid()
  
  isAnimating.value = false
}

async function animateToGrid() {
  // This will be handled by the GridView component
  // The Stack component will remain visible but we overlay a grid
  // For now, just transition state
  state.value = 'grid'
}

async function fanOutAndReturnToMarket() {
  isAnimating.value = true
  state.value = 'opening'
  
  // The Stack component handles the fan out via its internal logic
  // We just wait and then return to market
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  isAnimating.value = false
  state.value = 'market'
  cardsData.value = []
  revealedCount.value = 0
  seenCards.value.clear()
}

function handleContainerClick() {
  if (state.value === 'market') {
    if (!isAnimating.value) {
      openPack(currentPackSize.value)
    }
  } else if (state.value === 'grid') {
    if (!isAnimating.value) {
      fanOutAndReturnToMarket()
    }
  }
}

const getStateText = computed(() => {
  if (state.value === 'market') return 'Choose a pack to open'
  if (state.value === 'grid') return 'All cards revealed! Click anywhere to open pack.'
  if (state.value === 'opening') return 'Opening pack...'
  if (isAnimating.value) return 'Animating...'
  return `Click top card to reveal — ${revealedCount.value} of ${cardsData.value.length} revealed`
})

onMounted(() => {
  state.value = 'market'
  cardsData.value = []
})

onUnmounted(() => {
  // Cleanup
})
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="px-4 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <h1 class="text-xl font-bold text-center text-gray-900 dark:text-white">Stack Component - Booster Pack Market</h1>
    </header>
    <main class="flex-1 p-4 flex flex-col items-center justify-center">
      <div class="w-full max-w-4xl">
        <!-- Stack State Controls -->
        <div v-if="state === 'stack'" class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700 mb-4">
          <div class="flex gap-2 justify-center flex-wrap mb-4">
            <button @click="fanOutAndReturnToMarket" :disabled="isAnimating"
              class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors text-sm">
              Back to Market
            </button>
          </div>
          
          <div class="text-center">
            <p class="text-sm text-gray-600 dark:text-gray-300 font-medium">{{ getStateText }}</p>
          </div>
        </div>

        <!-- Market State - Pack Selection Buttons -->
        <div v-if="state === 'market'" class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-gray-200 dark:border-gray-700 mb-4 text-center">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Booster Pack Market (Stack Component)</h2>
          <p class="text-gray-600 dark:text-gray-400 mb-6">Select a pack to open</p>
          
          <div class="flex gap-4 justify-center flex-wrap">
            <button 
              v-for="pack in PACK_CONFIGS"
              :key="pack.size"
              @click="openPack(pack.size)"
              :disabled="isAnimating"
              :class="['px-8 py-4 rounded-xl font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex flex-col items-center gap-1 text-base', pack.color]"
            >
              <span class="text-3xl">{{ pack.icon }}</span>
              <span>{{ pack.label }}</span>
              <span class="text-xs opacity-75">{{ pack.size }} cards</span>
            </button>
          </div>
        </div>

        <!-- Grid State - Centered Grid Overlay -->
        <div v-if="state === 'grid'" class="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div class="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-gray-200 dark:border-gray-700 max-w-4xl w-full mx-4 animate-fade-in">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">All Cards Revealed!</h2>
              <button @click="fanOutAndReturnToMarket" 
                class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">
                Open New Pack
              </button>
            </div>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div v-for="card in cardsData" :key="card.id" class="relative aspect-[3/4] rounded-xl overflow-hidden shadow-lg">
                <img :src="card.img" :alt="`card-${card.id}`" class="w-full h-full object-cover" />
                <div class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                  <div class="text-white font-bold text-sm">Card #{{ card.id }}</div>
                </div>
              </div>
            </div>
            
            <p class="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
              Click anywhere outside or "Open New Pack" to continue
            </p>
          </div>
        </div>

        <!-- Card Container - Stack Component -->
        <div v-if="state === 'stack' || state === 'opening'" class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-700 relative min-h-[500px] flex items-center justify-center" 
             ref="containerRef" @click="handleContainerClick">
          <div class="relative" style="width: 100%; height: 480px;">
            <Stack
              :cards-data="cardsData"
              :send-to-back-on-click="true"
              :random-rotation="true"
              :animation-config="{ stiffness: 300, damping: 25 }"
              class="w-full h-full"
            >
              <template #default="{ card }">
                <img :src="card.img" :alt="`card-${card.id}`" class="w-full h-full object-cover" />
              </template>
            </Stack>
            
            <!-- Top card indicator -->
            <div v-if="state === 'stack' && cardsData.length > 0" 
                 class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-primary animate-bounce">
              TOP ▼
            </div>
          </div>
        </div>

        <!-- Instructions -->
        <div class="mt-6 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-4 shadow-xl border border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">How it works</h2>
          <div class="grid gap-3 md:grid-cols-3 text-sm">
            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <h3 class="font-medium text-gray-900 dark:text-white mb-2">1. Market</h3>
              <ul class="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                <li>• Start here - no cards visible</li>
                <li>• Pick a pack size (3, 5, or 6)</li>
                <li>• Pack spawns as Vue Bits Stack</li>
              </ul>
            </div>
            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <h3 class="font-medium text-gray-900 dark:text-white mb-2">2. Reveal</h3>
              <ul class="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                <li>• Click top card (or drag)</li>
                <li>• Card sends to back</li>
                <li>• Repeat until all seen</li>
              </ul>
            </div>
            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <h3 class="font-medium text-gray-900 dark:text-white mb-2">3. Grid → Market</h3>
              <ul class="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                <li>• All seen → centered grid</li>
                <li>• Click → fan out → market</li>
                <li>• Pick another pack</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
main {
  min-height: calc(100vh - 60px);
  min-height: calc(100dvh - 60px);
}

@keyframes fade-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}

.animate-bounce {
  animation: bounce 1s ease-in-out infinite;
}
</style>