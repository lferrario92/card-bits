<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, defineComponent, h } from 'vue'
import { gsap } from 'gsap'

// Proper Card component that forwards ref to the root element
const Card = defineComponent({
  name: 'TowerCard',
  inheritAttrs: false,
  props: ['customClass'],
  setup(props: any, { slots, attrs, expose }) {
    const cardRef = ref<HTMLElement | null>(null)
    expose({ cardRef })
    
    return () =>
      h(
        'div',
        {
          ref: cardRef,
          ...attrs,
          class: [
            'absolute top-1/2 left-1/2 rounded-2xl border border-white/20 bg-gradient-to-br from-gray-900 to-gray-800 [transform-style:preserve-3d] [will-change:transform] [backface-visibility:hidden]',
            props.customClass,
            attrs.class
          ],
          style: {
            touchAction: 'manipulation',
            userSelect: 'none',
          }
        },
        slots.default?.()
      )
  }
})

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

// Current pack images (reactive for grid view)
const images = ref<string[]>([])

const cardWidth = ref(280)
const cardHeight = ref(380)
const cardDistance = ref(8)
const verticalDistance = ref(12)
const skewAmount = ref(2)
const swapDuration = ref(0.5)

const isAnimating = ref(false)
// State: 'market' | 'stack' | 'grid' | 'opening'
const state = ref<'market' | 'stack' | 'grid' | 'opening'>('market')
// Order array: first element = top card
const order = ref<number[]>([])
// Track which cards have been seen in current cycle
const seenCards = ref<Set<number>>(new Set())
// Current pack size
const currentPackSize = ref(5)

const cardInstances = ref<Array<{ cardRef: HTMLElement | null }>>([])

function makeSlot(i: number, distX: number, distY: number, total: number) {
  return {
    x: i * distX,
    y: -i * distY,
    z: -i * distX * 2,
    zIndex: total - i
  }
}

function placeNow(el: HTMLElement, slot: ReturnType<typeof makeSlot>, skew: number) {
  gsap.set(el, {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    xPercent: -50,
    yPercent: -50,
    skewY: skew,
    transformOrigin: 'center center',
    zIndex: slot.zIndex,
    force3D: true,
    opacity: 1,
    scale: 1,
    rotationY: 0,
    rotationX: 0,
    rotationZ: 0
  })
}

function cssDim(v: number | string) {
  return typeof v === 'number' ? `${v}px` : v
}

function getCardElements(): HTMLElement[] {
  return cardInstances.value.map(inst => inst.cardRef).filter((el): el is HTMLElement => el !== null)
}

async function initPack(packSize: number) {
  currentPackSize.value = packSize
  // Shuffle and pick images for this pack
  const shuffled = [...availableImages].sort(() => Math.random() - 0.5)
  images.value = shuffled.slice(0, packSize)
  
  await nextTick()
  const cards = getCardElements()
  const total = cards.length
  order.value = Array.from({ length: total }, (_, i) => i)
  seenCards.value.clear()
  state.value = 'stack'
  cards.forEach((card, i) => {
    card.style.width = cssDim(cardWidth.value)
    card.style.height = cssDim(cardHeight.value)
    placeNow(card, makeSlot(i, cardDistance.value, verticalDistance.value, total), skewAmount.value)
  })
}

async function openPack(packSize: number) {
  if (isAnimating.value) return
  isAnimating.value = true
  state.value = 'stack'
  await initPack(packSize)
  isAnimating.value = false
}

async function swapTopToBack() {
  if (isAnimating.value || state.value !== 'stack') return
  if (order.value.length < 2) return
  
  isAnimating.value = true
  const cards = getCardElements()
  const total = cards.length
  const config = { ease: 'power2.inOut', dur: swapDuration.value }
  
  const frontIdx = order.value[0]
  const rest = order.value.slice(1)
  const frontCard = cards[frontIdx]
  
  // Mark as seen
  seenCards.value.add(frontIdx)
  
  const tl = gsap.timeline({
    onComplete: () => {
      // Update order: move front to back
      order.value = [...rest, frontIdx]
      isAnimating.value = false
      
      // Check if all cards have been seen
      if (seenCards.value.size >= total) {
        showGrid()
      }
    }
  })
  
  // IMMEDIATELY set front card to lowest z-index so it goes BEHIND everything
  tl.set(frontCard, { zIndex: 0 }, 0)
  
  const backSlot = makeSlot(total - 1, cardDistance.value, verticalDistance.value, total)
  
  // Single continuous motion: up and directly to back position
  tl.to(frontCard, {
    y: -cardHeight.value * 1.2,
    z: -200,
    x: backSlot.x * 0.3,
    duration: config.dur * 0.3,
    ease: 'power2.in'
  })
  .to(frontCard, {
    x: backSlot.x,
    y: backSlot.y,
    z: backSlot.z,
    duration: config.dur * 0.4,
    ease: 'power2.out'
  }, '+=0')
  
  // Promote other cards up smoothly (overlapping) - they get higher zIndex
  rest.forEach((idx, i) => {
    const card = cards[idx]
    const newSlot = makeSlot(i, cardDistance.value, verticalDistance.value, total)
    tl.to(card, {
      x: newSlot.x,
      y: newSlot.y,
      z: newSlot.z,
      zIndex: newSlot.zIndex,
      duration: config.dur * 0.5,
      ease: config.ease
    }, `-=${config.dur * 0.35}`)
  })
  
  // Ensure front card ends at correct back zIndex
  tl.set(frontCard, { zIndex: backSlot.zIndex }, '>')
}

