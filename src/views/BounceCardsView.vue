<script setup lang="ts">
import BounceCards, { type CardData } from '@/components/vue-bits/BounceCards.vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

interface CardTemplate {
  image: string
  title: string
  description: string
  effects: string[]
  cost: number
  attack: number
  defense: number
  type: string
  rarity: string
}

const cardTemplates: CardTemplate[] = [
  {
    image: 'https://picsum.photos/id/1015/400/400',
    title: 'Fire Dragon',
    description: 'A majestic dragon that breathes scorching flames.',
    effects: ['Deal 5 damage to all enemies', 'Burn: 2 damage per turn for 3 turns'],
    cost: 4, attack: 6, defense: 3, type: 'Creature', rarity: 'Legendary',
  },
  {
    image: 'https://picsum.photos/id/1025/400/400',
    title: 'Ice Shield',
    description: 'A magical shield that freezes attackers.',
    effects: ['Gain 8 armor', 'Freeze: Stun attacker for 1 turn on hit'],
    cost: 3, attack: 0, defense: 8, type: 'Spell', rarity: 'Rare',
  },
  {
    image: 'https://picsum.photos/id/1039/400/400',
    title: 'Lightning Bolt',
    description: 'Strikes a single target with raw electricity.',
    effects: ['Deal 8 damage to target', 'Chain: 50% chance to hit adjacent enemy'],
    cost: 2, attack: 8, defense: 0, type: 'Spell', rarity: 'Uncommon',
  },
  {
    image: 'https://picsum.photos/id/1043/400/400',
    title: 'Healing Spirit',
    description: 'A benevolent spirit that restores vitality.',
    effects: ['Heal 6 health', 'Cleanse: Remove all negative effects'],
    cost: 3, attack: 0, defense: 0, type: 'Creature', rarity: 'Rare',
  },
  {
    image: 'https://picsum.photos/id/1050/400/400',
    title: 'Shadow Assassin',
    description: 'Strikes from darkness with deadly precision.',
    effects: ['Deal 4 damage', 'Stealth: Cannot be targeted next turn'],
    cost: 3, attack: 5, defense: 2, type: 'Creature', rarity: 'Epic',
  },
  {
    image: 'https://picsum.photos/id/1062/400/400',
    title: 'Earth Golem',
    description: 'A massive construct of stone and magic.',
    effects: ['Taunt: Enemies must attack this', 'Gain 3 armor per turn'],
    cost: 5, attack: 3, defense: 10, type: 'Creature', rarity: 'Legendary',
  },
  {
    image: 'https://picsum.photos/id/1069/400/400',
    title: 'Frost Wolf',
    description: 'A swift predator of the frozen north.',
    effects: ['Deal 3 damage', 'Freeze target for 1 turn'],
    cost: 2, attack: 3, defense: 2, type: 'Creature', rarity: 'Common',
  },
  {
    image: 'https://picsum.photos/id/1074/400/400',
    title: 'Arcane Missiles',
    description: 'Unyielding bolts of raw arcane energy.',
    effects: ['Deal 3 damage to 3 random enemies'],
    cost: 2, attack: 9, defense: 0, type: 'Spell', rarity: 'Uncommon',
  },
  {
    image: 'https://picsum.photos/id/1080/400/400',
    title: 'Holy Light',
    description: 'Divine radiance that mends wounds.',
    effects: ['Heal 4 health', 'Gain 4 armor'],
    cost: 2, attack: 0, defense: 4, type: 'Spell', rarity: 'Rare',
  },
  {
    image: 'https://picsum.photos/id/1084/400/400',
    title: 'Poison Dagger',
    description: 'A venom-coated blade that weakens foes.',
    effects: ['Deal 2 damage', 'Poison: 2 damage per turn for 2 turns'],
    cost: 1, attack: 2, defense: 1, type: 'Creature', rarity: 'Common',
  },
]

const DECK_SIZE = 15
const OPENING_HAND = 5

let uid = 1
function makeCard(t: CardTemplate): CardData {
  return { ...t, id: uid++ }
}

