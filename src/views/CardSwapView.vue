<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, defineComponent, h } from 'vue'
import { gsap } from 'gsap'
import { addTemplates } from '@/game/collection'
import type { CardTemplate } from '@/game/types'
import { fetchAvailableBoosters, openBooster, type DbBooster } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'

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

// Current pack cards (reactive for grid view)
const packCards = ref<CardTemplate[]>([])

// Booster opening animation state
const packOpening = ref(false)
const pendingIcon = ref('🎁')
const boosterRef = ref<HTMLElement | null>(null)
const selectedBooster = ref<DbBooster | null>(null)

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

// Boosters fetched from Supabase
const boosters = ref<DbBooster[]>([])
const openError = ref<string | null>(null)

const cardInstances = ref<Array<{ cardRef: HTMLElement | null }>>([])

// The stack shows at most this many cards, regardless of pack size.
const MAX_STACK = 4

// Rarity drives the colour of the top card's frame so the stack telegraphs
// what is about to be revealed.
const RARITY_RING: Record<string, string> = {
  Common: 'ring-gray-400',
  Uncommon: 'ring-green-400',
  Rare: 'ring-blue-400',
  Epic: 'ring-purple-400',
  Legendary: 'ring-amber-400',
}

const RARITY_COLORS: Record<string, string> = {
  Common: '#9ca3af',
  Uncommon: '#4ade80',
  Rare: '#60a5fa',
  Epic: '#c084fc',
  Legendary: '#fbbf24',
}

function rarityRing(rarity?: string): string {
  return RARITY_RING[rarity ?? 'Common'] ?? RARITY_RING.Common
}

function rarityColor(rarity?: string): string {
  return RARITY_COLORS[rarity ?? 'Common'] ?? RARITY_COLORS.Common
}

function isTopCard(idx: number): boolean {
  return state.value === 'stack' && order.value[0] === idx && !isAnimating.value
}

