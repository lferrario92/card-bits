<script setup lang="ts">
import BounceCards, { type CardData } from '@/components/vue-bits/BounceCards.vue'
import HealthBar from '@/components/game/HealthBar.vue'
import CreatureTile from '@/components/game/CreatureTile.vue'
import BattleOverlay from '@/components/game/BattleOverlay.vue'
import BattleLog from '@/components/game/BattleLog.vue'
import { useBattle } from '@/game/useBattle'
import { STARTER_CARDS, OPPONENT_CARDS } from '@/game/cards'
import { describeCardEffects } from '@/game/effects'
import type { BoardCreature } from '@/game/types'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const {
  state,
  busy,
  isPlayerTurn,
  isOver,
  canDraw,
  playCard,
  attack,
  drawCard,
  endTurn,
  reset,
  playerTurnLabel,
} = useBattle({
  playerDeck: [...STARTER_CARDS],
  opponentDeck: [...OPPONENT_CARDS],
  playerName: 'You',
  opponentName: 'Dark Mage',
  playerMaxHp: 30,
  opponentMaxHp: 30,
  startingHand: 5,
  opponentDelay: 1000,
})

const selectedCard = ref<CardData | null>(null)
const playing = ref(false)
const message = ref('')

// --- Combat targeting ---
const attackerId = ref<number | null>(null)
const attacker = computed(() => state.playerBoard.find(c => c.instanceId === attackerId.value) ?? null)
const targeting = computed(() => !!attacker.value && isPlayerTurn.value)
const canAfford = computed(() => !!selectedCard.value && state.player.mana >= selectedCard.value.manaCost)

const bounceRef = ref<InstanceType<typeof BounceCards> | null>(null)
const deckEl = ref<HTMLElement | null>(null)
const drawOrigin = ref<{ x: number; y: number } | null>(null)

function flash(msg: string) {
  message.value = msg
  window.clearTimeout((flash as any)._t)
  ;(flash as any)._t = window.setTimeout(() => (message.value = ''), 1500)
}

const selectedEffects = computed(() => (selectedCard.value ? describeCardEffects(selectedCard.value.effects) : []))

const topDiscard = computed(() => state.discardPile[state.discardPile.length - 1] ?? null)

function captureDrawOrigin() {
  const rect = deckEl.value?.getBoundingClientRect()
  drawOrigin.value = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null
}

function onDrawClick() {
  if (!isPlayerTurn.value || !canDraw.value) return
  captureDrawOrigin()
  drawCard('player')
}

async function playSelectedCard() {
  const card = selectedCard.value
  if (!card || playing.value || !isPlayerTurn.value) return
  if (state.player.mana < card.manaCost) {
    flash('Not enough mana')
    return
  }
  playing.value = true
  const id = card.id
  selectedCard.value = null
  attackerId.value = null
  await bounceRef.value?.playCardOut(id)
  playCard(card, 'player')
  playing.value = false
}

function onEndTurn() {
  if (!isPlayerTurn.value) return
  selectedCard.value = null
  attackerId.value = null
  endTurn()
}

function onCardSelected(card: CardData | null) {
  selectedCard.value = card
  if (card) attackerId.value = null
}

const handAvailableMana = computed(() => (isPlayerTurn.value ? state.player.mana : undefined))

// --- Combat interactions ---
function onPlayerCreatureClick(c: BoardCreature) {
  if (!isPlayerTurn.value) return
  selectedCard.value = null
  if (attackerId.value === c.instanceId) {
    attackerId.value = null
    return
  }
  if (!c.canAttack) {
    flash(`${c.card.title} can't attack this turn`)
    return
  }
  attackerId.value = c.instanceId
}

function onOpponentCreatureClick(c: BoardCreature) {
  const a = attacker.value
  if (!a || !isPlayerTurn.value) return
  if (attack(a.instanceId, { type: 'creature', instanceId: c.instanceId })) attackerId.value = null
}

function onOpponentHeroClick() {
  const a = attacker.value
  if (!a || !isPlayerTurn.value) return
  if (attack(a.instanceId, { type: 'hero' })) attackerId.value = null
}

function onReset() {
  selectedCard.value = null
  attackerId.value = null
  playing.value = false
  message.value = ''
  reset()
}

// --- Card sizing / layout ---
const containerWidth = ref(0)
const containerHeight = ref(360)
const fallbackWidth = ref(typeof window !== 'undefined' ? window.innerWidth - 32 : 375)

const effectiveContainerWidth = computed(() => containerWidth.value || fallbackWidth.value)

const cardWidth = ref(76)
const cardHeight = ref(112)
const useAutoSize = ref(false)

const cardAspectRatio = computed(() => cardWidth.value / cardHeight.value)