function buildDeck(): CardData[] {
  const unique = cardTemplates.map(makeCard)
  const deck = [...unique]
  while (deck.length < DECK_SIZE) {
    const pick = unique[Math.floor(Math.random() * unique.length)]
    deck.push({ ...pick, id: uid++ })
  }
  return deck
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Game state
const drawPile = ref<CardData[]>([])
const discardPile = ref<CardData[]>([])
const hand = ref<CardData[]>([])
const turn = ref(1)
const selectedCard = ref<CardData | null>(null)
const playing = ref(false)
const message = ref('')

const bounceRef = ref<InstanceType<typeof BounceCards> | null>(null)
const deckEl = ref<HTMLElement | null>(null)
const drawOrigin = ref<{ x: number; y: number } | null>(null)

function flash(msg: string) {
  message.value = msg
  window.clearTimeout((flash as any)._t)
  ;(flash as any)._t = window.setTimeout(() => (message.value = ''), 1500)
}

function initGame() {
  uid = 1
  const deck = shuffle(buildDeck())
  hand.value = deck.slice(0, OPENING_HAND)
  drawPile.value = deck.slice(OPENING_HAND)
  discardPile.value = []
  turn.value = 1
  selectedCard.value = null
  playing.value = false
  message.value = ''
}

const canDraw = computed(() => drawPile.value.length > 0 || discardPile.value.length > 0)

function captureDrawOrigin() {
  const rect = deckEl.value?.getBoundingClientRect()
  drawOrigin.value = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null
}

function drawCard() {
  if (!canDraw.value) {
    flash('Deck is empty!')
    return
  }
  if (drawPile.value.length === 0) {
    drawPile.value = shuffle([...discardPile.value])
    discardPile.value = []
    flash('Reshuffled discard into deck')
  }
  captureDrawOrigin()
  const card = drawPile.value[0]
  drawPile.value = drawPile.value.slice(1)
  hand.value = [...hand.value, card]
}

async function playSelectedCard() {
  const card = selectedCard.value
  if (!card || playing.value) return
  playing.value = true
  // Deselect immediately ("click outside" the hand) so the UI doesn't linger
  selectedCard.value = null
  await bounceRef.value?.playCardOut(card.id)
  hand.value = hand.value.filter(c => c.id !== card.id)
  discardPile.value = [...discardPile.value, card]
  playing.value = false
  flash(`Played ${card.title}`)
}

function endTurn() {
  selectedCard.value = null
  turn.value += 1
  if (canDraw.value) {
    drawCard()
    flash(`Turn ${turn.value} — drew a card`)
  } else {
    flash(`Turn ${turn.value} — deck empty`)
  }
}

function onCardSelected(card: CardData | null) {
  selectedCard.value = card
}

function onCardPlayed(card: CardData) {
  selectedCard.value = card
  playSelectedCard()
}

const topDiscard = computed(() => discardPile.value[discardPile.value.length - 1] ?? null)

// --- Card sizing / layout ---
const containerWidth = ref(0)
const containerHeight = ref(400)
const fallbackWidth = ref(typeof window !== 'undefined' ? window.innerWidth - 32 : 375)

const effectiveContainerWidth = computed(() => containerWidth.value || fallbackWidth.value)

const cardWidth = ref(80)
const cardHeight = ref(120)
const useAutoSize = ref(false)

const cardAspectRatio = computed(() => cardWidth.value / cardHeight.value)

function computeAutoCardWidth(): number {
  const padding = 32
  const availableWidth = effectiveContainerWidth.value - padding
  const count = hand.value.length
  if (count <= 1) return Math.min(100, availableWidth * 0.6)
  const maxCardWidth = availableWidth / (count * 0.7)
  return Math.min(100, Math.max(50, maxCardWidth))
}

const finalCardWidth = computed(() => useAutoSize.value ? computeAutoCardWidth() : cardWidth.value)
const finalCardHeight = computed(() => useAutoSize.value ? finalCardWidth.value : cardHeight.value)

function computeArcTransforms(count: number): string[] {
  if (count === 0) return []
  const cw = finalCardWidth.value
  const maxSpread = Math.min(effectiveContainerWidth.value * 0.85, cw * count * 1.3)
  const step = count > 1 ? maxSpread / (count - 1) : 0
  const radius = maxSpread / 2 + 150
  const arcHeight = radius * 0.25
  return Array.from({ length: count }, (_, i) => {
    const x = -maxSpread / 2 + i * step
    const normalizedX = x / radius
    const y = -arcHeight * (1 - normalizedX * normalizedX)
    return `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`
  })
}

const arcTransformStyles = computed(() => computeArcTransforms(hand.value.length))

const resetSizes = () => {
  cardWidth.value = 80
  cardHeight.value = 120
  useAutoSize.value = false
}

const updateContainerWidth = () => {
  const el = document.querySelector('.bounce-container')
  if (el) containerWidth.value = Math.min(el.clientWidth, window.innerWidth - 32)
  fallbackWidth.value = window.innerWidth - 32
}

onMounted(() => {
  initGame()
  updateContainerWidth()
  window.addEventListener('resize', updateContainerWidth)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateContainerWidth)
})