async function fanOutAndReturnToMarket() {
  isAnimating.value = true
  state.value = 'opening'
  
  const cards = getCardElements()
  const total = cards.length
  
  const tl = gsap.timeline({
    onComplete: () => {
      isAnimating.value = false
      state.value = 'market'
      // Clear cards after fan out
      images.value = []
      order.value = []
      seenCards.value.clear()
    }
  })
  
  cards.forEach((card, i) => {
    const direction = (i % 2 === 0 ? -1 : 1)
    const finalX = direction * (window.innerWidth + 200)
    const finalY = -100 + i * 30
    
    tl.to(card, {
      x: finalX,
      y: finalY,
      rotationZ: direction * 45,
      scale: 0.4,
      opacity: 0,
      duration: 0.7,
      ease: 'power2.in'
    }, i * 0.04)
  })
}

// Show centered grid view with max 3 cards per row
async function showGrid() {
  state.value = 'grid'
  isAnimating.value = true
  
  const cards = getCardElements()
  const total = cards.length
  
  // Calculate centered grid layout with max 3 per row
  const maxPerRow = 3
  const gap = 16
  
  // Calculate scale to fit viewport
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight - 200
  const rows = Math.ceil(total / maxPerRow)
  
  const availableWidth = viewportWidth * 0.9 - (maxPerRow - 1) * gap
  const availableHeight = viewportHeight * 0.9 - (rows - 1) * gap
  const scaleX = availableWidth / (maxPerRow * cardWidth.value)
  const scaleY = availableHeight / (rows * cardHeight.value)
  const gridScale = Math.min(scaleX, scaleY, 1)
  
  const displayWidth = cardWidth.value * gridScale
  const displayHeight = cardHeight.value * gridScale
  
  const tl = gsap.timeline({
    onComplete: () => {
      isAnimating.value = false
    }
  })
  
  cards.forEach((card, i) => {
    const row = Math.floor(i / maxPerRow)
    const col = i % maxPerRow
    const cardsInThisRow = Math.min(maxPerRow, total - row * maxPerRow)
    const rowWidth = cardsInThisRow * displayWidth + (cardsInThisRow - 1) * gap
    const rowStartX = -rowWidth / 2 + displayWidth / 2
    const targetX = rowStartX + col * (displayWidth + gap)
    const targetY = -((rows - 1) * (displayHeight + gap)) / 2 + row * (displayHeight + gap)
    
    // FLAT cards facing front - no rotation, scaled to fit, centered
    tl.to(card, {
      x: targetX,
      y: targetY,
      z: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      skewY: 0,
      scale: gridScale,
      opacity: 1,
      zIndex: 100,
      duration: 0.6,
      ease: 'back.out(1.2)'
    }, i * 0.04)
  })
}

function handleCardClick(idx: number) {
  if (state.value === 'stack') {
    // Only allow clicking the top card
    if (!isAnimating.value && order[0] === idx) {
      swapTopToBack()
    }
  }
}

function handleContainerClick() {
  if (state.value === 'market') {
    // In market, open the standard pack (or could use last selected)
    if (!isAnimating.value) {
      openPack(currentPackSize.value)
    }
  } else if (state.value === 'stack') {
    if (!isAnimating.value) {
      swapTopToBack()
    }
  } else if (state.value === 'grid') {
    if (!isAnimating.value) {
      fanOutAndReturnToMarket()
    }
  }
}

function handleReset() {
  isAnimating.value = false
  state.value = 'market'
  images.value = []
  order.value = []
  seenCards.value.clear()
}

const getTopCardIndex = computed(() => order[0])

const getStateText = computed(() => {
  if (state.value === 'market') return 'Choose a pack to open'
  if (state.value === 'grid') return 'All cards revealed! Click anywhere to open pack.'
  if (state.value === 'opening') return 'Opening pack...'
  if (isAnimating.value) return 'Animating...'
  return `Click top card (Card #${getTopCardIndex.value + 1}) — ${seenCards.size} of ${images.length} revealed`
})

const getProgressText = computed(() => {
  if (state.value === 'stack') {
    return `${seenCards.size} / ${images.length} revealed`
  }
  return ''
})

onMounted(() => {
  // Start in market state, no cards
  state.value = 'market'
  images.value = []
  order.value = []
  seenCards.value.clear()
})