function computeAutoCardWidth(): number {
  const padding = 32
  const availableWidth = effectiveContainerWidth.value - padding
  const count = state.hand.length
  if (count <= 1) return Math.min(96, availableWidth * 0.6)
  const maxCardWidth = availableWidth / (count * 0.7)
  return Math.min(96, Math.max(48, maxCardWidth))
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

const arcTransformStyles = computed(() => computeArcTransforms(state.hand.length))

const resetSizes = () => {
  cardWidth.value = 76
  cardHeight.value = 112
  useAutoSize.value = false
}

const updateContainerWidth = () => {
  const el = document.querySelector('.bounce-container')
  if (el) containerWidth.value = Math.min(el.clientWidth, window.innerWidth - 32)
  fallbackWidth.value = window.innerWidth - 32
}

// Keep the deck origin fresh for turn-start draws performed by the engine
watch(
  () => state.hand.length,
  (n, o) => {
    if (n > o) captureDrawOrigin()
  }
)

onMounted(() => {
  updateContainerWidth()
  window.addEventListener('resize', updateContainerWidth)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateContainerWidth)
})

const showControls = ref(false)

function typeLabel(type: string) {
  return type === 'creature' ? 'Creature' : 'Spell'
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Top fixed-size attributes + turn info -->
    <div class="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-3xl mx-auto px-3 py-2">
        <div class="h-7 flex items-center justify-between gap-2">
          <h1 class="text-base font-bold text-gray-900 dark:text-white">Battle</h1>
          <div class="flex items-center gap-2 text-xs font-medium">
            <span class="px-2 py-0.5 rounded-full"
              :class="isPlayerTurn ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'">
              {{ playerTurnLabel }}
            </span>
            <span class="px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">Turn {{ state.turn }}</span>
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
                <span class="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">{{ typeLabel(selectedCard.type) }}</span>
              </div>
              <div class="flex items-center gap-2 mt-1 text-xs">
                <span class="px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 font-bold">💧 {{ selectedCard.manaCost }}</span>
                <span v-if="selectedCard.attack !== undefined" class="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-mono">⚔ {{ selectedCard.attack }}</span>
                <span v-if="selectedCard.health !== undefined" class="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono">❤ {{ selectedCard.health }}</span>
                <span v-if="selectedCard.charge" class="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold">⚡ Charge</span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{{ selectedCard.description }}</p>
              <div class="flex gap-1.5 mt-1 overflow-x-auto no-scrollbar">
                <span v-for="(effect, i) in selectedEffects" :key="i"
                  class="whitespace-nowrap px-2 py-0.5 text-[10px] rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                  {{ effect }}
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
      <div class="w-full max-w-3xl mx-auto space-y-3">
        <!-- Opponent -->
        <section class="rounded-2xl p-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border shadow-lg"
          :class="state.phase === 'opponent' ? 'border-rose-400/70 ring-1 ring-rose-400/40' : 'border-gray-200 dark:border-gray-700'">
          <div
            class="rounded-xl transition-all"
            :class="targeting ? 'cursor-crosshair ring-2 ring-rose-500 animate-pulse' : ''"
            @click="onOpponentHeroClick">
            <HealthBar :entity="state.opponent" accent="opponent" />
          </div>
          <div class="mt-2 flex items-center gap-2 flex-wrap min-h-[86px]">
            <CreatureTile
              v-for="c in state.opponentBoard" :key="c.instanceId" :creature="c"
              :interactive="targeting" :targetable="targeting" @pick="onOpponentCreatureClick(c)" />
            <span v-if="state.opponentBoard.length === 0" class="text-xs text-gray-400 dark:text-gray-500">
              Opponent has no creatures in play
            </span>
          </div>
          <div class="mt-1 flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
            <span>Hand: {{ state.opponentHand.length }} · Deck: {{ state.opponentDrawPile.length }}</span>
            <span class="px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-500 dark:text-indigo-300 font-bold">💧 {{ state.opponent.mana }}/{{ state.opponent.maxMana }}</span>
          </div>
        </section>

        <div class="flex items-center gap-3">
          <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span class="text-xs font-bold text-gray-400 dark:text-gray-500">VS</span>
          <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>

        <!-- Player board -->
        <section class="rounded-2xl p-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border shadow-lg"
          :class="state.phase === 'player' ? 'border-emerald-400/70 ring-1 ring-emerald-400/40' : 'border-gray-200 dark:border-gray-700'">
          <div class="flex items-center gap-2 flex-wrap min-h-[86px]">
            <CreatureTile
              v-for="c in state.playerBoard" :key="c.instanceId" :creature="c"
              :interactive="isPlayerTurn"
              :selected="attackerId === c.instanceId"
              :ready="isPlayerTurn && c.canAttack"
              @pick="onPlayerCreatureClick(c)" />
            <span v-if="state.playerBoard.length === 0" class="text-xs text-gray-400 dark:text-gray-500">
              Your board is empty — play a creature
            </span>
          </div>
          <div class="mt-2">
            <HealthBar :entity="state.player" accent="player" />
          </div>
          <div class="mt-1 flex items-center justify-between text-[10px]">
            <span class="text-gray-400 dark:text-gray-500">
              <template v-if="targeting">Choose a target to attack</template>
              <template v-else-if="isPlayerTurn">Tap a glowing creature to attack</template>
            </span>
            <span class="px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-500 dark:text-indigo-300 font-bold">💧 {{ state.player.mana }}/{{ state.player.maxMana }}</span>
          </div>
        </section>

        <!-- Hand -->
        <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-3 shadow-xl border border-gray-200 dark:border-gray-700 bounce-container">
          <div class="text-center text-xs text-gray-500 dark:text-gray-400 mb-2">
            Your Hand — {{ state.hand.length }} card{{ state.hand.length === 1 ? '' : 's' }}
          </div>
          <BounceCards
            v-if="state.hand.length > 0"
            ref="bounceRef"
            :cards="state.hand"
            :container-width="effectiveContainerWidth"
            :container-height="containerHeight"
            :enable-hover="true"
            :transform-styles="arcTransformStyles"
            :card-width="finalCardWidth"
            :card-height="finalCardHeight"
            :draw-origin="drawOrigin"
            :available-mana="handAvailableMana"
            class="w-full"
            @card-selected="onCardSelected"
          />
          <div v-else class="flex flex-col items-center justify-center h-40 text-gray-400 dark:text-gray-500 gap-2">
            <span class="text-4xl">🃏</span>
            <span class="text-sm">Your hand is empty — draw a card</span>
          </div>
        </div>

        <!-- Battle log -->
        <div>
          <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 px-1">Battle Log</div>
          <BattleLog :entries="state.log" />
        </div>

        <!-- Collapsible size controls -->
        <div>
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

    <!-- Floating Play button -->
    <transition name="fade">
      <button
        v-if="selectedCard && isPlayerTurn"
        @click="playSelectedCard"
        :disabled="playing || !canAfford"
        class="fixed bottom-44 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-primary text-white font-bold text-base shadow-2xl hover:bg-primary-dark active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        :title="canAfford ? '' : 'Not enough mana'"
      >
        <span>{{ selectedCard.type === 'creature' ? '🐾' : '✨' }}</span>
        <span>{{ selectedCard.type === 'creature' ? 'Summon' : 'Cast' }} — {{ selectedCard.title }}</span>
        <span class="px-1.5 py-0.5 rounded bg-white/20 text-sm">💧 {{ selectedCard.manaCost }}</span>
      </button>
    </transition>

    <!-- Cancel targeting -->
    <transition name="fade">
      <button
        v-if="targeting"
        @click="attackerId = null"
        class="fixed bottom-28 right-4 z-50 px-4 py-2 rounded-full bg-gray-900/90 text-white text-xs font-semibold shadow-lg border border-gray-700"
      >
        ✕ Cancel
      </button>
    </transition>

    <!-- Bottom game controls (above bottom nav) -->
    <div class="fixed bottom-16 inset-x-0 z-40 px-3 pb-2">
      <div class="max-w-md mx-auto bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur-md rounded-2xl p-3 shadow-2xl border border-gray-700/60">
        <div class="flex items-center justify-between gap-3">
          <!-- Deck pile -->
          <button ref="deckEl" @click="onDrawClick" :disabled="!isPlayerTurn || !canDraw"
            :class="['relative w-12 h-16 flex-shrink-0 transition-transform', (isPlayerTurn && canDraw) ? 'hover:-translate-y-0.5 active:translate-y-0' : 'opacity-50 cursor-not-allowed']"
            title="Draw a card">
            <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 border border-white/20 shadow-md"></div>
            <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 border border-white/20 shadow-md translate-x-1 translate-y-1"></div>
            <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 border border-white/20 shadow-md flex items-center justify-center">
              <span class="text-white font-bold text-lg">{{ state.drawPile.length }}</span>
            </div>
            <span class="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-300 whitespace-nowrap">Deck</span>
          </button>

          <!-- Center actions -->
          <div class="flex-1 flex flex-col gap-2">
            <button @click="onDrawClick" :disabled="!isPlayerTurn || !canDraw"
              class="w-full py-2 rounded-lg bg-indigo-500 text-white font-semibold text-sm hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition">
              Draw Card
            </button>
            <button @click="onEndTurn" :disabled="!isPlayerTurn"
              class="w-full py-2 rounded-lg bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition flex items-center justify-center gap-2">
              <span v-if="busy" class="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              <span>{{ busy ? 'Opponent thinking…' : 'End Turn' }}</span>
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
              {{ state.discardPile.length }}
            </div>
            <span class="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-300 whitespace-nowrap">Discard</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Victory / Defeat overlay -->
    <BattleOverlay v-if="isOver && state.winner" :winner="state.winner" :opponent-name="state.opponent.name" @reset="onReset" />
  </div>
</template>

<style scoped>
.bounce-container {
  min-height: 300px;
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