watch([cardWidth, cardHeight, useAutoSize], () => {})

const showControls = ref(false)
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Top fixed-size attributes + turn info -->
    <div class="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-3xl mx-auto px-3 py-2">
        <div class="h-7 flex items-center justify-between gap-2">
          <h1 class="text-base font-bold text-gray-900 dark:text-white">Card Game</h1>
          <div class="flex items-center gap-2 text-xs font-medium">
            <span class="px-2 py-0.5 rounded-full bg-primary/15 text-primary">Turn {{ turn }}</span>
            <span class="px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">Hand {{ hand.length }}</span>
          </div>
        </div>

        <!-- Attribute box: fixed height so nothing shifts -->
        <div class="mt-2 h-[104px] rounded-xl border transition-colors duration-200 overflow-hidden"
          :class="selectedCard ? 'border-primary/40 bg-primary/5 dark:bg-primary/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60'">
          <div v-if="selectedCard" class="h-full p-2 flex gap-3 items-center">
            <img :src="selectedCard.image" :alt="selectedCard.title"
              class="w-12 h-16 rounded-md object-cover flex-shrink-0 border border-primary/40" />
            <div class="flex-1 min-w-0 h-full flex flex-col justify-center">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-semibold text-sm text-gray-900 dark:text-white truncate">{{ selectedCard.title }}</span>
                <span class="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-primary/20 text-primary">{{ selectedCard.rarity }}</span>
                <span class="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">{{ selectedCard.type }}</span>
              </div>
              <div class="flex items-center gap-2 mt-1 text-xs">
                <span class="px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 font-bold">⚡ {{ selectedCard.cost }}</span>
                <span class="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-mono">⚔ {{ selectedCard.attack }}</span>
                <span class="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono">🛡 {{ selectedCard.defense }}</span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{{ selectedCard.description }}</p>
              <div class="flex gap-1.5 mt-1 overflow-x-auto no-scrollbar">
                <span v-for="(effect, i) in selectedCard.effects" :key="i"
                  class="whitespace-nowrap px-2 py-0.5 text-[10px] rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                  • {{ effect }}
                </span>
              </div>
            </div>
          </div>
          <div v-else class="h-full flex items-center justify-center text-xs text-gray-400 dark:text-gray-500">
            Tap a card in your hand to view its attributes
          </div>
        </div>
      </div>
    </div>

    <main class="flex-1 px-3 pt-3 pb-56">
      <div class="w-full max-w-3xl mx-auto">
        <!-- Hand -->
        <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-3 shadow-xl border border-gray-200 dark:border-gray-700 bounce-container">
          <div class="text-center text-xs text-gray-500 dark:text-gray-400 mb-2">
            Your Hand — {{ hand.length }} card{{ hand.length === 1 ? '' : 's' }}
          </div>
          <BounceCards
            v-if="hand.length > 0"
            ref="bounceRef"
            :cards="hand"
            :container-width="effectiveContainerWidth"
            :container-height="containerHeight"
            :enable-hover="true"
            :transform-styles="arcTransformStyles"
            :card-width="finalCardWidth"
            :card-height="finalCardHeight"
            :draw-origin="drawOrigin"
            class="w-full"
            @card-selected="onCardSelected"
            @card-played="onCardPlayed"
          />
          <div v-else class="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-500 gap-2">
            <span class="text-4xl">🃏</span>
            <span class="text-sm">Your hand is empty — draw a card</span>
          </div>
        </div>

        <!-- Collapsible size controls -->
        <div class="mt-3">
          <button @click="showControls = !showControls"
            class="w-full text-xs text-gray-500 dark:text-gray-400 py-1 flex items-center justify-center gap-1">
            <span>{{ showControls ? '▲' : '▼' }}</span> Display settings
          </button>
          <div v-if="showControls" class="mt-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-3 shadow-lg border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3 mb-3 flex-wrap">
              <label class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" v-model="useAutoSize" class="w-4 h-4 accent-primary" />
                Auto Size
              </label>
              <button @click="resetSizes" :disabled="useAutoSize" class="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50">
                Reset Sizes
              </button>
            </div>
            <div class="grid grid-cols-2 gap-3" :class="{ 'opacity-50 pointer-events-none': useAutoSize }">
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Width: {{ finalCardWidth }}px</label>
                <input type="range" v-model.number="cardWidth" min="40" max="200" step="1"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none accent-primary" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Height: {{ finalCardHeight }}px</label>
                <input type="range" v-model.number="cardHeight" min="40" max="300" step="1"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none accent-primary" />
              </div>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              Aspect Ratio: {{ cardAspectRatio.toFixed(2) }} {{ useAutoSize ? '(auto: 1:1)' : '' }}
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Toast -->
    <transition name="fade">
      <div v-if="message" class="fixed top-[148px] left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-gray-900/90 text-white text-xs font-medium shadow-lg">
        {{ message }}
      </div>
    </transition>

    <!-- Floating Play button: appears when a card is selected, no layout shift -->
    <transition name="fade">
      <button
        v-if="selectedCard"
        @click="playSelectedCard"
        :disabled="playing"
        class="fixed bottom-44 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-primary text-white font-bold text-base shadow-2xl hover:bg-primary-dark active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <span>▶</span>
        <span>Play Card — {{ selectedCard.title }}</span>
      </button>
    </transition>

    <!-- Bottom game controls (above bottom nav) -->
    <div class="fixed bottom-16 inset-x-0 z-40 px-3 pb-2">
      <div class="max-w-md mx-auto bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur-md rounded-2xl p-3 shadow-2xl border border-gray-700/60">
        <div class="flex items-center justify-between gap-3">
          <!-- Deck pile -->
          <button ref="deckEl" @click="drawCard" :disabled="!canDraw"
            :class="['relative w-12 h-16 flex-shrink-0 transition-transform', canDraw ? 'hover:-translate-y-0.5 active:translate-y-0' : 'opacity-50 cursor-not-allowed']"
            title="Draw a card">
            <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 border border-white/20 shadow-md"></div>
            <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 border border-white/20 shadow-md translate-x-1 translate-y-1"></div>
            <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 border border-white/20 shadow-md flex items-center justify-center">
              <span class="text-white font-bold text-lg">{{ drawPile.length }}</span>
            </div>
            <span class="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-300 whitespace-nowrap">Deck</span>
          </button>

          <!-- Center actions -->
          <div class="flex-1 flex flex-col gap-2">
            <button @click="drawCard" :disabled="!canDraw"
              class="w-full py-2 rounded-lg bg-indigo-500 text-white font-semibold text-sm hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition">
              Draw Card
            </button>
            <button @click="endTurn"
              class="w-full py-2 rounded-lg bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-400 active:scale-[0.98] transition">
              End Turn
            </button>
          </div>

          <!-- Discard pile -->
          <div class="relative w-12 h-16 flex-shrink-0">
            <div v-if="topDiscard" class="absolute inset-0 rounded-lg overflow-hidden border border-white/30 shadow-md">
              <img :src="topDiscard.image" :alt="topDiscard.title" class="w-full h-full object-cover" />
            </div>
            <div v-else class="absolute inset-0 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center">
              <span class="text-gray-600 text-lg">🗑</span>
            </div>
            <div class="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-gray-700 text-white text-[10px] font-bold flex items-center justify-center border border-gray-900">
              {{ discardPile.length }}
            </div>
            <span class="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-300 whitespace-nowrap">Discard</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bounce-container {
  min-height: 340px;
  overflow: hidden;
}

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { scrollbar-width: none; }

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #aa3bff;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #aa3bff;
  cursor: pointer;
  border: none;
}
</style>