onUnmounted(() => {
  gsap.killTweensOf('*')
})
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="px-4 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <h1 class="text-xl font-bold text-center text-gray-900 dark:text-white">Booster Pack Market</h1>
    </header>
    <main class="flex-1 p-4 flex flex-col items-center justify-center">
      <div class="w-full max-w-4xl">
        <!-- Controls (only in stack state) -->
        <div v-if="state === 'stack' && false" class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-200 dark:border-gray-700 mb-4">
          <div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Width: {{ cardWidth }}px</label>
              <input type="range" v-model.number="cardWidth" min="200" max="400" step="10" class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none accent-primary" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Height: {{ cardHeight }}px</label>
              <input type="range" v-model.number="cardHeight" min="280" max="500" step="10" class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none accent-primary" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">H-Spread: {{ cardDistance }}px</label>
              <input type="range" v-model.number="cardDistance" min="0" max="30" step="1" class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none accent-primary" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">V-Spread: {{ verticalDistance }}px</label>
              <input type="range" v-model.number="verticalDistance" min="0" max="40" step="1" class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none accent-primary" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Skew: {{ skewAmount }}deg</label>
              <input type="range" v-model.number="skewAmount" min="0" max="10" step="1" class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none accent-primary" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Duration: {{ swapDuration }}s</label>
              <input type="range" v-model.number="swapDuration" min="0.3" max="1.5" step="0.1" class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none accent-primary" />
            </div>
          </div>
          
          <div class="flex gap-2 justify-center flex-wrap">
            <button @click="handleReset" :disabled="isAnimating"
              class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors text-sm">
              Back to Market
            </button>
          </div>
          
          <div class="text-center mt-3">
            <p class="text-sm text-gray-600 dark:text-gray-300 font-medium">{{ getStateText }}</p>
            <p v-if="getProgressText" class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ getProgressText }}</p>
          </div>
        </div>

        <!-- Market State - Pack Selection Buttons -->
        <div v-if="state === 'market'" class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-gray-200 dark:border-gray-700 mb-4 text-center">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Booster Pack Market</h2>
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

        <!-- Card Container - Only visible in stack/grid/opening states -->
        <div v-if="state === 'stack' || state === 'grid' || state === 'opening'" class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-700 relative min-h-[500px] flex items-center justify-center" 
             ref="containerRef" @click="handleContainerClick">
          <div class="relative perspective-[2000px]" style="width: 100%; height: 480px;">
            <Card
              v-for="(src, idx) in images"
              :key="idx"
              ref="cardInstances"
              :data-index="idx"
              :class="['cursor-pointer', { 'ring-2 ring-primary ring-offset-2 ring-offset-gray-900 dark:ring-offset-gray-800': state === 'stack' && order[0] === idx && !isAnimating }]"
              @click="handleCardClick(idx)"
            >
              <div class="w-full h-full relative">
                <!-- Card front - always visible -->
                <div class="absolute inset-0 rounded-2xl overflow-hidden" style="backface-visibility: hidden;">
                  <img :src="src" :alt="`card-${idx}`" class="w-full h-full object-cover" />
                  <div class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                    <div class="text-white font-bold text-sm">Card #{{ idx + 1 }}</div>
                    <div class="text-white/70 text-xs">
                      Position: {{ order.indexOf(idx) + 1 }} of {{ images.length }}
                      <span v-if="seenCards.has(idx) && state === 'stack'" class="ml-2 text-green-300">✓ Revealed</span>
                    </div>
                  </div>
                </div>
                
                <!-- Subtle highlight for top card (only in stack) -->
                <div v-if="state === 'stack' && order[0] === idx && !isAnimating" 
                     class="absolute inset-0 rounded-2xl pointer-events-none"
                     style="box-shadow: inset 0 0 0 2px rgba(170, 59, 255, 0.6);"></div>
                
                <!-- Top card indicator (only in stack) -->
                <div v-if="state === 'stack' && order[0] === idx && !isAnimating" 
                     class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-primary">
                  TOP ▼
                </div>
              </div>
            </Card>
          </div>
        </div>

        <!-- Instructions -->
        <div class="mt-6 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-4 shadow-xl border border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">How to Play</h2>
          <div class="grid gap-3 md:grid-cols-3 text-sm">
            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <h3 class="font-medium text-gray-900 dark:text-white mb-2">1. Market</h3>
              <ul class="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                <li>• Start here - no cards visible</li>
                <li>• Pick a pack size (3, 5, or 6)</li>
                <li>• Pack spawns as a stack</li>
              </ul>
            </div>
            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <h3 class="font-medium text-gray-900 dark:text-white mb-2">2. Reveal</h3>
              <ul class="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                <li>• Click TOP card to reveal</li>
                <li>• Card slides to back</li>
                <li>• Repeat until all seen</li>
              </ul>
            </div>
            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <h3 class="font-medium text-gray-900 dark:text-white mb-2">3. Fan Out → Market</h3>
              <ul class="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                <li>• All seen → fan out & disappear</li>
                <li>• Returns to Market</li>
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
</style>