function makeSlot(i: number, distX: number, distY: number, total: number) {
  // Clamp the visual position so the stack never fans out beyond MAX_STACK
  // cards; extra cards tuck in behind the last visible one.
  const pos = Math.min(i, MAX_STACK - 1)
  return {
    x: pos * distX,
    y: -pos * distY,
    z: -pos * distX * 2,
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

async function initPackFromCards(picked: CardTemplate[]) {
  currentPackSize.value = picked.length
  packCards.value = picked
  state.value = 'stack'

  // Unlock the drawn cards for deck building.
  addTemplates(picked)

  await nextTick()
  const cards = getCardElements()
  const total = cards.length
  order.value = Array.from({ length: total }, (_, i) => i)
  seenCards.value.clear()
  cards.forEach((card, i) => {
    card.style.width = cssDim(cardWidth.value)
    card.style.height = cssDim(cardHeight.value)
    placeNow(card, makeSlot(i, cardDistance.value, verticalDistance.value, total), skewAmount.value)
  })

  // Fade the freshly mounted stack in.
  gsap.fromTo(cards, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.06, ease: 'power2.out' })
}

async function openPack(booster: DbBooster) {
  if (isAnimating.value) return
  isAnimating.value = true
  openError.value = null

  // Set the selected booster for the animation
  selectedBooster.value = booster

  // Play a short booster-opening animation before the cards spawn.
  pendingIcon.value = '🎁'
  packOpening.value = true
  await nextTick()
  await playBoosterAnimation()
  packOpening.value = false

  const { user } = useAuth()
  const userId = user.value?.id
  if (!userId) {
    openError.value = 'You must be signed in to open a booster.'
    isAnimating.value = false
    selectedBooster.value = null
    return
  }

  try {
    const result = await openBooster(userId, booster.id)

    // Map the real opened cards into templates the existing card renderer can show.
    const templates: CardTemplate[] = (result.cards ?? []).map((c) => ({
      title: c.name,
      image: c.image ?? '',
      description: c.description ?? '',
      type: 'spell',
      manaCost: 0,
      rarity: c.rarity ?? 'Common',
      effects: []
    }))

    if (templates.length === 0) {
      openError.value = 'The booster contained no cards.'
      isAnimating.value = false
      selectedBooster.value = null
      return
    }

    await initPackFromCards(templates)
  } catch (err) {
    console.error('Error opening booster:', err)
    openError.value = err instanceof Error ? err.message : 'Failed to open booster'
    selectedBooster.value = null
  } finally {
    isAnimating.value = false
  }
}

// Pop in, shake, then burst before the cards appear.
function playBoosterAnimation(): Promise<void> {
  const el = boosterRef.value
  return new Promise((resolve) => {
    if (!el) return resolve()
    gsap.killTweensOf(el)
    gsap.set(el, { scale: 0.2, opacity: 0, rotation: 0, transformOrigin: 'center center' })

    const tl = gsap.timeline({ onComplete: () => resolve() })
    tl.to(el, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' })
      .to(el, { rotation: 6, duration: 0.06, yoyo: true, repeat: 5, ease: 'power1.inOut' })
      .to(el, { rotation: 0, duration: 0.06 })
      .to(el, { scale: 1.9, opacity: 0, duration: 0.32, ease: 'power2.in' })
  })
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
      packCards.value = []
      order.value = []
      seenCards.value.clear()
      selectedBooster.value = null
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
  packCards.value = []
  order.value = []
  seenCards.value.clear()
  selectedBooster.value = null
}

const getTopCardIndex = computed(() => order[0])

// Full-screen reveal mode: while a pack is opening, being revealed, or fanned
// out, hide the market behind an immersive layer so the focus stays on cards.
const immersive = computed(() => state.value !== 'market' || packOpening.value)

const getStateText = computed(() => {
  if (state.value === 'market') return 'Choose a pack to open'
  if (state.value === 'grid') return 'All cards revealed! Click anywhere to open pack.'
  if (state.value === 'opening') return 'Opening pack...'
  if (isAnimating.value) return 'Animating...'
  return `Click top card (Card #${getTopCardIndex.value + 1}) — ${seenCards.size} of ${packCards.value.length} revealed`
})

const getProgressText = computed(() => {
  if (state.value === 'stack') {
    return `${seenCards.size} / ${packCards.value.length} revealed`
  }
  return ''
})

onMounted(async () => {
  // Start in market state, no cards
  state.value = 'market'
  packCards.value = []
  order.value = []
  seenCards.value.clear()
  selectedBooster.value = null
  try {
    boosters.value = await fetchAvailableBoosters()
  } catch (err) {
    console.error('Error fetching boosters:', err)
    openError.value = err instanceof Error ? err.message : 'Failed to load boosters'
  }
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
        <div v-if="state === 'market' && !packOpening" class="fade-in-up bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-gray-200 dark:border-gray-700 mb-4 text-center">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Booster Pack Market</h2>
          <p class="text-gray-600 dark:text-gray-400 mb-6">Select a pack to open</p>
          
          <div class="flex flex-col gap-4 items-center">
            <button
              v-for="booster in boosters"
              :key="booster.id"
              @click="openPack(booster)"
              :disabled="isAnimating"
              :style="{ backgroundImage: `url(${booster.cover_image || 'https://via.placeholder.com/150'})` }"
              class="w-48 h-72 rounded-xl font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex flex-col items-center justify-between gap-1 text-base bg-cover bg-center hover:scale-105"
            >
              <!--  -->
              <span class="bg-black/50 px-2 py-1 rounded backdrop-blur-sm">{{ booster.name }}</span>
              <span class="text-xs bg-black/50 px-2 py-1 rounded backdrop-blur-sm">{{ booster.card_count }} cards · {{ booster.price }} credits</span>
            </button>
          </div>
        </div>

        <!-- Immersive full-screen reveal layer -->
        <div v-if="immersive" class="fixed inset-0 z-[60] bg-slate-950/95 backdrop-blur-md flex items-center justify-center overflow-hidden">
          <!-- Booster opening animation -->
          <div v-if="packOpening" class="relative flex items-center justify-center">
            <div class="absolute w-72 h-72 rounded-full bg-primary/30 blur-3xl" aria-hidden="true"></div>
            <div
              ref="boosterRef"
              :style="{ backgroundImage: 'url(/booster_pack.jpg)' }"
              class="relative w-40 h-56 rounded-2xl bg-cover bg-center border border-white/25 shadow-2xl flex flex-col items-center justify-end gap-3 pb-4 [transform-style:preserve-3d] [will-change:transform]"
              style="opacity: 0;"
            >
              <span class="text-6xl drop-shadow-lg" aria-hidden="true">{{ pendingIcon }}</span>
              <span class="bg-black/60 px-3 py-1 rounded-lg backdrop-blur-sm text-white text-sm font-bold tracking-[0.2em]">{{ selectedBooster?.name || 'BOOSTER' }}</span>
            </div>
          </div>

          <!-- Card Container - visible in stack/grid/opening states -->
          <div v-else class="relative w-full h-full flex items-center justify-center" 
               ref="containerRef" @click="handleContainerClick">
            <div class="relative perspective-[2000px]" style="width: 100%; height: 480px;">
              <Card
                v-for="(card, idx) in packCards"
                :key="idx"
                ref="cardInstances"
                :data-index="idx"
                :class="['cursor-pointer', isTopCard(idx) ? ['ring-2', 'ring-offset-2', 'ring-offset-gray-900', 'dark:ring-offset-gray-800', rarityRing(card.rarity)] : '']"
                @click="handleCardClick(idx)"
              >
                <div class="w-full h-full relative">
                  <!-- Card face -->
                  <div class="absolute inset-0 rounded-2xl overflow-hidden" style="backface-visibility: hidden;">
                    <img :src="card.image" :alt="card.title" class="w-full h-full object-cover" draggable="false" />
                    <span class="absolute top-2 left-2 min-w-7 h-7 px-1.5 flex items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-bold shadow-lg">{{ card.manaCost }}</span>
                    <span class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-semibold">{{ card.rarity ?? 'Common' }}</span>
                    <div class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/85 to-transparent">
                      <div class="text-white font-bold text-sm">{{ card.title }}</div>
                      <div class="flex items-center gap-2 mt-1">
                        <span class="text-[11px] text-white/70">{{ card.type === 'creature' ? 'Creature' : 'Spell' }}</span>
                        <template v-if="card.type === 'creature'">
                          <span class="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold">{{ card.attack ?? 0 }}</span>
                          <span class="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold">{{ card.health ?? 0 }}</span>
                        </template>
                        <span v-if="seenCards.has(idx) && state === 'stack'" class="ml-auto text-[10px] text-green-300 font-semibold">✓ Revealed</span>
                      </div>
                    </div>
                  </div>

                  <!-- Rarity-colored top border / highlight for the top card -->
                  <div v-if="isTopCard(idx)"
                       class="absolute inset-0 rounded-2xl pointer-events-none"
                       :style="{ boxShadow: `inset 0 0 0 2px ${rarityColor(card.rarity)}` }"></div>

                  <!-- Top card indicator (only in stack) -->
                  <div v-if="isTopCard(idx)"
                       class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold"
                       :style="{ color: rarityColor(card.rarity) }">
                    TOP ▼
                  </div>
                </div>
              </Card>
            </div>

            <!-- Grid hint -->
            <p v-if="state === 'grid'"
               class="absolute bottom-6 left-0 right-0 text-center text-sm font-medium text-gray-300 pointer-events-none animate-pulse">
              Click anywhere to continue
            </p>
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

.fade-in-up {
  animation: fadeInUp 0.45s ease-out both;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
